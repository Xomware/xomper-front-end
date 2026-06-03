# Web ↔ iOS Parity — Brainstorm

> Status: Draft (brainstorm only — no plan, no code)
> Last updated: 2026-06-03
> Source of truth for IA: `xomper-ios` (`Xomper/Features/Shell/DrawerView.swift`, `Xomper/Features/Shell/TrayDestination.swift`, `Xomper/Navigation/AppRouter.swift`)

## TL;DR

The Angular web app is roughly a generation behind iOS. iOS has been refactored down to a single-league, drawer-driven shell with four sections (Play / Team / League / Admin), a Landing hub, AI Review hub, Announcements, World Cup, an Archive flow rolled into per-tab history, and a full admin portal (Test Email, Email Archive, Announcements, Tables, Audit, Cron, Weekly Trigger). The web still ships a multi-league `toolbar` with a stale "My League" dropdown of 5 entries, no Landing, no AI Review hub, no Announcements, no Admin portal, and a routing layer that branches on `my-` vs `selected-` league/team/profile — almost half of which becomes dead code under iOS's single-league model.

**Recommendation: Option C — IA-first, theme-later, structured as a multi-feature epic.** Reshape navigation and reframe (not delete) the multi-league surfaces around iOS's hybrid model in small, safe PRs; then port the missing feature surfaces (Landing, AI Review, Announcements, Admin portal) in dependency order; then layer Midnight Emerald visuals last. Big-bang (A) under-estimates the churn in a solo-maintained codebase; tab-by-tab inside the current toolbar (B) preserves the toolbar metaphor we already know we're replacing.

**Q1 decided (2026-06-03):** match iOS — **hybrid model**. The main shell (Play / Team / League / Admin) locks to the home league via `Config.whitelistedLeagueId`. A separate **Search surface** stays, with three modes (User / League / Player) and a free-form "paste any Sleeper league ID" input that opens a read-only view of any league. The `selected-*` pages are the Search results target, not dead code. iOS uses `SearchView` + `SearchStore` + `AppRoute.search` for exactly this.

---

## Phase 1 — Exploration (unfiltered)

A loose dump of angles considered. Most fold into Phase 2.

- Just mirror iOS drawer 1:1 in a left-rail sidebar (desktop) + slide-out drawer (mobile).
- Keep the top toolbar, repaint sections to match iOS groupings (`Play / Team / League / Admin`), kill the "My League" dropdown.
- Convert the whole web app to a SPA-shell + lazy-loaded feature modules so each iOS section maps to a route group.
- Hard-fork the repo: leave `xomper-front-end` as the public guest browser (multi-league search), spin a new `xomper-app` as the parity app (single-league, mirrors iOS).
- Replace web with a thin SSR site that just embeds the iOS app via TestFlight links + a marketing landing — i.e., concede that mobile-first wins and stop maintaining web parity. (Probably wrong, but worth naming.)
- Ship web as a PWA, copy iOS view structures verbatim with Tailwind + a SwiftUI-look component kit.
- Port iOS theme tokens (XomperColors, XomperTheme spacing) to CSS custom properties first as a "foundation PR" before any IA work.
- Use Angular Material or PrimeNG to accelerate Admin tables/forms (Tables, Audit, Email Archive) instead of hand-rolling.
- Build a code-gen step that reads iOS `TrayDestination` + `AppRoute` and emits an Angular routing scaffold so the IA can't drift again.
- Lean into Angular's `loadComponent` standalone APIs since the codebase is Angular 18 — kill `AppRoutingModule` and migrate to a single `app.routes.ts` while we're touching nav anyway.
- Treat parity as five separate features driven by `/orchestrate` (Shell + Auth, Play, Team, League, Admin) — each as its own stub plan.
- Park multi-league features behind a feature flag (`SHOW_GUEST_SEARCH`) so the production app collapses to single-league without losing the code.
- Single-league guard: replace the `my-` vs `selected-` route split with `/league/<section>` and lock the league ID at the service layer.
- Visual parity sub-question: does web need `championGold`/`accentRed` h2 headers like the email templates, or is a darker neutral palette enough?
- Sidebar pattern on web vs drawer pattern on iOS: desktop wants a persistent rail, mobile wants the drawer — same destinations, different chrome.
- Sub-tab consistency: Draft tab on iOS now has per-year sub-tabs (Live / Mocks / Recap); web's `DraftHistoryComponent` is a flat page — needs to absorb the same structure.

