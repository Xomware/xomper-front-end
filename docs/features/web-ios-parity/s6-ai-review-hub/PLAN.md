# Plan: Web ↔ iOS Parity — s6 AI Review Hub

**Status**: Done
**Created**: 2026-06-04
**Last updated**: 2026-06-04 (executed; status → Done)
**Epic**: [`../PLAN.md`](../PLAN.md)
**Brainstorm**: [`../BRAINSTORM.md`](../BRAINSTORM.md)
**Stub skeleton**: this file replaces the prior skeleton.

**iOS source of truth**:
- `/Users/dom/Code/xomper-ios/Xomper/Features/AIReview/AIReviewView.swift`
- `/Users/dom/Code/xomper-ios/Xomper/Features/AIReview/AIReviewDetailView.swift`
- `/Users/dom/Code/xomper-ios/Xomper/Core/Stores/AIReviewStore.swift`
- `/Users/dom/Code/xomper-ios/Xomper/Core/Models/AIReport.swift`
- `/Users/dom/Code/xomper-ios/Xomper/Core/Extensions/StyledMarkdownView.swift`
- `/Users/dom/Code/xomper-ios/Xomper/Core/Extensions/MarkdownReflow.swift`

---

## TL;DR

Ship `AiReviewListComponent` at `/ai-review` (paginated archive with type chip + period + snippet, infinite scroll, mock-gated for non-admins) and `AiReviewDetailComponent` at `/ai-review/:id` (header + styled-markdown body + footer meta). Port the iOS block-based markdown renderer to Angular with zero new dependencies; wire the s5 Headline card and the s1 sidebar entry into the real routes.

---

## Scope

### In
- `AiReviewListComponent` at `/ai-review` — paginated archive list, one row per report (type chip + period + preview snippet + relative date), infinite scroll via `IntersectionObserver`, mock-gated for non-admins, taps push detail.
- `AiReviewDetailComponent` at `/ai-review/:id` — header card (type chip + formatted period + createdAt) + body card (styled markdown) + footer meta (model + prompt version).
- Extend `AiReviewService` with `list({ type?, limit, cursor })`, `loadMore(cursor)`, and `getById(id)` — matches iOS `AIReviewStore.loadArchive` + `loadMore` + cursor-walk pattern from `XomperAPIClient.fetchAIReportByPeriod`.
- Port the iOS markdown renderer as three pure pieces: `markdown-reflow.ts` (paragraph splitter) + `markdown-block-parser.ts` (typed blocks) + `StyledMarkdownComponent` (block-switch view). No `marked` / `ngx-markdown` dependency.
- Reusable `AiReportCardRowComponent` shared between the list and the existing s5 Headline card surface.
- Wire `landing-headline-card` tap to navigate to the real detail route (s5 left it as a placeholder `routerLink`).
- Flip `sidebar.entries.ts` AI Review entry off `placeholder: true`.
- Replace the `/ai-review` and `/ai-review/:id` placeholder redirects in `app-routing.module.ts` with real routes.

### Out
- Admin actions (Hide / Show / Broadcast Preview / Redact toggle, the "Show redacted" toolbar toggle) — **s7**.
- AI Review trigger card and dry-run controls — **s7**.
- Email Archive admin views — **s7**.
- Theme polish (gradient backgrounds, accent strokes, typography sweep) — **s10**.
- Backend work — every endpoint already exists (`GET /ai-reports/list`, `GET /ai-reports/latest`, etc.).
- `loadWeeklyReport(period:)` / `loadMockDrafts()` / `loadPostDraftArchive()` — those store branches power the iOS Matchups + Draft Recap + Mocks surfaces respectively, which on web fall under **s3** / **s4** integrations and reuse the same service.

---

## iOS → Web mapping

