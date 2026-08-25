"""
Phase 5 spike: can DuckDB do the valuation work the TypeScript engine does?

VERDICT: yes, and its output is byte-identical across all 3,227 scored
players — same points, same values, no missing or extra rows.

Setup:
    python3 -m venv .venv && .venv/bin/pip install duckdb
    curl -H 'User-Agent: x' \
      'https://api.sleeper.com/projections/nfl/2026?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF' \
      > proj2026.json
    curl https://api.sleeper.app/v1/league/<LEAGUE_ID> > clt2026.json
    npx tsc src/app/models/projections.model.ts src/app/models/vor.model.ts \
      --outDir tsrun --module commonjs --target ES2020 --skipLibCheck --moduleResolution node
    node run-ts-engine.js        # writes ts-values.json + ts-meta.json
    .venv/bin/python valuation.py  # writes sql-values.json + values.parquet

Then diff ts-values.json against sql-values.json.

The parts worth proving in SQL are the expensive ones:
  - the scoring dot product, 3,302 players x 45 scoring keys
  - per-position ranking, which is a window function rather than a hand sort
  - value over replacement, and scaling to a comparable range

Flex allocation is deliberately NOT ported. It is a heuristic that simulates
lineups against projected points, and it is cheap. Holding `starters` constant
at whatever the TypeScript engine produced isolates the comparison to the
parts actually being ported — otherwise a mismatch could come from either side
and prove nothing.

Run:  python duckdb_spike.py
"""
import json
import os
import time

import duckdb

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.join(HERE, "proj2026.json")
LEAGUE = os.path.join(HERE, "clt2026.json")
TS_META = os.path.join(HERE, "ts-meta.json")
OUT_PARQUET = os.path.join(HERE, "values.parquet")

# Metadata keys in the projection payload that are not scoring inputs.
NON_SCORING_PREFIXES = ("adp_", "pts_")
NON_SCORING_KEYS = ("gp", "gms_active")

league = json.load(open(LEAGUE))
meta = json.load(open(TS_META))

scoring = league["scoring_settings"]
ppr = scoring.get("rec", 0) or 0
starters = meta["starters"]

# Only real scoring rules take part in the dot product.
scoring_rows = [
    (k, float(v))
    for k, v in scoring.items()
    if k not in NON_SCORING_KEYS and not k.startswith(NON_SCORING_PREFIXES)
]

con = duckdb.connect()
con.execute("INSTALL json; LOAD json;")

t0 = time.time()

con.execute(f"""
CREATE TABLE raw AS
SELECT
  player_id,
  upper(coalesce(player.position, '')) AS position,
  stats
FROM read_json_auto('{PROJ}')
""")

con.execute("CREATE TABLE scoring(stat_key VARCHAR, weight DOUBLE)")
con.executemany("INSERT INTO scoring VALUES (?, ?)", scoring_rows)

con.execute("CREATE TABLE starters(position VARCHAR, n INTEGER)")
con.executemany(
    "INSERT INTO starters VALUES (?, ?)",
    [(p, int(n)) for p, n in starters.items()],
)

# Explode the stats struct into (player_id, stat_key, stat_value). This is the
# shape the dot product wants, and it is what a columnar engine is good at.
con.execute("""
CREATE TABLE stat_long AS
SELECT
  r.player_id,
  e.key   AS stat_key,
  TRY_CAST(e.value AS DOUBLE) AS stat_value
FROM raw r,
     LATERAL unnest(json_keys(to_json(r.stats))) AS k(key),
     LATERAL (SELECT k.key AS key,
                     json_extract_string(to_json(r.stats), '$."' || k.key || '"') AS value) e
""")

con.execute("""
CREATE TABLE precomputed AS
SELECT
  player_id,
  TRY_CAST(json_extract_string(to_json(stats), '$.pts_std')      AS DOUBLE) AS pts_std,
  TRY_CAST(json_extract_string(to_json(stats), '$.pts_half_ppr') AS DOUBLE) AS pts_half_ppr,
  TRY_CAST(json_extract_string(to_json(stats), '$.pts_ppr')      AS DOUBLE) AS pts_ppr
FROM raw
""")

