# Plan: Web ↔ iOS Parity — s4 Draft Tab Restructure

**Status**: Done
**Created**: 2026-06-04
**Last updated**: 2026-06-05
**Epic**: [`../PLAN.md`](../PLAN.md)
**Brainstorm**: [`../BRAINSTORM.md`](../BRAINSTORM.md)

---

## TL;DR

Restructure the flat `/draft-history` page into an iOS-matching per-year view with sub-tabs. Current season gets **Live / Mocks / Recap**; past seasons get **Picks / Recap**. Live ports the iOS `LiveDraftView` (board grid + rounds list + All/My Picks toggle + `traded_picks` per-round ownership). Recap and Mocks render stored AI reports through the existing `StyledMarkdownComponent` and `AiReviewService`. The heavy `MockDraftEngine` is NOT ported — Mocks is read-only.

---

## Scope

### In scope
- Restructure `/draft-history` into a per-year shell with a year switcher and nested sub-tab routes.
- **Live** (current season): port iOS `LiveDraftView` — board grid + rounds list, All/My Picks toggle, live countdown header, `traded_picks` per-round ownership override, 5s polling while `drafting`.
- **Picks** (past seasons): the existing past-draft board/list rendering, lifted into a sub-tab.
- **Recap** (both modes): stored post-draft AI report via `AiReviewService.list({ type: 'postDraft' })` + `StyledMarkdownComponent`. Draft grades port only if a web player-values source exists — it does not today, so grades are **deferred** (see Decisions).
- **Mocks** (current season): read-only list of stored mock-draft AI reports via `AiReviewService.list({ type: 'mock', forUser })`, rendered with `StyledMarkdownComponent`. Mock-gating already filters non-admins.

### Out of scope
- `MockDraftEngine` client-side simulation port — deferred (epic risk, `s9b`).
- Draft grades (`DraftGradeCalculator`) — deferred pending a web FantasyCalc values service.
- Theme/visual polish — s10.
- Backend work — none. All endpoints already exist.
- `DraftOrderProposal` route — s9.

---

## iOS → Web mapping

| Sub-tab | iOS source | Web component (new) | Data source |
|---|---|---|---|
| Live (current) | `Draft/LiveDraftView.swift` | `draft-live.component` | Sleeper `getDraftsForLeague` + `getDraftPicks` (poll) + `league.getTradedPicks` |
| Mocks (current) | `Draft/MocksView.swift` | `draft-mocks.component` | `AiReviewService.list({ type: 'mock', forUser })` + `StyledMarkdownComponent` |
| Recap (both) | `Draft/DraftRecapView.swift` (+ `DraftGradesCard`) | `draft-recap.component` | `AiReviewService.list({ type: 'postDraft' })` + `StyledMarkdownComponent`; grades deferred |
| Picks (past) | `DraftHistoryView.swift` board/list | `draft-picks.component` | existing `LeagueHistoryService.getDraftHistoryFromChain` |
| Shell + year switcher | `DraftHistoryView.swift` + `DraftSubTabBar.swift` | `draft-history.component` (rewritten) | `availableSeasons` from history chain |

---

## Phase 0 — pre-work

- [x] Create/locate the GitHub sub-issue for s4 (`epic:web-ios-parity` label); branch `feature/<issue>-draft-tab-restructure` off `main` (master = `c1eae4d`, post-s2).
- [x] Confirm no in-flight PR touches `pages/draft-history/*`, `app-routing.module.ts`, or `sidebar.entries.ts`.
- [x] Confirm `StyledMarkdownComponent` (`src/app/components/styled-markdown/`) and `AiReviewService` (s5/s6) are on `main` — both verified present.
- [x] Confirm `LeagueService.getTradedPicks(leagueId)` exists — verified present (`league.service.ts:130`).

---

## Affected files

| File / Component | Change | Why |
|---|---|---|
| `pages/draft-history/draft-history.component.{ts,html,scss}` | Rewrite to per-year shell: year switcher + `<router-outlet>` for sub-tabs; resolve current vs past mode | Mirrors iOS `DraftHistoryView` orchestrator |
| `pages/draft-history/live/draft-live.component.*` | New — port `LiveDraftView` | Live sub-tab |
| `pages/draft-history/picks/draft-picks.component.*` | New — lift existing board/list rendering | Picks sub-tab (past) |
| `pages/draft-history/recap/draft-recap.component.*` | New — markdown recap | Recap sub-tab |
| `pages/draft-history/mocks/draft-mocks.component.*` | New — read-only mock report list | Mocks sub-tab |
| `services/draft.service.ts` | Add `getTradedPicks` passthrough OR call `league.service` directly; expose poll helper | Live ownership + polling |
| `app-routing.module.ts` (or `app.routes.ts`) | Nested routes `/draft-history/:year/{live\|picks\|recap\|mocks}` with redirect to default per mode | Bookmarkable deep links |
| `sidebar.entries.ts` | Point Draft entry at `/draft-history` (default-year redirect) | Nav parity |

---

## Implementation steps

