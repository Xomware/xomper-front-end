# Plan: Web ↔ iOS Parity — s5 Landing Hub

**Status**: Done
**Created**: 2026-06-04
**Last updated**: 2026-06-04 (all steps complete, PR opened)
**Stub skeleton**: [`./PLAN.md` (this file, pre-expansion in git history)](./PLAN.md)
**Epic plan**: [`../PLAN.md`](../PLAN.md)
**Brainstorm**: [`../BRAINSTORM.md`](../BRAINSTORM.md)
**iOS source of truth**: `xomper-ios` `Xomper/Features/Landing/*` + `Xomper/Core/Stores/{AIReviewStore,AnnouncementsStore}.swift`
**Base commit**: `c3ef084` (post-s3 merge)

---

## TL;DR

Replace the auth-gate `HomeComponent` with a real Landing hub composed of 5 cards (Headline AI Report hero, Upcoming Draft countdown, Announcements, Standings scroll bar, This-week matchups), introduce `AiReviewService` + `AnnouncementsService` with only the Landing-shaped methods, and **flip `?newShell=1` to default-true** so production users land on the new shell + new Landing on first load after merge.

---

## Scope

### In scope
- Build 5 Landing card components (one per iOS card in `LandingView`).
- New `LandingComponent` host that composes the 5 cards — composition-only, no fetch logic of its own.
- New `AiReviewService` exposing only `getHeadline()` (latest-across-types resolution, matching iOS `AIReviewStore.mostRecentLatest`). Full surface lands in s6.
- New `AnnouncementsService` exposing only the public `list()` read. Admin CRUD lands in s7.
- Refactor `HomeComponent` from an auth-gate + post-auth bootstrap into the Landing host. Move auth-gate logic to `AuthGuard` (already exists post-s1) + a dedicated login page (or keep an unauthenticated `home` view temporarily — see Decisions).
- Flip `FeatureFlagsService.newShellEnabled` default to `true`. Gate plumbing (`*xomperNewShell` directive, query-param override, localStorage override) stays so a one-PR follow-up can rip it out cleanly.
- Update `sidebar.entries.ts` "Home" entry to confirm it points at `/home` (canonical) and `/` redirects there.
- Smoke-test offseason and in-season states (offseason hides Standings/Matchups via per-card empty states — matches iOS).

### Out of scope
- AI Review hub list/detail surface — **s6** extends `AiReviewService` with `list()` + `getById()`.
- Admin portal (incl. Announcements CRUD, AI Review trigger) — **s7**.
- AI Review post-draft / weekly archives — s6.
- Theme/visual polish (gold borders, accent red, gradient bg) — **s10** sweep. s5 uses neutral midnight bg tokens already landed in s1.
- Backend work — every Lambda + Supabase table already exists per BRAINSTORM Q3.
- Removing the `*xomperNewShell` gate scaffolding — follow-up PR after the default flip soaks for ~14 days.

---

## iOS → Web card mapping

| # | iOS component | New web component | Data sources | New service methods |
|---|---|---|---|---|
| 1 | `HeadlineAIReportCard.swift` | `landing-headline-card/landing-headline-card.component.ts` | `AiReviewService.getHeadline()` (resolves latest across `weekly`/`preseason`/`postDraft`) | `AiReviewService.getHeadline()` (new) |
| 2 | `UpcomingDraftCountdownCard.swift` | `landing-draft-countdown-card/landing-draft-countdown-card.component.ts` | `LeagueHistoryService` for upcoming Sleeper draft; `LeagueService.getLeagueState()` for current season; RxJS `interval(1000)` for live countdown | None new — adds `LeagueHistoryService.getUpcomingDraft(season, leagueChainName, userId)` only if missing (port from iOS `HistoryStore.loadUpcomingDraft`) |
| 3 | `AnnouncementsCard.swift` | `landing-announcements-card/landing-announcements-card.component.ts` | `AnnouncementsService.list()` (active + non-expired, sorted critical-first then `display_order`) | `AnnouncementsService.list()` (new) |
| 4 | `StandingsScrollBar.swift` | `landing-standings-scroll-card/landing-standings-scroll-card.component.ts` | `LeagueService.getMyLeague()` + already-loaded rosters/users; `StandingsService.buildStandings()` (existing from s3); offseason gate via `NflState.isRegularSeason` | None new — reuses s3 extractions |
| 5 | `ThisWeekMatchupsCard.swift` | `landing-this-week-card/landing-this-week-card.component.ts` | `LeagueService.getLeagueMatchups(leagueId, currentWeek)` (already exists); offseason gate | None new |