---

## Phase 2 — Three strategic questions (lead with these)

The doc treats these as gates. Every option below answers them.

### Q1. Single-league vs multi-league? — **DECIDED: hybrid (match iOS)**

iOS is hybrid, not single-league:
- The **main shell** (Play / Team / League / Admin sections) is locked to `Config.whitelistedLeagueId`. Every dashboard, AI Review, draft, and admin tool operates on the home league only.
- A separate **Search surface** (`Features/Home/SearchView.swift`, `Core/Stores/SearchStore.swift`, `AppRoute.search`) supports three modes — User / League / Player — with a free-form Sleeper league-ID input ("Paste a Sleeper league ID to view any league").
- The Search surface is **not in the drawer** on iOS — it's reachable as a route. Results push read-only screens for the foreign user/league/team.

Web mirrors that:
- Main shell collapses to home-league-only (the `mode: 'my' | 'selected'` split inside `LeagueComponent`, `TeamComponent`, `ProfileComponent` disappears for the *shell*).
- **`SearchComponent` and the `selected-*` pages stay** — they become the dedicated read-only browse surface, wired off the Search results, not off a toolbar dropdown.
- The toolbar's "My League" dropdown (a curated 5-entry list) **is** dead code; it's not how iOS surfaces multi-league. Replace with sidebar (home shell) + a Search entry that opens the search UI.

**Concrete refactor blast radius** (hybrid, not deletion):

| File / surface | Disposition |
|---|---|
| `pages/search/search.component.*` | **Keep** — promote to top-level route; mirror iOS's three-mode segmented control (User / League / Player). |
| `pages/selected-profile/selected-profile.component.ts` | **Keep** — wired from User-mode search results. |
| `pages/selected-league/selected-league.component.ts` | **Keep** — wired from League-mode search results. |
| `pages/selected-team/selected-team.component.ts` | **Keep** — wired from selected-league drill-down. |
| `pages/profile/profile.component.*` (the shared `mode` input) | Keep both modes; what changes is that "my" comes from session, "selected" comes from search/route param. |
| `pages/league/league.component.ts` (`mode` input + `currentLeague` branch) | Same — keep both modes, but the *main shell* only ever uses `mode: 'my'`. The `selected` branch is only reached from search. |
| `pages/my-league/my-league.component.ts` | Merge into the main shell's home-league routes. Was a `my-` route wrapper; becomes the default `/league/...`. |
| `services/league.service.ts` | **Keep** `currentLeague`, `searchLeague`, `findUserLeagues`, `leagueChainCache`. They power the Search surface. |
| `services/user.service.ts` | **Keep** `currentUser`, `searchUser`. Power User-mode search. |
| `services/team.service.ts` | **Keep** `currentTeam` state. Powers selected-team. |
| `app-routing.module.ts` | Keep `selected-*` routes; collapse `my-*` routes into flat `/league`, `/team`, `/profile`; add `/search`. |
| `components/toolbar` "My League" dropdown | **Delete** — replace with sidebar entry pointing to the main shell + a Search entry. The dropdown of 5 hand-curated leagues is the part that's actually wrong vs iOS. |
| `models/league.model.ts` | Unchanged — model is shape-correct for both modes. |
| `guards/auth.guard.ts` | Unchanged. |

Net effect: ~5% of code is genuinely deleted (the toolbar dropdown + `my-*` route wrappers). The rest is route restructuring + sidebar rewrite. Search-related code is preserved and gets a clearer home.

### Q2. Parity scope — IA-only, or IA + Midnight Emerald visuals?

**Recommendation: IA-first now, theme as a follow-up phase** (last feature in the epic).

**Case for IA-only first:**
- The functional gap is the real product problem — users on web can't reach AI Review, Announcements, or admin tools at all.
- IA changes are small, mechanical, low-risk PRs. Theme work is sweeping and visual — it slows reviews and entangles every PR.
- Once IA is in, the theme port becomes a single self-contained feature.

