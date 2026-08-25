# DuckDB valuation spike

De-risks Phase 5 of `docs/features/xomper-rebrand/PLAN.md` by answering one
question: can the nightly valuation run as SQL over Parquet instead of Python
loops, and does it produce the same numbers as the engine that ships today?

**Yes, byte-identical.** All 3,227 scored players match the TypeScript engine
on both points and value — no missing rows, no extra rows, no rounding drift.

## Measured

| | |
|---|---|
| Wheel size | 19.4 MB zipped, **53 MB unzipped** (Lambda allows 250 MB unzipped) |
| `import duckdb` | 74 ms |
| Full pipeline | ~690 ms for 3,302 players × 45 scoring keys |
| Peak RSS | **517 MB** — size the Lambda at 1024 MB or above |
| Output | 26 KB Parquet |
| Remote JSON straight from the Sleeper API | 3,302 rows in 597 ms |
| Remote Parquet over HTTPS | works |
| Local Parquet read | 3,227 rows in 1 ms |

The remote read matters: **the ingest job can query the Sleeper API directly in
SQL**, with no download-then-parse step.

## The bug this spike caught

The first SQL port put QB replacement level at 224.58 instead of 214.84, and
every skill-position value was wrong as a result.

Replacement is *the best player who does **not** start*, not the last one who
does. `row_number()` is 1-based, so that is rank **N+1** for N starters; the
TypeScript engine indexes a 0-based array at N for the same player. The two
conventions differ by exactly one, and nothing about the output looked wrong
until it was diffed against the real engine.

That is the argument for keeping this harness: it compares against
`src/app/models/*` compiled and executed, not against a second implementation
written from the same idea.

## Version constraint for Phase 5

Build on DuckDB **1.5.x**. 2.0 is announced but not on PyPI — stable is 1.5.5,
with only `1.6.0.dev*` beyond it.

2.0's headline is async I/O, and the release notes say "network storage is
where you will see the big gains" — exactly a Lambda reading Parquet from S3.
Its breaking changes are the native storage format and the reworked C API,
**neither of which reaches us if we keep Parquet as the on-disk format and use
the Python bindings**. So: do not adopt DuckDB's native storage format, and
2.0 becomes a free upgrade later.

---

# Follow-up: does the warehouse need a precomputed grid at all?

`on-demand.py` answers the question the first spike raised. The plan assumed a
stored cross product — fetch a grid of formats nightly, key it by fingerprint,
serve lookups. Phase 0.8 undermined that: with projections, values are a
function of the league's own `scoring_settings` and `roster_positions`, which
are arbitrary. A grid cannot enumerate arbitrary.

So the question is latency. Measured against **16 real leagues**, with
projections resident as Parquet:

```
ingest (one-time)   540 ms  ->  216,209 stat rows, 168 KB Parquet
per-league compute  median 10.4 ms   (min 9.4, max 22.3)
```

**Ten milliseconds. There is no need for a precomputed grid on the projections
path** — the warehouse can store projections once and compute per request.

## What that changes

- The redraft/projections path needs **no fingerprint sort key and no stored
  grid**. Store one Parquet of projections; compute on demand.
- The **dynasty path still needs the fingerprint**, because FantasyCalc is an
  external API parameterised on `isDynasty × numQbs × numTeams × ppr`. That
  stays a cache key — but per Phase 0.2 only `isDynasty × numQbs` move values
  meaningfully, so it is roughly 4 entries, not 200.
- Phase 3's gate exists to freeze the fingerprint before it becomes a DynamoDB
  sort key. It still matters for the FantasyCalc cache, but the stakes drop
  sharply: a cache key for 4 combinations is not a migration risk the way a
  sort key over a large stored grid would be.

## Honest scope of this measurement

This variant computes starters from **dedicated roster slots only**. Flex
allocation — the heuristic that simulates lineups against projected points —
is not ported here, so **its output is not expected to match the TypeScript
engine exactly**. Parity was established separately in `valuation.py`, with
starters held constant.

What this measures is latency, not correctness. Do not read the two spikes as
one claim.
