# Plan: Web ↔ iOS Parity — s9 Draft Order Proposal

**Status**: Done
**Created**: 2026-06-04
**Last updated**: 2026-06-05
**Epic**: [`../PLAN.md`](../PLAN.md)
**Brainstorm**: [`../BRAINSTORM.md`](../BRAINSTORM.md)

---

## TL;DR

Port the iOS `DraftOrderView` to web as a **view-only `DraftOrderComponent`** at `/league/draft-order`. The screen is a **computed, read-only projection** of the proposed Reverse-HPP draft order — it is **not** a proposal/vote flow. It ranks non-playoff teams by ascending season HPP (highest-possible-points / perfect-lineup score) and parks playoff teams at the back by playoff finish. The `MockDraftEngine` simulator is **explicitly deferred** to a follow-up stub (`s9b-mock-draft-engine`).

**Stub-correction (important):** the skeleton assumed s9 reuses the s3 rule-proposal/vote infra (`rules.service.ts` `rule_proposals`/`rule_votes` tables). After reading iOS source, **that assumption is wrong** — see "iOS-to-web mapping." iOS writes nothing and reads no proposals table. The real work is porting an HPP calculator + playoff-finish derivation + a projection compute, all client-side from existing Sleeper/standings data.

---

## Scope

### In
- New `DraftOrderComponent` at route `/league/draft-order` (under the League shell — matches the iOS sidebar's League section and the existing placeholder entry).
- An explainer card ("PROPOSAL — Reverse-HPP draft order"; not in effect; how it works) mirroring iOS copy.
- A **read-only projected order list**: two sections — Reverse-HPP order (non-playoff teams, ascending HPP) and Playoff teams (back of the draft, ordered by playoff finish). Each row shows rank, team name, record, PF, season HPP, and a playoff badge.
- The supporting **client-side computation** ported from iOS: HPP calculator, playoff-finish map, and the projection sort. This is the substance of the feature.
- Loading / empty / pending states matching iOS (`Loading league…`, `Draft Order Pending` when per-week data is unaggregated).
- Wire the existing sidebar placeholder (`sidebar.entries.ts` Draft Order) to the real route + register the lazy route.

### Out
- **`MockDraftEngine` simulation port** — explicitly deferred to **`s9b-mock-draft-engine`** (the entire `Xomper/Features/DraftOrder/Mocks/` directory: engine, personalities, seeded RNG, mock cards). Not in s9.
- **Proposal/vote UI or DB writes.** iOS has none on this surface; do not bolt on a `rule_proposals` form here. (If a future product decision wants Draft Order to become votable, that is a separate stub.)
- Theme / visual polish — **s10**.
- Backend changes — none required (computation is client-side over existing Sleeper + matchup-history data).

---

## iOS-to-web mapping

| iOS surface (`DraftOrderView.swift`) | What it does | Web target | Data source |
|---|---|---|---|
| `proposalContent` / `proposalReady` | Read-only projection screen; no internal tabs, no `viewMode`, **no proposal write/vote** | `DraftOrderComponent` template | computed in-component |
| `explainerCard` | Static copy: "this is a *proposed* rule, not in effect yet" | explainer card markup | static |
| `DraftOrderProjection.compute(...)` | Builds standings → splits playoff/non-playoff → sorts | new `DraftOrderProjectionService` (or in-component method) | `StandingsService` + history |
| `HighestPossibleCalculator.seasonHPP` | Per-week optimal-lineup sum over the regular season | **new** `HighestPossibleCalculator` util (port) | per-week per-player points (**gap — see risks**) |
| `playoffFinishMap` | rosterId → final playoff finish from bracket `placement` | playoff-finish derivation | `league-history.service` matchup records |
| `regularSeasonLastWeek` | `playoff_week_start - 1`, fallback 14 | helper | league settings |

**Finding — what "draft order proposal" actually is:** a **commissioner/league rule preview**, computed and rendered read-only. The "PROPOSAL" badge is editorial copy describing a *proposed league rule* (#57 Reverse-HPP), not an interactive proposal record. There is **no vote, no `rule_proposals` row, no `rule_votes` row** on this surface. The live, in-effect order lives elsewhere (iOS Draft tab's Live sub-tab; web s4 draft restructure) and is out of scope here.

**Finding — proposal backend (shared table vs separate):** **Neither.** iOS does not persist this projection anywhere — it recomputes on view. So the answer to the stub's open question is: **no shared table, no separate table.** Web should likewise compute on the fly. `rules.service.ts` is **not** a dependency of s9.

---

## Phase 0 — setup

- [x] Open a tracking issue: "s9 — Draft Order Proposal (view-only projection)". → #98
- [x] Branch off master (`e2254b4`, post-s8b): `feature/98-draft-order-projection`.
- [x] In-flight check: confirm s3 (league surface split) and s4 (draft restructure) are merged into master and the League child-route block in `app-routing.module.ts` is the current shape.
- [x] Confirm no concurrent branch is editing `app-routing.module.ts` or `sidebar.entries.ts`.

---

## Affected files / components

| File / Component | Change | Why |
|---|---|---|
| `src/app/pages/league/draft-order/draft-order.component.ts` (+`.html`/`.scss`/`.spec.ts`) | New standalone component | The view-only projection surface |
| `src/app/services/draft-order-projection.service.ts` (new) | Port `DraftOrderProjection.compute` | Builds the two-section ranked order |
| `src/app/services/highest-possible-calculator.ts` (new util) | Port `HighestPossibleCalculator` | HPP / perfect-lineup scoring |
| per-week player-points access (new or extended) | Provide `weeklyRosterPoints` equivalent | HPP needs per-week per-player scores — **does not exist on web yet** |
| `src/app/services/league-history.service.ts` | Expose playoff-finish derivation (or add `playoff_placement` to records) | Playoff-team ordering |
| `src/app/app-routing.module.ts` | Add `draft-order` lazy child under `league` | Route registration |
| `src/app/components/sidebar/sidebar.entries.ts` | Point Draft Order entry at `/league/draft-order`; drop `placeholder` | Wire nav |

---

## Implementation steps

1. [x] **Verify data availability first.** Confirmed: `Matchup.players_points` is present on web (`matchup.interface.ts:9`). No backend work needed — direct Sleeper fetch per week is sufficient.
2. [x] **Port `HighestPossibleCalculator`** as a framework-free TS util: slot-eligibility map, greedy optimal-lineup assignment, `seasonHPP(rosterId, rosterPositions, weeklyPoints, lastWeek)`. 6 unit tests written and passing.
3. [x] **Port playoff-finish derivation** — used seed-based derivation via standings rank (documented fidelity gap: granular bracket `placement` not available in web matchup records).
4. [x] **Build `DraftOrderProjectionService.compute`**: standings → split by `playoff_teams` count → non-playoff ascending HPP → playoff sorted by finish. Returns `{ nonPlayoffOrder, playoffOrder }`.
5. [x] **Build `DraftOrderComponent`**: explainer card + two sections + rows (rank, team, record, PF, HPP, playoff badge). Loading / pending / empty states.
6. [x] **Register route** `draft-order` as lazy child under `league` in `app-routing.module.ts`.
7. [x] **Wire sidebar** entry to `/league/draft-order`, removed `placeholder: true`.
8. [x] **Unit tests**: 7 tests (6 HPP calculator + 1 component smoke). All passing.
9. [x] **Add `s9b-mock-draft-engine` stub** at `docs/features/web-ios-parity/s9b-mock-draft-engine/PLAN.md`.

---

## Decisions to surface

- **Route placement** → **Decided: `/league/draft-order`** (League shell child). Matches the iOS sidebar's League section and the existing placeholder entry. Not top-level `/draft-order`, not under Draft/Play.
- **Proposal backend (shared vs separate)** → **Decided: neither.** iOS persists nothing; compute on the fly. `rules.service.ts` is not used. (Corrects the skeleton.)
- **Mocks UI** → **Omit entirely in s9**, not stub-in-place. The deferral lives in the `s9b` stub doc, not as a placeholder card on this screen — keeping s9 a clean read-only projection. (If product wants a teaser card, that is a one-line follow-up, not s9.)
- **Per-week points fetch** → open until step 1; may force a small data-layer addition (see risks).

---

## Risks / tradeoffs

- **Scope creep into the mock engine** — the directory is large and tempting. **Be ruthless: s9 is the projection list only.** Any simulation work belongs to `s9b`.
- **HPP data dependency is the real risk, not proposal overlap.** Web has no per-week per-player points store today. If sourcing that is heavier than expected, the projection's HPP column cannot be computed faithfully. Mitigation: gate on step 1; if blocked, descope to standings-only ordering with HPP marked "pending" rather than shipping wrong numbers.
- **Playoff-finish fidelity** — web matchup records expose `is_playoff`/`is_championship`/`is_runner_up`/`playoff_seed` but maybe not iOS's granular `placement` (3rd/5th/7th games). Accepted tradeoff: fall back to seed-based ordering for unresolved finishes; document the gap.
- **Proposal-infra mis-port** — the skeleton's premise was wrong; do **not** reuse `rule_proposals`/`rule_votes`. Building a vote UI here would be a fidelity regression vs iOS.

---

## Open questions

- [ ] Can web obtain per-week per-roster `players_points` without new backend work (client-side Sleeper fetch acceptable), or does faithful HPP require a server aggregation? (Gates step 1 → step 2.)
- [ ] Do web matchup-history records carry bracket `placement` granularity, or only champion/runner-up flags? (Determines playoff-finish fidelity vs the seed fallback.)

---

## Success criteria

- [ ] `/league/draft-order` renders under the League shell; sidebar entry navigates there (no placeholder).
- [ ] Explainer card mirrors iOS copy and the "proposed, not in effect" framing.
- [ ] Non-playoff section lists teams in **ascending season HPP**; playoff section parks teams at the back ordered by finish with correct tie-break.
- [ ] HPP values match the iOS calculator for shared test fixtures (or HPP is explicitly marked pending if data-blocked — no wrong numbers shipped).
- [ ] No proposal/vote UI and no `rule_proposals`/`rule_votes` writes on this surface.
- [ ] `s9b-mock-draft-engine` stub exists documenting the deferred simulator.

---

## Next step

Resolve open question 1 (per-week points availability) — it gates the build. Then flip Status to `Ready` and run `/execute s9-draft-order-proposal`.