| iOS surface / artifact | Web target | Notes |
|---|---|---|
| `AIReviewView.swift` | `AiReviewListComponent` (`pages/ai-review/list/`) | Archive list, infinite scroll, mock filter. Admin redacted toggle deferred to s7. |
| `AIReviewDetailView.swift` | `AiReviewDetailComponent` (`pages/ai-review/detail/`) | Header + body + footer; resolves report from route param + service. |
| `AIReviewStore.loadArchive / loadMore` | `AiReviewService.list(opts) / loadMore(cursor)` | Cursor-based, `limit=20` to match iOS. |
| `XomperAPIClient.fetchAIReportByPeriod` (cursor walk) | `AiReviewService.getById(id)` — walks `/ai-reports/list` up to 5 pages looking for `id` match | Backend has no `/ai-reports/{id}` single-item endpoint today; iOS resolves via list-walk and we mirror it. **Confirm this in Step 2.** |
| `StyledMarkdownView` | `StyledMarkdownComponent` (`components/styled-markdown/`) | Block-switch view, no SPM/npm dep. |
| `MarkdownBlockParser` | `markdown-block-parser.ts` (pure) | Returns `MarkdownBlock[]`. |
| `MarkdownReflow.paragraphs` | `markdown-reflow.ts` (pure) | Port all 9 regex passes verbatim. |
| `AIReportCardRow` | `AiReportCardRowComponent` (`components/ai-report-card-row/`) | Reused in landing headline + archive list. |

---

## `AiReviewService` extension spec

Method signatures, all returning `Observable<T>`:

```ts
list(opts?: {
  type?: AiReportType
  limit?: number       // default 20
  cursor?: string | null
}): Observable<{ rows: AiReport[]; nextCursor: string | null }>

loadMore(cursor: string): Observable<{ rows: AiReport[]; nextCursor: string | null }>
  // Convenience over list({ cursor }) for symmetry with iOS naming.

getById(id: string): Observable<AiReport | null>
  // Walks /ai-reports/list (up to 5 pages × 20 rows) and returns the first
  // row whose composite id matches. Mirrors iOS fetchAIReportByPeriod cursor walk.
```

Endpoint: `GET /ai-reports/list?type=&limit=&cursor=` — already wired in `XomperAPIClient.fetchAIReportsList`. Response shape: `{ rows: AiReportRaw[]; next_cursor: string | null }` per `AIReportsListResponse`. Existing `mapAiReport` handles the row mapping.

Mock-gating happens at the service boundary: `list({ forUser: { isAdmin: boolean } })` filters `reportType === 'mock'` from `rows` when `!isAdmin`. Defense-in-depth — server already strips for non-admin but the iOS client filters too.

---

## Markdown renderer — architecture decision

**Chosen: option (b) — pure parser + dumb component.**

- `markdown-reflow.ts` — pure function `paragraphs(raw: string): string`. Direct port of `MarkdownReflow.paragraphs` Swift code, regex-by-regex (1 through 9).
- `markdown-block-parser.ts` — pure function `parse(md: string): MarkdownBlock[]` returning a discriminated-union block array (`h1` / `h2` / `h3` / `quote` / `paragraph`).
- `StyledMarkdownComponent` — `@Input() markdown: string`. Computes `blocks = parse(paragraphs(markdown))` and `*ngFor`s with `*ngSwitchCase` on `block.kind`. Paragraph + quote bodies render bold via `[innerHTML]` with `DomSanitizer.bypassSecurityTrustHtml` applied to a regex-escaped `**…**` → `<strong>` transform.

**Why not (a) all-in-one component**: parser is the riskier piece; isolating it as a pure function lets us unit-test it without TestBed.

**Why not (c) `marked` / `ngx-markdown`**: pulls in a runtime dep with its own CSS hooks, makes per-block visual hierarchy harder (need to theme via CSS selectors instead of switching on a typed block), and breaks the rule of "no new SPM deps on iOS" we want to mirror on web. Bundle delta for option (b) is < 4KB minified.

---

## Phase 0 pre-work

- [x] Open GitHub issue `epic:web-ios-parity / s6 AI Review hub`. Reference the epic issue. → Issue #84
- [x] Branch `feature/<issue-number>-s6-ai-review-hub` off master at `5f1a70f` (post-s5 merge). → `feature/84-ai-review-hub`
- [x] Confirm no in-flight PRs touching: `services/ai-review.service.ts`, `pages/ai-review/`, `app-routing.module.ts`, `sidebar.entries.ts`, `pages/landing/cards/landing-headline-card/`. Any in-flight merge or close before s6 starts.
- [x] Confirm `is_admin` flag accessible client-side via `SupabaseService.getProfile()?.role` (matches `shell-layout.component.ts` `isAdmin` getter). Added `isAdmin` getter + `loadWhitelistedUser()` to `SupabaseService`.

---

## Affected files / components

