import { NgModule } from '@angular/core'
import { Routes, RouterModule } from '@angular/router'

import { HomeComponent } from './pages/home/home.component'
import { LoginComponent } from './pages/login/login.component'
import { SearchComponent } from './pages/search/search.component'
import { LeagueComponent } from './pages/league/league.component'
import { MyProfileComponent } from './pages/my-profile/my-profile.component'
import { ProfileComponent } from './pages/profile/profile.component'
import { AuthGuard } from './guards/auth.guard'
import { AdminGuard } from './guards/admin.guard'
import { MyTeamComponent } from './pages/my-team/my-team.component'
import { SelectedTeamComponent } from './pages/selected-team/selected-team.component'
import { DraftHistoryComponent } from './pages/draft-history/draft-history.component'
import { SettingsComponent } from './pages/settings/settings.component'

import { LinkSleeperComponent } from './pages/link-sleeper/link-sleeper.component'

export const routes: Routes = [
  // Public landing. This used to redirect straight to /home, which is
  // auth-gated, so every unauthenticated visitor hit a bare login form.
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/welcome/welcome.component').then((m) => m.WelcomeComponent),
  },

  // Login — public, no guard. Authed users visiting /login get redirected
  // to /home inside LoginComponent.ngOnInit.
  { path: 'login', component: LoginComponent },

  // Cognito hosted redirect lands here after Google sign-in. Deliberately
  // NOT guarded: AuthGuard would run before Amplify finishes exchanging the
  // code, redirect to /login, and strip the `?code=` so it can never be
  // redeemed.
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./pages/auth-callback/auth-callback.component').then(
        (m) => m.AuthCallbackComponent,
      ),
  },

  // Landing hub — auth-gated. AuthGuard redirects unauthed → /login.
  { path: 'home', component: HomeComponent, canActivate: [AuthGuard] },

  { path: 'search', component: SearchComponent },

  // Guest accessible (view others)
  { path: 'selected-profile', component: ProfileComponent },
  { path: 'selected-league', component: LeagueComponent, data: { mode: 'selected' } },
  { path: 'selected-team', component: SelectedTeamComponent },

  // League with nested child routes (s3).
  //
  // `mode: 'my'` matters: LeagueComponent defaults to 'selected', which reads
  // a `?leagueId=` query param. The sidebar links here without one, so every
  // page under /league searched for league `undefined`, 404'd, and sat on
  // "Loading..." forever. Broken since the s3 split (c3ef084).
  {
    path: 'league',
    component: LeagueComponent,
    canActivate: [AuthGuard],
    data: { mode: 'my' },
    children: [
      { path: '', redirectTo: 'standings', pathMatch: 'full' },
      {
        path: 'standings',
        loadComponent: () =>
          import('./pages/league/standings/standings.component').then(
            (m) => m.StandingsComponent,
          ),
      },
      {
        path: 'matchups',
        loadComponent: () =>
          import('./pages/league/matchups/matchups.component').then(
            (m) => m.MatchupsComponent,
          ),
      },
      {
        path: 'playoffs',
        loadComponent: () =>
          import('./pages/league/playoffs/playoffs.component').then(
            (m) => m.PlayoffsComponent,
          ),
      },
      {
        path: 'draft-order',
        loadComponent: () =>
          import('./pages/league/draft-order/draft-order.component').then(
            (m) => m.DraftOrderComponent,
          ),
      },
    ],
  },

  // Other authenticated flat routes
  { path: 'team', component: MyTeamComponent, canActivate: [AuthGuard] },
  { path: 'profile', component: MyProfileComponent, canActivate: [AuthGuard] },
  { path: 'settings', component: SettingsComponent, canActivate: [AuthGuard] },

  // AI Review hub (s6)
  {
    path: 'ai-review',
    loadComponent: () =>
      import('./pages/ai-review/list/ai-review-list.component').then(
        (m) => m.AiReviewListComponent,
      ),
    canActivate: [AuthGuard],
  },
  {
    path: 'ai-review/:id',
    loadComponent: () =>
      import('./pages/ai-review/detail/ai-review-detail.component').then(
        (m) => m.AiReviewDetailComponent,
      ),
    canActivate: [AuthGuard],
  },
  // Admin portal (s7a — shell + AI Review + Test Email + Email Archive)
  {
    path: 'admin',
    loadComponent: () =>
      import('./pages/admin/admin.component').then((m) => m.AdminComponent),
    canActivate: [AuthGuard, AdminGuard],
    children: [
      {
        path: 'ai-review',
        loadComponent: () =>
          import('./pages/admin/ai-review/admin-ai-review.component').then(
            (m) => m.AdminAiReviewComponent,
          ),
      },
      {
        path: 'ai-review/preview/:type',
        loadComponent: () =>
          import('./pages/admin/ai-review/preview/admin-ai-review-preview.component').then(
            (m) => m.AdminAiReviewPreviewComponent,
          ),
      },
      {
        path: 'test-email',
        loadComponent: () =>
          import('./pages/admin/test-email/admin-test-email.component').then(
            (m) => m.AdminTestEmailComponent,
          ),
      },
      {
        path: 'email-archive',
        loadComponent: () =>
          import('./pages/admin/email-archive/list/admin-email-archive-list.component').then(
            (m) => m.AdminEmailArchiveListComponent,
          ),
      },
      {
        path: 'email-archive/:id',
        loadComponent: () =>
          import('./pages/admin/email-archive/detail/admin-email-archive-detail.component').then(
            (m) => m.AdminEmailArchiveDetailComponent,
          ),
      },
      // PR 7b — Announcements
      {
        path: 'sleeper-claims',
        loadComponent: () =>
          import('./pages/admin/sleeper-claims/admin-sleeper-claims.component').then(
            (m) => m.AdminSleeperClaimsComponent,
          ),
      },
      {
        path: 'announcements',
        loadComponent: () =>
          import('./pages/admin/announcements/list/admin-announcements-list.component').then(
            (m) => m.AdminAnnouncementsListComponent,
          ),
      },
      {
        path: 'announcements/new',
        loadComponent: () =>
          import('./pages/admin/announcements/edit/admin-announcement-edit.component').then(
            (m) => m.AdminAnnouncementEditComponent,
          ),
      },
      {
        path: 'announcements/:id',
        loadComponent: () =>
          import('./pages/admin/announcements/edit/admin-announcement-edit.component').then(
            (m) => m.AdminAnnouncementEditComponent,
          ),
      },
      // PR 7b — Tables
      {
        path: 'tables',
        loadComponent: () =>
          import('./pages/admin/tables/admin-tables-menu.component').then(
            (m) => m.AdminTablesMenuComponent,
          ),
      },
      {
        path: 'tables/users',
        loadComponent: () =>
          import('./pages/admin/tables/users/list/admin-tables-users.component').then(
            (m) => m.AdminTablesUsersComponent,
          ),
      },
      {
        path: 'tables/users/:id',
        loadComponent: () =>
          import('./pages/admin/tables/users/edit/admin-user-edit.component').then(
            (m) => m.AdminUserEditComponent,
          ),
      },
      {
        path: 'tables/leagues',
        loadComponent: () =>
          import('./pages/admin/tables/leagues/list/admin-tables-leagues.component').then(
            (m) => m.AdminTablesLeaguesComponent,
          ),
      },
      {
        path: 'tables/leagues/:id',
        loadComponent: () =>
          import('./pages/admin/tables/leagues/edit/admin-league-edit.component').then(
            (m) => m.AdminLeagueEditComponent,
          ),
      },
      // PR 7b — Audit
      {
        path: 'audit',
        loadComponent: () =>
          import('./pages/admin/audit/feed/admin-audit-feed.component').then(
            (m) => m.AdminAuditFeedComponent,
          ),
      },
      {
        path: 'audit/:id',
        loadComponent: () =>
          import('./pages/admin/audit/detail/admin-audit-detail.component').then(
            (m) => m.AdminAuditDetailComponent,
          ),
      },
      // PR 7b — Cron Settings
      {
        path: 'cron-settings',
        loadComponent: () =>
          import('./pages/admin/cron-settings/admin-cron-settings.component').then(
            (m) => m.AdminCronSettingsComponent,
          ),
      },
      // PR 7b — Logs placeholder
      {
        path: 'logs',
        loadComponent: () =>
          import('./pages/admin/logs/admin-logs.component').then(
            (m) => m.AdminLogsComponent,
          ),
      },
    ],
  },
  // s8b: Team Analyzer — replaced placeholder redirect with real component
  // Bare path analyzes the active league; :leagueId analyzes any league.
  {
    path: 'team-analyzer',
    loadComponent: () =>
      import('./pages/team-analyzer/team-analyzer.component').then(
        (m) => m.TeamAnalyzerComponent,
      ),
    canActivate: [AuthGuard],
  },
  {
    path: 'team-analyzer/:leagueId',
    loadComponent: () =>
      import('./pages/team-analyzer/team-analyzer.component').then(
        (m) => m.TeamAnalyzerComponent,
      ),
    canActivate: [AuthGuard],
  },

  // Trade analyzer — grades a proposed trade against the active league's own
  // value book, so the same trade scores differently in a dynasty league than
  // in a redraft one.
  {
    path: 'trades',
    loadComponent: () =>
      import('./pages/trade-analyzer/trade-analyzer.component').then(
        (m) => m.TradeAnalyzerComponent,
      ),
    canActivate: [AuthGuard],
  },

  // 302 redirects for my-* → flat routes (remove ~14 days post-s5 default flip)
  { path: 'my-profile', redirectTo: 'profile', pathMatch: 'full' },
  { path: 'my-league', redirectTo: 'league', pathMatch: 'full' },
  { path: 'my-team', redirectTo: 'team', pathMatch: 'full' },

  // Authenticated — taxi squad and other non-redirected MY routes

  // Account setup (authenticated)
  { path: 'link-sleeper', component: LinkSleeperComponent, canActivate: [AuthGuard] },

  // Draft History (authenticated) — s4: per-year shell with nested sub-tab routes
  // URL scheme: /draft-history/:year/{live|picks|recap|mocks}
  // DraftHistoryComponent is the shell (year chips + sub-tab bar + router-outlet).
  // Root /draft-history has no children — DraftHistoryComponent.ngOnInit redirects to
  // /draft-history/:currentSeason/live (or picks for past seasons).
  { path: 'draft-history', component: DraftHistoryComponent, canActivate: [AuthGuard] },

  // Top-level entry point for the live draft, which was previously reachable
  // only by opening Draft History and finding the tab. DraftHistoryComponent
  // resolves the current season and lands on its live sub-tab, so this
  // redirect ends up at /draft-history/:season/live -- an honest URL, at the
  // cost of routerLinkActive tracking the resolved path rather than this one.
  { path: 'live-draft', redirectTo: 'draft-history', pathMatch: 'full' },
  {
    path: 'draft-history/:year',
    component: DraftHistoryComponent,
    canActivate: [AuthGuard],
    children: [
      {
        path: 'live',
        loadComponent: () =>
          import('./pages/draft-history/live/draft-live.component').then(
            (m) => m.DraftLiveComponent,
          ),
      },
      {
        path: 'picks',
        loadComponent: () =>
          import('./pages/draft-history/picks/draft-picks.component').then(
            (m) => m.DraftPicksComponent,
          ),
      },
      {
        path: 'recap',
        loadComponent: () =>
          import('./pages/draft-history/recap/draft-recap.component').then(
            (m) => m.DraftRecapComponent,
          ),
      },
      {
        path: 'mocks',
        loadComponent: () =>
          import('./pages/draft-history/mocks/draft-mocks.component').then(
            (m) => m.DraftMocksComponent,
          ),
      },
      // Default sub-tab: DraftHistoryComponent.ngOnInit redirects per isCurrentSeason
      { path: '', redirectTo: 'live', pathMatch: 'full' },
    ],
  },

  // Catch-all
  { path: '**', redirectTo: '/home' },
]

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
