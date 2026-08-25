# Xomper Rebrand — Brainstorm

> Status: Draft (brainstorm only — no plan, no code)
> Last updated: 2026-08-24
> Scope: pivot Xomper from single-league CLT companion → read-only multi-platform fantasy analysis front
> Related: `docs/features/web-ios-parity/BRAINSTORM.md` (Q1 hybrid model already decided), `docs/features/xomper-ios/`

---

## TL;DR

This is a **backend build wearing a frontend rebrand's clothes.** Four codebase facts drive everything below:

1. **The backend serves zero fantasy data today.** Every Sleeper and FantasyCalc call is browser-direct (`UserService`, `LeagueService`, `DraftService`, `PlayerService`, `PlayerPointsService`, `LeagueHistoryService`, `PlayerValuesService` all hardcode `https://api.sleeper.app/v1` or the FantasyCalc URL). The Lambda API surface is *entirely* `/admin/*`, `/email/*`, `/ai-reports/*`, `/announcements/*`, `/cron*`. A caching tier isn't a modification — it's a net-new service tier.
2. **The backend has no per-user auth.** It authenticates with a static bearer token shipped in the JS bundle (`environment.apiAuthToken`, used identically by 8 services). Supabase JWTs never reach API Gateway. This reframes the Cognito question completely (see Q2).
3. **The analysis engine is already pure and league-agnostic.** `TeamAnalysisService.build()` and every method on `RecommendedTradeService` take `rosters`/`users`/`playerMap` as parameters. The *only* coupling to CLT is the singleton `PlayerValuesService.value(pid)` lookup and one `getWhitelistedLeagueId()` call in a convenience wrapper. That's the whole refactor.
4. **Multi-league read-only rendering already exists.** `LeagueComponent` takes `mode: 'my' | 'selected'`, the `selected-*` pages are thin wrappers, and the Search surface already accepts an arbitrary pasted league ID. The hybrid model was decided in web-ios-parity Q1.

**Recommendation: Option B → Option A, sequenced.** Do the ValueBook refactor as a cheap client-side vertical slice to prove the engine on arbitrary leagues, then build the backend data tier. Do not start with the backend, and do not migrate auth at all.

---

## Gaps in the framing (read this before the options)

Five things the brief assumes that the code contradicts or doesn't cover.

### The derivation engine is mostly already built — by FantasyCalc

The brief proposes ingesting base value curves and deriving values at read time from a league-settings fingerprint. That's the right *long-term* shape, but it over-scopes v1. FantasyCalc's endpoint is **already parameterized on the four axes that matter most**:

```
https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=12&ppr=1
```

`isDynasty`, `numQbs`, `numTeams`, `ppr` are exactly the dynasty/redraft × 1QB/SF × team-count × scoring cross product. You don't need to derive those — you need to **map league settings → query params**. The combinatorial explosion the brief worries about isn't a storage problem, it's a *cache key* problem, and the realistic fingerprint space is ~30-50 distinct combos, not thousands.

You only need your own derivation layer for the axes FantasyCalc does **not** expose: TE premium and starter-count positional scarcity. Those are v2 refinements on top of a fetched base curve, not the foundation.

**Reframe:** v1 is a fingerprint → endpoint mapper with per-fingerprint caching. The derivation engine is a v2 adjustment layer. This cuts the single biggest architectural change down to something shippable.

### FantasyCalc covers ~350 players. Your analysis silently returns zero for the rest.

`PlayerValuesService.value()` returns `0` for unknown IDs (matching the iOS default), and both `TeamAnalysisService` and `RecommendedTradeService` do `if (value <= 0) continue`. In CLT this is invisible — a dynasty superflex league only cares about the top ~350 skill players.

Multi-league, this breaks quietly and badly:
- **K and DEF have no FantasyCalc values.** Redraft leagues start them. Every redraft roster analysis silently drops two starters.
- **IDP leagues are entirely unvalued.**
- **Deep benches** (30+ man rosters, 14-16 team leagues) fall off the end of the curve.
- The failure mode is not an error — it's a plausible-looking hexagon chart that's wrong.

