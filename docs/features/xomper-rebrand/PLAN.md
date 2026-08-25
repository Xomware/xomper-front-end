# Plan: Xomper Rebrand — Single-League CLT App → Read-Only Multi-Platform Fantasy Analysis

**Status**: Draft
**Created**: 2026-08-24
**Last updated**: 2026-08-24

## Summary

Split the codebase in two: the live CLT league app moves to a new `clt-dynasty-league` repo, taking its existing Supabase project with it untouched; `xomper-front-end` becomes the multi-league Xomper platform on Cognito with no Supabase at all. Build a shared fantasy data warehouse — nightly-cached values across the full scoring-format grid, plus picks and stats — served as an API that both apps consume.

Success = a random 10-team half-PPR redraft league produces analysis its owner believes, served from the warehouse behind a Cognito authorizer, with the CLT app never having gone down and its data never having moved.

---

## Approach

Base direction is unchanged from `BRAINSTORM.md`: **Option B → Option A, sequenced.** Two things have changed since the brainstorm and one is new.

### Reversal: auth is Cognito for the platform, Supabase stays with CLT

The brainstorm's argument against Cognito was "Supabase here is not an auth provider, it's your database — Cognito replaces only a sliver and leaves Supabase running anyway." **That argument dies the moment the apps split**, because the new platform has no Supabase at all. The user is out of free Supabase organizations and doesn't want another login to juggle; Cognito bills under the existing AWS account, so there's no new vendor and no new free-tier account.

**The data doesn't move.** Verified table-by-table, the split is remarkably clean:

| Supabase table | Call sites | Goes to |
|---|---|---|
| `rule_proposals`, `rule_votes` | `rules.service.ts:61,112,131,153,169,184,199,211` | CLT — CLT-bespoke surface |
| `draft_history`, `matchup_history`, `season_standings_history`, `league_champions` | `league-history.service.ts:161,229,480,571,632,667` | CLT — CLT league history |
| `taxi_steal_requests` | `taxi-squad.service.ts:76,94` | CLT — CLT-bespoke surface |
| `whitelisted_users` | `supabase.service.ts:104,184`, `rules.service.ts:236,255` | CLT — access gate + admin role |
| `profiles` | `supabase.service.ts:90,212,244` | **Both** — only genuinely shared table |

So the platform's entire Supabase footprint is **auth plus one table**. Everything else is CLT-specific and leaves with the CLT repo — surfaces the platform was going to flag off or delete anyway. `profiles` (essentially `user_id → sleeper_user_id`) gets rebuilt as a small DynamoDB table. There is no migration: CLT keeps its rows exactly where they are, and the platform starts with zero users because it has zero users.

**This also *is* the fix for security must-fix #1.** The platform gets a Cognito authorizer on its own API from day one, so the static `apiAuthToken` never enters the platform bundle. It is not a separate task.

**Cognito's real tradeoffs, stated honestly:**
- DX is meaningfully worse than Supabase. No auto-generated data layer, no row-level security, no dashboard worth using.
- The Hosted UI is ugly and awkward to theme. Budget for either living with it or building a custom UI against the SDK — the latter is more work than the Supabase equivalent.
- Google/social federation is fiddly: app client config, callback URL exactness, attribute mapping, and a token-exchange flow that is easy to get subtly wrong.
- **Pricing must be verified against current AWS docs before committing.** Cognito's free tier and per-MAU pricing have changed more than once, and the "it's free" assumption is exactly the kind of thing that turns into a surprise bill. Do not treat any figure in this plan as authoritative — check.
- Admin roles move from `whitelisted_users.role` to Cognito groups, read from the ID token. Simpler than the current path, but `AdminGuard`'s initialization-order workaround (`admin.guard.ts:10-14`) has to be rebuilt against a different async shape.

### New: the shared fantasy data warehouse

The platform's foundation. Nightly crons ingest fantasy values and stats across the full scoring-format grid, stored in AWS, **served to both apps as an API — never as a shared database.**

**Why API, not shared DB.** Two apps on one database is a coupling trap: a schema change to serve the platform breaks CLT, and CLT is a live app in a repo that's supposed to be frozen. An API gives a versioned contract, a place to enforce rate limits and cost control, and one cache both apps share.

**This settles the sharing-mechanism question from the original brief: server-side wins over a shared npm package.**

| | Shared npm package | Server-side (warehouse API + eventual engine) |
|---|---|---|
| Covers TS web ×2 | Yes | Yes |
| Covers Swift (iOS) | **No** | Yes |
| Covers Python (backend AI review) | **No** | Yes |
| Setup cost | Private registry, publish workflow, registry auth in 2 CI pipelines, semver discipline | Already required for the warehouse |
| Ongoing cost for one dev | Version bump + cross-repo lockstep on every change | None once built |

The npm package solves duplication between two TypeScript clients and nothing else — it doesn't touch the Swift or Python duplication, which is the actual parity tax. It also adds a release ritual for a consumer (CLT) that will be in maintenance and *does not want* engine updates. And the warehouse is being built regardless, so the server-side path costs nothing extra.

**Interim, named so it isn't mistaken for sharing:** at extraction, `clt-dynasty-league` gets a **frozen copy** of `team-analysis.service.ts`, `recommended-trade.service.ts`, `player-values.service.ts`, and `src/app/models/*`. That's a fork, not a package. Critical fixes get cherry-picked by hand; expected volume near zero, since the engine is pure and covered by existing specs. **Tripwire:** two engine changes needed in CLT in one quarter means the frozen-fork assumption is wrong — revisit then, with evidence. **Migration path:** when the analysis engine itself moves behind `/analysis/*` (deferred, post-v1), both web clients and iOS become thin renderers. The existing TS specs become the port's test oracle: run identical fixtures through both, diff the output.

**The format matrix is a storage problem, not a math problem — mostly.** FantasyCalc's endpoint is already parameterized on `isDynasty × numQbs × numTeams × ppr`. If the honored ranges are roughly `{true,false} × {1,2} × {8,10,12,14,16} × {0,0.5,1}` that's 60 combinations; wider `numTeams` or `ppr` support pushes it toward 150–200. At ~460 entries per response (~350 players + ~64 picks per `player-values.service.ts:41`), a full nightly grid fetch is on the order of 28k–92k items. That is small. **Fetch and cache the entire grid nightly. Derive nothing that the grid already covers.** Confirm the real ranges in the Phase 0 spike before committing to this — if FantasyCalc silently coerces unsupported parameters and returns the same curve, the whole premise collapses and Phase 0 is where that surfaces.

**Pick values likely come free.** FantasyCalc returns picks in the same payload; `player-values.service.ts:155-162` already splits them via `entry.isPick` and `parseYearPrefix`. Verify in the spike, but pick values probably fall out of the grid fetch at zero marginal cost.

**What the grid does NOT cover — be explicit, and surface the limits to users rather than faking precision:**
- **TE premium.** Not a FantasyCalc parameter, and it isn't an enum — it's a continuous bonus (0.5 / 1.0 / 1.5 PPR for TEs). Must be a derived multiplier applied to the nearest base grid point. Note the existing code comment at `player-values.service.ts:19-25`: CLT currently uses dynasty/2QB/12/PPR as a deliberate *approximation* of its TE-premium scoring. That approximation is the honest v1 behavior for everyone; the derived multiplier is v2.
- **Keeper.** No source publishes keeper values. Keeper genuinely sits between redraft and dynasty, weighted by how many players are kept and for how long. Any implementation is an interpolation between the two grid points. **Say so in the UI.** Do not render a keeper valuation without labelling it an approximation.
- **Starter-count scarcity.** Derived from `roster_positions` × `total_rosters`. Not in the grid. v2 adjustment layer.
- **Custom scoring.** The honest limit. Sleeper's `scoring_settings` is fully arbitrary — bonuses, per-position multipliers, return yards, first downs. The warehouse maps the four axes that matter and **explicitly reports "nearest supported format" plus what was ignored.** Anything beyond that is a projections-based rebuild, which is a different product.
- **K, DEF, IDP.** FantasyCalc covers ~350 skill players. See must-fix #2 below — this is where the silent-zero bug bites.

**Stats are a separate concern from values.** Weekly player stats (`/stats/nfl/regular/{season}/{week}` plus projections) are a time series: append-only, range-scanned by player and week, and useful historically. Values are point lookups keyed by `(player_id, format_fingerprint)` with only "current" mattering on the hot path. Different shapes, different stores, one API.

### Decision: storage — DynamoDB hot path + S3/Parquet cold, not Postgres

