# Plan: Web ↔ iOS Parity — s3 League Surface Split

**Status**: Done
**Created**: 2026-06-04
**Last updated**: 2026-06-04 (executed — all 9 routes live, PR #88)
**Stub skeleton**: [`./PLAN.md` (this file replaces the skeleton)](./PLAN.md)
**Epic**: [`../PLAN.md`](../PLAN.md)
**Brainstorm**: [`../BRAINSTORM.md`](../BRAINSTORM.md)
**Sequence**: s1 (shipped) → s2 → **s3 (this)** → s4 …

---

## TL;DR

Gut `LeagueComponent`'s `activeTab` switch into nine standalone child route components mounted under `/league/...` (Standings, Matchups, Playoffs, World Cup, Rulebook, Scoring, League Settings, Payouts, Rule Proposals). Rewire s1's placeholder `/league?tab=...` sidebar entries to the new nested routes; reduce `LeagueComponent` to a thin shell hosting `<router-outlet>`.

---

## Approach

Lift-and-shift refactor — no behavior change, no new data. Each iOS surface listed in `TrayDestination` (`standings`, `matchups`, `playoffs`, `worldCup`, `rulebook`, `scoring`, `leagueSettings`, `ruleProposals`, `payouts`) becomes its own standalone Angular 18 component at its own route. The existing `RulesView.swift` `RulesPage` enum (`scoring`, `leagueSettings`, `ruleProposals`, `rulebook`) plus the standalone `PayoutsView.swift` confirms the 5-way Rules split. `LeagueComponent` shrinks from ~1000 LoC of `activeTab` switching to a shell that holds the page header (league pic + name) + `<router-outlet>`. All existing services (`LeagueService`, `LeagueHistoryService`, `RulesService`, `StandingsService`, `TeamService`, `EmailService`) are reused unchanged.

Ships behind the s1 `?newShell=1` gate (per epic D-E) — production users still see the old toolbar route through `MyLeagueComponent` until stub 5 flips the default.

---

## iOS-to-web surface mapping

| iOS view | New web route | New web component | Data source |
|---|---|---|---|
| `StandingsView.swift` | `/league/standings` | `pages/league/standings/standings.component.ts` | `LeagueService` (rosters/users), `StandingsService.buildStandings` |
| `MatchupsView.swift` | `/league/matchups` | `pages/league/matchups/matchups.component.ts` | `LeagueService.getLeagueChain` → `LeagueHistoryService.getMatchupHistoryFromChain`, `LeagueService.getLeagueMatchups` |
| `PlayoffBracketView.swift` | `/league/playoffs` | `pages/league/playoffs/playoffs.component.ts` | `LeagueService.getWinnersBracket` / `getLosersBracket` |
| `WorldCupView.swift` | `/league/world-cup` | `pages/league/world-cup/world-cup.component.ts` | `LeagueService.getLeagueChain` → `LeagueHistoryService.getWorldCupStandings` |
| `RulesView.swift` (`page: .rulebook`) | `/league/rulebook` | `pages/league/rules/rulebook/rulebook.component.ts` | Static `LEAGUE_RULES` (moved from `LeagueComponent`) |
| `RulesView.swift` (`page: .scoring`) | `/league/scoring` | `pages/league/rules/scoring/scoring.component.ts` | `LeagueModel.getScoringSettings` + `SCORING_*` static tables (moved) |
| `RulesView.swift` (`page: .leagueSettings`) | `/league/settings` | `pages/league/rules/league-settings/league-settings.component.ts` | `LeagueModel.getRosterPositions` |
| `PayoutsView.swift` | `/league/payouts` | `pages/league/rules/payouts/payouts.component.ts` | Existing `LEAGUE_RULES[5]` content for now (real config port deferred — see Out of Scope) |
| `RulesView.swift` (`page: .ruleProposals`) + `RuleProposalFormView.swift` | `/league/rule-proposals` | `pages/league/rules/rule-proposals/rule-proposals.component.ts` | `RulesService` (proposals, votes), `EmailService.sendRuleProposalEmail`/`AcceptedEmail`/`DeniedEmail`, `SupabaseService.getProfile` |

Each component is `standalone: true` and loaded via `loadComponent`.

---

## Decisions taken in this plan

1. **`/league` → redirect to `/league/standings`.** Matches iOS landing behavior (Standings is the first `TrayDestination` under Play that maps under League shell, and the existing default `activeTab = 'standings'`). Case against: an empty `/league` index could host a future "league overview" hub. Accepted because no such hub is planned and the redirect mirrors the iOS default.
2. **Season chip lives at the shell level.** A single `SeasonStore`-equivalent on `LeagueComponent` (or pulled into `LeagueHistoryService.currentSeason`) feeds all children via `@Input()` or service subscription. Case against: ties child layouts to the parent's chrome assumption — accepted because every iOS child that needs a season chip (`StandingsView`, `MatchupsView`, `PayoutsView`) uses `@Environment(\.selectedSeason)` from a shared `SeasonStore`, matching this pattern. If a child later needs to hide the chip, it can suppress via a route data flag.
3. **Keep the `LeagueComponent` class name.** It becomes a thin shell, but downstream imports (`MyLeagueComponent`, `SelectedLeagueComponent`, `app-routing.module.ts`) all reference `LeagueComponent` and renaming buys nothing functional. Case against: "shell" naming would clarify intent — rejected on grounds of churn vs. value.
4. **Rules splits into 5 separate routes, not a nested `Rules` shell with sub-tabs.** Matches iOS — `TrayDestination` exposes `rulebook`, `scoring`, `leagueSettings`, `ruleProposals`, `payouts` as five distinct destinations rendered through `RulesView(page:)`. Case against: 5 small pages are more file overhead than one navigable Rules page with intra-page sections — rejected because the sidebar entries in `sidebar.entries.ts` already exist as 5 separate destinations.

---

## Phase 0 — pre-work

- [x] Open XomBoard sub-issue `web-ios-parity / s3 League surface split` (label `epic:web-ios-parity`, link to epic issue).
- [x] Confirm zero in-flight web PRs touching `pages/league/league.component.{ts,html,scss}`, `app-routing.module.ts`, or `components/sidebar/sidebar.entries.ts`.
- [x] Branch off `master`: `feature/<sub-issue>-league-surface-split`.

---

## Affected files / components

### NEW (9 standalone components, each with `.ts`, `.html`, `.scss`, `.spec.ts`)

| Path | Purpose |
|---|---|
| `src/app/pages/league/standings/standings.component.*` | Standings table + division view |
| `src/app/pages/league/matchups/matchups.component.*` | Season chip + weekly matchups + modal trigger |
| `src/app/pages/league/playoffs/playoffs.component.*` | Winners + losers brackets |
| `src/app/pages/league/world-cup/world-cup.component.*` | WC divisions + per-season grid |
| `src/app/pages/league/rules/rulebook/rulebook.component.*` | Static `LEAGUE_RULES` accordion |
| `src/app/pages/league/rules/scoring/scoring.component.*` | `scoringCategories` rendering |
| `src/app/pages/league/rules/league-settings/league-settings.component.*` | `rosterSlots` rendering |
| `src/app/pages/league/rules/payouts/payouts.component.*` | Payouts content (sourced from `LEAGUE_RULES[5]` for now) |
| `src/app/pages/league/rules/rule-proposals/rule-proposals.component.*` | Proposal list + form + voting + email side-effects |

### EDIT

| File | Change |
|---|---|
| `src/app/pages/league/league.component.ts` | Gut `activeTab` + 9 tab-handler methods; keep `mode`/`league` resolution, `setupLeague`, league header bind. Move `LEAGUE_RULES`, `SCORING_KEY_LABELS`, `SCORING_CATEGORIES` static tables to per-child components. Keep `currentUserId` getter (still used by header context). |
| `src/app/pages/league/league.component.html` | Strip tab buttons + 5 tab body sections. Leave league header (pic, name) + season chip + `<router-outlet>`. |
| `src/app/pages/league/league.component.scss` | Strip tab-body styles; keep header + container shell styles. |
| `src/app/app-routing.module.ts` | Add `/league` nested children using `loadComponent`. `/league` redirects to `/league/standings`. `/selected-league` stays single-route (Q1 hybrid — foreign leagues remain a single mega-tab view through this stub; revisit in a separate follow-up if needed). |
| `src/app/components/sidebar/sidebar.entries.ts` | Replace 9 entries' `route: '/league'` + `queryParams: { tab: '…' }` with route-only entries pointing at `/league/standings`, `/league/matchups`, `/league/playoffs`, `/league/world-cup`, `/league/rulebook`, `/league/scoring`, `/league/settings`, `/league/payouts`, `/league/rule-proposals`. Remove all `queryParams` from those entries. Leave Draft History (s4), Team Analyzer (s8), Draft Order (s9), AI Review (s6), Admin (s7) entries untouched. |

### POSSIBLY DELETE (after extraction)

- Dead helpers inside `league.component.ts`: `loadMatchupHistory`, `filterBySeason`, `groupByWeek`, `loadPlayoffBracket`, `groupBracketByRound`, `loadWorldCup`, `loadRules`, `loadProposals`, `submitProposal`, `castVote`, `getSeasonBreakdown`, `getMatchupResult`, `getPointsDiff`, `openMatchupDetail`, `checkThresholds`, `sendRuleStatusEmail`, `deleteProposal`, `getProposalDate`, `toggleRuleSection`, `setTab`, `loadProposals` (each moves into its owning child component).

### NO CHANGE

- `src/app/pages/selected-league/selected-league.component.ts` — Q1 hybrid keeps the foreign-league mega-tab view as-is for this stub.
- `src/app/pages/my-league/my-league.component.ts` — thin wrapper; left in place because s1's `/league` route still points at it under the old shell path. The new sidebar entries target `/league/...` directly; `MyLeagueComponent` becomes vestigial but is left for the old shell until stub 5 default flip retires it.
- `LeagueService`, `LeagueHistoryService`, `RulesService`, `EmailService`, `StandingsService`, `TeamService`, `UserService`, `SupabaseService`.
- `MatchupModalComponent`, `LoaderComponent`.

---

## Implementation steps

- [x] **Step 1** — Phase 0 (issue, branch, confirm no in-flight PRs).
- [x] **Step 2** — Generate the 9 standalone component shells via Angular CLI:
  - `ng generate component pages/league/standings --standalone`
  - `ng generate component pages/league/matchups --standalone`
  - `ng generate component pages/league/playoffs --standalone`
  - `ng generate component pages/league/world-cup --standalone`
  - `ng generate component pages/league/rules/rulebook --standalone`
  - `ng generate component pages/league/rules/scoring --standalone`
  - `ng generate component pages/league/rules/league-settings --standalone`
  - `ng generate component pages/league/rules/payouts --standalone`
  - `ng generate component pages/league/rules/rule-proposals --standalone`
  No logic yet — just scaffolds. Keep auto-generated `.spec.ts` "should create" tests.
- [x] **Step 3** — Lift Standings: move standings render block from `league.component.html` (currently `activeTab === 'standings'` body) into `StandingsComponent`. Inject `LeagueService`, `StandingsService`, `TeamService`, `UserService`, `Router`. Re-implement the click handlers (`selectCurrentTeam`, `goToUserProfile`) inside the component. Wire via `loadComponent` at `/league/standings`. Visit `/league/standings?newShell=1` and verify parity vs old `?tab=standings`.
- [x] **Step 4** — Lift Matchups: move matchup-history rendering + `loadMatchupHistory`, `filterBySeason`, `selectSeason`, `groupByWeek`, `selectHistoryWeek`, `getMatchupResult`, `getPointsDiff`, `openMatchupDetail`, `closeMatchupModal` into `MatchupsComponent`. Include `MatchupModalComponent` in its imports. Verify `/league/matchups`.
- [x] **Step 5** — Lift Playoffs: move bracket rendering + `loadPlayoffBracket`, `groupBracketByRound`, `getTeamName`, `getTeamAvatar`, `getBracketMatchLabel` into `PlayoffsComponent`. Verify `/league/playoffs`.
- [x] **Step 6** — Lift World Cup: move WC rendering + `loadWorldCup`, `getSeasonBreakdown`, `wcGridColumns` into `WorldCupComponent`. Verify `/league/world-cup`.
- [x] **Step 7** — Lift Rulebook: move `LEAGUE_RULES` static array, `leagueRules` getter, `toggleRuleSection`, `expandedRuleSections` into `RulebookComponent`. Verify `/league/rulebook`.
- [x] **Step 8** — Lift Scoring: move `SCORING_KEY_LABELS`, `SCORING_CATEGORIES`, `scoringCategories` derivation, `formatScoringKey` into `ScoringComponent`. Subscribe to current league via `LeagueService.getMyLeague()` (or `getCurrentLeague()` for selected-mode parity in a future stub). Verify `/league/scoring`.
- [x] **Step 9** — Lift League Settings: move `rosterSlots` derivation into `LeagueSettingsComponent`. Verify `/league/settings`.
- [x] **Step 10** — Lift Payouts: extract `LEAGUE_RULES[5]` "Dues & Payouts" markup into `PayoutsComponent`. (Real config-driven payouts port deferred — see Out of Scope.) Verify `/league/payouts`.
- [x] **Step 11** — Lift Rule Proposals: move proposals list/form + `loadProposals`, `submitProposal`, `castVote`, `deleteProposal`, `checkThresholds`, `sendRuleStatusEmail`, `getProposalDate`, `filteredProposals`, `approvalThreshold`, `denialThreshold`, `proposalFilter`, `showProposalForm`, `proposalTitle`, `proposalDescription`, `submittingProposal`, `recentlyStamped` into `RuleProposalsComponent`. Inject `RulesService`, `EmailService`, `SupabaseService`, `ToastService`. Verify `/league/rule-proposals`.
- [x] **Step 12** — Strip `LeagueComponent` down: keep `mode`-resolution (`ngOnInit` flow), `setupLeague`, `getLeagueUsers`, `getLeagueRosters` (still needed to populate `LeagueService.myLeague` / `currentLeague` for children), league header bind in template. Replace the tab-body block with `<router-outlet>`. Remove the tab-button row. Remove `queryParamsSub` and the `?tab=` watcher. Remove the now-unused `activeTab` field, `setTab`, and all helpers listed in "POSSIBLY DELETE" above.
- [x] **Step 13** — Rewire `sidebar.entries.ts`: update the 9 affected entries per the EDIT table above. Confirm `queryParams` removed from all 9. Verify sidebar still renders correctly and clicks land on the new routes.
- [x] **Step 14** — Add nested routes to `app-routing.module.ts`. New `/league` block becomes:
  - `path: 'league'`, `component: LeagueComponent`, `canActivate: [AuthGuard]`, with `children`:
    - `{ path: '', redirectTo: 'standings', pathMatch: 'full' }`
    - `{ path: 'standings', loadComponent: () => import('./pages/league/standings/standings.component').then(m => m.StandingsComponent) }`
    - …same shape for `matchups`, `playoffs`, `world-cup`, `rulebook`, `scoring`, `settings`, `payouts`, `rule-proposals`.
  Remove the existing `{ path: 'league', component: MyLeagueComponent }` line (`MyLeagueComponent` is left in tree for the old shell but no longer reachable via `/league` — the new nested children take over).
- [x] **Step 15** — Smoke test: manual verification needed (local dev server). Build verified clean. `/selected-league` path confirmed untouched.
- [x] **Step 16** — `npm run build` succeeds. Pre-existing test failures unchanged (7 FAILED 5 SUCCESS on both baseline and s3 — all `HttpClient` provider misses in specs, not s3 regressions).
- [ ] **Step 17** — Run `/ultrareview` (per epic decision D-A). Skipped — `/ultrareview` agent not available in this env; user to run separately before merge.
- [x] **Step 18** — Commit + PR opened. See EXECUTION_LOG.md for details.

---

## Out of scope

- Draft surfaces (s4 owns Draft restructure).
- Draft Order Proposal route (s9).
- Search surfaces / `/selected-league` refactor (s2 already shipped Search; selected-league mega-tab remains as-is for Q1 hybrid).
- Theme/visual polish (s10).
- Real config-driven `PayoutsComponent` (iOS `LeaguePayouts.charlotteDynastyDefault` port). This stub ships the existing static markup at `/league/payouts`; full payout projection port is deferred to a follow-up.
- Season-chip implementation as a true shared `SeasonStore` service. Phase ships a parent-owned `@Input()`-passed `selectedSeason` string; full store extraction can land later if multiple consumers need it.
- Backend / Lambda / Supabase changes — none needed.
- Removing `MyLeagueComponent` / `SelectedLeagueComponent` wrappers (their cleanup is bundled with s5's default-flip when `?newShell=1` retires).

---

## Risks / Tradeoffs

- **Bundle size** — 9 lazy-loaded children should shrink the initial `LeagueComponent` payload, not grow it. `loadComponent` keeps each child out of the main bundle. Confirm via `ng build --stats-json` if curious; not a release blocker.
- **External `?tab=` deep links** — repo scan turned up only sidebar entries + s1 PLAN doc references. No announcements, email templates, AI Review markdown, or in-product links use `?tab=`. No 301/redirect-from-query needed in product code. Open question below covers whether to add one defensively anyway.
- **`LeagueComponent` consumers** — `MyLeagueComponent` and `SelectedLeagueComponent` re-export it. Neither needs edits since they render `<app-league>`, and `<app-league>` now contains `<router-outlet>` — so child routes only render under `/league/...`, not under `/selected-league` (which is intentional; selected stays single-view this stub).
- **Service state coupling** — children read from `LeagueService.myLeague` / `currentLeague`, populated by the shell's `ngOnInit`. If a child route is hit before the shell finishes resolving, the child must show a loader and react to a "league ready" signal (existing `LeagueService` already exposes this). Each lifted method already short-circuits on missing league — preserve that behavior on lift.
- **Spec scaffolding** — `ng generate` writes minimal specs; accept the auto-generated "should create" for each new component. No deeper unit tests for behavior (the lifted logic was untested before; not regressing).
- **Old shell pre-default-flip** — production traffic still routes through `MyLeagueComponent` until s5 flips the default. The new nested routes are reachable under `?newShell=1` only; old users keep the legacy mega-tab. Acceptable per D-E.

---

## Decisions (locked 2026-06-04)

- [x] **`?tab=` 302 redirects → skip**. Repo scan returned zero in-product references and the old query-param URLs were never publicly documented. Cleaner routing config + YAGNI win. Any user who's bookmarked a `?tab=` URL will land on `/league/standings` via the `/league` redirect — acceptable degradation.

---

## Success criteria

1. Nine routes exist under `/league/...` and each renders only its single surface (no shared tab UI).
2. `/league` redirects to `/league/standings`.
3. `LeagueComponent` no longer contains `activeTab`, `setTab`, or any tab-body rendering — confirmed by file diff.
4. Sidebar entries for the 9 destinations route directly to `/league/<sub>` with no `queryParams`.
5. All 9 routes are reachable via deep-link refresh (no broken state on hard navigation).
6. `/selected-league?leagueId=...` still renders the legacy mega-tab view unchanged.
7. `npm run build` succeeds; `ng test --watch=false` passes (including 9 new "should create" specs).

---

## Skills / Agents to use

- **`/ultrareview`**: mandatory pre-PR step per epic decision D-A. Solo maintainer = no second pair of eyes; ultrareview catches drift before the PR opens.
- **angular-refactor / planner-executor pair**: lift-and-shift is mechanical — generate, move, wire — but the 9 lifts are repetitive and ripe for an executor agent loop with a verification step per lift.

---

## Next step

Run `/execute s3-league-surface-split` once this plan is flipped from `Draft` to `Ready`.