This is the biggest data risk in the pivot and it's currently unobservable. Any v1 needs a **coverage metric surfaced in the UI** ("valued 21 of 26 rostered players") and an explicit unsupported-league-type gate.

### The whitelist doesn't get deleted — it gets inverted

`whitelisted_users` (Supabase) does double duty: access gate **and** admin role. `SupabaseService.isAdmin` reads `whitelisted_users.role === 'admin'`. Ripping out the gate must not rip out the role. Cheapest move: stop calling `isUserWhitelisted()` in `auth.guard.ts`, keep the table for roles, rename later.

`whitelisted_leagues` (backend/DynamoDB, exposed via `/admin/leagues-list`) is the cron's **work list** — it's what the notification and AI-review jobs iterate. Multi-user, that becomes "leagues at least one user follows." Same table, inverted population: user-subscribed instead of admin-curated. That's not just tidy, it's your **cost control** — you only cron leagues someone actually follows, so spend scales with engaged users, not with registered ones.

### The backend probably already has a Sleeper client

The AI review generates reports about league state (`/admin/ai-review-weekly-trigger`, `postDraft`, `preseason`, `weekPreview`). It cannot do that without fetching rosters, matchups, and player data server-side. **Assumption to verify: the Lambda already has a Sleeper client and player-dump handling, and the caching tier is a refactor of existing code rather than greenfield.** If true, Option A gets meaningfully cheaper. If false, it gets meaningfully more expensive. This is the highest-leverage unknown in the whole doc.

### Moving the engine server-side kills the iOS parity tax

The brief flags the iOS app as a parallel burden — correct, but it's also an *argument*. Every service here is annotated as a port of a Swift twin (`PlayerValuesStore.swift`, `TeamAnalysisBuilder`, `TradeEvaluator`, `RecommendedTradeBuilder`). Today every engine change is written twice.

If the analysis engine moves behind an API, both clients become thin renderers and the parity burden collapses permanently. That's a real long-term argument for backend-first that the brief doesn't make — weighed against the fact that porting a working pure-function engine from TS to Python is itself a rewrite with its own bug surface.

---

## Phase 1 — Exploration (unfiltered)

Angles considered. Most fold into Phase 2.

**Architecture / sequencing**
- Backend-first: stand up a Sleeper proxy + cache + values service, repoint the frontend wholesale.
- Frontend-first: refactor the singleton value lookup into a per-league `ValueBook`, keep browser-direct fetches, prove the engine on arbitrary leagues before spending backend effort.
- Values-engine-first as its own isolated feature, agnostic to where it runs.
- Fork the product: CLT app stays frozen, new platform app built alongside sharing an engine package.
- Extract the analysis engine into a shared npm package consumed by web + a Node backend, killing the Python/Swift triplication.
- Move the engine to Python in Lambda, make web and iOS thin clients.
- Keep everything client-side forever; accept Sleeper fan-out as the user's own IP problem (it genuinely sidesteps central rate limits).
- Edge-cache Sleeper responses at CloudFront instead of Lambda — you already have the distribution.
- Ship a "bring your own league ID" mode with no auth at all as a pre-v1 growth wedge.

**Values**
- Map league settings → FantasyCalc query params, cache per fingerprint (the cheap path).
- Ingest DynastyProcess CSVs on a cron as the base curve, derive everything yourself (the expensive, controllable path).
- Dual-source: FantasyCalc primary, DynastyProcess fallback + reconciliation, flag divergence.
- Build your own values from Sleeper's own projections/ADP — no third-party dependency, worse quality.
- Let users override values manually (personal like/dislike lists — already wanted for the draft board).
- Surface a coverage/confidence score instead of pretending the numbers are complete.
- Snapshot values weekly to a table so historical analysis is reproducible and you're resilient to a source going dark.
- Normalize to Sleeper player ID as the internal ID (the `/players/nfl` dump is the crosswalk; `espn_id` already exists on `player.interface.ts`).