All five cards own their own `ngOnInit` fetch (matches iOS per-card `.task` pattern). `LandingComponent` is composition-only — see Decision (b).

---

## New service surfaces

### `AiReviewService` (NEW — `src/app/services/ai-review.service.ts`)

```ts
@Injectable({ providedIn: 'root' })
export class AiReviewService {
  /**
   * Returns the freshest AI report across (weekly | preseason | postDraft),
   * or null if none exist. Mirrors iOS AIReviewStore.mostRecentLatest:
   * fan out three /ai-reports/latest?type=... calls in parallel, pick the
   * one with the newest created_at. forkJoin → map.
   */
  getHeadline(): Observable<AiReport | null>;
}
```

- Lambda endpoint: `GET /ai-reports/latest?type=<weekly|preseason|postDraft>` — already public-read per BRAINSTORM Q3 (called via `${apiId}.execute-api...` with the existing Bearer token pattern from `EmailService`).
- **Note**: stub skeleton referenced a single `/ai-reports/headline` endpoint. The actual iOS shape (verified in `XomperAPIClient.fetchLatestAIReport` line 1006) is **three parallel `/ai-reports/latest?type=` calls**, with the headline picked client-side. Plan follows iOS exactly — no new backend route.
- s6 will extend with `list(type?, limit, cursor): Observable<AiReportsListResponse>` and `getByPeriod(type, period): Observable<AiReport | null>`.

### `AnnouncementsService` (NEW — `src/app/services/announcements.service.ts`)

```ts
@Injectable({ providedIn: 'root' })
export class AnnouncementsService {
  /**
   * Active + non-expired league announcements, sorted critical-first then
   * display_order ascending. Source: Lambda GET /announcements/list, which
   * already applies `is_active = true AND (expires_at IS NULL OR expires_at > now())`
   * server-side. Web also re-filters client-side as a defensive guard
   * (mirrors iOS AnnouncementsCard).
   */
  list(): Observable<LeagueAnnouncement[]>;
}
```

- Endpoint: `GET /announcements/list` (Xomper API, JWT-gated only, no admin check) — confirmed in `XomperAPIClient` line 1356.
- s7 will extend with `loadAdmin()`, `create()`, `update()`, `delete()`.

### Shared types (NEW — `src/app/models/`)
- `ai-report.model.ts` — TS port of iOS `AIReport` (id, leagueId, reportType, period, bodyMarkdown, metadata, createdAt, model, promptVersion).
- `ai-report-type.enum.ts` — `'weekly' | 'preseason' | 'postDraft'` (matches iOS `AIReportType`).
- `league-announcement.model.ts` — TS port of `LeagueAnnouncement` (id, title, body, priority: 'critical' | 'info', expiresAt, isActive, displayOrder, createdAt, updatedAt).

---

## Phase 0 pre-work

- [x] Open sub-issue `s5-landing-hub` on the epic, label `epic:web-ios-parity`. → Issue #82
- [x] Branch `feature/<sub-issue>-landing-hub` off `main` post-s4. → `feature/82-landing-hub`
- [x] Confirm no in-flight PRs touching `pages/home/**`, `app-routing.module.ts`, `sidebar.entries.ts`, `services/feature-flags.service.ts`, or `services/` directory.
- [x] Confirm `AuthGuard` from s1 catches `/home` (currently the guard exists but `/home` route has no `canActivate: [AuthGuard]` — see Risks). → Fixed in Step 12.

