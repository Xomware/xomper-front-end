# Plan: Web ↔ iOS Parity — s1 Shell + Nav Rewrite

**Status**: Ready
**Created**: 2026-06-04
**Last updated**: 2026-06-04 (open questions resolved, status → Ready)
**Epic**: [`../PLAN.md`](../PLAN.md)
**Brainstorm**: [`../BRAINSTORM.md`](../BRAINSTORM.md)
**Predecessor (skeleton)**: this doc replaces the orchestrate-generated stub.

---

## TL;DR

Replace `ToolbarComponent` with a new shell — desktop `SidebarComponent`, mobile hamburger-triggered `MobileDrawerComponent` — whose entries mirror iOS `TrayDestination` (Play / Team / League / Admin + pinned Settings + profile chip). Flatten `my-*` routes to `/league`, `/team`, `/profile`, ship a `/settings` placeholder, land CSS custom-property tokens, and gate everything behind `?newShell=1` via a structural directive so the legacy toolbar remains the prod default through s5.

---

## Scope

### In scope
- New `SidebarComponent` (desktop, persistent rail) with full iOS `TrayDestination` IA.
- New `MobileDrawerComponent` (mobile, hamburger-triggered overlay drawer + scrim).
- New `ShellLayoutComponent` wrapping sidebar/drawer + `<router-outlet>` + footer.
- CSS custom-property token declarations in `styles.scss` (`--xomper-bg-dark`, `--xomper-champion-gold`, `--xomper-accent-red`, `--xomper-text-primary`).
- Route flattening: `/my-league` → `/league`, `/my-team` → `/team`, `/my-profile` → `/profile` with 302 redirects for one release.
- `/settings` placeholder route + component ("Settings coming soon" + sticky sidebar footer entry).
- `FeatureFlagsService` parsing `?newShell=1` (sticky for the session).
- `*xomperNewShell` structural directive that swaps legacy vs new chrome.
- Profile chip on sidebar footer reusing existing `SupabaseService` profile.

### Out of scope
- Any feature port (Landing/AI Review/Admin/Team Analyzer/Draft Order) — later stubs.
- Component-level Midnight Emerald styling — s10.
- `selected-*` route restructuring — s2 owns Search.
- `LeagueComponent` `activeTab` split — s3 owns this.
- Draft sub-tabs — s4 owns.
- `provideRouter` migration — flagged as a sub-step inside this plan but explicitly time-boxed.
- Bundle budget tuning beyond "do not regress".

---

## Decisions taken in this plan

### 1. Mobile chrome — hamburger-triggered overlay drawer
**Chosen**: tap a top-left hamburger button to slide a 280–320 px panel from the left, dimmed scrim behind, tap-scrim-to-close. Hand-rolled (no Material dep) using a CDK `BreakpointObserver` (already a peer dep) to flip rail vs drawer at the `768 px` breakpoint that `ToolbarComponent` already uses.
**Case against**: less native-feeling on iOS Safari (no edge swipe). Acceptable — mobile-web users universally expect the hamburger pattern, and iOS users open the native app for the native feel. Reduces gesture-conflict risk against scroll containers and Safari's own edge-back swipe.

### 2. `?newShell=1` plumbing — feature flag service + structural directive
**Chosen**: `FeatureFlagsService` reads `?newShell=1` once at bootstrap (also honors `localStorage.xomperNewShell === '1'` so the flag survives in-app navigation). A `*xomperNewShell` structural directive renders the new `<app-shell-layout>` when true and the legacy `<app-toolbar> + <router-outlet>` otherwise. `app.component.html` hosts both branches behind the directive.
**Case against**: extra abstraction for a temporary flag — three files (service, directive, host template change) to delete in s5. Worth it: gates the entire feature surface area in one place, no per-component flag checks, easy global default flip later (one line in the service).

### 3. `my-*` redirects — hard-redirect for 14 days
**Chosen**: register `redirectTo` route entries (`/my-league` → `/league`, etc.) and leave them in place for one release cycle (~14 days post-s5 default flip). Then delete in a follow-up cleanup PR.
**Case against**: routing-config noise + a cleanup task on a calendar. Worth it: any bookmarked or externally linked `/my-*` URL keeps working through the cutover. 14 days is enough for analytics to show traffic drop-off.

---

## Phase 0 pre-work