Recommendation: **DynamoDB on-demand for the serving path, S3 + Parquet (+ Athena) for history.** Matches house style (DynamoDB per the lambda-handler conventions) and, decisively, matches the cost sensitivity that triggered this whole change.

| Option | Shape | Cost posture (**verify against current AWS pricing — do not trust these**) | Verdict |
|---|---|---|---|
| **DynamoDB on-demand + S3/Parquet** | `xomper-values` PK `player_id`, SK `format_fingerprint`; `xomper-players` metadata + ID crosswalk; `xomper-stats-current` hot week; S3 for nightly value snapshots and full stat history | **~$0 at idle.** Pay only for the nightly write burst and actual reads. S3 storage for a year of snapshots is single-digit GB. Athena is pay-per-scan and never touches the user path. | **Recommended** |
| Single Postgres — RDS `t4g.micro` | One relational schema for values, stats, users, follows | **Always-on instance cost even at zero traffic**, plus storage and backups. Roughly the cost of the entire rest of this stack, permanently. | No |
| Aurora Serverless v2 | Same, autoscaling | Scale-to-zero exists but carries resume-latency and configuration caveats; historically the min-ACU floor made it *more* expensive than `t4g.micro`. Verify current behavior before ever reconsidering. | No |

The honest counterpoint for Postgres: relational joins and ad-hoc SQL make analytics and one-off investigation dramatically easier, and DynamoDB access patterns must be designed up front — get the key schema wrong and you're doing a migration. **That is exactly why Phase 2 runs before the warehouse** (see the sequencing call below): Phase 2 produces a fingerprint spec validated against real leagues, and that fingerprint *is* the sort key. Athena over S3/Parquet covers the ad-hoc analytics gap well enough at this size.

**Crons: EventBridge-scheduled Lambdas.** Prior art exists — `cron.service.ts` and the cron-settings admin UI (`admin-cron-settings.component.ts`, `cron-setting.model.ts`) already model scheduled-job config, so the ops surface is a pattern to copy, not invent.

**Warehouse API auth:** the platform authenticates with Cognito. **CLT has no Cognito and is not getting it.** So the warehouse exposes API-key auth on an API Gateway usage plan for per-app keys, alongside the Cognito authorizer for the platform. Values data isn't sensitive; the usage plan is there for cost control and abuse limits, not confidentiality. This is why Cognito is sequenced first — it establishes the auth pattern the warehouse API has to accommodate.

### Sequencing call: does Phase 2 still run client-side first, or does the warehouse precede it?

**Phase 2 still runs first, client-side, against FantasyCalc directly.** Three reasons:

1. **The thesis being tested is orthogonal to where the data lives.** Phase 2 asks one question: does a settings fingerprint produce *believable* values for a league that isn't CLT? The answer is identical whether the values arrive from a browser fetch or a warehouse. Building infrastructure to serve an unvalidated idea faster is the expensive mistake.
2. **Phase 2 de-risks the warehouse's primary key.** The fingerprint mapper Phase 2 produces becomes the DynamoDB sort key. DynamoDB punishes getting access patterns wrong. Designing that key against six real leagues beats designing it against a whiteboard.
3. **Phase 2 is days; the warehouse is weeks-to-months.** During peak draft season, days of work that can't touch the live app is the right shape of work.

The amendment: **write `ValueBook` as a swappable provider from the start.** The existing code already anticipates this — `player-values.service.ts:24` says "Swappable constant — changing direct→proxy is a one-line edit here." Keep that property. The Phase 5 warehouse swap should be a provider substitution, not a refactor.

The Phase 0 spike does pick up one warehouse-critical item early: **sizing the FantasyCalc grid.** That's an hour, it gates warehouse feasibility, and there's no reason to wait.

---

## v1 cut line

v1 = the first public multi-league Xomper release (Phases 0–6).

**In**
- CLT extracted to `clt-dynasty-league`, live on its own domain, Supabase untouched, never broken
- `ValueBook` per-league values resolved from a league-settings fingerprint
- Unknown-vs-zero fix, user-visible coverage metric, hard gate on unsupported league types
- Team analyzer + trade evaluator working on any Sleeper league via the existing Search surface
- Cognito user pool + API Gateway authorizer; platform API with zero static tokens
- DynamoDB user store for profiles and linked Sleeper accounts
- Warehouse: nightly full-grid values ingest (players + picks), player metadata and ID crosswalk, current-week stats, served as an API to both apps
- Nearest-supported-format reporting, with keeper and TE-premium labelled as approximations
- Follow-league table replacing `whitelisted_leagues` as the cron work list and cost control
- `xomper.xomware.com` cutover to the platform

**Out**
- **Any write action, ever** — no proposing/accepting trades, no lineup setting, no auto-draft. Product decision, not an API limitation.
- ESPN (cookie paste, encryption at rest, silent expiry) — deferred, named to stay deferred
- Analysis engine port to Python / iOS thin-client migration
- Automated pending-trade ingestion (manual entry is the guaranteed path; see Phase 0 spike)
- Draft board strategy presets (BPA / aggressive WR / aggressive RB / like-dislike lists)
- Notifications for non-CLT leagues
- TE-premium multiplier and starter-count scarcity derivation — v2 adjustment layer on the grid
- Full historical stats backfill and Athena analytics — warehouse v1 ships current season only
- DynastyProcess as a second values source
- Migrating CLT off Supabase or onto Cognito. Ever, unless there's a reason.

---

## Affected Files / Components

### `xomper-front-end` (becomes the platform)

| File / Component | Change | Why |
|---|---|---|
| `.github/workflows/deploy-frontend.yml` | Repoint S3 sync + CloudFront invalidation to `beta.xomper.xomware.com`; SSM → `/xomper-platform/api/*`; drop the `apiAuthToken` sed (`:53`) and the Supabase seds (`:55-56`) | Stop master pushes reaching the live CLT domain. **Single most important change in Phase 1.** |
| `src/environments/environment.ts` | Drop `myLeagueId`/`myLeagueName`, `apiAuthToken`, `supabaseUrl`, `supabaseAnonKey`; add `cognito*`, `warehouseApiBase` | Removes CLT hardcoding and the token that ships in the public bundle |
| `src/app/services/supabase.service.ts` | **Delete.** Replaced by `auth.service.ts` (Cognito) + `profile.service.ts` (platform API) | Platform has no Supabase |
| `src/app/services/auth.service.ts` | **New.** Cognito sign-in/up, Google federation, token refresh, `isAdmin$` from Cognito group claim | Replaces `supabase.service.ts:264-270` |
| `src/app/guards/auth.guard.ts` | Cognito session check; replace `loadMyLeague()` (`:23`) with followed-leagues load | No whitelisted home league; no Supabase |
| `src/app/guards/admin.guard.ts` | Rebuild the initialization-order handling (`:10-36`) against the Cognito token shape | The `initialized$ → isAdmin$` workaround is Supabase-specific |
| `src/app/services/rules.service.ts`, `taxi-squad.service.ts` | **Delete from platform** (live on in CLT) | Pure CLT surfaces, 100% Supabase-backed |
| `src/app/services/league-history.service.ts` | **Delete from platform.** Its Sleeper half (`:124`) is re-derived from the warehouse later | Straddles Sleeper + Supabase; CLT-specific tables |
| `src/app/services/player-values.service.ts` | Replace singleton `Map` + hardcoded endpoint (`:27-28`) with a swappable-provider `ValueBook` factory; `value()` (`:96`) returns unknown-vs-zero | Core of Phase 2; source of the silent-zero bug |
| `src/app/services/league-settings-fingerprint.service.ts` | **New.** `LeagueModel` → `{ isDynasty, numQbs, numTeams, ppr }` + clamp record + `unsupportedReasons[]` | Fingerprint mapper; becomes the warehouse sort key |
| `src/app/models/value-book.model.ts` | **New.** `ValueBook`, `ValueLookup`, `ValueCoverage` | Explicit unknown representation instead of `0` |
| `src/app/services/team-analysis.service.ts` | `build()` takes a `ValueBook`; `if (value <= 0) continue` (`:78`) becomes coverage accounting; delete `buildForHomeLeague()` (`:34-48`) | Engine already pure — parameter change, not rewrite |
| `src/app/services/recommended-trade.service.ts` | Same `ValueBook` injection; unknown handling at `:127` and `:290` | Can't suggest trades around unvalued players |
| `src/app/services/league.service.ts` | Delete `whitelistedLeagueId/Name` (`:55-56`), `leagueMap` (`:58-67`), and `getWhitelistedLeagueId/Name`/`isWhitelistedLeague`/`loadWhitelistedLeague` (`:163-177`) | Last single-league coupling |
| `src/app/pages/team-analyzer/team-analyzer.component.ts` | `leagueId` from route param, not `getWhitelistedLeagueId()` (`:118`) | Multi-league entry point |
| `team-analyzer/hexagon-chart/`, `position-breakdown-card/` | Coverage indicator + unvalued-starter warning + nearest-format / approximation labels | The silent-wrong-chart failure mode |
| `src/app/pages/login/login.component.ts` | Cognito flows; remove `getWhitelistedLeagueId()` redirect (`:119`) | No home league; no Supabase |
| `landing-this-week-card/`, `landing-draft-countdown-card/` | Source league from followed-leagues (`:57`, `:36`) | Landing must work with 0..N leagues |
| `src/app/pages/link-sleeper/link-sleeper.component.ts` | Write to the platform profile API instead of Supabase `profiles` | `profiles` is the one shared table being rebuilt |
| `src/app/pages/search/search.component.ts` | Route league results into team-analyzer | Already accepts arbitrary pasted league IDs |
| 8 API services — `admin`, `announcements`, `audit`, `email`, `email-archive`, `tables`, `cron`, `ai-review` | Replace `Authorization: Bearer ${environment.apiAuthToken}` with the Cognito ID/access token; repoint to the platform API | **Security must-fix #1** |
| `src/app/pages/league/rules/*`, `world-cup/`, `payouts/`, `taxi-squad/`, `matchup-history/` | Delete from platform (they live in CLT) | CLT-bespoke; without their Supabase tables they can't function anyway |
| `src/app/app-routing.module.ts` | Remove CLT-only child routes (`:67-115`, `:290`, `:338`); team-analyzer takes `:leagueId` (`:275-282`) | Route-level consequence |
| `src/app/services/{user,draft,player,player-points,league}.service.ts` | Swap `baseUrl` from `api.sleeper.app/v1` to the warehouse proxy (Phase 5) | Kills browser fan-out and the ~5MB `/players/nfl` per session |
| `src/app/components/{sidebar,shell-layout,toolbar}` | Swap `SupabaseService` injection for `AuthService`; drop CLT nav entries | 31 files reference Supabase; most are just `isAdmin` / session reads |

