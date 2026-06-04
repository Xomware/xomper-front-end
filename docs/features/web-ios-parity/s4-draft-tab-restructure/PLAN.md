# Plan: Web ↔ iOS Parity — s4 Draft Tab Restructure

**Status**: Draft
**Created**: 2026-06-04
**Epic**: [`../PLAN.md`](../PLAN.md)
**Brainstorm**: [`../BRAINSTORM.md`](../BRAINSTORM.md)

---

## TL;DR

Lift `pages/draft-history` to per-year sub-tabs (Live / Mocks / Recap for current season, Picks / Recap for past).

---

## iOS source surfaces

- `Xomper/Features/DraftHistory/DraftHistoryView.swift`

## Web surfaces touched

- `pages/draft-history/draft-history.component.*` (restructure to per-year)
- New sub-components: `draft-live`, `draft-mocks` (placeholder — engine deferred), `draft-recap`, `draft-picks` (past season)
- `services/league.service.ts` — reused for picks data
- (Recap data) `ai-review.service.ts` — introduced by s5, consumed here

---

## Dependencies

- **s3** (league surface split) — establishes the per-route component pattern this stub plugs into; Rules mega-tab vacated.

---

## Open questions for `/plan` to resolve

- [ ] **Year switcher placement**: top-of-page chip row vs. inline tab strip vs. URL segment (`/draft/2026/live`)? Affects deep-linkability and back-button behavior.
- [ ] **Mocks sub-tab in v1**: ship as an empty placeholder card pointing to "available on iOS" (mirrors brainstorm note that `MockDraftEngine` is iOS-only), or skip the sub-tab entirely for current season until s9b lands?
- [ ] **Recap sub-tab data source**: depends on `ai-review.service` from s5. If s5 hasn't shipped yet, does s4 ship without Recap or hard-block on s5 first?
- [ ] **Past-season "Picks" view**: reuse current draft picks table component, or build a read-only variant with different styling?

---

## Out of scope

- Building the `MockDraftEngine` port — deferred to a follow-up sub-stub (`s9b-mock-draft-engine` per epic plan risks).
- Draft Order Proposal route — that's s9.
- Theme/visual polish — s10.
- Backend changes. None required.

---

## Backend contract dependencies

| New service(s) | Backend contract used | New backend work? |
|---|---|---|
| — for Live/Picks; Recap consumes `ai-review.service` (from s5) | Lambda `GET /ai-reports/...` (via s5/s6) | No |

---

## Success criteria

- `/draft` (or equivalent) shows a year switcher; current-season view has Live / Mocks / Recap sub-tabs; past-season views have Picks / Recap.
- Live sub-tab renders the same data the current `draft-history` page renders today.
- Past-season Picks renders read-only picks per year.
- Mocks sub-tab renders an explicit "deferred" placeholder (decision pending — see open questions).
- Deep linking to a specific year + sub-tab works.

---

## Next step

Run `/plan s4-draft-tab-restructure` to expand this skeleton into implementation-level detail.