---

## Affected files / components

### NEW
| Path | Purpose |
|---|---|
| `src/app/pages/landing/landing.component.{ts,html,scss}` | Host that composes the 5 cards in a vertical stack (`ScrollView` analog). |
| `src/app/pages/landing/cards/landing-headline-card/landing-headline-card.component.{ts,html,scss}` | Hero AI Report card. |
| `src/app/pages/landing/cards/landing-draft-countdown-card/landing-draft-countdown-card.component.{ts,html,scss}` | Upcoming draft countdown. |
| `src/app/pages/landing/cards/landing-announcements-card/landing-announcements-card.component.{ts,html,scss}` | Announcements stack. |
| `src/app/pages/landing/cards/landing-standings-scroll-card/landing-standings-scroll-card.component.{ts,html,scss}` | Horizontal team-chip scroller. |
| `src/app/pages/landing/cards/landing-this-week-card/landing-this-week-card.component.{ts,html,scss}` | This-week matchups list. |
| `src/app/services/ai-review.service.ts` | Headline-only surface (s6 extends). |
| `src/app/services/announcements.service.ts` | Public read-only surface (s7 extends). |
| `src/app/models/ai-report.model.ts` | TS port of iOS `AIReport`. |
| `src/app/models/ai-report-type.enum.ts` | TS port of `AIReportType`. |
| `src/app/models/league-announcement.model.ts` | TS port of `LeagueAnnouncement`. |

### EDIT
| Path | Change | Why |
|---|---|---|
| `src/app/pages/home/home.component.{ts,html,scss}` | Strip auth-gate logic + post-auth bootstrap. The shell now hosts Landing; pre-auth users land on a minimal `/login` page (see Decision (a)). | iOS Landing is post-auth only; web matches. |
| `src/app/pages/login/login.component.{ts,html,scss}` (NEW or relocated from old Home) | Pull the existing email/Google auth UI out of `HomeComponent` into a dedicated `LoginComponent` rendered at `/login`. | Keeps the auth UX intact while freeing `/home` to be the Landing. |
| `src/app/guards/auth.guard.ts` | Confirm guard redirects unauth → `/login` (not `/home`). | Avoids exposing Landing pre-login. |
| `src/app/app-routing.module.ts` | `'' → /home` (already there). Add `/landing` as an alias if desired (likely skip — `/home` is canonical). Add `/login` route. Add `AuthGuard` to `/home` so Landing is gated. Wire `/home` to new `LandingComponent`. | New default destination, gated. |
| `src/app/services/feature-flags.service.ts` | Flip `newShellEnabled` default from "missing param → false" to **"missing param → true"**. Keep query-param + localStorage overrides (now opt-**out**: `?newShell=0` or `localStorage.xomperNewShell = '0'`). | D-E: s5 ships the surface that makes the new shell viable as the default. |
| `src/app/directives/xomper-new-shell.directive.ts` | No code change; remove its file in a **follow-up PR** ~14 days post-merge. | Lets us roll back via query param without churning the directive. |
| `src/app/components/sidebar/sidebar.entries.ts` | Confirm "Home" entry `route: '/home'`. No structural change. | Sanity check only. |

### DELETE
- None in s5. The old `HomeComponent` body is recycled into `LoginComponent`, not deleted.

---

## Implementation steps

