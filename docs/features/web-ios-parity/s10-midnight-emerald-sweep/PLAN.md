# Plan: Web ↔ iOS Parity — s10 Midnight Emerald Sweep

**Status**: Ready
**Created**: 2026-06-04
**Last updated**: 2026-06-04
**Epic**: [`../PLAN.md`](../PLAN.md)
**Brainstorm**: [`../BRAINSTORM.md`](../BRAINSTORM.md)

---

## TL;DR

The final stub. s1–s9 built every IA + feature surface on neutral/midnight backgrounds. This stub extends `src/styles.scss` CSS custom-property tokens to the **full `XomperColors` palette**, builds a shared `_theme.scss` mixins file (card, hero-card, section-divider, chip, gradient bg), and sweeps the **Midnight Emerald accent treatment** across every surface to match iOS and the email templates: dark gradient backgrounds, gold-bordered hero cards, gold CTA accents, red `h2` dividers + gold subheaders. **Pure visual — zero behavioral change.**

---

## Approach

Deferred to last on purpose (epic Option C, Decision D-E theme-deferral) so feature PRs never churned on visual review. The SCSS variable layer in `src/styles/_variables.scss` **already mirrors the full palette** — the work is not redefining colors, it's (1) exposing the full palette as `--xomper-*` CSS custom properties, (2) extracting the accent treatment that s5–s9 emerged ad-hoc into shared mixins, and (3) applying those mixins consistently across surfaces that currently range from "mostly themed" (Landing, League) to "raw hardcoded greys" (Admin).

Reference treatment is the iOS email templates + `StyledMarkdownComponent`: red 3px `h2` top-bar dividers, uppercase tracked red `h2` text, gold `h3` subheaders, gold-bordered hero cards over a card gradient.

---

## Scope

### In scope
- Extend `src/styles.scss` `:root` tokens from the current 6 to the **full `XomperColors` palette** (`--xomper-*` namespace, established s1).
- Build `src/styles/_theme.scss` — shared mixins: `xomper-card`, `xomper-hero-card`, `xomper-section-divider`, `xomper-chip`, `xomper-gradient-bg`, `xomper-subheader`.
- Apply the accent treatment app-wide: dark gradient backgrounds, gold accents on cards/CTAs, red `h2` dividers + gold subheaders, gold-bordered hero cards, consistent corner radii + spacing from `XomperTheme`, typography pass.
- Fix `StyledMarkdownComponent` fallback hexes — currently `#e53935`/`#f0c040`, must be palette `#ff4757`/`#00ffab`.

### Out of scope
- **No functional / behavioral changes** — pure visual.
- No backend work (no Lambda, Supabase, infra).
- No new features or surfaces — all shipped s1–s9.
- Legacy toolbar / old components behind `?newShell=0` opt-out (deleted in the gate-removal follow-up — see Decisions).
- Light mode (iOS is always-dark; web matches — dark only).

---

## Token mapping (iOS `XomperColors` → CSS custom property → hex)

Hexes read from `Xomper/Core/Theme/XomperColors.swift`.

| iOS name | CSS custom property | Hex |
|---|---|---|
| `deepNavy` | `--xomper-deep-navy` | `#050A08` |
| `darkNavy` | `--xomper-dark-navy` | `#0C1612` |
| `bgDark` | `--xomper-bg-dark` *(exists)* | `#030706` |
| `bgCard` | `--xomper-bg-card` *(exists)* | `#0A1610` |
| `bgCardHover` | `--xomper-bg-card-hover` | `#14271E` |
| `bgInput` | `--xomper-bg-input` | `#14271E` |
| `championGold` | `--xomper-champion-gold` *(exists)* | `#00FFAB` |
| `steelBlue` | `--xomper-steel-blue` | `#00E89D` |
| `accentRed` | `--xomper-accent-red` *(exists)* | `#FF4757` |
| `textPrimary` | `--xomper-text-primary` *(exists)* | `#F0F5F0` |
| `textSecondary` | `--xomper-text-secondary` | `#8FADA0` |
| `textMuted` | `--xomper-text-muted` *(exists)* | `#4A6B5C` |
| `successGreen` | `--xomper-success-green` | `#00E676` |
| `errorRed` | `--xomper-error-red` | `#FF5252` |
| `surfaceLight` | `--xomper-surface-light` | `#1A2E26` |
| `legacyRed` | `--xomper-legacy-red` | `#BF0A0A` |
| `legacyBlue` | `--xomper-legacy-blue` | `#1B8EDC` |
| `bgGradient` | `--xomper-bg-gradient` | `deepNavy → darkNavy → deepNavy` (180°) |
| `cardGradient` | `--xomper-card-gradient` | `0C1612@.97 → 050A08@.97` (135°) |
| `goldAccentGradient` | `--xomper-gold-accent` | `championGold → steelBlue` (90°) |
| `redAccentGradient` | `--xomper-red-accent` | `accentRed → #FF6B7A` (90°) |

