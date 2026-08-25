"""
Does the warehouse need a precomputed grid, or can it value a league on demand?

The plan assumed a stored cross product: fetch a grid of formats nightly, key
it by fingerprint, serve lookups. Phase 0.8 undermined that — with projections,
values are a function of the league's own scoring_settings and roster_positions,
which are arbitrary. A grid cannot enumerate arbitrary.

So the question is latency. If one league values in single-digit milliseconds
off cached projections, there is no grid: the warehouse stores projections and
computes per request. That removes the whole fingerprint-as-sort-key design,
and with it the Phase 3 gate that exists to freeze that key.

Measures the per-league compute with projections already resident as Parquet,
which is what a warm Lambda or a served API would actually have.
"""
import json
import os
import statistics
import time

import duckdb

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ_PARQUET = os.path.join(HERE, "projections.parquet")
LEAGUES = os.path.join(HERE, "leagues.json")

NON_SCORING_PREFIXES = ("adp_", "pts_")
NON_SCORING_KEYS = ("gp", "gms_active")

con = duckdb.connect()
con.execute("INSTALL json; LOAD json;")

# One-time: normalise projections into a long table and persist as Parquet.
# This is the nightly ingest artefact.
t = time.time()
con.execute(f"""
CREATE TABLE proj AS
SELECT player_id,
       upper(coalesce(player.position, '')) AS position,
       stats
FROM read_json_auto('{os.path.join(HERE, "proj2026.json")}')
WHERE upper(coalesce(player.position, '')) IN ('QB','RB','WR','TE','K','DEF')
""")
con.execute("""
CREATE TABLE stat_long AS
SELECT p.player_id, p.position, k.key AS stat_key,
       TRY_CAST(json_extract_string(to_json(p.stats), '$."' || k.key || '"') AS DOUBLE) AS stat_value
FROM proj p, LATERAL unnest(json_keys(to_json(p.stats))) AS k(key)
""")
con.execute("""
CREATE TABLE precomputed AS
SELECT player_id, position,
  TRY_CAST(json_extract_string(to_json(stats), '$.pts_std')      AS DOUBLE) AS pts_std,
  TRY_CAST(json_extract_string(to_json(stats), '$.pts_half_ppr') AS DOUBLE) AS pts_half_ppr,
  TRY_CAST(json_extract_string(to_json(stats), '$.pts_ppr')      AS DOUBLE) AS pts_ppr
FROM proj
""")
con.execute(f"COPY (SELECT * FROM stat_long) TO '{PROJ_PARQUET}' (FORMAT PARQUET)")
ingest_ms = (time.time() - t) * 1000

rows = con.execute("SELECT count(*) FROM stat_long").fetchone()[0]
print(f"ingest (one-time)  : {ingest_ms:.0f} ms -> {rows:,} stat rows, "
      f"{os.path.getsize(PROJ_PARQUET)/1024:.0f} KB Parquet")


def value_league(league, starters_override=None):
    """Value one league against the resident projections. Returns elapsed ms."""
    scoring = league.get("scoring_settings") or {}
    ppr = scoring.get("rec", 0) or 0
    rows = [(k, float(v)) for k, v in scoring.items()
            if k not in NON_SCORING_KEYS and not k.startswith(NON_SCORING_PREFIXES)]
    if not rows:
        return None

    t0 = time.time()
    con.execute("CREATE OR REPLACE TEMP TABLE sc(stat_key VARCHAR, weight DOUBLE)")
    con.executemany("INSERT INTO sc VALUES (?, ?)", rows)

    # Starters per position. Dedicated slots only here — flex allocation is a
    # separate heuristic and is not what this is measuring.
    rp = [p.upper() for p in (league.get("roster_positions") or [])]
    teams = league.get("total_rosters") or 12
    counts = {}
    for pos in ("QB", "RB", "WR", "TE", "K", "DEF"):
        n = sum(1 for p in rp if p == pos or (pos == "DEF" and p == "DST"))
        counts[pos] = n * teams
    con.execute("CREATE OR REPLACE TEMP TABLE st(position VARCHAR, n INTEGER)")
    con.executemany("INSERT INTO st VALUES (?, ?)", list(counts.items()))

    con.execute(f"""
    CREATE OR REPLACE TEMP TABLE out AS
    WITH dot AS (
      SELECT s.player_id, sum(s.stat_value * sc.weight) AS pts, count(*) AS matched
      FROM stat_long s JOIN sc USING (stat_key)
      WHERE s.stat_value IS NOT NULL
      GROUP BY s.player_id
    ),
    scored AS (
      SELECT p.player_id, p.position,
             CASE WHEN p.position IN ('K','DEF') OR coalesce(d.matched,0)=0
                  THEN CASE WHEN {ppr} >= 0.75 THEN p.pts_ppr
                            WHEN {ppr} >= 0.25 THEN p.pts_half_ppr
                            ELSE p.pts_std END
                  ELSE d.pts END AS points
      FROM precomputed p LEFT JOIN dot d USING (player_id)
    ),
    ranked AS (
      SELECT *, row_number() OVER (PARTITION BY position ORDER BY points DESC) AS rk,
                count(*)     OVER (PARTITION BY position) AS cnt
      FROM scored
    ),
    levels AS (
      SELECT r.position,
             max(CASE WHEN r.rk = CASE WHEN coalesce(st.n,0) <= 0 THEN 1
                                       ELSE least(coalesce(st.n,0)+1, r.cnt) END
                      THEN r.points END) AS level
      FROM ranked r LEFT JOIN st USING (position) GROUP BY r.position
    ),
    v AS (
      SELECT r.player_id, r.position, r.points - coalesce(l.level,0) AS vor
      FROM ranked r LEFT JOIN levels l USING (position)
    )
    SELECT player_id, position,
           CASE WHEN (SELECT greatest(max(vor),0) FROM v) > 0
                THEN greatest(0, round(vor * 10000.0 / (SELECT max(vor) FROM v)))
                ELSE 0 END AS value
    FROM v
    """)
    con.execute("SELECT count(*) FROM out").fetchone()
    return (time.time() - t0) * 1000


leagues = json.load(open(LEAGUES))
print(f"\nvaluing {len(leagues)} real leagues on demand:\n")

timings = []
for lg in leagues:
    ms = value_league(lg)
    if ms is None:
        continue
    timings.append(ms)
    print(f"  {(lg.get('name') or '')[:34]:<36} {ms:6.1f} ms")

if timings:
    print()
    print(f"  n={len(timings)}  median {statistics.median(timings):.1f} ms  "
          f"min {min(timings):.1f}  max {max(timings):.1f}")