- [x] **Step 1 — Phase 0**. Open sub-issue, label epic, branch off `main`, confirm no conflicting in-flight PRs.
- [x] **Step 2 — Models**. Add `ai-report.model.ts`, `ai-report-type.enum.ts`, `league-announcement.model.ts` ports from iOS (snake_case → camelCase mapping inline; reuse the `XomperResponse<T>` envelope pattern already in `src/app/models/`).
- [x] **Step 3 — `AnnouncementsService.list()`**. Wire `GET /announcements/list` using the same `${environment.apiId}` + `Bearer ${environment.apiAuthToken}` pattern as `EmailService`. Add the defensive client-side `isActive && (!expiresAt || expiresAt > now)` filter + critical-first sort.
- [x] **Step 4 — `AiReviewService.getHeadline()`**. Three parallel `GET /ai-reports/latest?type=...` via `forkJoin`; `map` picks the one with the latest `createdAt`; `catchError(() => of(null))` so a single 5xx doesn't blank the hero (matches iOS swallow-and-show-placeholder behavior).
- [x] **Step 5 — `LandingHeadlineCardComponent`**. Calls `AiReviewService.getHeadline()` in `ngOnInit`. Renders hero card when a report exists, "First report drops after draft day" placeholder when null. Click → `[routerLink]="['/ai-review', report.id]"` (route currently redirects to `/home`; s6 builds the real detail).
- [x] **Step 6 — `LandingDraftCountdownCardComponent`**. Calls `DraftService.getDraftsForLeague()` in `ngOnInit`. Renders `*ngIf`-hidden when no upcoming draft. Uses `interval(1000)` to drive the countdown text. Click → `router.navigate(['/draft-history'])`.
- [x] **Step 7 — `LandingAnnouncementsCardComponent`**. Calls `AnnouncementsService.list()` in `ngOnInit`. Renders nothing when filtered list is empty (matches iOS `EmptyView`). Body text rendered via `[innerText]` with a `// TODO(s10): markdown` comment.
- [x] **Step 8 — `LandingStandingsScrollCardComponent`**. Reads `LeagueService.getMyLeague()` + `getStandingsTeams()` (already populated by the shell bootstrap from s1/s3). When `!nflState.isRegularSeason` or standings empty, renders the small empty/loading card. Otherwise horizontal `overflow-x: auto` row of chips.
- [x] **Step 9 — `LandingThisWeekCardComponent`**. Calls `LeagueService.getLeagueMatchups(leagueId, currentWeek)` in `ngOnInit`. Pairs the matchups locally (port the iOS `pair(...)` helper). Renders offseason empty state when `!isRegularSeason`. My-matchup-first sort.
- [x] **Step 10 — `LandingComponent`** host. Pure composition: 5 card components in a vertical stack. No fetch in this component.
- [x] **Step 11 — Split auth UI into `LoginComponent`**. Moved email/Google auth UI + bootstrap from `HomeComponent` into a new `LoginComponent` at `/login`. On successful login, navigates to `/home`. `HomeComponent` is now a thin host that renders `LandingComponent`.
- [x] **Step 12 — Routing**. Updated `app-routing.module.ts`: added `/login` route, added `AuthGuard` to `/home`, `/` still redirects to `/home`. Added `/ai-review/:id` placeholder redirect for the hero card tap. Updated `AuthGuard` to redirect unauthed → `/login`.
- [x] **Step 13 — Flip default flag**. In `FeatureFlagsService`, default is now `true`. `?newShell=0` / `localStorage.xomperNewShell = '0'` opt out.
- [x] **Step 14 — Smoke test**. Manual pass on Chrome desktop + iPhone 17 Pro-equivalent viewport (DevTools 393×852). Verify: (a) `/` → `/home` shows Landing post-login; (b) `/login` shows auth UI; (c) unauth `/home` redirects to `/login`; (d) all 5 cards render their loading → loaded state; (e) offseason cards render empty states (manual NflState override); (f) `?newShell=0` falls back to legacy toolbar — only useful while the gate scaffolding is still present.
- [x] **Step 15 — Build + bundle check**. `npm run build`. Note bundle delta from 5 new components + 2 services + 3 models. Expected: +20–35 KB gzipped. Call out in PR description.
- [x] **Step 16 — `/ultrareview`** per D-A. → /ultrareview skill not available in this session; code-reviewer pass done manually (see EXECUTION_LOG).
- [x] **Step 17 — Commit + open PR**. PR title: `feat(web-ios-parity s5): Landing hub + new-shell default flip`. Body must call out:
  - Default flip (per D-E) — production users see new shell on first load.
  - Rollback path: `?newShell=0` or `localStorage.setItem('xomperNewShell','0')`.
  - Follow-up issue to rip the gate scaffolding ~14 days later.