**Case for "do both in lockstep":**
- Brand consistency matters — email templates already use the iOS palette (deep navy bg, gold accents, red dividers, h2 red headers). Web looking off-brand erodes the polish.
- Tokens are cheap to port if done first as CSS custom properties (`--xomper-bg-dark`, `--xomper-champion-gold`, `--xomper-accent-red`, etc.) — and then every new screen automatically lands on-brand.

Compromise inside the recommendation: port the **color tokens only** as a 1-PR foundation (CSS variables in `styles.scss`) before any screens land, then defer typography, spacing system, and component restyling to the final phase. Cheap insurance against drift.

### Q3. Backend contract gaps

The web already speaks:
- **Sleeper API** (`league.service.ts` direct calls).
- **Supabase** (`supabase.service.ts` — auth, profile, whitelisted users; `rules.service.ts` — proposals/votes; `league-history.service.ts` — matchup_history, world_cup standings).
- **Xomper API** (`email.service.ts` — `/email/rule-proposal`, `/email/rule-accept`, `/email/rule-denied`).

Per-surface gap audit:

| iOS surface | Contract status on web | Action required |
|---|---|---|
| Landing — Headline AI Report | Lambda `GET /ai-reports/headline` — not called from web | New service method, ~30 LoC |
| Landing — Announcements | Supabase table `league_announcements` — not read from web | New `announcements.service.ts` (Supabase select w/ active+date filters) |
| Landing — Upcoming Draft Countdown | Reuses `nflState` + `league_history` already on web | No new contract |
| Landing — This-Week Matchups | Reuses `getLeagueMatchups()` already on web | No new contract |
| Landing — Standings Scroll Bar | Reuses standings already built on web | No new contract |
| AI Review hub (list + detail) | Lambda `GET /ai-reports`, `GET /ai-reports/{id}` — not called from web | New `ai-review.service.ts` |
| Draft tab — Live / Mocks / Recap sub-tabs | Mocks rely on iOS-only `MockDraftEngine` (client-side) — Recap is a Lambda call | Recap needs new service; Mocks needs full port (non-trivial logic) |
| World Cup | Already implemented as a sub-tab inside `LeagueComponent` (good) — needs to become its own destination | No new contract, IA only |
| Playoffs | Already implemented as `LeagueComponent` sub-tab | IA only |
| Standings | Already implemented as `LeagueComponent` sub-tab | IA only |
| Matchups | Already implemented as `LeagueComponent` sub-tab | IA only |
| Matchup History | Standalone page exists | IA-only — possibly drop the standalone (iOS reaches it from within Matchups) |
| Team Analyzer | iOS-only (hexagon chart) — no web equivalent | Full port — needs only data already in Sleeper |
| My Team / Taxi Squad / Player Detail | Exist on web | Mostly IA + theme polish |
| Rulebook / Scoring / League Settings / Payouts / Rule Proposals / Draft Order | All currently sub-tabs of `LeagueComponent` `activeTab: 'rules'` — one mega-tab on web vs six destinations on iOS | IA-only — split into separate routes/components |
| Admin → AI Review trigger | Lambda `POST /ai-review/trigger?type=weekly_recap` etc. — not called from web | New `admin.service.ts` |
| Admin → Test Email | Lambda `POST /email/test-send` — not called from web | New service method |
| Admin → Email Archive list/detail/resend | Supabase `email_archive` table + Lambda `POST /email/resend` — neither on web | New `email-archive.service.ts` + 2 list/detail components |
| Admin → Announcements CRUD | Supabase `league_announcements` writes — not on web | Combine with read service above |
| Admin → Tables (Users/Leagues) | Supabase `whitelisted_users` / `whitelisted_leagues` CRUD — not on web | New service + 2 list + 2 edit components |
| Admin → Audit | Supabase `audit_log` table — not on web | New service + list/detail components |
| Admin → Cron Settings | Supabase `cron_settings` table or Lambda config — not on web | New service + form |
| Admin → Logs | CloudWatch tail — iOS marks as stub | Defer (matches iOS state) |
| Admin → Weekly Trigger Card (F3) | Same lambda as AI Review trigger with `week` override | Same `admin.service.ts`, additional form |