- [ ] Open GitHub issue: "web-ios-parity s1: shell + nav rewrite". Apply `epic:web-ios-parity` label. Capture issue number `<N>`.
- [ ] Branch name: `feature/<N>-shell-nav-rewrite` off `master`.
- [ ] Confirm zero in-flight PRs touching `ToolbarComponent`, `AppRoutingModule`, `LeagueComponent`, `SearchComponent` (`gh pr list --search "toolbar OR app-routing OR LeagueComponent"`).
- [ ] Confirm D-B standalone migration (PR #76) is on `master` — current `app.component.ts` already uses `standalone: true`, so this is verification not work.

---

## Affected files / components

| File / Component | Change | Why |
|---|---|---|
| `src/styles.scss` | EDIT — add `:root { --xomper-bg-dark: ...; --xomper-champion-gold: ...; --xomper-accent-red: ...; --xomper-text-primary: ...; }` | Token foundation; consumed by future stubs |
| `src/app/services/feature-flags.service.ts` | NEW | `?newShell=1` parser; reads URL + `localStorage`, exposes `newShellEnabled: boolean` |
| `src/app/directives/xomper-new-shell.directive.ts` | NEW (standalone) | Structural directive `*xomperNewShell="true"` / `="false"`; injects `FeatureFlagsService` |
| `src/app/components/shell-layout/shell-layout.component.{ts,html,scss}` | NEW (standalone) | Hosts sidebar (or drawer) + `<router-outlet>` + footer; chooses chrome via `BreakpointObserver` |
| `src/app/components/sidebar/sidebar.component.{ts,html,scss}` | NEW (standalone) | Desktop persistent rail; profile chip top, scrollable section list, sticky Settings footer |
| `src/app/components/mobile-drawer/mobile-drawer.component.{ts,html,scss}` | NEW (standalone) | Mobile overlay drawer with scrim + hamburger trigger button (button lives in `shell-layout`) |
| `src/app/pages/settings/settings.component.{ts,html,scss}` | NEW (standalone) | `/settings` placeholder route — "Settings coming soon" centered card |
| `src/app/app.component.{ts,html}` | EDIT | Add directive import; template renders legacy chrome by default and `<app-shell-layout>` behind `*xomperNewShell` |
| `src/app/app-routing.module.ts` | EDIT | Add `/league`, `/team`, `/profile` flat routes pointing at the same components `my-*` use; add `/settings`; add 302 redirects from `/my-*`; keep `selected-*` |
| `src/app/components/toolbar/toolbar.component.{ts,html,scss}` | KEEP (untouched) | Legacy default through s5; deleted post-s5 default flip |

### Sidebar entry → route mapping (matches iOS `TrayDestination`)

| Section | iOS destination | Web route s1 points at | Notes |
|---|---|---|---|
| Play | `landing` (Home) | `/home` (existing) | s5 replaces target with `LandingComponent` |
| Play | `standings` | `/league` (existing — opens `LeagueComponent` standings tab) | s3 splits to `/league/standings` |
| Play | `matchups` | `/league?tab=matchups` | s3 splits to `/league/matchups` |
| Play | `playoffs` | `/league?tab=playoffs` | s3 splits |
| Play | `draftHistory` | `/draft-history` (existing) | s4 restructures |
| Play | `worldCup` | `/league?tab=worldcup` | s3 splits |
| Team | `myTeam` | `/team` (flat) | route flattening below |
| Team | `taxiSquad` | `/taxi-squad` (existing) | unchanged |
| Team | `teamAnalyzer` | `/team-analyzer` (route only — placeholder component falls back to `/team`) | s8 builds the component |
| League | `rulebook` | `/league?tab=rules` | s3 splits |
| League | `scoring` | `/league?tab=rules` (deeplink) | s3 splits |
| League | `leagueSettings` | `/league?tab=rules` (deeplink) | s3 splits |
| League | `payouts` | `/league?tab=rules` (deeplink) | s3 splits |
| League | `ruleProposals` | `/league?tab=rules` (deeplink) | s3 splits |
| League | `draftOrder` | `/league?tab=rules` (deeplink) | s9 builds the component |
| Admin (gated) | `aiReview` | `/ai-review` (placeholder route → redirects to `/home` with toast) | s6 builds |
| Admin (gated) | `admin` | `/admin` (placeholder route → redirects to `/home` with toast) | s7 builds |
| Footer (sticky) | `settings` | `/settings` | this stub |
| Profile chip | `profile` | `/profile` (flat) | this stub |

Sidebar must render entries even when their target is a placeholder — every iOS row is present so later stubs only swap the destination, not the chrome.

---

## Implementation steps

- [ ] **Step 1 — Phase 0.** Open issue, capture `<N>`, create branch `feature/<N>-shell-nav-rewrite`. Confirm no conflicting in-flight PRs.
- [ ] **Step 2 — CSS tokens.** Add `:root` custom-property declarations to `src/styles.scss` (just the four locked tokens, plus `--xomper-bg-card`, `--xomper-text-muted` for sidebar internals). No component styling changes; only token declarations.
- [ ] **Step 3 — `FeatureFlagsService`.** Create `src/app/services/feature-flags.service.ts`. On construction: read `window.location.search` for `newShell=1`; if present, write `localStorage.xomperNewShell = '1'`. Expose `get newShellEnabled(): boolean`. Provided in root.
- [ ] **Step 4 — `*xomperNewShell` directive.** Standalone structural directive in `src/app/directives/xomper-new-shell.directive.ts`. Accepts a boolean input; injects `FeatureFlagsService` and `TemplateRef` + `ViewContainerRef`. Renders the embedded view when `input === flag`. Allows both `*xomperNewShell="true"` (render when on) and `*xomperNewShell="false"` (render when off) so `app.component.html` can host both branches.
- [ ] **Step 5 — `ShellLayoutComponent` + children.** Build standalone `<app-shell-layout>` that:
  - Uses Angular CDK `BreakpointObserver` (`Breakpoints.HandsetPortrait` / `'(max-width: 768px)'`).
  - Renders `<app-sidebar>` desktop or `<app-mobile-drawer>` mobile.
  - Hosts `<router-outlet>` in the main column.
  - Keeps existing `<app-footer>` at the bottom.
  - Both chrome components receive `sections` config (Play / Team / League / Admin) as a `readonly` array; entries derived from a `SIDEBAR_ENTRIES` constant file `src/app/components/sidebar/sidebar.entries.ts` exporting the iOS `TrayDestination` order.
  - Profile chip in sidebar header pulls `displayName`, `email`, `avatarID` from `SupabaseService` (existing); avatar source matches iOS Sleeper-CDN pattern — flag as open question if Supabase profile lacks avatar URL.
  - Admin section visible only when `SupabaseService.isAdmin === true`.
- [ ] **Step 6 — `/settings` placeholder.** Standalone `SettingsComponent` rendering a centered card with "Settings coming soon" and a back link to `/home`.
- [ ] **Step 7 — `app-routing.module.ts`.** Add:
  - Flat routes: `{ path: 'league', component: MyLeagueComponent, canActivate: [AuthGuard] }`, same for `team`, `profile`.
  - 302 redirects: `{ path: 'my-league', redirectTo: 'league', pathMatch: 'full' }` (same for `my-team`, `my-profile`).
  - `{ path: 'settings', component: SettingsComponent, canActivate: [AuthGuard] }`.
  - `{ path: 'team-analyzer', redirectTo: 'team', pathMatch: 'full' }`, `{ path: 'ai-review', redirectTo: 'home' }`, `{ path: 'admin', redirectTo: 'home' }` (placeholders).
  - **Do not** alter `selected-*` routes.
  - Time-box `provideRouter` migration: skip unless reviewers demand it; the structural-directive gate doesn't require it.
- [ ] **Step 8 — Wire the gate.** Edit `app.component.html`:
  ```
  <ng-container *xomperNewShell="false">
    <app-toolbar></app-toolbar>
    <main><app-toast></app-toast><router-outlet></router-outlet></main>
    <app-footer></app-footer>
  </ng-container>
  <ng-container *xomperNewShell="true">
    <app-shell-layout></app-shell-layout>
  </ng-container>
  ```
  Update `imports:` array in `app.component.ts` to add `XomperNewShellDirective` and `ShellLayoutComponent`.
- [ ] **Step 9 — Build + manual smoke.** `npm run build` (verify no new bundle warnings beyond existing budget). `npm start`, then:
  1. Visit `/` — legacy toolbar renders.
  2. Visit `/?newShell=1` — new shell renders; sidebar shows Play/Team/League sections (+ Admin if logged in as admin).
  3. Click each sidebar entry — verify it routes to something (placeholder OK).
  4. Visit `/my-league` — verify 302 to `/league`.
  5. Resize to <768 px — sidebar collapses to hamburger; tap opens drawer, tap scrim closes.
  6. Visit `/settings` — placeholder renders.
- [ ] **Step 10 — Pre-PR.** Run `/ultrareview` (D-A). Flip plan `Status: Ready`. Commit using `#<N>` prefix. Open PR with body `Closes #<N>` and link to this plan + epic plan.

---

## Data flow

```
URL ?newShell=1
   │
   ▼
FeatureFlagsService (singleton)
   │ writes localStorage.xomperNewShell
   ▼
XomperNewShellDirective (in app.component.html)
   │
   ├── flag === false  →  <app-toolbar> + <router-outlet>  (legacy)
   └── flag === true   →  <app-shell-layout>
                              │
                              ▼
                          BreakpointObserver
                              │
                              ├── desktop → <app-sidebar>
                              └── mobile  → hamburger + <app-mobile-drawer>
                              │
                              ▼
                          SIDEBAR_ENTRIES (Play / Team / League / Admin)
                              │  Admin only if SupabaseService.isAdmin
                              ▼
                          <router-outlet> → routes from app-routing.module
```

---

## Risks

- **Bundle size.** Adding shell + tokens + directive should not regress the budget. The standalone-migration PR already triggered a warning; this stub must not make it worse. Mitigation: no third-party additions; CDK `BreakpointObserver` is already pulled in by other deps. Verify in step 9.
- **Routing conflict on `LeagueComponent`.** `LeagueComponent` is currently bound to `selected-league` and the `MyLeagueComponent` wraps the same data model for `my-league`. Adding a flat `/league` that maps to `MyLeagueComponent` keeps existing internal tab logic untouched. Verify by visiting `/league` and `/selected-league?id=<other>` side-by-side.
- **Gate removal complexity.** Post-s5 default flip will touch: `FeatureFlagsService` (default to `true`), `app.component.html` (collapse to single branch), `XomperNewShellDirective` (delete), `ToolbarComponent` (delete + scan importers). Enumerated here so s5's plan can pre-populate the checklist.
- **Standalone component `imports:` arrays.** `ToolbarComponent` is only imported by `AppComponent` (grep result). When the deletion happens (post-s5), only `app.component.ts`'s `imports:` array changes. No other standalone components reference `ToolbarComponent` today. Re-verify with `grep ToolbarComponent src` immediately before deletion.
- **Admin section visibility race.** `SupabaseService.isAdmin` may not be hydrated at first render. Mitigation: sidebar reads it reactively; if unavailable on first frame, render without Admin section, then update when the auth flow resolves.

---

## Decisions (locked 2026-06-04)

- [x] **Redirect window → 14 days**. Captures most user traffic cycles; analytics will show drop-off by then. Cleanup task added as a follow-up calendar item.
- [x] **Profile chip avatar source → resolve during impl**. If `SupabaseService.currentUser` already exposes Sleeper user ID, build the CDN URL inline. Otherwise add a thin `UserService.myAvatarUrl()` shim. Either path is < 10 LoC; not worth gating Ready on.

---

## Success criteria

1. Visiting `/?newShell=1` renders the new sidebar with Play / Team / League sections in iOS `TrayDestination` order.
2. Visiting `/` without the flag renders the legacy `ToolbarComponent` unchanged.
3. Every sidebar row resolves to a route (placeholders OK for s5-s9 destinations); no dead links.
4. `/my-league`, `/my-team`, `/my-profile` 302 to their flat equivalents.
5. `/settings` renders the placeholder; sticky-footer entry navigates to it.
6. Mobile breakpoint (<768 px) hides the rail and shows a hamburger that opens the slide-out drawer.
7. `npm run build` succeeds without new bundle-budget warnings; `/ultrareview` passes.

---

## Skills / Agents to use

- **angular-component-author**: scaffold standalone components (`SidebarComponent`, `MobileDrawerComponent`, `ShellLayoutComponent`, `SettingsComponent`) and the directive.
- **routing-surgeon**: edit `app-routing.module.ts` for flat routes + redirects + `selected-*` preservation.
- **/ultrareview**: pre-PR review per D-A.

---

## Next step

Flip to `Status: Ready`, then run `/execute s1-shell-nav-rewrite`.
