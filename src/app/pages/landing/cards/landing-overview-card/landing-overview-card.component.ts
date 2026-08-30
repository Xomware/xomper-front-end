import { Component, OnInit } from '@angular/core'
import { NgFor, NgIf } from '@angular/common'
import { Router } from '@angular/router'
import { take } from 'rxjs/operators'
import {
  FollowedLeague,
  LeagueFollowsService,
} from 'src/app/services/league-follows.service'
import { LeagueService } from 'src/app/services/league.service'
import { UserProfileService } from 'src/app/services/user-profile.service'

interface QuickAction {
  label: string
  hint: string
  route: string
  svg: string
}

/**
 * The league-agnostic top of the home page.
 *
 * Everything else on this page is scoped to one league — the AI headline,
 * announcements, standings, this week's matchups. That made the landing page
 * a view of whichever league happened to be selected, with no way to see the
 * others or to reach the tools that work across all of them.
 *
 * This is the part that does not care which league is active: every league
 * you follow, and the jump-off points into the app.
 */
@Component({
  selector: 'app-landing-overview-card',
  standalone: true,
  imports: [NgFor, NgIf],
  templateUrl: './landing-overview-card.component.html',
  styleUrls: ['./landing-overview-card.component.scss'],
})
export class LandingOverviewCardComponent implements OnInit {
  leagues: FollowedLeague[] = []

  /** False until the league list has actually been fetched. */
  resolved = false

  /**
   * Where someone with no leagues can actually go.
   *
   * Every action below is league-scoped and dead-ends on "No league
   * selected", so offering them to a user with nothing is four doors that do
   * not open. These two are the only real moves: look around, or link the
   * Sleeper account that has their leagues on it.
   */
  readonly emptyActions: QuickAction[] = [
    {
      label: 'Search',
      hint: 'Find a league or a player',
      route: '/search',
      svg: 'M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z',
    },
    {
      label: 'Sleeper account',
      hint: 'Link a different one',
      route: '/settings',
      svg: 'M10.325 4.317a1.724 1.724 0 013.35 0 1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
    },
  ]

  readonly actions: QuickAction[] = [
    {
      label: 'Team Analyzer',
      hint: 'Roster strength by position',
      route: '/team-analyzer',
      svg: 'M3 3v18h18M7 15l4-4 3 3 5-6',
    },
    {
      label: 'Trades',
      hint: 'Grade a deal before you send it',
      route: '/trades',
      svg: 'M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5',
    },
    {
      label: 'Live Draft',
      hint: 'Board plus who to take next',
      route: '/live-draft',
      svg: 'M8.464 15.536a5 5 0 010-7.072m7.072 0a5 5 0 010 7.072M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728',
    },
    {
      label: 'Standings',
      hint: 'Where everyone sits',
      route: '/league/standings',
      svg: 'M3 21h18M6 21V9m6 12V4m6 17v-8',
    },
  ]

  constructor(
    private follows: LeagueFollowsService,
    private leagueService: LeagueService,
    private profiles: UserProfileService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    // AuthGuard loads the list on every protected navigation, so this is
    // usually already populated; the fetch is the cold-nav fallback.
    this.leagues = this.follows.followed
    if (this.leagues.length) {
      this.resolved = true
      return
    }
    this.follows.load().pipe(take(1)).subscribe({
      next: (leagues) => {
        this.leagues = leagues.filter((l) => l.isFollowed)
        this.resolved = true
      },
      // An empty state is the honest answer either way -- what it must not do
      // is claim "no leagues" while the request is still in flight.
      error: () => (this.resolved = true),
    })
  }

  /** The handle whose leagues we looked for, to say so by name. */
  get sleeperUsername(): string {
    return this.profiles.getProfile()?.sleeperUsername ?? ''
  }

  get selectedLeagueId(): string | null {
    return this.follows.selectedLeagueId
  }

  /**
   * Switch to a league and open it.
   *
   * Everything LeagueService caches is scoped to one league, so it all has to
   * go or the new league renders with the old one's rosters and standings.
   */
  open(league: FollowedLeague): void {
    if (league.leagueId !== this.follows.selectedLeagueId) {
      this.follows.select(league.leagueId)
      this.leagueService.clearForLeagueSwitch()
    }
    this.router.navigate(['/league/standings'])
  }

  go(action: QuickAction): void {
    this.router.navigate([action.route])
  }

  statusLabel(league: FollowedLeague): string {
    switch (league.status) {
      case 'in_season':
        return 'In season'
      case 'drafting':
        return 'Drafting'
      case 'pre_draft':
        return 'Pre-draft'
      case 'complete':
        return 'Complete'
      default:
        return league.status || ''
    }
  }
}