Spacing / radius from `XomperTheme.swift`: spacing `2/4/8/16/24/32/48/64`; radius `sm 4 / md 8 / lg 12 / xl 16 / full 9999`. (`_variables.scss` already carries these; `_theme.scss` consumes them.)

---

## Sweep inventory (batches)

70 `.scss` files. Grouped by surface; deltas noted.

| Batch | Surfaces | Key visual deltas | State today |
|---|---|---|---|
| **B0 Foundation** | `styles.scss`, new `_theme.scss`, `styled-markdown` | Full token set; mixins; fix md `h2`/`h3` fallback hexes | tokens partial |
| **B1 Shell / Sidebar** | `shell-layout`, `sidebar`, `mobile-drawer`, `app.component`, `footer`, `ambient-background` | Gradient bg, gold active-nav indicator, surface-light dividers | mostly themed |
| **B2 Landing** | `landing` + 5 `cards/*` | Hero card → gold border + card gradient; gold chips; consistent radii | mostly themed (ad-hoc → mixin) |
| **B3 League sub-pages** | `league`, `standings`, `matchups`, `playoffs`, `world-cup`, `rulebook`, `scoring`, `league-settings`, `payouts`, `rule-proposals`, `draft-order` | Red toggle/divider treatment, gold rank/winner accents, section dividers | partial |
| **B4 Draft tabs** | `draft-history`, `live`, `mocks`, `picks`, `recap` | Card treatment on pick rows, gold round headers | partial |
| **B5 AI Review** | `ai-review-list`, `ai-review-detail`, `ai-report-card-row` | Gold hero card, red `h2` dividers via styled-markdown | mostly themed |
| **B6 Admin portal** | `admin` + ~18 `admin/**` sub-screens | Replace raw `rgba(255,255,255,*)` / `#f87171` with tokens; card + chip treatment | **mostly raw — heaviest** |
| **B7 Team Analyzer** | `team-analyzer`, `hexagon-chart`, `position-breakdown-card`, `recommended-trade-card` | Gold-stroked hexagon, gold-border cards | partial |
| **B8 Search + misc** | `search`, `team`, `profile`, `settings`, `taxi-squad`, `matchup-history`, `link-sleeper`, `login`, `home`, modals, `toast`, `loader`, `confirm-dialog` | Token pass, card + chip treatment, gradient bg | mixed |

---

## Phase 0 — pre-work

- [ ] **Create GitHub sub-issue** under epic, label `epic:web-ios-parity`. Branch `style/<issue>-midnight-emerald-sweep` off master (`948246b`).
- [ ] **In-flight check** — confirm no open web PRs touching `.scss`, `_variables.scss`, `_mixins.scss`, or `styles.scss`. Any in-flight must merge/close first (sweep touches ~70 files → catastrophic rebase otherwise).
- [ ] **Confirm all s1–s9 stubs merged** to master (epic dependency — this is last).
- [ ] **Confirm new shell is default** (gate flipped post-s5). Legacy toolbar surfaces explicitly skipped.

---

## Affected files / components

Large diff, **low risk** — pure presentation, no `.ts`/`.html` logic touched. ~70 `.scss` files plus 2 new/extended foundation files.

| File / component | Change | Why |
|---|---|---|
| `src/styles.scss` | Extend `:root` to full palette tokens | Single source for `--xomper-*` |
| `src/styles/_theme.scss` *(new)* | Shared accent mixins | DRY the treatment across 70 files |
| `src/app/components/styled-markdown/*.scss` | Fix `h2`/`h3` fallback hexes to palette | Canonical brand `h2`/`h3` |
| `src/app/**/*.component.scss` (~67) | Apply mixins + tokens per batch | The sweep |

### PR strategy — split recommended

`_variables.scss` already holds the palette, so per-file churn is moderate (token swaps + mixin includes), **not** full rewrites — but B6 Admin is near-raw and large. Survey puts total churn at **~1,500–2,200 LoC of SCSS** across 70 files. That straddles the split threshold.

**Recommendation: split into 2 PRs.**
- **PR 1 — Foundation + shared:** B0 + B1 + B2 + B5 (tokens, `_theme.scss`, shell, the already-mostly-themed surfaces that exercise the mixins). Reviewable, establishes the pattern, low risk.
- **PR 2 — Per-feature sweep:** B3 + B4 + B6 + B7 + B8 (the bulk, including the heavy Admin batch). Reviewed against the now-locked mixin API.

`/ultrareview` runs before **each** PR (Decision D-A).

---

## Implementation steps