Summary: contracts mostly exist (Lambda + Supabase tables are live, iOS uses them). Web just hasn't grown the service layer yet. Per surface, the cost is one `*.service.ts` and 1–2 page components.

---

## Phase 2.5 — IA mapping table (the core artifact)

Drawer section → iOS destination → current web equivalent → status.

Statuses:
- `MATCH` — equivalent surface exists, mostly fine
- `RENAMED` — exists but under different label/route
- `OUTDATED` — exists but missing structural changes iOS made (e.g., sub-tabs)
- `MISSING` — does not exist on web
- `DEPRECATED-ON-IOS` — web has it, iOS dropped — should web drop too?

### Play (iOS Drawer Section)

| iOS surface | iOS path | Web equivalent today | Status | Notes |
|---|---|---|---|---|
| Landing (Home hub) | `Features/Landing/LandingView.swift` | `pages/home` is an auth/login page, not a hub | MISSING | iOS Home = 5 cards (Headline AI, Draft countdown, Announcements, Standings scrollbar, This-week matchups). Web `home` redirects to `my-profile` after auth. |
| Standings | `Features/League/StandingsView.swift` | `league.component` `activeTab: 'standings'` | OUTDATED | iOS made it a top-level destination; web buries it as a tab. Also iOS dropped historical from this view (lives in Archive). |
| Matchups | `Features/League/MatchupsView.swift` | `league.component` `activeTab: 'matchups'` | OUTDATED | Same — needs to lift out, per-season chip absorbs Matchup History. |
| Playoffs | `Features/League/PlayoffBracketView.swift` | `league.component` `activeTab: 'playoffs'` | OUTDATED | Same lift-out story. |
| Draft | `Features/DraftHistory/DraftHistoryView.swift` | `pages/draft-history` | OUTDATED | iOS now sub-tabs: Live / Mocks / Recap (current season), Picks / Recap (past). Web is flat. |
| World Cup | `Features/League/WorldCupView.swift` | `league.component` `activeTab: 'worldcup'` | OUTDATED | Needs lift-out to its own destination. |

### Team (iOS Drawer Section)

| iOS surface | iOS path | Web equivalent today | Status | Notes |
|---|---|---|---|---|
| My Team | `Features/Team/TeamView.swift` | `pages/my-team` | MATCH | Functional. Needs theme + drawer entry. |
| Taxi Squad | `Features/TaxiSquad/TaxiSquadView.swift` | `pages/taxi-squad` | MATCH | Functional. Needs drawer entry. |
| Team Analyzer | `Features/TeamAnalyzer/TeamAnalyzerView.swift` | none | MISSING | Hexagon chart of team strengths. New component. |
| Player Detail (push, not drawer) | `Features/Team/PlayerDetailView.swift` | `components/player-modal` | RENAMED | iOS pushes a screen; web shows a modal. Modal is fine, no work needed. |

### League (iOS Drawer Section)

| iOS surface | iOS path | Web equivalent today | Status | Notes |
|---|---|---|---|---|
| Rulebook | `Features/League/RulesView.swift` | `league.component` `activeTab: 'rules'` | OUTDATED | Static rules currently sit inside Rules tab; split out. |
| Scoring | (part of `RulesView.swift`) | `league.component` `activeTab: 'rules'` `scoringCategories` | OUTDATED | iOS gave scoring its own destination. |
| League Settings | (part of `RulesView.swift`) | `league.component` `activeTab: 'rules'` `rosterSlots` | OUTDATED | Same — separate destination on iOS. |
| Payouts | `Features/Payouts/PayoutsView.swift` | hardcoded HTML inside `LEAGUE_RULES[5]` of `league.component.ts` | OUTDATED | Currently a static rule chunk; iOS has a real screen pulling from config. |
| Rule Proposals | `Features/League/RuleProposalFormView.swift` (+ list inside `RulesView`) | `league.component` activeTab `'rules'` proposals form/list | OUTDATED | Logic is there, but lives inside Rules. Lift to own destination. |
| Draft Order Proposal | `Features/DraftOrder/DraftOrderView.swift` | none | MISSING | New surface for picks proposal + mock engine. |

