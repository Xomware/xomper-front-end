import { Component, OnInit } from '@angular/core'
import { NgIf, NgFor } from '@angular/common'
import { Router } from '@angular/router'
import { LeagueService } from 'src/app/services/league.service'
import { UserService } from 'src/app/services/user.service'
import { StandingsTeamModel } from 'src/app/models/standings.model'
import { NflStateModel } from 'src/app/models/nfl-state.model'

/**
 * Horizontal standings chip scroller — mirrors iOS StandingsScrollBar.
 * Reads already-loaded data from LeagueService (populated at login time).
 * Shows offseason empty state when !isRegularSeason.
 * Chip for the current user gets a gold border accent.
 */
@Component({
  selector: 'app-landing-standings-scroll-card',
  standalone: true,
  imports: [NgIf, NgFor],
  templateUrl: './landing-standings-scroll-card.component.html',
  styleUrls: ['./landing-standings-scroll-card.component.scss'],
})
export class LandingStandingsScrollCardComponent implements OnInit {
  standings: StandingsTeamModel[] = []
  nflState: NflStateModel | null = null
  myUserId: string | null = null

  constructor(
    private leagueService: LeagueService,
    private userService: UserService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.nflState = this.leagueService.getNflState()
    this.myUserId = this.userService.getMyUser()?.getUserId() ?? null

    const league = this.leagueService.getMyLeague()
    if (league) {
      // Already sorted by StandingsService.buildStandings during login bootstrap
      this.standings = league.getStandingsTeams()
    }
  }

  get isRegularSeason(): boolean {
    return this.nflState?.isRegularSeason ?? false
  }

  isMine(team: StandingsTeamModel): boolean {
    return !!this.myUserId && team.user?.user_id === this.myUserId
  }

  goToStandings(team: StandingsTeamModel): void {
    this.router.navigate(['/league/standings'], {
      queryParams: { roster: team.roster.roster_id },
    })
  }
}