- [ ] **1 — Extend tokens.** Add the full palette + gradients to `:root` in `src/styles.scss` (table above). Keep existing 6; do not rename.
- [ ] **2 — Build `_theme.scss`.** Mixins: `xomper-card`, `xomper-hero-card` (gold border + card gradient + hover lift), `xomper-section-divider` (red 3px bar), `xomper-subheader` (gold uppercase), `xomper-chip` (gold pill), `xomper-gradient-bg`. Consume `_variables.scss` values; map 1:1 to `XomperTheme` radii/spacing.
- [ ] **3 — Fix StyledMarkdown.** Swap fallback hexes to palette (`--xomper-error-red`/`#FF5252`, `--xomper-champion-gold`/`#00FFAB`). This is the canonical `h2`/`h3` reference all other dividers point at.
- [ ] **4 — Sweep B1 Shell/Sidebar** → smoke test → visual check.
- [ ] **5 — Sweep B2 Landing** (replace ad-hoc gold-border with `xomper-hero-card`) → smoke test.
- [ ] **6 — Sweep B5 AI Review** → smoke test.
- [ ] **7 — Build PR 1, `/ultrareview`, open PR** (`Closes #<issue-part-1>` or single issue w/ checklist).
- [x] **8 — Sweep B3 League sub-pages** → smoke test each route.
- [x] **9 — Sweep B4 Draft tabs** → smoke test.
- [x] **10 — Sweep B6 Admin** (heaviest — replace raw greys with tokens, apply card/chip mixins) → smoke test each sub-screen.
- [x] **11 — Sweep B7 Team Analyzer** (gold hexagon stroke) → smoke test.
- [x] **12 — Sweep B8 Search + misc** (incl. modals, toast, loader) → smoke test.
- [x] **13 — Full build** (`ng build`) — confirm no SCSS compile errors, no unused-import warnings.
- [x] **14 — `/ultrareview`, open PR 2.**

---

## Decisions to surface

- **Single PR vs split** → **Split (2 PRs).** ~1,500–2,200 LoC churn over 70 files; foundation+shared first locks the mixin API, then the bulk per-feature sweep reviews against it. Single PR would be unreviewable for a solo maintainer.
- **Mixins vs utility classes vs per-component** → **Shared `_theme.scss` mixins.** Codebase already uses `@import 'styles/mixins'` and `@include` heavily (`card`, `glass-card`, `button-primary`). Mixins fit the existing convention, avoid global utility-class specificity surprises, and keep the accent treatment in one editable place.
- **Touch legacy toolbar / `?newShell=0` components?** → **Skip.** Being deleted in the gate-removal follow-up; theming them is wasted churn.
- **Dark-mode-only?** → **Confirmed dark only.** iOS is always-dark; no light-mode tokens, no `prefers-color-scheme`.

---

## Risks / tradeoffs

- **Visual regression** — no behavioral test catches CSS. *Mitigation:* per-batch manual smoke test + `/ultrareview` per PR; batching keeps each review surface small.
- **Specificity wars** with existing component SCSS (Admin's hardcoded `rgba`/`#hex` rules may out-rank mixin output). *Mitigation:* mixins emit plain property sets (no inflated selectors); replace conflicting hardcoded rules in-place rather than layering over them.
- **Large diff hard to review.** *Mitigation:* shared mixins shrink per-file diffs to includes + token swaps; 2-PR split + batch ordering.
- **Token drift** — `_variables.scss` (SCSS) and `:root` (CSS custom props) both hold the palette. *Mitigation:* `:root` interpolates `#{$var}` from `_variables.scss` (already the pattern) — single source, no duplicate hexes.

---

## Open questions

- [ ] Should `_variables.scss` SCSS vars eventually be *replaced* by `var(--xomper-*)` references (one true source), or do we keep the dual layer (SCSS for compile-time `darken()`/`rgba()`, CSS props for runtime)? Lean: **keep dual** this stub; consolidation is a separate refactor.
- [ ] Does the gold hexagon stroke (B7) need a runtime CSS-var-driven `stroke` on the SVG, or is a static themed value fine for a single always-dark theme? Lean: **static**.

---

## Success criteria

- `src/styles.scss` `:root` exposes the full `XomperColors` palette as `--xomper-*` tokens (21 entries), hexes matching the Swift source exactly.
- `_theme.scss` exists; hero cards across the app render a gold border over the card gradient via `xomper-hero-card` (Landing headline, AI Review, Team Analyzer parity).
- Every `h2` section divider renders the red 3px top-bar + uppercase tracked red text; `h3` subheaders render champion-gold — matching the email templates and `StyledMarkdownComponent`.
- App background is the Midnight Emerald gradient (`deepNavy → darkNavy → deepNavy`) on every routed surface.
- Admin portal no longer uses raw `rgba(255,255,255,*)` / off-palette hexes — fully tokenized.
- `ng build` compiles clean; zero behavioral/logic diffs (`.ts`/`.html` untouched except where a class rename is unavoidable).
- Visual parity with iOS confirmed via per-batch manual review under `/ultrareview`.

---

## Next step

```
/execute s10-midnight-emerald-sweep
```