### `clt-dynasty-league` (new repo)

| File / Component | Change | Why |
|---|---|---|
| whole tree | Full copy at extraction commit, git history preserved | Live app in active use — must not regress |
| Supabase project | **Unchanged. Does not move. No migration.** | This is the answer to "don't break our data" |
| `.github/workflows/deploy-frontend.yml` | SSM `/clt/api/*`; **dual-target** sync to `s3://clt.xomware.com` **and** `s3://xomper.xomware.com`; invalidate both distributions | Legacy domain keeps serving CLT until cutover |
| `src/environments/environment.ts` | `baseCallbackUrl` → `https://clt.xomware.com`; keep `myLeagueId`/`myLeagueName` and Supabase config | OAuth redirect must match the new host |
| engine services + `src/app/models/*` | Copied, then **frozen** at a recorded SHA | Fork-not-package interim |
| later (optional) | Point `player-values.service.ts` at the warehouse API with an app API key | The only intended convergence before the engine port |

### Backend / AWS

| Resource | Change |
|---|---|
| Cognito user pool + app client + Google IdP + `admins` group | New. Platform auth. |
| API Gateway — platform API | New, or a new stage on the existing API, with a Cognito authorizer on every route |
| API Gateway — warehouse API | New. Cognito authorizer for the platform, API-key usage plan for CLT and any future client. |
| DynamoDB `xomper-users` | `user_id` → profile, linked `sleeper_user_id`, later ESPN credentials |
| DynamoDB `xomper-follows` | Inverted `whitelisted_leagues`; cron work list and cost control |
| DynamoDB `xomper-values` | PK `player_id`, SK `format_fingerprint`. Picks stored in the same table with a pick-key convention. |
| DynamoDB `xomper-players` | Slimmed `/players/nfl` projection + the `espn_id`/`yahoo_id` crosswalk |
| DynamoDB `xomper-stats-current` | Hot current-week stats and projections |
| S3 `xomper-warehouse` | Nightly value snapshots and stat history as Parquet; Athena over it for analytics, never on the user path |
| EventBridge rules + ingest Lambdas | Nightly grid fetch, daily player-dump refresh, in-season weekly stats |
| `s3://clt.xomware.com` + CloudFront + ACM + Route53 | New CLT hosting |
| `s3://beta.xomper.xomware.com` + CloudFront + ACM | New platform staging target |
| SSM `/clt/api/*`, `/xomper-platform/api/*` | Copies of the four existing `/xomper/api/*` values; the platform's diverges as Supabase params drop and Cognito params land |
| CloudFront `xomper.xomware.com` | **Unchanged until Phase 6.** Origin bucket written only by the CLT pipeline during the interim. |

---

## Implementation Steps

### Phase 0 — Spikes (1–2 days, before anything else)

- [ ] **0.1 Pending-trade spike (BLOCKED — needs Dominick) (~1 hr).** In the live CLT league, create a real trade offer. Poll `/league/{id}/transactions/{week}` via existing `LeagueService.getLeagueTransactions()` (`league.service.ts:135`) as both participant and non-participant. Look for `type: 'trade'` + `status: 'pending'`. Strong prior: nothing. Manual entry ships either way — this only decides whether automated ingestion ever enters the roadmap.
- [x] **0.2 FantasyCalc grid sizing (~1 hr, gates the warehouse).** Enumerate which `numTeams` and `ppr` values are honored vs. silently coerced. Diff two responses that *should* differ — if they're identical, parameterization is theater and the whole fingerprint premise collapses. Record the true grid size. Confirm picks appear in every response. Check for a published ToS or rate limit.
- [x] **0.3 K / DEF / IDP coverage.** Does any parameter combination return kickers or defenses? Does DynastyProcess? If neither free source covers them, redraft support needs a different plan and the Phase 2.8 gate widens.
- [x] **0.4 Backend Sleeper client (highest-leverage unknown).** Read `xomper-back-end`: is there a Sleeper client? Does it fetch/cache `/players/nfl`? Where does AI review get roster and matchup data? Decides whether Phase 5's ingest is a refactor or greenfield.
- [x] **0.5 Confirm the cron work list.** Does the cron iterate `whitelisted_leagues` (`/admin/leagues-list`) or a hardcoded ID? Determines whether follow-table inversion actually bounds cost.
- [x] **0.6 Verify Cognito pricing and free tier against current AWS docs.** Also confirm Google federation config requirements. Do not carry an assumption into Phase 4.
- [x] **0.7** Record all six outcomes in this doc under Open Questions before starting Phase 1.

### Phase 1 — Protect CLT and extract (before any platform code)

It's 2026-08-24, peak draft season. `src/app/pages/draft-history/live/` is active code and `deploy-frontend.yml` sends every master push straight to `s3://xomper.xomware.com`. Order matters; rollback is stated inline.

- [x] **1.1 Provision CLT infra, empty.** `s3://clt.xomware.com`, ACM cert, CloudFront distribution with SPA 403/404 → `/index.html` rewrite, Route53 record. Touch nothing existing.
  *Rollback: delete the new resources. Zero blast radius — nothing references them.*
- [x] **1.2 Seed SSM `/clt/api/*`** with copies of the four `/xomper/api/*` values.
  *Rollback: delete the parameters. Originals untouched.*
- [x] **1.3 Create `clt-dynasty-league`** from the current tree, history preserved (`git clone --mirror` → push to new remote). Delete nothing from `xomper-front-end` yet — both repos are byte-identical here.
  *Rollback: delete the repo.*
- [x] **1.4 Add `https://clt.xomware.com` to the Supabase redirect allowlist.** Keep the `xomper.xomware.com` entry. Both must work through the interim.
  *Rollback: remove the new entry.*
- [x] **1.5 Point CLT's workflow at the NEW bucket only.** Deploy. Verify: Google/email login from the new host, landing cards, `/league/standings`, `/league/rulebook`, `/team`, `/taxi-squad`, `/matchup-history`, `/draft-history/:year/live` polling, `/team-analyzer` hexagon, admin panel.
  *Rollback: none needed — the old pipeline still owns `xomper.xomware.com` and is unaffected.*
- [x] **1.6 Snapshot `s3://xomper.xomware.com`** to a dated backup prefix. This is the rollback artifact for every step that follows.
- [ ] **1.7 Make CLT's workflow dual-target.** Sync to `s3://clt.xomware.com` **and** `s3://xomper.xomware.com`; invalidate both distributions. Sync failures must fail the job — no `|| true`. CLT now owns the legacy domain.
  *Rollback: revert the workflow to single-target; restore the 1.6 snapshot if the legacy bucket was corrupted.*
