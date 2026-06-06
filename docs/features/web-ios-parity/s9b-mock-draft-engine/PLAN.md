# Plan: Web ↔ iOS Parity — s9b Mock Draft Engine

**Status**: Draft
**Created**: 2026-06-05
**Last updated**: 2026-06-05
**Epic**: [`../PLAN.md`](../PLAN.md)

---

## TL;DR

Port the iOS `MockDraftEngine` and personality system to web as an interactive
simulation layer on top of the `DraftOrderComponent` draft order projection.

This stub was explicitly **deferred out of s9** (Draft Order projection). The
projection screen (`/league/draft-order`) is read-only; the mock engine
simulation belongs here in s9b.

---

## Deferred From

s9 (`s9-draft-order-proposal`) deliberately excluded the entire
`Xomper/Features/DraftOrder/Mocks/` iOS directory:

- `MockDraftEngine.swift` — seeded RNG simulation loop
- `MockDraftPersonality.swift` — per-team drafting personality profiles
- `MockDraftCard.swift` — per-pick card UI
- Seeded RNG utility

---

## Scope (to be defined)

- [ ] Define scope once s9 is merged and the projection UI is stable.
- [ ] Port `MockDraftEngine` as an Angular service.
- [ ] Port personality profiles.
- [ ] Build simulation UI on top of `DraftOrderComponent` or as a sibling tab.
- [ ] Add `/league/draft-order/simulate` sub-route (TBD).

---

## Open Questions

- [ ] Should the mock draft engine be a tab within the Draft Order view or a
      separate route?
- [ ] Do personalities need to be editable per-session or are they static iOS
      port?
- [ ] What replay/share story is needed (if any)?

---

## Next Step

Flip **Status** to `Ready` after s9 is merged and scope is confirmed.