1. **Routing skeleton.** Add nested routes under `/draft-history/:year` with children `live`, `picks`, `recap`, `mocks`. Add a year-level resolver/guard that redirects to the mode default (`live` for current season, `picks` for past) when no child is specified. Mirrors iOS `defaultSubTab(isCurrentSeason:)`.
2. **Shell rewrite.** Convert `draft-history.component` to render the year switcher (chip row) + sub-tab bar (filtered by `isCurrentSeason = year === nflState.currentSeason`) + `<router-outlet>`. Move season-resolution logic (`availableSeasons`, current-vs-past) here; drop the inline round rendering.
3. **Picks sub-tab.** Lift the existing `groupByRound` / board / list rendering out of the old component into `draft-picks.component`. Reuse `LeagueHistoryService`. Read-only; this is the past-season default.
4. **Recap sub-tab.** Build `draft-recap.component`: call `AiReviewService.list({ type: 'postDraft' })`, pick the row matching `:year` (period/season match), render `bodyMarkdown` via `StyledMarkdownComponent`. Empty state when no report. **No grades** — add a `TODO(grades)` note where `DraftGradesCard` would mount.
5. **Mocks sub-tab.** Build `draft-mocks.component`: `AiReviewService.list({ type: 'mock', forUser: { isAdmin } })`, render a list of report cards each expanding to `StyledMarkdownComponent`. Read-only. Empty state for non-admins / no mocks.
6. **Live sub-tab — static structure.** Build `draft-live.component` with the controls bar (All/My Picks chips + rounds/board toggle), header card (countdown via RxJS `interval(1000)` → `async` pipe), and slot→team mapping from `draft.draft_order` + league users. Port `liveTeamsBySlot`.
7. **Live — traded picks.** Port `liveTeamsBySlotByRound`: fetch `league.getTradedPicks(leagueId)`, build `slot → originalRoster → currentOwner` per round, override the base map. Matches iOS exactly.
8. **Live — polling.** Add a `draft.service` picks-poll: `interval(5000)` (drafting) / `interval(30000)` (pre_draft) / stop (complete), `switchMap` to `getDraftPicks`, `takeUntilDestroyed`. Map picks into a `"round.slot"` cell lookup; flip empty rows/cells to "pick made".
9. **Live — render modes.** Port rounds-list (`liveRichRow`) and board grid (`liveBoard`/`liveBoardCell`) including My-Picks dimming (board) / filtering (list).
10. **Sidebar + nav.** Update `sidebar.entries.ts` Draft entry → `/draft-history`; verify deep links to `/:year/:subtab` work and survive refresh.
11. **Verify `selected-*` mode** is unaffected (epic constraint) — this surface is `my`-league only, confirm no `selected-league` regression.
12. **`/ultrareview`** per epic decision D-A, then open PR with `Closes #<issue>`.

---

## Decisions to surface

- **Draft grades — DEFER.** No web player-values / FantasyCalc service exists (`services/` has no `player-values`, `fantasycalc`, or `grade` source). Porting `DraftGradeCalculator` would require building that values pipeline first — out of proportion for s4. Ship Recap as markdown-only; file a follow-up (`s4b-draft-grades`) gated on a values service. Note the gap in the Recap empty/footer.
- **Traded picks — PORT.** `LeagueService.getTradedPicks` already hits Sleeper `/league/{id}/traded_picks` (`league.service.ts:130`). Port the iOS per-round ownership override in full; no backend gap.
- **Sub-tab routing — NESTED ROUTES.** Use `/draft-history/:year/{live|picks|recap|mocks}` for bookmarkability, consistent with s3's per-route split. Reject in-component tab state (loses deep links).
- **Live polling — PORT (5s/30s).** The picks endpoint exists (`getDraftPicks`). Port the iOS cadence via RxJS `interval` + `switchMap` + `takeUntilDestroyed`; stop polling when status is complete.

---

## Risks / tradeoffs

- **`traded_picks` correctness.** Endpoint exists but the slot→roster→owner mapping is subtle (keyed by original roster, not slot). _Mitigation:_ port the iOS logic verbatim; test against a season with a known traded pick.
- **No FantasyCalc values on web.** Recap ships without grades — visible parity gap vs iOS. _Mitigation:_ explicit follow-up stub; note in UI.
- **Live polling cost.** A 5s poll runs only while a draft is `drafting` and the tab is mounted. _Mitigation:_ stop on complete, `takeUntilDestroyed` on navigate-away; do not poll past seasons.

---

## Open questions

- [ ] Recap report → year matching: does the `postDraft` report's `period`/`season` reliably encode the draft year, or do we match on `createdAt`? Confirm against a real `postDraft` row before wiring step 4.
- [ ] Year switcher placement on mobile: shared chip row above the sub-tab bar, or fold the year into a dropdown when sub-tabs crowd the width?

---

## Success criteria

1. `/draft-history` redirects to the current season's `live` sub-tab; a year switcher lists all seasons from the league chain.
2. Current season shows Live / Mocks / Recap; past seasons show Picks / Recap; switching years resets to the mode default.
3. Live renders both rounds-list and board-grid, with a working All/My Picks toggle and a live countdown.
4. Traded picks display the correct current owner per round in both Live render modes.
5. While a draft is `drafting`, picks populate without a manual refresh and polling stops when complete.
6. Recap renders the stored `postDraft` report as styled markdown; Mocks renders stored `mock` reports read-only (gated for non-admins).
7. Deep linking to `/draft-history/:year/:subtab` works on refresh; `selected-*` league mode is unregressed.

---

## Next step

```
/execute s4-draft-tab-restructure
```