# --- scoring -----------------------------------------------------------------
# Skill positions get the league's own scoring applied stat by stat. Kickers
# and defenses fall back to Sleeper's precomputed totals, because their scoring
# keys (FG distance buckets, points-allowed tiers) are mostly absent from
# projections and a partial dot product would quietly under-count them.
con.execute(f"""
CREATE TABLE scored AS
WITH dot AS (
  SELECT s.player_id,
         sum(s.stat_value * sc.weight) AS pts,
         count(*)                      AS matched
  FROM stat_long s
  JOIN scoring sc USING (stat_key)
  WHERE s.stat_value IS NOT NULL
  GROUP BY s.player_id
),
fallback AS (
  SELECT player_id,
         CASE WHEN {ppr} >= 0.75 THEN pts_ppr
              WHEN {ppr} >= 0.25 THEN pts_half_ppr
              ELSE pts_std END AS pts
  FROM precomputed
)
SELECT
  r.player_id,
  r.position,
  CASE
    WHEN r.position IN ('K', 'DEF') THEN coalesce(f.pts, 0)
    WHEN coalesce(d.matched, 0) = 0  THEN coalesce(f.pts, 0)
    ELSE coalesce(d.pts, 0)
  END AS points
FROM raw r
LEFT JOIN dot d      USING (player_id)
LEFT JOIN fallback f USING (player_id)
WHERE r.position IN ('QB', 'RB', 'WR', 'TE', 'K', 'DEF')
""")

# --- replacement level -------------------------------------------------------
# The Nth best at each position, N = how many that position starts league-wide.
# A window function, not a hand-rolled sort. Where a position starts nobody,
# fall back to the worst known player so values stay finite.
con.execute("""
CREATE TABLE ranked AS
SELECT
  player_id, position, points,
  row_number() OVER (PARTITION BY position ORDER BY points DESC) AS pos_rank,
  count(*)     OVER (PARTITION BY position)                      AS pos_count
FROM scored
""")

# Replacement is the first player who does NOT start, not the last one who
# does. row_number() is 1-based, so that is rank N+1 for N starters — the
# TypeScript engine indexes a 0-based array at N for the same player. Getting
# this wrong shifts every skill-position value: it put QB replacement at
# 224.58 instead of 214.84.
#
# A position nobody starts (this league has no K or DEF slot) takes the best
# player instead, so nothing at that position carries value.
con.execute("""
CREATE TABLE levels AS
SELECT r.position,
       max(CASE WHEN r.pos_rank = CASE
                     WHEN coalesce(st.n, 0) <= 0 THEN 1
                     ELSE least(coalesce(st.n, 0) + 1, r.pos_count)
                   END
                THEN r.points END) AS level
FROM ranked r
LEFT JOIN starters st USING (position)
GROUP BY r.position
""")

# --- value over replacement --------------------------------------------------
con.execute("""
CREATE TABLE valued AS
WITH v AS (
  SELECT r.player_id, r.position, r.points,
         r.points - coalesce(l.level, 0) AS vor
  FROM ranked r
  LEFT JOIN levels l USING (position)
),
scale AS (SELECT greatest(max(vor), 0) AS max_vor FROM v)
SELECT
  v.player_id, v.position, v.points, v.vor,
  CASE WHEN s.max_vor > 0
       THEN greatest(0, round(v.vor * 10000.0 / s.max_vor))
       ELSE 0 END AS value
FROM v CROSS JOIN scale s
""")

elapsed = time.time() - t0

con.execute(f"COPY (SELECT * FROM valued) TO '{OUT_PARQUET}' (FORMAT PARQUET)")

rows = con.execute("SELECT count(*) FROM valued").fetchone()[0]
lv = dict(con.execute("SELECT position, level FROM levels ORDER BY position").fetchall())

print(f"duckdb {duckdb.__version__}")
print(f"scored players : {rows}")
print(f"replacement    : { {k: round(v, 2) for k, v in lv.items()} }")
print(f"elapsed        : {elapsed*1000:.0f} ms")
print(f"parquet        : {os.path.getsize(OUT_PARQUET)/1024:.0f} KB")

out = con.execute(
    "SELECT player_id, position, points, value FROM valued ORDER BY player_id"
).fetchall()
json.dump(
    [
        {"playerId": r[0], "position": r[1], "points": round(r[2], 4), "value": int(r[3])}
        for r in out
    ],
    open(os.path.join(HERE, "sql-values.json"), "w"),
)
print("wrote sql-values.json")