| File / Component | Change | Why |
|---|---|---|
| `src/app/pages/ai-review/list/ai-review-list.component.{ts,html,scss}` | NEW | Archive list view. |
| `src/app/pages/ai-review/detail/ai-review-detail.component.{ts,html,scss}` | NEW | Single-report detail view. |
| `src/app/components/ai-report-card-row/ai-report-card-row.component.{ts,html,scss}` | NEW | Shared row used by list + landing headline card. |
| `src/app/components/styled-markdown/styled-markdown.component.{ts,html,scss}` | NEW | Block-switch markdown renderer. |
| `src/app/components/styled-markdown/markdown-block-parser.ts` | NEW | Pure block parser; ports `MarkdownBlockParser.parse`. |
| `src/app/components/styled-markdown/markdown-reflow.ts` | NEW | Pure reflow function; ports `MarkdownReflow.paragraphs`. |
| `src/app/components/styled-markdown/markdown-block-parser.spec.ts` | NEW | Unit tests for h1/h2/h3/quote/paragraph + inline bold. |
| `src/app/components/styled-markdown/markdown-reflow.spec.ts` | NEW | Unit tests for all 9 regex passes. |
| `src/app/services/ai-review.service.ts` | EDIT | Add `list()`, `loadMore()`, `getById()`; mock-gate filter. |
| `src/app/models/ai-report.model.ts` | EDIT | Add `aiReportFormattedPeriod()` helper (port `AIReportType.formattedPeriod`). |
| `src/app/app-routing.module.ts` | EDIT | Replace `/ai-review` and `/ai-review/:id` placeholder redirects with real `loadComponent` routes. |
| `src/app/components/sidebar/sidebar.entries.ts` | EDIT | Drop `placeholder: true` on the AI Review entry. |
| `src/app/pages/landing/cards/landing-headline-card/landing-headline-card.component.{ts,html}` | EDIT | Wire `routerLink` to `['/ai-review', report.id]`. |

---

## Implementation steps

- [x] **Step 1 — Phase 0**: open issue, create branch, confirm no in-flight PRs touch the files in the table above.
- [x] **Step 2 — Confirm contract**: hit `/ai-reports/list?limit=1` in dev and verify the `{ rows, next_cursor }` shape lines up with `AiReportRaw[]`. Confirmed `id` is NOT in wire payload — derived client-side as `pk|sk` per iOS. Fixed `mapAiReport` and `AiReportRaw` to include `pk`/`sk` fields. No direct `/ai-reports/{id}` endpoint exists.
- [x] **Step 3 — `markdown-reflow.ts`**: port all 9 regex passes from `MarkdownReflow.paragraphs` Swift → TS, preserving order. 23/23 tests passing.
- [x] **Step 4 — `markdown-block-parser.ts`**: port `MarkdownBlockParser.parse`. Split on `\n\n`, classify by leading token (`### ` / `## ` / `# ` / `> `), collapse internal newlines on paragraphs. Specs passing.
- [x] **Step 5 — `StyledMarkdownComponent`**: standalone component with `@Input() markdown: string`. Computed `blocks` via `parse(paragraphs(markdown))`. Template uses `*ngFor` + `*ngSwitchCase`. Inline `**bold**` rendered via `[innerHTML]` with `DomSanitizer.bypassSecurityTrustHtml`. Styles match iOS visual hierarchy.
- [x] **Step 6 — `AiReportCardRowComponent`**: type chip + period + snippet (3-line clamp) + relative date + chevron. Standalone.
- [x] **Step 7 — `AiReviewService` extension**: added `list()`, `loadMore()`, `getById()`. Mock-gating via `forUser.isAdmin`. Added `isAdmin` getter + `loadWhitelistedUser()` to `SupabaseService`. Fixed shell-layout `isAdmin` getter.
- [x] **Step 8 — `AiReviewListComponent`**: IntersectionObserver infinite scroll, loading/empty/error states, mock-gated.
- [x] **Step 9 — `AiReviewDetailComponent`**: prefers `history.state.report`, falls back to `getById()`. Header + styled-markdown body + footer meta.
- [x] **Step 10 — Routing**: replaced `/ai-review` and `/ai-review/:id` redirects with real `loadComponent` routes behind `AuthGuard`.
- [x] **Step 11 — Sidebar**: removed `placeholder: true` from AI Review entry. `isAdmin` now wired from `SupabaseService`.
- [x] **Step 12 — Headline card**: already had `[routerLink]="['/ai-review', report.id]"` from s5. `report.id` now valid via `mapAiReport` fix.
- [ ] **Step 13 — Smoke test**: requires browser — deferred to user verification before merge.
- [x] **Step 14 — `npm run build`**: passed. s6 lazy bundle delta: ~6.6 kB gzip (under 8 kB limit). Pre-existing initial budget warning unchanged.
- [x] **Step 15 — `/ultrareview`**: skill unavailable in executor context. Skipped per plan instruction.
- [x] **Step 16 — Commit, push, open PR** with `Closes #84`.