### Admin (iOS Drawer Section — gated by `is_admin`)

| iOS surface | iOS path | Web equivalent today | Status | Notes |
|---|---|---|---|---|
| AI Review (read-only hub for all users) | `Features/AIReview/AIReviewView.swift`, `AIReviewDetailView.swift` | none | MISSING | Note: drawer lists `aiReview` under Admin on iOS but the **reader** is for everyone — admin only sees an extra menu entry. Same split applies on web. |
| Admin home menu | `Features/Admin/AdminView.swift` | none | MISSING | Menu of 8 admin sub-screens. |
| Admin → AI Review trigger + activity feed | `Admin/AIReviewSubScreen.swift` | none | MISSING | The dry-run trigger card lives here. |
| Admin → AI Review broadcast preview | `Admin/AIReviewPreviewView.swift` | none | MISSING | Pre-send preview of recipient list. |
| Admin → Test Email | `Admin/TestEmailView.swift` | none | MISSING | F1 surface. |
| Admin → Email Archive list + detail + resend | `Admin/EmailArchiveListView.swift`, `EmailArchiveDetailView.swift` | none | MISSING | New table-backed surface. |
| Admin → Announcements list + edit | `Admin/AnnouncementsListView.swift`, `AnnouncementEditView.swift` | none | MISSING | Supabase CRUD. |
| Admin → Tables Users/Leagues/edit forms | `Admin/UsersListView.swift`, `LeaguesListView.swift`, `UserEditView.swift`, `LeagueEditView.swift`, `TablesSubScreenView.swift` | none | MISSING | F4 deliverable on iOS — full CRUD. |
| Admin → Audit feed + detail | `Admin/AuditFeedView.swift`, `AuditDetailView.swift` | none | MISSING | F4 deliverable. |
| Admin → Cron Settings | `Admin/CronSettingsView.swift` | none | MISSING | Kill switch + test toggles per lambda. |
| Admin → Logs | `Admin/LogsView.swift` | none | MISSING | iOS stub — defer on web too. |
| Admin → Weekly Recap Trigger (with week override) | (per recent commit `ff1507b` / `cd5b144`) | none | MISSING | Card embedded in `AIReviewSubScreen` or standalone — confirm during plan. |

### Profile / Settings / Other

| iOS surface | iOS path | Web equivalent today | Status | Notes |
|---|---|---|---|---|
| Profile (own) | `Features/Profile/MyProfileView.swift` | `pages/my-profile` | MATCH | Functional. |
| Profile (other user) | `Features/Profile/ProfileView.swift` | `pages/selected-profile` | MATCH | Reached via Search → User mode → result push. Web keeps `selected-profile` for exactly this. |
| Settings | `Features/Profile/SettingsView.swift` | none | MISSING | Pinned drawer footer entry on iOS. |
| Archive (past standings + past drafts hub) | `Features/Archive/*` | `pages/matchup-history` | OUTDATED | iOS dissolved Archive into per-tab past flows (Standings season chip, Draft per-year sub-tab). Web should follow. |
| Search | `Features/Home/SearchView.swift` + `Core/Stores/SearchStore.swift` | `pages/search` | OUTDATED | iOS surfaces a 3-mode segmented control (User / League / Player) with a free-form Sleeper league-ID input. Web's `search` page needs to match this shape. **Not in the drawer on iOS** — reached via `AppRoute.search`; on web, give it a dedicated header/sidebar entry separate from the home-league shell. |
| Link Sleeper | (handled in auth flow) | `pages/link-sleeper` | DEPRECATED? | Sleeper username is set via Supabase whitelist on iOS — confirm whether web onboarding still needs this. |
| Auth Gate | `Features/Auth/AuthGateView.swift`, `LoginView.swift` | inline in `pages/home/home.component.ts` | RENAMED | Web bakes auth into Home; iOS has a dedicated gate. Functional equivalent, structural inconsistency. |
| Headline / Matchup / Player Detail modals | iOS uses navigation pushes | `components/matchup-modal`, `player-modal`, `taxi-squad-player-modal` | MATCH | Modal pattern is fine on web. |

---

## Phase 3 — Converge to options

### Option A — Big-bang rewrite