**Auth**
- Stay on Supabase, add a Lambda authorizer that validates Supabase JWTs against its JWKS endpoint.
- Migrate to Cognito, native API Gateway authorizer.
- Keep Supabase for DB, Cognito for auth (worst of both).
- Drop auth entirely for read-only browse, require it only for follow/notify.
- Keep the static bearer token for admin routes, add user JWT for everything else.

**Whitelist / admin**
- Delete the gate, keep the table for roles.
- Invert `whitelisted_leagues` into a follow/subscription table.
- Keep CLT as a first-class "featured league" with its bespoke surfaces (rules, world-cup, payouts) intact.
- Move CLT-specific surfaces behind per-league opt-in flags so any league can enable a rulebook.
- Admin panel becomes the platform ops console — it gets *more* useful multi-tenant, not less.

**Product / trades**
- Manual trade entry as the guaranteed path (evaluator already exists and is pure).
- Paste-a-trade text parser as a bridge.
- Screenshot → vision model parse (you already have Anthropic API wired for AI review).
- Poll transactions for pending trades — unverified, spike it.
- Watch the *executed* transaction feed and grade completed trades retroactively — guaranteed to work, decent product on its own.

**Social / notifications**
- Cron diffing transactions per followed league → email (backbone already exists: `cron.service.ts`, `email.service.ts`, email-archive).
- Follow users across leagues, not just leagues.
- Push/web-push instead of email.

---

## Phase 2 — Converge

Three options. They differ in **what you build first and what you're willing to be wrong about**, not in end state.

---

## Option A: Backend-first platform

**What**: Build the missing service tier (Sleeper proxy + cache, values service, subscription-driven cron) on the existing Lambda/API Gateway/DynamoDB stack, then repoint the frontend at it.

**How it works**: Add a Lambda authorizer validating Supabase JWTs. Stand up cached endpoints for the Sleeper surface the app already consumes (`/league/{id}`, `/users`, `/rosters`, `/players/nfl` slimmed, `/matchups`, `/transactions`, `/drafts`). Add a values endpoint keyed on a league-settings fingerprint that maps to FantasyCalc params server-side with a shared cache. Invert `whitelisted_leagues` into a follow table that bounds cron spend. Frontend services swap their `baseUrl` and mostly stop caring. Optionally move the analysis engine server-side so iOS gets it free.

**Pros**
- Fixes the real bottleneck. Multi-user without server-side caching is a rate-limit and bandwidth problem waiting to happen (the `/players/nfl` dump alone is ~5MB per browser session).
- Kills the static-bearer-token hole before the app is public. Today anyone can read `apiAuthToken` out of the bundle and call `/admin/*`. That is a **hard blocker on going multi-user** regardless of which option you pick.
- Only path that eventually collapses the iOS parity tax.
- Correct place to enforce cost control, dedupe fan-out, and snapshot values.

**Cons / Risks**
- Longest time to any user-visible change. Months of work before the product looks different.
- Biggest unknown-unknown: you can't read the backend repo, and the shape of what exists is assumption, not fact.
- If you also port the engine to Python, you're rewriting working, tested, pure code — new bug surface for zero user benefit.
- Frontend services need a coordinated swap; `LeagueHistoryService` talks to both Sleeper *and* Supabase directly and will be fiddly.

**Best if**: The backend already has a Sleeper client and player-dump handling (verify this first), *and* you're committed to killing the TS/Swift duplication.

**v1 cut line**
- In: Supabase JWT authorizer; cached Sleeper proxy for league/users/rosters/players/transactions; values endpoint keyed by settings fingerprint; follow table replacing `whitelisted_leagues`; frontend repointed.
- Out: engine port to Python (do it in a later phase, or never); ESPN; pending-trade ingestion; notifications beyond what already runs for CLT.

---

## Option B: Values-engine-first vertical slice