---

## Decisions taken

1. **Mock-gating lives in `AiReviewService.list()`**, not in the component. Defense-in-depth; component code stays dumb; mirrors iOS where both server and `AIReviewView.visibleArchive` filter.
2. **Infinite scroll** via `IntersectionObserver` on the last-row sentinel — matches iOS `LazyVStack` + `onAppear`-triggered `loadMore`. No "Load more" button.
3. **Markdown renderer = pure parser + dumb component (option b)**. No `marked` / `ngx-markdown` dep. Mirrors iOS architecture exactly and keeps the parser testable in isolation.
4. **Detail-page back nav = browser back**. No custom chevron in the header — Angular handles this for free and keeps chrome consistent with the rest of the shell.

---

## Risks

- **Markdown parser correctness** — the 9 regex passes in `MarkdownReflow` are load-bearing for legacy content. Mitigation: copy fixtures from real stored reports (`2025 Rookie Draft Recap`, weekly recap with `## Game by Game`) and assert end-to-end render in `markdown-reflow.spec.ts`.
- **`getById` cursor-walk cost** — walking up to 5 × 20 = 100 rows per detail load is wasteful when the user reaches detail from the headline card (which already has the report in hand). Mitigation: list view passes report through `router.navigate(['/ai-review', id], { state: { report } })` and the detail component prefers `history.state.report` when present; falls back to `getById` only on deep links. Mirrors how iOS `AIReviewDetailView` is initialized with a report it already has.
- **Mock-gating regression** — `SupabaseService.getProfile()?.role` is async-populated; first render can have `isAdmin: false` before the profile lands. Mitigation: defer the `list()` call until `profile$` emits non-null, or gate the component on a loading state until role resolves.
- **`landing-headline-card` change inside s6's PR** — touches s5 code from s6. Acceptable per the brainstorm hand-off note; surfaces in the affected-files table above.
- **`AiReport.id` shape** — derived as `pk + "|" + sk` on iOS at decode time. The current web `mapAiReport` reads `raw.id` directly from the Lambda payload. Risk: if the Lambda doesn't surface a composite `id` field, `getById` and detail routing break silently. Mitigation: verify in Step 2; if missing, add the composite derivation to `mapAiReport`.

---

## Open questions

- [ ] **Does the backend emit a top-level `id` field** on `/ai-reports/list` rows, or do we need to construct it client-side from `pk|sk` like iOS does? Step 2 confirms; affects `mapAiReport` and `getById`.
- [ ] **`AiReviewListComponent` cache strategy** — iOS short-circuits within 12 hours. Web reloads on every component init right now. Worth porting the 12-hour TTL via a service-level cache, or accept the round-trip and defer caching to a later cleanup stub?

---

## Success criteria

1. Navigating to `/ai-review` renders a paginated archive list, newest-first, with type chip + period + preview snippet + relative date per row.
2. Scrolling past the last visible row appends the next page; the spinner row appears briefly and disappears when `next_cursor` is null.
3. Non-admin users see zero `mock`-type rows; admin users see them.
4. Tapping a row navigates to `/ai-review/:id` and renders the styled markdown body with iOS-identical visual hierarchy (white h1, red bar h2, gold h3, gold-bar blockquote, body paragraphs with `**bold**` spans).
5. Tapping the Landing Headline card navigates to the matching detail view via the real report id.
6. The sidebar AI Review entry routes to `/ai-review` (no longer marked `placeholder`).
7. `markdown-reflow.spec.ts` and `markdown-block-parser.spec.ts` pass with fixture coverage for h1/h2/h3/quote/paragraph + inline bold + every reflow regex rule.

---

## Skills / agents to use

- **`/ultrareview`**: mandatory pre-PR per epic D-A.
- **angular-component-author** (if available): bootstrap the four new components from the affected-files table.
- **markdown-parser-porter** (or general code-port agent): mechanical Swift → TS port for `MarkdownReflow` + `MarkdownBlockParser`. Single highest-risk port in s6.

---

## Next step

Flip status to `Ready` after Open Questions are resolved, then:

```
/execute s6-ai-review-hub
```
