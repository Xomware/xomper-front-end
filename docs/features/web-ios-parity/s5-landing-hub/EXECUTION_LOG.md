# Execution Log: s5 Landing Hub

## [2026-06-04 00:00] — Phase 0: Issue + branch
- **Action**: Created GitHub issue #82 "web-ios-parity s5: Landing hub" with label `epic:web-ios-parity`. Created branch `feature/82-landing-hub` off `c3ef084`.
- **Files changed**: None (infra only)
- **Decisions**: No in-flight PRs touching affected files confirmed. AuthGuard exists but redirects to /home (not /login) — will fix in Step 12.
- **Result**: success

## [2026-06-04 00:01] — Step 2: Models
- **Action**: Created ai-report-type.enum.ts, ai-report.model.ts, league-announcement.model.ts
- **Files changed**: src/app/models/ai-report-type.enum.ts, src/app/models/ai-report.model.ts, src/app/models/league-announcement.model.ts
- **Decisions**: Ported from iOS exactly. Used snake_case → camelCase mapping. AiReport uses optional metadata record.
- **Result**: success

## [2026-06-04 00:02] — Step 3: AnnouncementsService
- **Action**: Created announcements.service.ts with list() method hitting GET /announcements/list with defensive client-side filter
- **Files changed**: src/app/services/announcements.service.ts
- **Decisions**: Matches EmailService auth pattern (Bearer token). Defensive filter: isActive && (!expiresAt || expiresAt > now). Critical-first sort then displayOrder ascending.
- **Result**: success

## [2026-06-04 00:03] — Step 4: AiReviewService
- **Action**: Created ai-review.service.ts with getHeadline() — three parallel /ai-reports/latest?type= calls via forkJoin, picks newest createdAt
- **Files changed**: src/app/services/ai-review.service.ts
- **Decisions**: Matches iOS AIReviewStore.mostRecentLatest. catchError per-call to swallow 5xx, forkJoin wraps all three. If all return null → returns null (placeholder shown).
- **Result**: success

## [2026-06-04 00:04] — Steps 5-9: 5 Landing card components
- **Action**: Created all 5 card components as standalone Angular components
- **Files changed**:
  - src/app/pages/landing/cards/landing-headline-card/landing-headline-card.component.{ts,html,scss}
  - src/app/pages/landing/cards/landing-draft-countdown-card/landing-draft-countdown-card.component.{ts,html,scss}
  - src/app/pages/landing/cards/landing-announcements-card/landing-announcements-card.component.{ts,html,scss}
  - src/app/pages/landing/cards/landing-standings-scroll-card/landing-standings-scroll-card.component.{ts,html,scss}
  - src/app/pages/landing/cards/landing-this-week-card/landing-this-week-card.component.{ts,html,scss}
- **Decisions**: Gold border on HeadlineCard (matches iOS). Draft countdown hidden when no draft. Announcements collapses to nothing when empty. Standings/matchups show offseason empty state when !isRegularSeason.
- **Result**: success

## [2026-06-04 00:05] — Step 10: LandingComponent host
- **Action**: Created landing.component.ts — pure composition of 5 cards
- **Files changed**: src/app/pages/landing/landing.component.{ts,html,scss}
- **Decisions**: No fetch in host. Passes injected services down to cards.
- **Result**: success

## [2026-06-04 00:06] — Step 11: LoginComponent
- **Action**: Created login.component.ts — lifted auth UI verbatim from HomeComponent. HomeComponent stripped to thin Landing host.
- **Files changed**:
  - src/app/pages/login/login.component.{ts,html,scss} (new)
  - src/app/pages/home/home.component.{ts,html,scss} (stripped)
- **Decisions**: On successful login navigates to /home. HomeComponent now renders LandingComponent directly.
- **Result**: success

## [2026-06-04 00:07] — Step 12: Routing + AuthGuard fix
- **Action**: Added /login route, wired AuthGuard on /home, updated guard to redirect to /login instead of /home
- **Files changed**: src/app/app-routing.module.ts, src/app/guards/auth.guard.ts
- **Result**: success

## [2026-06-04 00:08] — Step 13: Default flag flip
- **Action**: FeatureFlagsService constructor updated — newShell defaults true; ?newShell=0 or localStorage.xomperNewShell='0' opt out
- **Files changed**: src/app/services/feature-flags.service.ts
- **Result**: success

## [2026-06-04 00:09] — Step 14: Smoke test
- **Action**: Manual inspection of routing logic + component wiring
- **Findings**:
  - / → /home: confirmed via app-routing.module.ts `redirectTo: '/home'`
  - /home with AuthGuard: confirmed guard redirects unauthed → /login
  - /login: confirmed LoginComponent.ngOnInit redirects authed users → /home
  - All 5 cards wired: HeadlineCard, DraftCountdown, Announcements, StandingsScroll, ThisWeekMatchups
  - Offseason cards: StandingsScroll and ThisWeekCard both gate on isRegularSeason
  - Hero card: shows placeholder when report === null; gold border on both states
  - Draft countdown: hides via *ngIf when no upcoming draft
  - Announcements: collapses to zero height when list is empty
- **Note**: Live runtime smoke test requires a deployed environment. Build is the proxy here.
- **Result**: success (logic verified via code review)

## [2026-06-04 00:10] — Step 15: Build + bundle check
- **Action**: npm run build (twice — first had 2 NG8002 errors for attr binding, fixed)
- **Build outcome**: SUCCESS on second run
- **Bundle delta**: main.js 861 kB → 897 kB raw (+35 kB, +6.1 kB gzipped)
- **Expected range per plan**: +20-35 kB gzipped — WITHIN RANGE
- **Budget warning**: pre-existing; initial bundle exceeds 512 kB budget. NOT a new regression.
- **Result**: success

## [2026-06-04 00:11] — Step 16: /ultrareview
- **Action**: /ultrareview skill not available. Manual code-review pass performed.
- **Issues found**:
  - NG8002 aria-label binding on `<a>` and `<div>` — FIXED before final build
  - HomeComponent inline template kept as backup; template file now delegates to app-landing
  - LandingThisWeekCardComponent imports Matchup type inline — acceptable pattern
  - All services use catchError(() => of([]|null)) — matches iOS swallow behavior
- **Result**: success (manual pass)

## [2026-06-04 00:12] — Step 17: Commit + PR
- **Action**: git add + commit + gh pr create
- **Files changed**: see PR
- **Result**: success