**What**: Refactor the singleton `PlayerValuesService` into a per-league `ValueBook` resolved from a league-settings fingerprint, still fetched client-side, and prove the whole analysis engine works on arbitrary leagues through the Search surface that already exists.

**How it works**: `PlayerValuesService` currently holds one global `Map<playerId, value>` and every consumer calls `value(pid)` with no league context. Replace it with a factory that takes a `LeagueModel`, reads `roster_positions`, `scoring_settings`, `total_rosters`, and `settings.type` (dynasty vs redraft), builds a fingerprint, fetches the matching FantasyCalc endpoint, and returns a scoped `ValueBook`. Inject the `ValueBook` into `TeamAnalysisService.build()` and `RecommendedTradeService` instead of the singleton — both are already pure, so this is a parameter change, not a rewrite. Add a coverage metric so the K/DEF/IDP zero-value problem becomes visible. Wire it to `selected-league` / `selected-team`, which already render arbitrary leagues.

**Pros**
- Cheapest possible test of the core product thesis. If settings-derived values don't produce believable analysis for a random redraft PPR league, you learn that in days, not months.
- Touches the one thing the brief correctly identifies as the biggest architectural change, with none of the backend risk.
- Uses assets that already exist: pure engine, `mode: 'selected'` components, Search surface, FantasyCalc's own parameterization.
- Makes the coverage gap visible before you build anything on top of it.
- Directly reusable in Option A — the fingerprint logic moves server-side unchanged.

**Cons / Risks**
- Does nothing about the static bearer token, so you still can't open the app to the public at the end of it.
- Client-side fan-out gets worse, not better. A user with 12 leagues triggers 12 fingerprint fetches plus a 5MB player dump.
- Risks being a dead end if FantasyCalc rate-limits or blocks browser origins under real traffic (unofficial API, no SLA, no stated ToS).
- Feels like backsliding — you're doing frontend work on a project you just reframed as a backend build.

**Best if**: You want to de-risk the product thesis before committing months of backend work, and you accept that "public launch" is explicitly not in scope for this phase.

**v1 cut line**
- In: `ValueBook` refactor; fingerprint from league settings → FantasyCalc params; per-fingerprint in-memory cache; coverage metric in UI; team-analyzer + trade evaluator working on any league via Search; unsupported-league-type gate (IDP, best-ball).
- Out: any backend change; auth change; whitelist removal; ESPN; pending trades; draft board presets.

---

## Option C: Fork the product

**What**: Freeze `xomper-front-end` as the CLT league app; build the public platform as a separate app sharing the analysis engine as an extracted package.

**How it works**: Extract `team-analysis`, `recommended-trade`, `player-values`, and the models into a shared TS package. CLT keeps its rulebook, payouts, world-cup, rule-proposals, taxi, and matchup-history surfaces untouched. The platform app is greenfield, multi-league from line one, with no whitelist to unwind.

**Pros**
- No refactor risk to a working app your league actually uses.
- Platform gets clean architecture with no single-league legacy.
- Clear boundary for what's CLT-specific vs general.