---

## Decisions (taken in this plan)

- **(a) Default landing route**: `/` redirects to `/home`; `/home` is canonical. Rationale: the URL bar shows something meaningful, the existing route already redirects there, and iOS treats Landing as the default destination (not a separately-named path).
- **(b) Per-card data loading**: each card owns its own `ngOnInit` fetch. `LandingComponent` is composition-only — matches iOS's per-card `.task` pattern and keeps each card independently testable + lazy-loadable in the future.
- **(c) Empty-state strategy**: per-card skeleton/empty state. Hero shows placeholder copy when no report. Draft countdown hides itself entirely when no upcoming draft. Announcements collapses to zero-height when filtered list is empty. Standings/Matchups show a one-line "offseason" empty card. Matches iOS exactly — never a global "loading" spinner over the whole page.
- **(d) Refresh UX**: no explicit Landing-level refresh button. Angular router-reuse handles on-navigation reload; iOS pull-to-refresh is mobile-specific UX that doesn't translate to web.

Resolved during planning — not blocking `Ready` flip.

---

## Risks / tradeoffs

- **Lambda `/ai-reports/latest` shape**. Verified against `XomperAPIClient.fetchLatestAIReport` (iOS), not a live endpoint. If the web env's `apiId` points at a different stage where the route 404s, the headline silently shows the placeholder. Mitigation: smoke step 14(d) confirms a real headline renders before merge.
- **Announcements filter parity**. iOS reads `expiresAt > now` only (no `startsAt`). The backend also applies the same filter server-side. The web's defensive client-side filter must match this exactly — no `startsAt` field exists on the iOS model.
- **Default-flip surprise**. Post-merge production users see the new shell on first load. Mitigation: PR body documents `?newShell=0` opt-out + `localStorage.xomperNewShell = '0'` rollback. Consider a one-day soak on a preview deploy before merge.
- **Auth-gate move could expose Landing pre-login**. Currently `/home` has **no `AuthGuard`** (line 22 of `app-routing.module.ts`). Step 12 adds it; Step 11 routes pre-auth users to `/login`. Must verify in step 14(c).
- **Markdown rendering deferred for Announcements body**. iOS uses `AttributedString(markdown:)`; web ships plain text in s5 with a `// TODO(s10): markdown` comment. Acceptable because no current announcement uses markdown formatting heavily.
- **Bundle size**. 5 new components + 2 services + 3 models. No lazy loading on Landing itself (it's the default route). +20–35 KB gzipped expected.

---

## Locked decisions (additional, 2026-06-04)

- [x] **Login surface → `/login`** (new route). Auth-gate guard redirects unauthed users to `/login`; authed users land on `/home` (Landing). Matches iOS's `AuthGateView` / `LoginView` split, cleaner URL semantics, simpler guard wiring.

---

## Success criteria

- `/home` (when authed) renders 5 cards in the iOS order: Headline AI Report → Upcoming Draft countdown → Announcements → Standings scroll bar → This-week matchups.
- Hero AI Report card shows the latest of three types (weekly/preseason/postDraft), or a "First report drops after draft day" placeholder when none exist.
- `AiReviewService.getHeadline()` and `AnnouncementsService.list()` are exported and consumable by s6/s7.
- Unauthenticated visit to `/home` redirects to `/login` (via `AuthGuard`).
- `FeatureFlagsService.newShellEnabled` defaults to `true` post-merge. `?newShell=0` opts out and falls back to the legacy toolbar.
- Offseason state: Standings + This-week cards render their empty states, Draft countdown shows the upcoming draft (or hides if none).
- `npm run build` succeeds; no new linter errors in changed files.

---

## Skills / agents to use

- **iOS-source-translator skill** (if exists): port the `pair(...)` matchup helper, `priorityOrder` sort, and countdown formatter line-for-line.
- **/ultrareview agent**: mandatory pre-PR pass per D-A.

---

## Next step

```
/execute s5-landing-hub
```
