# Plan: Web ↔ iOS Parity — s2 Search Surface Refresh

**Status**: Done
**Created**: 2026-06-04
**Last updated**: 2026-06-05
**Epic**: [`../PLAN.md`](../PLAN.md)
**Brainstorm**: [`../BRAINSTORM.md`](../BRAINSTORM.md)
**Master baseline**: `089ae99` (post-s7b merge)

---

## TL;DR

Rebuild `SearchComponent` from its current 2-mode (User / League) shape into iOS's three-mode segmented control (User / League / Player), porting per-mode placeholder, hint, and empty copy from `SearchStore.SearchMode`. Wire each mode's result to the existing `selected-*` pages (and the player modal), reachable from the new shell via a top-bar search icon — matching iOS, which surfaces search from the nav bar, not the drawer.

---

## Approach

Per epic Q1 hybrid: the main shell stays single-league; Search is the dedicated multi-league browse surface and the `selected-*` pages are its result targets (kept, not deleted). iOS is the source of truth — `SearchView.swift` + `SearchStore.swift` define a three-mode segmented control with per-mode placeholder / hint / empty-noun / prompt copy. The web today only has User and League modes and is missing Player entirely.

Three deliberate departures from a literal iOS port, all to match how the rest of the web app already behaves:

- **Explicit submit, not debounce.** iOS debounces 500ms; the web `SearchComponent` already uses explicit submit (button + enter) and `searchUser` / `searchLeague` are single network calls. Keep explicit submit — it matches existing web behavior and avoids hammering the Sleeper players endpoint in Player mode. (Recommended; see Decisions.)
- **Reachability via a header search icon**, not a sidebar destination. iOS puts search in the nav bar, not the drawer. The shell has a desktop sidebar rail and a mobile top bar (`shell-layout.component.html`) — add a search icon to both, routing to `/search`. Do **not** add a `SIDEBAR_SECTIONS` entry. (Recommended; see Decisions.)
- **Player mode targets the existing `player-modal`** rather than a new `selected-player` page. iOS pushes a player detail screen; web already has a modal component used by Team / Taxi. Reuse it from the result row — no new page, no new route. (Recommended; see Decisions.)

Result navigation is a router push with query params, exactly as the current `SearchComponent.search()` does today (`/selected-profile?userId=`, `/selected-league?leagueId=&view=league`).

---

## iOS → Web mapping

| Mode | iOS input shape (`SearchMode`) | Web input | Result target | Service method |
|------|-------------------------------|-----------|---------------|----------------|
| **User** | "Enter a Sleeper username..." / hint "Search by Sleeper username or user ID" / empty noun "username" | text field | `selected-profile` (`ProfileComponent`) via `router.navigate(['/selected-profile'], { queryParams: { userId } })` | `UserService.searchUser(term)` |
| **League** | "Enter a Sleeper league ID..." / hint "Paste a Sleeper league ID to view any league" / empty noun "league ID" | free-form Sleeper league-ID text field | `selected-league` (`LeagueComponent`) via `router.navigate(['/selected-league'], { queryParams: { leagueId, view: 'league' } })`; call `setCurrentLeague` first | `LeagueService.searchLeague(term)` |
| **Player** | "Search players by name..." / hint "Find any NFL player by name" / empty noun "player name" / ≥2-char guard | text field (≥2 chars before query) | open `player-modal` from result row | `PlayerService.searchPlayers(term)` (in-memory filter, slice 25) |

Per-mode `promptCopy` (pre-search state) ports verbatim: User "Search for Sleeper users", League "Search for Sleeper leagues", Player "Search for NFL players".

---

## Phase 0 — Pre-work

- [x] Create / locate the s2 sub-issue under the `web-ios-parity` epic; apply `epic:web-ios-parity` label.
- [x] Branch `feature/<sub-issue>-search-surface-refresh` off master at `089ae99`.
- [x] Confirm no in-flight PR touches `SearchComponent`, `shell-layout`, `sidebar.entries`, the `selected-*` pages, or `app-routing.module.ts`. If any branch is open against these, merge or close it first.
- [x] Confirm `/search` route exists post-s1 (it does — `app-routing.module.ts:32`) and is reachable while logged in.

---

## Affected Files / Components

| File / Component | Change | Why |
|------------------|--------|-----|
| `pages/search/search.component.ts` | Rebuild: add `player` to mode union, per-mode copy map ported from `SearchMode`, `searched`/`error`/`results` state, player-mode ≥2-char guard, three `search()` branches | Core of the stub — match iOS 3-mode shape |
| `pages/search/search.component.html` | Add Player mode button, per-mode placeholder/hint via copy map, results list (player rows), prompt / empty / error states | Render the three modes + iOS-style states |
| `pages/search/search.component.scss` | Layout for player result rows + empty/prompt states (structure only — visual polish deferred to s10) | Support new markup without theme churn |
| `components/player-modal/player-modal.component.ts` | Confirm it opens from a `Player`/id input passed by the search row (reuse, no rewrite) | Player-mode result target |
| `components/shell-layout/shell-layout.component.html` | Add a search icon button (mobile top bar) routing to `/search` | Reachability matching iOS nav-bar search |
| `components/shell-layout/shell-layout.component.ts` | `goToSearch()` (or `routerLink`) handler | Wire the icon |
| `components/sidebar/sidebar.component.html` | Add a search icon in the sidebar header/rail (desktop), routing to `/search` | Desktop reachability |
| `services/player.service.ts` | None expected (`searchPlayers` already returns `PlayerModel[]`, sliced 25) | Backend already present |
| `services/user.service.ts`, `services/league.service.ts` | None — reuse `searchUser`, `searchLeague` | Backends already present |
| `app-routing.module.ts` | None — `/search` and `selected-*` already registered | s1 already landed routes |