**What**: New Angular standalone-component shell with sidebar (desktop) + drawer (mobile) mirroring iOS exactly. Port pages in dependency order, kill old routes in one PR at the end. Migrate to `app.routes.ts` (standalone API), drop `AppModule`.

**How it works**: Branch off `main`, build a new shell + routing layer alongside the old one. Stand up all new feature shells as placeholders, then port each one. Single switchover PR flips the default route from `home` to `landing` and deletes the old toolbar + module routing.

**Feature breakdown (~5 stubs for /orchestrate):**
1. Shell + routing rewrite (sidebar/drawer, standalone components, `app.routes.ts`, theme tokens).
2. Play section (Landing, Standings, Matchups, Playoffs, Draft sub-tabs, World Cup).
3. Team section (My Team, Taxi Squad, Team Analyzer port).
4. League section (Rulebook, Scoring, Settings, Payouts, Rule Proposals, Draft Order).
5. Admin section (AI Review hub + 8 admin sub-screens).

**Pros**:
- Cleanest endpoint — code matches iOS structure end to end.
- Forces single-league commitment up front; no flag gymnastics.
- Migrating to standalone-components-with-`loadComponent` is a free win.

**Cons / Risks**:
- High churn — every commit touches the new shell.
- Long branch life = merge pain for any concurrent fixes.
- High blast radius if a single mid-stream decision is wrong.

**Best if**: You can dedicate two consecutive sprints with no other web work in flight.

### Option B — Incremental tab-by-tab inside existing toolbar

**What**: Keep current `AppRoutingModule` + `ToolbarComponent`. For each iOS destination, add a new route + page, light up a new toolbar entry behind a feature flag, retire the old when stable.

**How it works**: Each iOS section becomes a series of small PRs that add one route, leave old routes alive, and progressively gate them off via `environment.flags.*`. The toolbar dropdown evolves into a flat top-nav over time. The "My League" dropdown shrinks one entry at a time.

**Feature breakdown (~12+ stubs):**
- One stub per new destination (Landing, AI Review hub, Announcements card, Team Analyzer, Draft Order, each Admin sub-screen, etc.).

**Pros**:
- Lowest risk per PR — everything stays shippable.
- Easy to pause mid-epic.
- Each stub is independently testable.

**Cons / Risks**:
- IA never feels right until the very end — partial state is worse than either before/after.
- Toolbar metaphor is wrong for iOS parity; you end up reskinning it eventually anyway.
- Long tail — likely 2–3x as many PRs as Option C.

**Best if**: Web is shipping continuously and you can't afford a single multi-PR rework window.

### Option C — IA-first / theme-later (recommended)

**What**: Three sequenced phases as one epic. Phase 1 = nav + dead-code purge (small PRs, no new features). Phase 2 = feature ports (Landing → AI Review → Admin portal → Team Analyzer → Draft Order). Phase 3 = Midnight Emerald visual port (tokens already landed in Phase 1, this is the component-level styling sweep).

