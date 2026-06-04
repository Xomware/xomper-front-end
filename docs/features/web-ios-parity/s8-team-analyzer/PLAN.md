# Plan: Web ↔ iOS Parity — s8 Team Analyzer

**Status**: Draft
**Created**: 2026-06-04
**Epic**: [`../PLAN.md`](../PLAN.md)
**Brainstorm**: [`../BRAINSTORM.md`](../BRAINSTORM.md)

---

## TL;DR

Port `TeamAnalyzerView.swift` hexagon chart.

---

## iOS source surfaces

- `Xomper/Features/TeamAnalyzer/TeamAnalyzerView.swift`

## Web surfaces touched

- `pages/team-analyzer/team-analyzer.component.*` (new)
- `app.routes.ts` — register `/team/analyzer` (or per planning)
- `services/team.service.ts` — reused (Sleeper roster data already present)
- Likely new sub-component / utility for the hexagon chart rendering

---

## Dependencies

- **s1** (shell + nav rewrite) — Team-section sidebar entry must exist.

Independent of all other feature stubs (s2–s7, s9).

---

## Open questions for `/plan` to resolve

- [ ] **Chart rendering tech**: hand-roll SVG (matches iOS native draw, no dep), use a small lib (`d3-shape` only), or pull in a charting lib? Brainstorm says hand-rolled — confirm SVG is the chosen path.
- [ ] **Strength categories**: which dimensions are on the hexagon — match iOS exactly (presumably QB / RB / WR / TE / FLEX / DEF or similar), or extend? Need to read the iOS source to enumerate.
- [ ] **Comparison mode**: iOS renders one team. Does web ship a "compare two teams" overlay now, or single-team only matching iOS?
- [ ] **Selected-team mode**: does the analyzer render for foreign teams reached via Search, or home-league only?

---

## Out of scope

- Theme/visual polish — s10.
- Backend changes. None required.
- Any new Sleeper data — strengths derived from existing roster + season data.

---

## Backend contract dependencies

| New service(s) | Backend contract used | New backend work? |
|---|---|---|
| — (Sleeper data already in `team.service`) | Sleeper API | No |

---

## Success criteria

- `/team/analyzer` (or equivalent) renders a hexagon chart for the home team.
- Chart axes/dimensions match iOS.
- Loading / empty / error states match the rest of Team section UX.
- Sidebar Team-section entry from s1 points to the new route.

---

## Next step

Run `/plan s8-team-analyzer` to expand this skeleton into implementation-level detail.