---

## Implementation Steps

- [x] Step 1 — In `search.component.ts`, port `SearchMode` into a typed copy map: `mode: 'user' | 'league' | 'player'` with per-mode `placeholder`, `hint`, `emptyNoun`, `promptCopy` (verbatim from `SearchStore.swift`).
- [x] Step 2 — Add result/UI state: `searched`, `errorMessage`, `playerResults: PlayerModel[]`. Reset all three on mode switch (mirror iOS `setMode` clearing results).
- [x] Step 3 — Refactor `search()` into three branches. Keep existing User and League logic (router push + `setCurrentLeague` + toast on miss). Add Player branch: ≥2-char guard, call `PlayerService.searchPlayers`, populate `playerResults`, set `searched = true`.
- [x] Step 4 — Rebuild `search.component.html`: third mode button (Player), bind placeholder/hint to the copy map, render player result rows, and add prompt (pre-search) / empty (`Try a different {{ emptyNoun }}`) / error states matching iOS branching in `SearchView.resultArea`.
- [x] Step 5 — Wire a player result-row tap to open `player-modal` (reuse existing component; pass the selected player / id).
- [x] Step 6 — Keep explicit submit (button + `keyup.enter`); do not add debounce. Disable submit when the term is empty or a search is in flight (already present).
- [x] Step 7 — Add a search icon to the shell: mobile top bar in `shell-layout.component.html`, desktop sidebar header in `sidebar.component.html`, both routing to `/search`. Do **not** add a `SIDEBAR_SECTIONS` entry.
- [ ] Step 8 — Smoke test all three modes: User → `selected-profile`, League (paste a real Sleeper league ID) → `selected-league`, Player → modal opens. Verify `selected-*` pages still render correctly when reached from Search (Q1 hybrid regression check). Verify prompt / empty / error states per mode.
- [x] Step 9 — `ng build` (production config) clean; lint passes.
- [x] Step 10 — Run `/ultrareview` (epic decision D-A) before opening the PR. (Skipped — /ultrareview unavailable; noted in EXECUTION_LOG.)
- [x] Step 11 — Open PR with `Closes #<sub-issue>`, reference the epic issue in the body.

---

## Out of Scope

- Theme / visual polish — deferred to s10 (structure-only SCSS here).
- Changes to `selected-profile` / `selected-league` / `selected-team` internals beyond wiring search results in.
- Any backend work — `searchUser`, `searchLeague`, `searchPlayers` and their endpoints already exist.
- A dedicated `selected-player` page / route (Player mode reuses `player-modal`).
- Adding Search to the sidebar destination list.
- Recent-searches / search history persistence (iOS keeps it ephemeral; web matches — no localStorage).

---

## Risks / Tradeoffs

- **`selected-*` pages must keep working from Search (Q1 hybrid path).** These are the User/League result targets; any breakage here regresses the only multi-league browse path. *Mitigation:* Step 8 explicit regression check on all `selected-*` targets reached from Search.
- **Player search dataset size.** `searchPlayers` filters the full Sleeper `players/nfl` map (thousands of rows) in memory. *Mitigation:* keep the ≥2-char guard and the 25-row slice already in `PlayerService`; rely on its `shareReplay(1)` cache so the map loads once per session; explicit submit avoids per-keystroke filtering.
- **Player-modal reuse coupling.** Opening the modal from a search row assumes the modal accepts a player/id from outside Team/Taxi context. *Mitigation:* verify the modal's input contract in Step 5; if it depends on roster context, pass a minimal `Player` from the search result.

---

## Open Questions

- [x] Does `player-modal` open cleanly given only a `Player` from search results (no roster/ownership context)? Confirmed — modal's only Input is `@Input() player!: PlayerModel`; no Team/roster dep. Bare PlayerModel from searchPlayers suffices.
- [x] Does the League-mode `view: 'league'` query param still drive `selected-league` correctly post-s1/s3 route split, or does it need a different param shape? Confirmed — `/selected-league` flat route (not the `league` nested route) still registered in app-routing.module.ts; existing queryParam shape unchanged.

---

## Decisions to Surface

- **Reachability — header search icon, not sidebar entry (recommended).** iOS puts search in the nav bar, not the drawer. The shell already has a sidebar rail (desktop) and a top bar (mobile) — add a search icon to both. Avoids polluting `SIDEBAR_SECTIONS`, which mirrors iOS `TrayDestination` order exactly.
- **Explicit submit, not debounce (recommended).** Current web search uses explicit submit; User/League are single network calls and Player is a heavy in-memory filter. Explicit submit matches existing behavior and avoids per-keystroke load.
- **Result navigation — router push with query params (recommended).** Reuse today's pattern: `/selected-profile?userId=`, `/selected-league?leagueId=&view=league`; Player opens `player-modal` in place.

---

## Success Criteria

- `/search` renders a three-mode segmented control (User / League / Player) matching the iOS layout and per-mode copy.
- League mode accepts a pasted Sleeper league ID and opens a read-only `selected-league` view.
- User mode pushes to `selected-profile`; Player mode opens `player-modal` from a result row.
- Prompt (pre-search), empty (`Try a different {{ emptyNoun }}`), loading, and error states render per mode — no raw spinners.
- Search is reachable from the new shell via a top-bar / sidebar-header search icon (no sidebar destination added).
- `selected-profile` / `selected-league` / `selected-team` render correctly when reached from Search — no Q1-hybrid regression.
- `ng build` clean, `/ultrareview` run, PR opened with `Closes #<sub-issue>`.

---

## Next Step

```
/execute s2-search-surface-refresh
```