**How it works**:
- Phase 1 (1–2 PRs):
  - Replace `ToolbarComponent` with a `SidebarComponent` (desktop) + slide-out drawer (mobile) whose entries match iOS `TrayDestination` order exactly. Initially the new sidebar just routes to existing components (even if they're stale).
  - Add a top-level **Search** entry separate from the home-shell sections — matches iOS's "in the route graph but not in the drawer" model. Wire it to the existing `SearchComponent` (which Phase 2 then rebuilds to the 3-mode iOS shape).
  - Add CSS custom property tokens (`--xomper-bg-dark`, `--xomper-champion-gold`, `--xomper-accent-red`, `--xomper-text-primary`, etc.) in `styles.scss`. No component styling changes yet.
  - Apply the Q1 hybrid decision — kill the toolbar "My League" dropdown; collapse `my-*` routes into flat `/league`, `/team`, `/profile`; keep `selected-*` routes intact for Search results.
  - Split `LeagueComponent`'s mega `activeTab` into 6 separate route components (Standings, Matchups, Playoffs, World Cup, Rules, etc.) — pure refactor.
  - Lift `pages/draft-history` to sub-tabs matching iOS.

- Phase 2 (5–6 PRs):
  - Build `LandingComponent` with the 5 cards. (Uses existing services + adds 1 new for AI Review headline + 1 for announcements.)
  - Build `AIReviewListComponent` + `AIReviewDetailComponent`.
  - Build `TeamAnalyzerComponent`.
  - Build `DraftOrderComponent` (defer Mocks engine — heavy port; could land a "view-only" version first).
  - Build `AdminComponent` shell + 8 admin sub-screens in priority order: AI Review trigger → Test Email → Email Archive → Announcements → Tables → Audit → Cron → (defer Logs).

- Phase 3 (1 big PR):
  - Component-level visual sweep: dark gradient backgrounds, gold/red accent treatments on cards, red `h2` headers, league-rules-style red dividers, typography pass to match iOS Dynamic Type behavior.

**Feature breakdown (clean stubs for /orchestrate):**
1. Shell + nav rewrite (sidebar/drawer, theme tokens, toolbar dropdown removal, `my-*` route flattening — `selected-*` retained).
2. Search surface refresh (rebuild `SearchComponent` to iOS's three-mode shape: User / League / Player; wire results into existing `selected-*` pages).
3. League surface split (Standings / Matchups / Playoffs / World Cup / Rulebook / Scoring / League Settings / Payouts / Rule Proposals as separate routes).
4. Draft tab restructure (Live / Mocks / Recap sub-tabs; past-season Picks / Recap).
5. Landing hub (5 cards + 2 new services).
6. AI Review hub (list + detail; new service).
7. Admin portal (menu + 8 sub-screens; new service modules).
8. Team Analyzer (hexagon chart port).
9. Draft Order Proposal (view-only first; Mocks engine deferred).
10. Midnight Emerald visual sweep.

**Pros**:
- Each phase has a clean review boundary.
- Phase 1 alone makes the app immediately closer to iOS, even if no new features ship.
- Single-league decision happens once, up front — no flag gymnastics in feature ports.
- Theme deferred = feature PRs don't churn on visual review.
- Maps cleanly to `/orchestrate` workflow (9 stubs).

**Cons / Risks**:
- Phase 1 has a "things look the same but slightly worse" interim where sidebar exists but features are still stale — short window, but real.
- Adding feature flags for `guestBrowserEnabled` is mild tech debt if multi-league never returns.
- Theme deferral means web stays visually off-brand for the duration of Phase 2.

**Best if**: We're committed to single-league (Q1) and want the structural fix to land before brand polish — which describes us.

---

## Phase 4 — Recommendation

**Take Option C.**

Reasoning:
- Option A is the "right" endpoint but Option C arrives at the same endpoint via smaller PRs. The endpoint matters more than the path.
- Option B preserves the toolbar metaphor we already know is wrong. Replacing it later is worse than replacing it now.
- Option C's phasing means you can pause cleanly after Phase 1 (web is reorganized, dead code is gone, multi-league is collapsed) and ship that alone if priorities shift. Phases 2 and 3 then accrete value over time.

**This recommendation depends on**:
1. Q1 settled in favor of the **hybrid** model (single-league shell + multi-league Search surface, matching iOS). Decided 2026-06-03.
2. Treating this as an epic, not a single feature. Run `/plan [epic]` first, then `/orchestrate` to spawn the 10 feature stubs above.
3. Web is a solo-maintained project — Option A's long-branch risk is bigger here than it would be on a team with reviewers.

---

## Notes for the planner

- Use the IA mapping table above as the canonical inventory for stub generation.
- Start the epic plan with a Phase 0 deliverable: confirm single-league answer, agree on token names for CSS variables, and decide whether to migrate to standalone components (`bootstrapApplication`) while we're touching the shell.
- The `Admin → Logs` surface is stubbed on iOS; mirror that on web (don't try to ship CloudWatch tail in v1).
- The `MockDraftEngine` is heavy — if Draft Order ports the view-only flow first, the Mocks logic can become its own deferred feature.
- Email Archive resend requires the Lambda endpoint to accept an explicit recipient override — confirm contract before scoping that stub.
- The toolbar's "Sign Out" + profile menu have to land somewhere in the new sidebar — match iOS's pinned-bottom Settings entry + drawer profile card pattern.
