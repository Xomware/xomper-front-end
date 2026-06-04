# Plan: Web ↔ iOS Parity — s2 Search Surface Refresh

**Status**: Draft
**Created**: 2026-06-04
**Epic**: [`../PLAN.md`](../PLAN.md)
**Brainstorm**: [`../BRAINSTORM.md`](../BRAINSTORM.md)

---

## TL;DR

Rebuild `SearchComponent` to iOS's three-mode segmented control (User / League / Player) with paste-any-Sleeper-league-ID input; wire results into preserved `selected-*` pages.

---

## iOS source surfaces

- `Xomper/Features/Home/SearchView.swift`
- `Xomper/Core/Stores/SearchStore.swift`
- `Xomper/Navigation/AppRouter.swift` (`AppRoute.search`)

## Web surfaces touched

- `pages/search/search.component.*` (rebuild)
- `pages/selected-profile/*` (wire from User mode results)
- `pages/selected-league/*` (wire from League mode results + free-form league-ID input)
- `pages/selected-team/*` (drill-down from selected-league)
- `services/user.service.ts` (`searchUser`) — reused
- `services/league.service.ts` (`searchLeague`, `findUserLeagues`) — reused

---

## Dependencies

- **s1** (shell + nav rewrite) — `/search` registered as a top-level route separate from the home-league shell; `selected-*` routes retained.

---

## Open questions for `/plan` to resolve

- [ ] **Segmented control component**: hand-roll a new `SegmentedControl` primitive (reusable later in s7 Admin filters) or scope a one-off inside `SearchComponent`?
- [ ] **Player mode results target**: iOS pushes a player detail screen. Web has `components/player-modal` — open the modal from the result row, or build a dedicated `selected-player` page for URL-shareability?
- [ ] **Free-form league-ID validation**: client-side regex only, or call `searchLeague` and show inline error on 404? Affects perceived speed.
- [ ] **Search history / recent searches**: iOS `SearchStore` keeps state across navigations. Should web persist recent searches (localStorage) or reset per session?

---

## Out of scope

- Putting Search in the drawer/sidebar. Per brainstorm Q1: Search is a top-level route, not a drawer destination.
- Theme/visual polish — s10.
- Backend changes. None required.
- Modifying the home-league shell's `mode: 'my' | 'selected'` logic — the shell only uses `'my'`; `'selected'` is reached exclusively from search.

---

## Backend contract dependencies

| New service(s) | Backend contract used | New backend work? |
|---|---|---|
| — (reuses `league.service`, `user.service`) | Sleeper API + Supabase | No |

---

## Success criteria

- `/search` shows a three-mode segmented control (User / League / Player) matching iOS layout.
- League mode accepts a pasted Sleeper league ID and opens a read-only `selected-league` view.
- User mode results push to `selected-profile`; League mode results push to `selected-league`; Player mode opens the player detail surface (decision pending — see open questions).
- Empty / loading / error states render per iOS pattern (no raw spinners).
- `selected-*` pages render correctly when reached from Search (no regressions vs. pre-s1 behavior).

---

## Next step

Run `/plan s2-search-surface-refresh` to expand this skeleton into implementation-level detail.
