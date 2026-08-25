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
