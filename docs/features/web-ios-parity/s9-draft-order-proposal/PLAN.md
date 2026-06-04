# Plan: Web ↔ iOS Parity — s9 Draft Order Proposal

**Status**: Draft
**Created**: 2026-06-04
**Epic**: [`../PLAN.md`](../PLAN.md)
**Brainstorm**: [`../BRAINSTORM.md`](../BRAINSTORM.md)

---

## TL;DR

Build `DraftOrderComponent` view-only (proposal form + read-only mock display). Full `MockDraftEngine` port is **explicitly deferred** to a follow-up sub-stub (`s9b-mock-draft-engine`).

---

## iOS source surfaces

- `Xomper/Features/DraftOrder/DraftOrderView.swift`

## Web surfaces touched

- `pages/draft-order/draft-order.component.*` (new)
- Proposal form sub-component
- Read-only mock display sub-component
- `services/rules.service.ts` — extended (proposals share infra with Rule Proposals from s3)
- `app.routes.ts` — register `/draft-order` or `/league/draft-order`

---

## Dependencies

- **s3** (league surface split) — Rule Proposals route exists with the shared proposal infra this stub extends.
- **s4** (draft tab restructure) — Draft section's restructured layout sets the slot Draft Order lives near in the sidebar.

---

## Open questions for `/plan` to resolve

- [ ] **Mock display data source**: read-only display of what? iOS uses `MockDraftEngine` output cached server-side — does web have a cached mocks endpoint, or does view-only mean "no mocks shown at all until s9b"?
- [ ] **Proposal form shape**: same fields as Rule Proposals (text body + vote), or Draft Order specific (suggested order list + rationale)? Need to read iOS source to confirm.
- [ ] **Sidebar placement**: under League (with Rule Proposals) or under Play / Draft (with the Draft tab)? Epic plan implies Draft adjacency; brainstorm says shared infra with Rule Proposals.
- [ ] **Engine deferral copy**: the Mocks placeholder card needs explicit "engine port pending — view-only for now" copy. What CTA, if any?

---

## Out of scope

- **`MockDraftEngine` port — explicitly deferred** to follow-up `s9b-mock-draft-engine` (or skipped indefinitely per epic plan risks).
- Building any client-side mock simulation logic.
- Theme/visual polish — s10.
- Backend changes. None required.

---

## Backend contract dependencies

| New service(s) | Backend contract used | New backend work? |
|---|---|---|
| extends `rules.service` (proposals) | Supabase proposals tables | No |

---

## Success criteria

- `/draft-order` (or equivalent) renders the proposal form.
- Existing proposals (and any read-only mock data, if available) display correctly.
- Form submission writes to Supabase via `rules.service` proposal write path.
- Engine-driven mocks display a placeholder explaining the deferral.
- Sidebar entry from s1 points to the new route.

---

## Next step

Run `/plan s9-draft-order-proposal` to expand this skeleton into implementation-level detail.
