# Plan: Web ↔ iOS Parity — s10 Midnight Emerald Sweep

**Status**: Draft
**Created**: 2026-06-04
**Epic**: [`../PLAN.md`](../PLAN.md)
**Brainstorm**: [`../BRAINSTORM.md`](../BRAINSTORM.md)

---

## TL;DR

Component-level visual port: dark gradient backgrounds, gold/red accent treatments, red `h2` headers, red dividers, typography pass. Tokens already exist from s1; this is the styling sweep. **Must be last** so feature PRs don't churn on visual review.

---

## iOS source surfaces

- `Xomper/Core/Theme/XomperColors.swift`
- `Xomper/Core/Theme/XomperTheme.swift`

## Web surfaces touched

- `styles.scss` — extend the token namespace established in s1 (typography, spacing, gradients, shadows)
- Every feature component shipped in s1–s9 — apply tokens + Midnight Emerald treatments
- Existing components (toolbar refs removed by s1; sidebar, drawer, modals, cards, tables)
- Email-template-style elements: red `h2`, red dividers, gold accents
- Typography pass: Dynamic Type parity (CSS `clamp()` or rem scaling)

---

## Dependencies

**Every prior stub** (s1 through s9). This stub explicitly waits for the last feature surface to merge so visual review happens once, not per-PR.

---

## Open questions for `/plan` to resolve

- [ ] **Sweep granularity**: one massive PR (matches D-A `/ultrareview` per stub) or split by section (Play / Team / League / Admin / Search / Landing)? Single PR has highest review burden; split adds coordination cost.
- [ ] **Typography mapping**: iOS uses Dynamic Type. Web — pure `rem` + user font-size respect, `clamp()` for responsive scaling, or both? Affects accessibility story.
- [ ] **Component primitives**: do we extract shared primitives (`Card`, `Divider`, `SectionHeader`) as part of this sweep, or apply the treatment inline per component?
- [ ] **Animation/motion**: iOS has subtle springs on tap/transitions. Does this sweep ship motion parity (CSS transitions, `prefers-reduced-motion` respect) or stay static?

---

## Out of scope

- Any new feature surfaces — they all shipped in s1–s9.
- Functional behavior changes — visual-only sweep.
- Backend changes. None required.
- Reworking the marketing landing in `xomware-frontend`.

---

## Backend contract dependencies

| New service(s) | Backend contract used | New backend work? |
|---|---|---|
| — | — | No |

---

## Success criteria

- Dark gradient backgrounds match iOS `XomperColors.background`.
- `h2` headers render in the accent red used in iOS email templates.
- Dividers use the league-rules-style red treatment.
- Champion gold appears on highlight elements (winner badges, primary CTAs) per iOS.
- Typography respects user font-size preferences and scales responsively.
- Visual diff vs. iOS screenshots is within the agreed tolerance (set during plan).

---

## Next step

Run `/plan s10-midnight-emerald-sweep` to expand this skeleton into implementation-level detail.
