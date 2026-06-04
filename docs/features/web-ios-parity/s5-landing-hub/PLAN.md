# Plan: Web ↔ iOS Parity — s5 Landing Hub

**Status**: Draft
**Created**: 2026-06-04
**Epic**: [`../PLAN.md`](../PLAN.md)
**Brainstorm**: [`../BRAINSTORM.md`](../BRAINSTORM.md)

---

## TL;DR

Build `LandingComponent` with 5 cards (Headline AI Report, Draft countdown, Announcements, Standings scroll bar, This-week matchups) + 2 new services (`ai-review.service`, `announcements.service`).

**Critical milestone:** when this stub merges, the `?newShell=1` gate's default flips (decision D-E) — production users get the new chrome by default.

---

## iOS source surfaces

- `Xomper/Features/Landing/LandingView.swift`

## Web surfaces touched

- `pages/landing/landing.component.*` (new)
- `services/ai-review.service.ts` (new — skeleton; full surface in s6)
- `services/announcements.service.ts` (new)
- `app.routes.ts` — register `/` → `landing`
- Card sub-components: `landing-headline-card`, `landing-draft-countdown-card`, `landing-announcements-card`, `landing-standings-scroll-card`, `landing-this-week-card`
- Existing services consumed: `league.service` (matchups, standings, nflState), `league-history.service`

---

## Dependencies

- **s1** (shell + nav rewrite) — `/` routes to `landing` instead of `home`/`my-profile`.
- **s3** (league surface split) — standings + this-week-matchups card consumers reuse the extracted components/services.

---

## Open questions for `/plan` to resolve

- [ ] **Card loading order**: render all 5 cards in parallel with skeletons, or prioritize Headline first since it's the most prominent? Affects perceived performance.
- [ ] **Announcements pagination**: iOS shows the most recent active announcement. Web — single card with most recent, or stack 2–3 most recent? Brainstorm doesn't specify.
- [ ] **Empty state per card**: e.g., no draft scheduled, no AI headline yet — hide the card, show "nothing yet" copy, or collapse? Need a consistent rule.
- [ ] **`?newShell=1` default flip mechanics**: PR description must call out the flip; do we want a one-PR-prior canary where the gate-default flips ahead of the Landing PR, or flip in the same PR that lands the surface?

---

## Out of scope

- Building the full AI Review list/detail surface — s6 owns that. This stub only adds the `headline` method on the new service.
- Admin Announcements CRUD — s7 owns that. This stub only adds the **read** path.
- Theme/visual polish — s10.
- Backend changes. None required.

---

## Backend contract dependencies

| New service(s) | Backend contract used | New backend work? |
|---|---|---|
| `ai-review.service` (new), `announcements.service` (new) | Lambda `GET /ai-reports/headline`, Supabase `league_announcements` | No |

---

## Success criteria

- `/` renders 5 cards matching iOS `LandingView` layout (headline, draft countdown, announcements, standings scroll, this-week matchups).
- `ai-review.service` exposes a `getHeadline()` method consumable by s6.
- `announcements.service` exposes a `getActive()` read method consumable by s7.
- Each card has a defined loading / empty / error state.
- After merge, `?newShell=1` gate default flips (per D-E).

---

## Next step

Run `/plan s5-landing-hub` to expand this skeleton into implementation-level detail.
