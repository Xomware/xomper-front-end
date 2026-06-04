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
import { TaxiSquadComponent } from './pages/taxi-squad/taxi-squad.component'
import { DraftHistoryComponent } from './pages/draft-history/draft-history.component'
import { MatchupHistoryComponent } from './pages/matchup-history/matchup-history.component'
import { SettingsComponent } from './pages/settings/settings.component'

import { LinkSleeperComponent } from './pages/link-sleeper/link-sleeper.component'

const routes: Routes = [
  // Public
  { path: '', redirectTo: '/home', pathMatch: 'full' },

  // Login — public, no guard. Authed users visiting /login get redirected
  // to /home inside LoginComponent.ngOnInit.
  { path: 'login', component: LoginComponent },

  // Landing hub — auth-gated. AuthGuard redirects unauthed → /login.
  { path: 'home', component: HomeComponent, canActivate: [AuthGuard] },

  { path: 'search', component: SearchComponent },

  // Guest accessible (view others)
  { path: 'selected-profile', component: ProfileComponent },
  { path: 'selected-league', component: LeagueComponent },
  { path: 'selected-team', component: SelectedTeamComponent },

  // League with nested child routes (s3)
  {
    path: 'league',
    component: LeagueComponent,
    canActivate: [AuthGuard],
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
        path: 'world-cup',
        loadComponent: () =>
          import('./pages/league/world-cup/world-cup.component').then(
            (m) => m.WorldCupComponent,
          ),
      },
      {
        path: 'rulebook',
        loadComponent: () =>
          import('./pages/league/rules/rulebook/rulebook.component').then(
            (m) => m.RulebookComponent,
          ),
      },
      {
        path: 'scoring',
        loadComponent: () =>
          import('./pages/league/rules/scoring/scoring.component').then(
            (m) => m.ScoringComponent,
          ),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./pages/league/rules/league-settings/league-settings.component').then(
            (m) => m.LeagueSettingsComponent,
          ),
      },
      {
        path: 'payouts',
        loadComponent: () =>
          import('./pages/league/rules/payouts/payouts.component').then(
            (m) => m.PayoutsComponent,
          ),
      },
      {
        path: 'rule-proposals',
        loadComponent: () =>
          import('./pages/league/rules/rule-proposals/rule-proposals.component').then(
            (m) => m.RuleProposalsComponent,
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
      // PR 7b routes (placeholders — components ship in 7b)
      // Registered now so the shell can navigate to them even before 7b merges.
      // They will 404-redirect gracefully via the catch-all.
    ],
  },
  { path: 'team-analyzer', redirectTo: 'team', pathMatch: 'full' },

  // 302 redirects for my-* → flat routes (remove ~14 days post-s5 default flip)
  { path: 'my-profile', redirectTo: 'profile', pathMatch: 'full' },
  { path: 'my-league', redirectTo: 'league', pathMatch: 'full' },
  { path: 'my-team', redirectTo: 'team', pathMatch: 'full' },

  // Authenticated — taxi squad and other non-redirected MY routes
  { path: 'taxi-squad', component: TaxiSquadComponent, canActivate: [AuthGuard] },

  // Account setup (authenticated)
  { path: 'link-sleeper', component: LinkSleeperComponent, canActivate: [AuthGuard] },

  // League History (authenticated)
  { path: 'draft-history', component: DraftHistoryComponent, canActivate: [AuthGuard] },
  { path: 'matchup-history', component: MatchupHistoryComponent, canActivate: [AuthGuard] },

  // Catch-all
  { path: '**', redirectTo: '/home' },
]

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