**Cons / Risks**
- **You now maintain three clients** (CLT web, platform web, iOS) with one developer. The brief already flags iOS as a parallel burden; this makes it worse, not better.
- The CLT-specific surfaces are a smaller share of the app than it feels like — the genuinely bespoke pages are rules/*, world-cup, and payouts. Everything else is already league-parameterized.
- Duplicated shell, nav, theme, auth, and deploy pipeline forever.
- Contradicts the web-ios-parity work you just finished, which deliberately built the hybrid single-shell-plus-search model.

**Best if**: The CLT surfaces turn out to be far more entangled than they look and unwinding them is riskier than duplicating the shell. **I don't think that's the case** — naming this option mostly to rule it out.

**v1 cut line**: N/A — not recommended.

---

## Phase 3 — Recommendation

**Do Option B, then Option A. Do not do Option C. Do not migrate auth.**

**Why B first:** the entire product thesis rests on one unproven claim — that settings-derived values produce *believable* analysis for leagues that aren't CLT. Option B tests that claim in days using code that already exists, because the engine is already pure and the multi-league components are already built. If the answer is "the hexagon chart looks wrong for a 10-team half-PPR redraft league," you want to know that before you've built a caching tier to serve it faster.

**Why A second and not never:** two things make it mandatory, not optional. The static bearer token in the JS bundle is a hard blocker on ever going public. And browser-direct fan-out — a 5MB player dump plus N league fetches plus N fingerprint fetches per session — is not a scaling concern you can defer past the first real user with 12 leagues.

**What this depends on:** verify the backend already has a Sleeper client (it must, for AI review to work). If it does, Option A is a refactor and the sequence is comfortable. If it doesn't, Option A is greenfield and you should stretch Option B further — possibly all the way to a usable read-only product for a small invite group — before starting it.

**On Q2 (auth) — stay on Supabase. The Cognito question is malformed.**

Supabase here is not an auth provider, it's your **database**. `profiles`, `whitelisted_users`, `rule_proposals`, and league-history tables all live in Postgres, queried directly from the browser via the Supabase client. Cognito replaces only the auth sliver and leaves you running Supabase anyway — strictly additive complexity.

The "native authorizer" argument also doesn't hold, because **there is no per-user backend authorizer today to preserve or rewrite.** The backend uses a shared static token. You're building an authorizer from scratch either way. Supabase issues standard JWTs with a JWKS endpoint; a Lambda authorizer validating them is a small, well-understood piece of code. Cognito saves you that and costs you a user migration, a social-login rebuild, a rewrite of `SupabaseService`, and either a second datastore or a full table migration to DynamoDB.

**Cost of migrating anyway, stated plainly:** rebuild sign-in/sign-up/Google OAuth, migrate existing user rows, rework both guards, rewrite every direct-Supabase table query into API calls (because Cognito gives you no data layer), and re-point `profiles.sleeper_user_id`. Weeks of work, zero user-visible benefit. Don't.

**On Q3 (whitelist / admin):**
- Keep `whitelisted_users`, drop its gate semantics, retain it for roles. One-line change in `auth.guard.ts`; `isAdmin` keeps working.
- Invert `whitelisted_leagues` into a user-driven follow table. It becomes the cron work list *and* the cost control.
- Keep the admin panel whole. Tables, audit, cron, email-archive, announcements all get more valuable multi-tenant.
- Keep CLT as a featured league. Put its bespoke surfaces (rules/*, world-cup, payouts) behind per-league opt-in flags rather than deleting or forking them — `rules.service.ts` is already keyed on `league_id`, so the data model already supports it.

---

## Assumptions

Stated so they can be checked, not assumed true.

| # | Assumption | Confidence | Impact if wrong |
|---|---|---|---|
| A1 | Backend already has a Sleeper client + player-dump handling (required for AI review) | High | Option A shifts from refactor to greenfield; stretch Option B further |
| A2 | Backend is DynamoDB-per-concern with no relational joins | Medium | Affects follow-table design |
| A3 | FantasyCalc tolerates browser-origin traffic at low volume | Medium | Option B dead-ends; forces server-side proxy sooner |
| A4 | ~30-50 realistic settings fingerprints, not thousands | Medium-High | Cache strategy changes; may need real derivation in v1 |
| A5 | `whitelisted_leagues` is what the cron iterates | Medium | Follow-table inversion doesn't bound cost as cleanly |
| A6 | Sleeper league settings expose enough to build a fingerprint (`roster_positions`, `scoring_settings`, `total_rosters`, `settings.type`) | High | Fingerprint needs user input, hurting UX |
| A7 | Static `apiAuthToken` is the only backend auth | High | Changes the Q2 conclusion |

## Open questions

1. **Pending trade offers spike — do this first, it's an hour.** In the live CLT league, create a real trade offer and poll `/league/{id}/transactions/{week}` as both a participant and a non-participant. Look for `type: 'trade'` with `status: 'pending'`. `LeagueService.getLeagueTransactions()` already exists, so this is a console call, not a build. Strong prior that it returns nothing — a public API leaking private negotiations would be a design flaw — but it's cheap and it determines whether the flagship trade feature is automatic or manual. **Manual entry ships regardless.**
2. Does the backend already fetch and cache `/players/nfl`? If yes, the crosswalk and caching tier are half-built.
3. Does FantasyCalc have a published ToS or rate limit? Currently unknown and depended upon.
4. What exactly does the cron iterate — `whitelisted_leagues`, or a hardcoded league ID?
5. Does DynastyProcess's coverage extend to K/DEF? If not, no free source solves the coverage gap and redraft support needs a different plan.
6. Should the analysis engine move server-side in Option A, or stay in TS and get consumed by iOS via an API wrapping a Node Lambda?

## Risks

**Data source fragility (high)**
- FantasyCalc is unofficial, free, no SLA. It is a single point of failure for the entire product.
- Mitigation: snapshot values to storage weekly so you degrade to stale-but-present, not broken. Add DynastyProcess as a second source. Never let the UI render an analysis without a coverage indicator.

**Silent zero-value corruption (high, currently invisible)**
- `value() → 0` plus `if (value <= 0) continue` means unvalued players vanish from analysis with no error. Multi-league this hits K, DEF, IDP, and deep benches.
- Mitigation: coverage metric in the UI, hard gate on unsupported league types, and a distinction between "worth zero" and "unknown."

**Cost and scale on whitelist removal (medium-high)**
- `/players/nfl` per browser session is ~5MB. N leagues per user × M users of uncached Sleeper fan-out.
- Mitigation: follow-table-bounded cron; server-side cache with a slim player projection; the fingerprint cache is shared across all users, which is where the leverage is.

**Static bearer token (high, blocking)**
- Anyone can extract `apiAuthToken` from the bundle and call `/admin/*` — including `users-update`, `leagues-update`, and the email triggers. Acceptable while the app is effectively private; **not acceptable the moment it's public.** This gates public launch independent of which option you pick.

**iOS parallel burden (medium, compounding)**
- Every service is annotated as a Swift port. The `ValueBook` refactor has a `PlayerValuesStore.swift` twin; the engine changes have `TeamAnalysisBuilder` and `TradeEvaluator` twins.
- Mitigation: the pure-function shape makes the port mechanical. Long term, moving the engine behind an API is the only permanent fix — factor that into the Option A decision rather than treating it as unrelated.

**Scope creep from the CLT surfaces (medium)**
- rules/*, world-cup, payouts, matchup-history, taxi-squad have no meaning for a random league. Deleting them costs league goodwill; keeping them unconditionally makes the platform look broken.
- Mitigation: per-league opt-in flags; `rules.service.ts` is already keyed on `league_id`.

**ESPN (deferred, named so it stays deferred)**
- Cookie-paste UX, silent expiry, encrypting a live third-party session credential at rest. Not in v1. The `/players/nfl` dump already carries `espn_id` so the crosswalk is free whenever you do return to it — that's the only ESPN work worth doing now, and it's already done.

---

## Suggested sequencing

1. **Spike (1 day)** — pending-trade behavior in the live CLT league; confirm backend has a Sleeper client; check DynastyProcess K/DEF coverage.
2. **Option B (weeks)** — `ValueBook` refactor, settings fingerprint, coverage metric, engine proven on arbitrary leagues via Search.
3. **Decide** — does derived analysis look believable for non-dynasty leagues? If no, the product needs rethinking before any backend spend.
4. **Option A (months)** — Supabase JWT authorizer (kills the token hole), cached Sleeper proxy, server-side values cache, follow-table inversion, whitelist gate removal.
5. **Then** — social/follow notifications on the existing cron+email backbone, draft board presets, manual trade entry surfaced as a first-class feature.
6. **Later / maybe never** — engine port for iOS parity, ESPN.