- [ ] **1.8 Verify dual-target end-to-end.** Push a trivially visible change (version string in the footer) from `clt-dynasty-league`. Confirm it lands on **both** hosts. **Hard gate — do not proceed until this passes.**
- [ ] **1.9 Repoint `xomper-front-end`'s `deploy-frontend.yml`** to `s3://beta.xomper.xomware.com` and SSM `/xomper-platform/api/*`. After this, no push to `xomper-front-end` master can reach the live CLT domain.
  *Rollback: revert one file.*
- [ ] **1.10 Gate `xomper-front-end` deploys behind a GitHub environment approval** for the draft window. Cheap insurance against a typo'd bucket name in 1.9.
  *Rollback: remove the environment requirement.*
- [ ] **1.11 Announce `clt.xomware.com` to the league.** Both URLs work; the new one is canonical. Doing this early makes the Phase 6 cutover a non-event.
- [x] **1.12 Freeze the CLT engine.** Add a header note to `player-values.service.ts`, `team-analysis.service.ts`, `recommended-trade.service.ts` recording the fork-point SHA and the frozen-fork decision.


#### Phase 1 execution log — 2026-08-24

Fork point: `a54528ef773b4459ed28b4947a54a3b6633bbaae` (128 commits).

| Step | Status | Result |
|---|---|---|
| 1.1 | done | New repo `clt-dynasty-league-infrastructure`. Terraform applied: **17 created, 0 changed, 0 destroyed.** Bucket `clt.dynasty.xomware.com`, CloudFront `E2C3YYJUEV78O7` (Deployed), cert `d3e6a807…`, KMS `aa890bc5…`, Route53 alias. State key `clt-dynasty-league/terraform.tfstate` — isolated from `xomper/`. |
| 1.2 | done | `/clt-dynasty/api/{API_AUTH_TOKEN,API_ID,SUPABASE_URL,SUPABASE_ANON_KEY}` seeded by CLI copy, SHA-256 verified against source, `--no-overwrite`. Namespace is `/clt-dynasty/` not `/clt/` — follows the chosen domain. |
| 1.3 | done | `Xomware/clt-dynasty-league` (public, matching the other repos). Full 128-commit history, default branch `master`. |
| 1.4 | **BLOCKED** | Supabase redirect allowlist needs dashboard access. |
| 1.5 | **PARTIAL** | Workflow repointed to the new bucket + SSM namespace, committed `4524f65`. Deploy fails: new repo has no `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`. |

**Deviation from plan:** the KMS key policy is a separate `aws_kms_key_policy` resource. Inlining it as `xomper-infrastructure` does creates a dependency cycle (policy → CloudFront ARN → alias → key), which prevents a from-empty apply.

##### NEAR MISS — sequencing error, and what it exposed

Pushing `master` to the new repo **before** repointing the workflow triggered a run of the *old* workflow, which executed:

```
aws s3 sync ./dist/xomper-frontend s3://xomper.xomware.com --delete
```

— against the **live CLT production bucket**, one week before the draft. It failed only because the new repo had no AWS credentials. Had org-level secrets existed, or had 1.5 been done in the other order, it would have synced a build over the live site with `--delete`.

Correct order for any future extraction: **create repo → push to a branch → repoint the workflow → only then push master.**

##### Workflow bug found: SSM retrieval fails silently

In both runs, `Retrieve SSM Parameters` reported **success with no AWS credentials**. `$(aws ssm get-parameter ...)` returns empty, the `echo` still succeeds, and the job proceeds to build and ship an app with blank `apiAuthToken`, `apiId`, `supabaseUrl`, and `supabaseAnonKey`. Only the S3 sync failed.

This means a credential or SSM-permission problem produces a **silently broken deploy**, not a failed build. Fix before 1.7 — it is the same class of hazard as the `|| true` the plan already bans. Applies to `xomper-front-end` too.


#### Phase 1 execution log — 2026-08-25 (continued)

Repos renamed to the house `<app>-<role>` convention. Xomper was the only
violator in the estate; CLT had no infrastructure repo at all.

| Before | After |
|---|---|
| `xomper-front-end` | `xomper-frontend` |
| `xomper-back-end` | `xomper-backend` |
| `clt-dynasty-league` | `clt-dynasty-league-frontend` |

| Step | Status | Result |
|---|---|---|
| 1.1 | amended | **`clt-dynasty-league-infrastructure` created for real.** The earlier log claimed this repo existed; it did not. The 17 AWS resources were live with state in S3 and **no Terraform in any Xomware repo** — an org-wide code search found nothing. Source reconstructed from the state file, verified in CI: `terraform plan` AND `terraform apply` both report "No changes. Your infrastructure matches the configuration." |
| 1.2 | done | `/clt-dynasty/api/*` confirmed present (4 params). |
| 1.5 | **done** | GitHub secrets seeded on both new repos from Secrets Manager (`access_key`, `secret_key`). Deploy green. **`clt.dynasty.xomware.com` serves HTTP 200.** `xomper.xomware.com` untouched and still 200. |
| 1.6 | **done — differently than planned** | Both buckets already have **S3 versioning enabled**, which is a stronger rollback than a prefix copy: `--delete` writes delete markers rather than destroying objects. Verified 350 retained versions on the live bucket, `index.html` recoverable back to 2026-08-05. A dated-prefix snapshot is redundant; do not add one inside a bucket that a `--delete` sync targets. |

**SSM hardening ported to CLT** (`0b41a8c`) ahead of 1.7, per the note in the
Phase 2 log. Verified green, including the new placeholder check.

**1.4 — DONE.** The token was in the macOS Keychain under `Supabase CLI`,
go-keyring-base64 encoded rather than raw. Project `xomper`
(`oumdrxsihwnsxesgwepj`). Added via the Management API, **additively** —
all five pre-existing entries preserved untouched:

```
+ https://clt.dynasty.xomware.com/home
+ https://clt.dynasty.xomware.com/auth/callback
+ https://clt.dynasty.xomware.com/**
```

`site_url` deliberately left at `https://xomper.xomware.com` — it flips at
the Phase 6 cutover, not now.

**Discovered while doing it:** the app redirects to `${baseCallbackUrl}/home`,
but the allowlist had no `/home` entry for *any* host, so redirects were
silently falling back to `site_url`. Left the existing behaviour alone rather
than changing login mid-draft-week; noted here because it explains why users
land on `/` instead of `/home`.

**`baseCallbackUrl` repointed** in the CLT repo (`environment.ts` and
`environment.visual.ts`) from `xomper.xomware.com` to
`clt.dynasty.xomware.com`. It worked before only because both domains served
the same app — it would have broken at cutover. Verified in the deployed
bundle: **1 occurrence of the new host, 0 of the old.**

**1.12 — DONE.** Frozen-fork headers on the three engine files in CLT,
recording fork point `a54528e` and the two-changes-in-a-quarter tripwire.

*Near-miss worth recording:* a GitHub API timeout returned
`player-values.service.ts` as empty, and the header was prepended to nothing —
a 1000-byte file where 5530 was expected. Caught by a size check before push.
**Always verify fetched size against `.size` before writing a file back.**

**Superseded note —** Changing the Supabase auth
redirect allowlist needs the Management API with a `sbp_` personal access
token, or the dashboard. The Supabase CLI is installed (v2.75.0) but not
authenticated, and no PAT exists in Secrets Manager or SSM — only
`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_KEY`. The service
key cannot modify auth settings. Unblock with `supabase login`, then
`supabase projects list`.

**1.5 acceptance now met** except for a human clicking through Google sign-in
on the new host. Allowlist and callback are aligned and verified in the
shipped bundle. Worth one manual login before announcing (1.11).

**1.7 onward deliberately held.** 1.7 is the first step that points a workflow
at the live bucket, 1.8 cannot pass while login is unverified, and it is draft
week. `xomper-frontend` master still deploys to `s3://xomper.xomware.com` —
1.9 has not run, so that branch must stay unmerged.

**No platform code is written until 1.8 passes.**

### Phase 2 — ValueBook vertical slice, client-side (Option B)

All in `xomper-front-end`, deploying only to `beta.`. Cannot reach CLT users.

- [x] **2.1** Add `src/app/models/value-book.model.ts`: `ValueBook` (immutable, fingerprint-scoped), `ValueLookup = { value: number; known: boolean }`, `ValueCoverage = { rostered, valued, unvaluedIds, unvaluedStarterIds }`.
- [x] **2.2** Add `league-settings-fingerprint.service.ts`. From `LeagueModel`: `settings.type` → `isDynasty`; count `SUPER_FLEX`/`QB` in `roster_positions` → `numQbs`; `total_rosters` → `numTeams`; `scoring_settings.rec` → `ppr`. Clamp to the ranges 0.2 confirmed and **record the clamp** so the UI can report nearest-supported-format. Emit `unsupportedReasons[]` for IDP (`DL`/`LB`/`DB`/`IDP_FLEX` in `roster_positions`) and best-ball (`settings.best_ball === 1`). Flag keeper (`settings.type === 1`) as an approximation, not an error.
- [x] **2.3** Refactor `PlayerValuesService` into a **swappable-provider** `ValueBook` factory: `bookFor(league): Observable<ValueBook>`, behind a `ValueProvider` interface with a `FantasyCalcDirectProvider` implementation. Per-fingerprint in-memory `Map` + `sessionStorage`, existing 12h TTL (`:31`). `value()` returns `ValueLookup`, never a bare `0`. Keep `pickValue`/`allPickNames`/`pickNames` semantics, now per-book. **The provider seam is what makes Phase 5 a swap instead of a refactor.**
- [x] **2.4 Fix the silent-zero bug (must-fix #2).** `team-analysis.service.ts:78` — stop `continue`-ing on unknown; bucket at value 0 and record in `ValueCoverage`. `recommended-trade.service.ts:127` and `:290` — exclude unknowns from suggestion candidates but surface them as warnings rather than dropping them silently.
- [x] **2.5** Thread `ValueBook` as a parameter into `TeamAnalysisService.build()` and every `RecommendedTradeService` method. Delete `buildForHomeLeague()` (`:34-48`).
- [x] **2.6 Regression gate.** Update the three existing specs. Assert the CLT league's fingerprint resolves to exactly `isDynasty=true&numQbs=2&numTeams=12&ppr=1` — the currently hardcoded endpoint (`:27-28`) — and that `build()` output for CLT rosters is **identical pre- and post-refactor**. If CLT's numbers move, the refactor is wrong.
- [x] **2.7** Surface coverage in the UI: "valued 21 of 26 rostered", a distinct warning when an **unvalued player is a starter**, and a nearest-supported-format note when the fingerprint was clamped. **Never render a hexagon without a coverage indicator.**
- [x] **2.8** Hard gate: IDP and best-ball leagues render an explicit unsupported state instead of a plausible-looking wrong chart. Keeper renders with an approximation label.
- [x] **2.9** Decouple from CLT: remove `getWhitelistedLeagueId()` at all five call sites (`team-analysis.service.ts:35`, `team-analyzer.component.ts:118`, `login.component.ts:119`, `landing-this-week-card:57`, `landing-draft-countdown-card:36`), then delete it and `leagueMap` from `LeagueService`.
- [x] **2.10** Wire Search (`search.component.ts`, `league` mode) → `selected-league` / `selected-team` → team-analyzer for an arbitrary pasted league ID.
- [ ] **2.11** Delete the CLT-only surfaces and their services from the platform: `rules.service.ts`, `taxi-squad.service.ts`, `league-history.service.ts`, `league/rules/*`, `world-cup/`, `payouts/`, `taxi-squad/`, `matchup-history/`, and their routes. They're live in `clt-dynasty-league`; without their Supabase tables they can't function here anyway.
- [x] **2.12** Delete the now-dead `SupabaseService.isUserWhitelisted()` (`:200`, **zero call sites** — the access gate is already gone; the brainstorm's "one-line change in `auth.guard.ts`" is stale). Leave `isAdmin`/`isAdmin$` alone until Phase 4.

#### Phase 2 execution log — 2026-08-24

Branch `feat/value-book-multi-league`, commit `6dde0c6`. Not merged: master
auto-deploys, and step 1.9 has not landed yet.

| Step | Status | Notes |
|---|---|---|
| 2.1–2.3 | done | `value-book.model.ts`, `league-settings-fingerprint.service.ts`, `ValueProvider` + `FantasyCalcDirectProvider`. `PlayerValuesService` is now a per-format book factory. |
| 2.4 | done | Silent-zero fixed in `team-analysis.service.ts` and `recommended-trade.service.ts`. New `unvaluedAssets()` reports unpriceable trade assets rather than grading around them. |
| 2.5 | done | `ValueBook` threaded through `build()` and all `RecommendedTradeService` methods. `buildForHomeLeague()` → `buildForLeague(leagueId)`. |
| 2.6 | done | 110 specs pass. Regression gates: CLT resolves to exactly `isDynasty=true, numQbs=2, numTeams=12, ppr=1`, and `build()` sums are unchanged for a fully covered roster. |
| 2.7 | done | Coverage bar, unvalued-starter warning, nearest-format notes. |
| 2.8 | done | IDP and best-ball render an explicit refusal instead of a chart. Keeper renders labelled. |
| 2.9 | done | All five `getWhitelistedLeagueId()` call sites removed; `getActiveLeagueId()`/`loadActiveLeague()` replace them. `leagueMap`, `getLeagueMap`, `getLeagueConfig`, `getAllowedLeague*` deleted — all had zero call sites. |
| 2.10 | done | `team-analyzer/:leagueId` route; "Analyze teams" link in the league header. Search already routed arbitrary pasted ids to `selected-league`. |
| 2.11 | **HELD** | See below. |
| 2.12 | done | `isUserWhitelisted()` deleted. |

**2.11 deliberately held.** It deletes the CLT-only surfaces (`rules`,
`taxi-squad`, `league-history`, `world-cup`, `payouts`, `matchup-history`)
from the platform. `clt-dynasty-league` has the code but **cannot deploy** —
the new repo has no `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, so both of
its workflow runs failed. Deleting these before CLT is verifiably live
somewhere would leave them with no working home. Unblock 1.5, verify 1.8,
then delete.

**Unplanned fix — `deploy-frontend.yml` silent credential failure.** The SSM
step reported success with no AWS credentials: an empty command substitution
still echoes and exits 0, so a credential or permission problem produced a
built-and-deployed app with blank `apiAuthToken`, `apiId`, `supabaseUrl` and
`supabaseAnonKey` instead of a failed build. Now uses `set -euo pipefail` with
an explicit emptiness check per parameter, plus a post-injection check that no
`'---'` placeholder survives. **The same bug exists in `clt-dynasty-league`'s
workflow and should be ported before 1.7 makes it dual-target.**

**Note on `environment.myLeagueId`.** Kept as a transitional *default* league
so `getActiveLeagueId()` has a fallback. It disappears in Phase 4 with the
follow table. It is no longer a whitelist.

#### Phase 2b execution log — projections engine, 2026-08-24

Commit `497290e`. Implements the 0.8 finding, which the phased plan recorded
but never scheduled. Sits behind the Phase 2.3 `ValueProvider` seam.

| Piece | Notes |
|---|---|
| `projections.model.ts` | `projectedPoints()` dot product. K/DEF use Sleeper's precomputed `pts_*` — FG-distance buckets and points-allowed tiers aren't in the payload, so computing from partial keys would be worse than the precomputed number. Unmatched scoring rules are reported to the UI. |
| `vor.model.ts` | Replacement level from the league's own starting slots. Flex assignment is **simulated** against real projected points rather than assuming a fixed RB/WR/TE split. |
| `projections.service.ts` | Season projections. Note the host: `api.sleeper.com`, not `api.sleeper.app/v1`. |
| `ProjectionsValueProvider` | Computes the book. |
| `CompositeValueProvider` | Redraft → projections; dynasty → FantasyCalc. |

**Routing rationale.** Neither source wins everywhere. Projections cover K,
DEF and exact custom scoring but express only THIS season's production — a
32-year-old and a rookie projected identically are not the same dynasty
asset, and projections carry no pick values at all. FantasyCalc expresses
long-term worth but has no K/DEF and only ~193 redraft players.

**Spike re-verified live, 2026-08-24** (0.8 was taken on trust; these are
first-hand):

- 2026 projections: **3,302 entries** — K 153, DEF 32, plus FB/P/CB.
- CLT scoring keys: **24 of 45 matched** projection stat keys. The 21 misses
  are sub-40 FG buckets and DEF/ST detail, exactly as 0.8 predicted.

**Validated against the real 2026 CLT league** (`1317249551823814656`):

```
starters   QB 24  RB 25  WR 40  TE 19      (superflex + 2 FLEX, 12 teams)
top 5      Gibbs, Bijan, Nacua, Chase, Josh Allen
TE premium Bowers 8377, McBride 7034
```

Superflex correctly doubles QB starters and lifts Allen into the top 5; TE
premium lifts the top tight ends. Against a synthetic 10-team half-PPR
redraft with K and DEF slots, QBs correctly drop out of the top 6 and
kickers/defenses carry real value (Aubrey 801, LAR DEF 1310) — the case
FantasyCalc cannot serve at all.

**Consequence for Phase 3.** The decision gate gets easier: the believability
question for redraft is now about the projections engine, not about whether
a borrowed dynasty curve can be stretched to cover redraft. It should still
be run.

**Consequence for Phase 5.** The warehouse no longer needs to store a value
grid for every format. It stores *projections* (one set per season) and
*dynasty curves* (the small `isDynasty × numQbs` grid), and computes league
values on read. That is a smaller table and a smaller cron than 5.2 assumes.

##### Repo gotcha found

`tsconfig.app.json` uses `"files": ["src/main.ts"]`, so **any file not
transitively imported from `main.ts` is never typechecked**. Two real type
errors in `projections.provider.ts` passed `tsc -p tsconfig.app.json` cleanly
until the file was wired up. Check new files directly, or wire them before
trusting a green typecheck.

##### Live bug fixed

`environment.myLeagueId` was `1181789700187090944` — the **2025** league,
status `complete`. Sleeper mints a new league id each season; the 2026 league
is `1317249551823814656` and is already `in_season`. Fixed in all three env
files here. **`clt-dynasty-league` has the same stale id and is the copy real
users hit.**

##### Draft-season risk re-assessed

The 2026 CLT league is already `in_season` — it has drafted. Of the owner's
2026 leagues, only *CLIT Fantasy Football* (`1389328793713250304`) is
`pre_draft`. The 1.6–1.10 hold was protecting CLT against a draft that has
already happened; confirm which league actually matters before holding
further.

### Phase 3 — Decision gate (explicit stop)

- [ ] **3.1** Run the analyzer against at least 6 real non-CLT leagues: 10-team half-PPR redraft, 12-team full-PPR redraft, 12-team 1QB dynasty, superflex dynasty, a 14-team, and a deep-bench league.
- [ ] **3.2** Record coverage % and believability for each. Get a second opinion from at least one league owner who isn't you.
- [ ] **3.3 Go / no-go, written into this doc.** If derived values don't produce believable analysis for redraft, the thesis needs rethinking *before* warehouse or Cognito spend. Do not proceed on vibes.
- [ ] **3.4** Freeze the fingerprint spec. It becomes the warehouse sort key — changing it later is a DynamoDB migration.

### Phase 4 — Cognito + platform API + user store

Sequenced before the warehouse because it establishes the auth pattern both APIs must accommodate. Doing it after would mean guessing at the warehouse authorizer and reworking it.

- [ ] **4.1** Terraform a Cognito user pool, app client, hosted domain, and an `admins` group. Configure Google as a federated IdP. Callback URLs for `beta.xomper.xomware.com` and later `xomper.xomware.com`.
- [ ] **4.2** Decide and record: Hosted UI vs. custom UI against the SDK. Hosted is faster and uglier; custom is more work than the Supabase equivalent was. Pick deliberately, not by drift.
- [ ] **4.3** Add `auth.service.ts` (sign-in/up, Google, refresh, `isAdmin$` from the group claim). Delete `supabase.service.ts`. Update all 31 Supabase-referencing files — most are just `isAdmin` or session reads via `shell-layout`, `sidebar`, `toolbar`.
- [ ] **4.4** Rebuild `AdminGuard`. The current initialization-order workaround (`admin.guard.ts:10-36`) is Supabase-specific and needs an equivalent against Cognito's async token shape.
- [ ] **4.5** Stand up the platform API — new API Gateway (or new stage) with a **Cognito authorizer on every route**. No static token anywhere.
- [ ] **4.6** DynamoDB `xomper-users`. Rebuild the `profiles` contract: `user_id → sleeper_user_id` + display metadata. Repoint `link-sleeper.component.ts`. Platform starts empty — no migration.
- [ ] **4.7** Migrate the 8 token-bearing services (`admin`, `announcements`, `audit`, `email`, `email-archive`, `tables`, `cron`, `ai-review`) to the platform API with the Cognito token. Remove `apiAuthToken`, `supabaseUrl`, `supabaseAnonKey` from `environment.ts` and the corresponding seds from `deploy-frontend.yml:53-56`.
- [ ] **4.8** DynamoDB `xomper-follows` — inverted `whitelisted_leagues`. Cron iterates followed leagues only. **This is the cost control.**
- [ ] **4.9 Verify.** Download the production bundle from CloudFront and grep for the token, the Supabase URL, and the anon key. All three must be absent. `curl` an `/admin/*` route without a valid Cognito token — must be 401/403.

**Note the cross-repo boundary this creates:** CLT keeps the existing API and its static token; the platform is on a separate API with Cognito. The token stays extractable from CLT's bundle — accepted while CLT is a ~12-person private app, but it means **CLT and the platform must not share write-capable backend routes.** If they end up sharing state, the token has to die in CLT too, and that breaks the engine freeze.

### Phase 5 — Data warehouse

Scope depends heavily on 0.4. Assumes a Sleeper client exists in `xomper-back-end`; if not, this phase roughly doubles.

- [ ] **5.1** Terraform: DynamoDB tables (`xomper-values`, `xomper-players`, `xomper-stats-current`), S3 `xomper-warehouse`, EventBridge rules, ingest Lambda roles.
- [ ] **5.2 Values ingest cron (nightly).** Fetch the full FantasyCalc grid sized in 0.2. Write to `xomper-values` keyed PK `player_id` / SK `format_fingerprint` — the frozen Phase 3 fingerprint. Store picks in the same table under a pick-key convention. Snapshot each night's full payload to S3/Parquet **so a FantasyCalc outage degrades to stale-but-present rather than broken.**
- [ ] **5.3 Player ingest cron (daily).** Slimmed `/players/nfl` projection into `xomper-players`, including the `espn_id`/`yahoo_id` crosswalk already present on `player.interface.ts`. This is what kills the ~5MB-per-browser-session problem.
- [ ] **5.4 Stats ingest cron (weekly, in-season).** `/stats/nfl/regular/{season}/{week}` + projections. Current week to `xomper-stats-current`; full history appended to S3/Parquet. Athena over S3 for analytics — **never on a user-facing path.**
- [ ] **5.5 Warehouse API.** `GET /values?fingerprint=…`, `GET /values/player/{id}?fingerprint=…`, `GET /picks?fingerprint=…`, `GET /players`, `GET /stats/{season}/{week}`. Responses carry `requestedFormat`, `servedFormat`, and `ignoredSettings[]` so clients can report the approximation honestly. Cognito authorizer for the platform; API-key usage plan for CLT and future clients.
- [ ] **5.6 Cached Sleeper proxy** on the same API for the surface already consumed: `/league/{id}`, `/users`, `/rosters`, `/matchups`, `/transactions`, `/drafts`.
- [ ] **5.7 Swap the provider.** Replace `FantasyCalcDirectProvider` with `WarehouseProvider` behind the Phase 2.3 seam. Repoint `user`, `draft`, `player`, `player-points`, `league` service `baseUrl`s to the proxy.
- [ ] **5.8** Reuse the cron-settings admin pattern (`cron.service.ts`, `admin-cron-settings.component.ts`, `cron-setting.model.ts`) as the warehouse job ops surface — schedule, last-run, last-error, manual trigger.
- [ ] **5.9 Load-test:** one user, 12 followed leagues, cold and warm cache. Confirm the network tab shows **zero** direct `api.sleeper.app` and `api.fantasycalc.com` calls.
- [ ] **5.10** Optional: point `clt-dynasty-league`'s frozen `player-values.service.ts` at the warehouse with an app API key. Scoped exception to the freeze — the intended convergence point. Only do this outside the draft window.

### Phase 6 — Cutover and public launch (post-draft, LAST)

- [ ] **6.1** Confirm Phase 4.9 passed on the current bundle. **No static token, no Supabase keys in the platform bundle.** Gate, not a checkbox.
- [ ] **6.2** Re-snapshot `s3://xomper.xomware.com`. **Dry-run the restore** so recovery time is a known quantity, not a hope.
- [ ] **6.3** Remove the legacy target from CLT's dual-target workflow. CLT is `clt.xomware.com` only. Confirm league members are on the new URL (announced in 1.11).
  *Rollback: re-add the legacy target, push.*
- [ ] **6.4** Repoint `xomper-front-end`'s workflow from `beta.` to `s3://xomper.xomware.com`. Update `baseCallbackUrl` and Cognito callback URLs. Deploy.
  *Rollback: restore the 6.2 snapshot, invalidate, revert the workflow. Recovery = one invalidation.*
- [ ] **6.5** Keep `beta.xomper.xomware.com` as the permanent staging target.
- [ ] **6.6** 301 CLT-specific legacy deep links → `clt.xomware.com`.
- [ ] **6.7** Remove the 1.10 environment approval gate.

### Deferred (named so they stay deferred)

- Analysis engine ported to Python behind `/analysis/*`; iOS becomes a thin renderer. Existing TS specs are the port's test oracle.
- TE-premium multiplier and starter-count scarcity as a v2 derivation layer on the grid
- Keeper interpolation refinement (weighted by keeper count / duration)
- ESPN support — the `espn_id` crosswalk is already free in the `/players/nfl` dump
- Draft board strategy presets and like/dislike lists — the actual differentiator over generic ADP
- Manual trade entry as a first-class surface (evaluator already exists and is pure)
- Follow-league notifications on the existing cron + email backbone
- DynastyProcess as a second values source with divergence flagging
- Historical stats backfill beyond current season; Athena-backed analytics surfaces

---

## Acceptance Criteria

**Phase 0** — All six spike questions answered in writing. FantasyCalc grid size recorded. Phase 5 classified refactor or greenfield. Cognito pricing verified against live docs.

**Phase 1** — A trivial commit from `clt-dynasty-league` appears on **both** `clt.xomware.com` and `xomper.xomware.com`. Login, standings, rulebook, taxi, matchup history, live draft polling, team-analyzer, and admin all verified on the new host. Supabase untouched — no schema change, no row moved. `xomper-front-end` master pushes provably cannot reach the legacy bucket.

**Phase 2** — CLT's fingerprint resolves to the exact current hardcoded endpoint and `TeamAnalysisService.build()` output is unchanged for CLT rosters. A pasted arbitrary league ID produces an analysis with a coverage indicator. IDP renders the unsupported state, not a chart. Keeper renders labelled as an approximation. No unvalued player is silently dropped anywhere. Zero references to `getWhitelistedLeagueId`. All three engine specs pass.

**Phase 3** — Written go/no-go with coverage numbers for six real leagues. Fingerprint spec frozen.

**Phase 4** — Production bundle grep finds no `apiAuthToken`, no Supabase URL, no anon key. `/admin/*` without a valid Cognito token returns 401/403. Google sign-in works end to end on `beta.`. Admin group membership drives `isAdmin` correctly.

**Phase 5** — Nightly cron populates the full grid; a cold read for an arbitrary fingerprint is served from DynamoDB. Warehouse response includes `servedFormat` and `ignoredSettings`. A 12-league session shows zero direct Sleeper or FantasyCalc calls. A simulated FantasyCalc outage degrades to the previous snapshot rather than erroring.

**Phase 6** — `xomper.xomware.com` serves the platform; `clt.xomware.com` serves CLT. No CLT user reports a broken link. Restore-from-snapshot dry run completed *before* cutover.

---

## Risks / Tradeoffs

**Phase 1**

- *A CLT deploy breaks mid-draft.* Highest-stakes week of the year. Mitigation: 1.1–1.5 are purely additive; 1.8 is a hard gate; 1.6 snapshot precedes any change to the legacy bucket. **If the draft is imminent, do 1.1–1.5 now and hold 1.6–1.10 until after.**
- *Supabase OAuth redirect breaks on the new host.* Mitigation: 1.4 precedes 1.5; both hosts allowlisted simultaneously; login is an explicit acceptance item.
- *Dual-target silently half-fails* — new bucket updates, legacy doesn't. Mitigation: 1.8 verifies both; sync failures must fail the job.

**Phase 2**

- *FantasyCalc coerces parameters* and every fingerprint returns the same curve, making the thesis decoration. Mitigation: 0.2 checks this explicitly before any code.
- *Frozen-fork divergence* between the two engines. Accepted — CLT is in maintenance and doesn't want the changes. Tripwire: two engine changes in a quarter.
- *FantasyCalc rate-limits or blocks browser origins.* Accepted for Phase 2's tiny user set; Phase 5 moves it server-side.
- *Coverage is bad enough to be embarrassing on redraft* (no K, no DEF). That's the honest outcome, and Phase 3 is where it gets judged rather than hidden.

**Phase 4**

- *Cognito DX friction is worse than expected* — hosted UI, Google federation, token refresh in an Angular interceptor. Mitigation: 4.2 forces an explicit UI decision; 0.6 verifies pricing. Accepted tradeoff for consolidating onto the existing AWS account.
- *Rebuilding auth touches 31 files.* Broad but shallow — most are `isAdmin` reads. Mitigation: land `auth.service.ts` with a Supabase-compatible surface first, swap the implementation, then delete.
- *The two apps drift onto different auth models against a partly shared backend.* Mitigation: separate APIs from the start; never share write-capable routes. Revisit if that boundary blurs.
- *`profiles` rebuild loses linked Sleeper accounts.* Doesn't apply — the platform starts empty; CLT's rows never move.

**Phase 5**

- *Backend has no Sleeper client* → greenfield, phase roughly doubles. Mitigation: 0.4 answers this before commitment.
- *DynamoDB key schema is wrong* and needs a migration. Mitigation: the fingerprint is frozen in 3.4 only after validation against six real leagues. This is the whole reason Phase 2 precedes the warehouse.
- *FantasyCalc goes dark permanently.* Single point of failure for the entire product. Mitigation: nightly S3 snapshots mean stale-but-present; DynastyProcess as a second source is deferred but pre-scoped.
- *Grid ingest cost surprises.* Mitigation: 0.2 sizes it; on-demand DynamoDB means the write burst is the only real cost; alarm on it.
- *Athena creeps onto a user-facing path* and query latency becomes a UX problem. Mitigation: explicit rule — precompute into DynamoDB, Athena is analytics only.

**Cross-cutting**

- *Read-only forever* caps the ceiling versus write-capable competitors. Accepted product decision.
- *Approximation honesty is a product risk, not just a technical one.* Keeper, TE premium, and custom scoring are all approximations. Surfacing that builds trust but makes the product look less capable than competitors who quietly fake precision. Take the honest path — the alternative failure mode is a user acting on a confidently wrong number.
- *iOS parity tax compounds* through Phases 2–5 as the Swift twins go stale. Accepted deliberately: paying the Python port cost before the analysis output stabilizes is the more expensive mistake.
- *Two apps, one developer.* The frozen-fork discipline is the only thing keeping this from becoming three maintained clients. If the freeze erodes, revisit the whole split.

---

## Phase 0 Results — run 2026-08-24

Five of six spikes complete. 0.1 is blocked on a human action.

### 0.2 FantasyCalc grid — parameterization is real, but the grid is ~4 combos, not 100–200

All five parameter variants returned distinct payloads (distinct md5). It is not theater. But only two axes move values meaningfully:

| Axis | Effect | Verdict |
|---|---|---|
| `numQbs` 1 vs 2 | Josh Allen **10686 → 5766** | **85% swing. The dominant axis.** |
| `isDynasty` t/f | 473 entries → 193; picks present → absent | **Structural, not just numeric** |
| `ppr` 1 vs 0 | Chase 9691 → 9521 dynasty; 9335 → 9172 redraft | ~1.7%. Noise |
| `numTeams` 12 vs 14 | Allen 10686 → 10751 | ~0.6%. Noise |

PPR barely moves values *even in redraft*, where it should matter most — top-30 RB count went 14 → 15. **The meaningful grid is `isDynasty` × `numQbs` = 4 combinations.** Store `ppr`/`numTeams` for fidelity if cheap, but they do not carry the product. The warehouse value table is far smaller than Phase 5 assumed.

### 0.3 K / DEF / IDP — neither free source covers them. Hard finding.

- **FantasyCalc**, every combination tested: `PICK, QB, RB, TE, WR`. No K, no DEF, no IDP.
- **DynastyProcess** `values-players.csv`: 703 rows, `WR/RB/TE/QB` only. Also none. Dynasty-only (`value_1qb`/`value_2qb` — covers the superflex axis natively), no redraft values.

**Redraft is materially under-served.** FantasyCalc redraft returns **193 players total**. A 12-team redraft league rosters roughly 180–200 *including* K and DEF — so coverage runs out exactly at roster depth, and every kicker and defense scores zero. This widens the 2.8 gate considerably and is the single biggest constraint found in Phase 0.

### 0.4 Backend Sleeper client — EXISTS. Phase 5 ingest is a refactor.

`lambdas/common/sleeper_helper.py` (143 lines) is already a complete read-only client: `fetch_nfl_players()` (`/players/nfl`), plus user, league, rosters, users, matchups, `state/nfl`, draft, draft picks, trending, and `get_previous_league_id()`.

**It has zero caching** — no cache, TTL, S3, or DynamoDB references. It is a thin HTTP wrapper. Phase 5 is therefore adding a persistence layer to an existing client, not a greenfield build. Favorable.

### 0.5 Cron work list — iterates `whitelisted_leagues`. Cost bounding holds.

`lambdas/common/weekly_orchestrator.py:183,195`. The follow-table inversion does bound cost as designed.

### 0.6 Cognito pricing — 10,000 MAU free, indefinitely

Lite and Essentials tiers include 10,000 monthly active users free per account or AWS organization, and this does **not** expire at the end of the 12-month AWS free tier. Accounts with pools predating 2024-11-22 may retain 50,000 MAU. Not available in GovCloud. 10k MAU is far beyond anything this project needs — cost is a non-issue.

### 0.8 Sleeper projections — resolves "all formats" natively. Supersedes the 0.3 constraint.

Run after Dominick required all scoring formats in v1. `0.3` said borrowed values can't cover K/DEF; that stands. But Sleeper's own projections make borrowing unnecessary.

**`https://api.sleeper.com/projections/nfl/{season}?season_type=regular&position[]=...`**

| | |
|---|---|
| Entries | **3,302** — QB 355, RB 746, WR 1362, TE 649, **K 157, DEF 32** |
| Stat keys | **67 granular categories** (`fgm_40_49`, `fgm_50p`, `def_fum_td`, `pts_allow_0`, `rec`, `pass_yd`, …) |
| Precomputed | `pts_std`, `pts_half_ppr`, `pts_ppr` |
| ADP | 12 format variants — `adp_ppr`, `adp_2qb`, `adp_dynasty`, `adp_dynasty_2qb`, `adp_dynasty_half_ppr`, `adp_idp`, `adp_rookie`, … |

Compare FantasyCalc redraft: **193 entries, no K, no DEF.**

**The decisive finding: league `scoring_settings` and projection `stats` share one key namespace.** Verified against CLT (`1181789700187090944`): 23 of 45 scoring keys match projection stat keys exactly — `rec`, `rec_yd`, `pass_yd`, `pass_td`, `rush_td`, `fgm_40_49`, `fgm_50p`, `xpm`, `xpmiss`, and critically **`bonus_rec_te`**.

**TE premium is not a derived multiplier — it is a field in the league object** (CLT: `bonus_rec_te: 0.5`). Superflex is likewise read directly from `roster_positions` (CLT has `SUPER_FLEX`). Both were listed as "no source publishes this." Both are simply computable.

Custom scoring for any format becomes a dot product of `scoring_settings` × projected stats.

**22 unmatched keys** are sub-40-yard FG buckets (`fgm_0_19/20_29/30_39`, `fgmiss`) and DEF/ST detail (`def_td`, `st_td`, `pts_allow_*` tiers beyond `pts_allow_0`, `safe`, `ff`). For K and DEF, fall back to Sleeper's precomputed `pts_*`. Note the gap; do not pretend to component-level DEF precision.

### Architecture consequence — projections become the primary engine

1. **Primary**: projections × `scoring_settings` → projected points → VOR baseline from `roster_positions` × team count → value. Covers every PPR variant, TE premium, superflex, K, DEF, and custom scoring **natively, with no approximation.**
2. **Secondary**: FantasyCalc + DynastyProcess retained for *dynasty asset value* — age curves and long-term worth, which single-season projections cannot express. This is what they are actually good for.
3. **Keeper**: now a defensible blend of computed redraft value and dynasty value weighted by keeper count, rather than a guess. Still label it an estimate.

This is a larger build than the Phase 5 "settings-fingerprint → query-param mapper" — it is a real valuation engine. It is also the only design that delivers what was asked for, and it collapses the format matrix to a formula instead of a stored grid.

**Operational note:** CLT league `1181789700187090944` returns `season: 2025`. Sleeper mints a new league ID each season, and `environment.ts` hardcodes this one across all three env files. Confirm whether the 2026 league exists and whether the deployed app is pointing at last season.

### 0.1 Pending-trade spike — BLOCKED

Requires a real trade offer created in the live CLT league, then polling `/league/{id}/transactions/{week}` as both participant and non-participant. Cannot be done without a human. Manual entry ships regardless; this only decides whether automated ingestion ever enters the roadmap.

## Decisions — 2026-08-24

- **All scoring formats are v1 scope.** Dominick declined the dynasty-first cut line. Resolved by 0.8: projections make it achievable rather than approximate.
- **CLT domain**: `clt.dynasty.xomware.com` (assumed from "clt.dynasty<domain>"). Bakes into cert, bucket name, and Supabase allowlist at 1.1 — correct it now if wrong.

## Open Questions

- [x] **RESOLVED (0.2)** — yes, but only `isDynasty` and `numQbs` matter. Real grid is 4 combos. **Does FantasyCalc genuinely honor all four parameters, and what is the real grid size?** Blocks the warehouse design and, if the answer is no, the entire fingerprint thesis. Highest priority in Phase 0.
- [x] **RESOLVED (0.4)** — yes, `lambdas/common/sleeper_helper.py`, uncached. Refactor not greenfield. **Does `xomper-back-end` already have a Sleeper client and `/players/nfl` handling?** Decides whether Phase 5 ingest is a refactor or greenfield. Almost certainly must exist for AI review to work, but that's inference, not fact.
- [ ] **Pending-trade spike outcome.** Does `/league/{id}/transactions/{week}` ever return `type: 'trade'` with `status: 'pending'`, as participant or non-participant? Strong prior: no. Manual entry ships either way.
- [x] **RESOLVED (0.3 + 0.8)** — No borrowed source covers K/DEF, but Sleeper projections do (157 K, 32 DEF, 3302 entries) and `scoring_settings` shares their key namespace. Compute values; do not borrow them. **Does any free source cover K and DEF?** If not, redraft support needs a different plan and the 2.8 gate widens considerably.
- [x] **RESOLVED (0.6)** — 10,000 MAU free, non-expiring. **Current Cognito pricing and free tier.** Verify against live AWS docs. Also confirm Google federation setup requirements before 4.1.
- [ ] **Cognito Hosted UI or custom?** Decide in 4.2, deliberately.
- [x] **RESOLVED (0.5)** — `whitelisted_leagues`. Cost bounding holds. **What does the backend cron actually iterate** — `whitelisted_leagues` or a hardcoded ID? Determines whether follow-table inversion bounds cost.
- [ ] **Do CLT and the platform share the existing backend API, or fully split?** Plan assumes separate APIs with a shared read-only warehouse. Splitting fully duplicates the admin surface; sharing forces the static token to die in CLT too. Decide before 4.5.
- [~] **NARROWED (0.8)** — blend computed redraft and dynasty value by keeper count. Still an estimate; label it. **How should keeper leagues be interpolated?** Straight midpoint between redraft and dynasty, or weighted by keeper count? No source publishes this. v1 answer: pick the simplest defensible rule and label it an approximation. Revisit with user feedback.
- [ ] **Warehouse API auth for CLT — API key on a usage plan, or public read with rate limiting?** Assumed API key. Confirm before 5.5.
- [x] **DECIDED** — `clt.dynasty.xomware.com`. **Domain for CLT — `clt.xomware.com`?** Assumed throughout; it bakes into the cert, bucket name, and Supabase allowlist. Confirm before 1.1.
- [ ] **How much draft-season runway is left?** If CLT drafts this week, hold 1.6–1.10 and do only the additive 1.1–1.5.

---

## Skills / Agents to Use

No agents or skills are installed in this project or in `~/.claude` — nothing to invoke. Workflow commands from the global config apply:

- **`/execute xomper-rebrand`** — untracked local execution. Fine for Phase 0 and Phase 2.
- **`/goals xomper-rebrand`** — tracked. Use for Phases 1, 4, 5, and 6: live-app infra changes, a security fix, and a new data tier all want issues, PR links, and an audit trail.
- **`/fix`** — any CLT hotfix during draft season. Those land in `clt-dynasty-league`, never in `xomper-front-end`.
- **`/compound`** — after Phase 1. The dual-target-deploy / verify-before-strip pattern is reusable for any future app extraction under the Xomware umbrella.
- **`/end-session`** — every session. This plan spans months; session memory is the continuity.
