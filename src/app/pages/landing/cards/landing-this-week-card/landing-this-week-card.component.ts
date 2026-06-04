import { Component, OnInit } from '@angular/core'
import { NgIf, NgFor } from '@angular/common'
import { LeagueService } from 'src/app/services/league.service'
import { UserService } from 'src/app/services/user.service'
import { NflStateModel } from 'src/app/models/nfl-state.model'
import { StandingsTeamModel } from 'src/app/models/standings.model'

interface PairedMatchup {
  matchupId: number
  teamAName: string
  teamAAvatar: string | null
  teamAPoints: number
  teamAIsMine: boolean
  teamBName: string
  teamBAvatar: string | null
  teamBPoints: number
  teamBIsMine: boolean
}

/**
 * This-week matchups card — mirrors iOS ThisWeekMatchupsCard.
 * Calls LeagueService.getLeagueMatchups(leagueId, week) in ngOnInit.
 * Skips network call during offseason (matches iOS guard).
 * My matchup sorts first.
 */
@Component({
  selector: 'app-landing-this-week-card',
  standalone: true,
  imports: [NgIf, NgFor],
  templateUrl: './landing-this-week-card.component.html',
  styleUrls: ['./landing-this-week-card.component.scss'],
})
export class LandingThisWeekCardComponent implements OnInit {
  pairs: PairedMatchup[] = []
  isLoading = false
  loadError = ''
  nflState: NflStateModel | null = null
  private standings: StandingsTeamModel[] = []
  private myUserId: string | null = null

  constructor(
    private leagueService: LeagueService,
    private userService: UserService,
  ) {}

  ngOnInit(): void {
    this.nflState = this.leagueService.getNflState()
    this.myUserId = this.userService.getMyUser()?.getUserId() ?? null

    const league = this.leagueService.getMyLeague()
    if (league) {
      this.standings = league.getStandingsTeams()
    }

    if (!this.isRegularSeason) return

    const leagueId = this.leagueService.getWhitelistedLeagueId()
    const week = this.nflState?.week ?? 1

    this.isLoading = true
    this.leagueService.getLeagueMatchups(leagueId, week).subscribe({
      next: (matchups) => {
        this.pairs = this.buildPairs(matchups)
        this.isLoading = false
      },
      error: (err) => {
        this.loadError = err?.message ?? 'Failed to load matchups'
        this.isLoading = false
      },
    })
  }

  get isRegularSeason(): boolean {
    return this.nflState?.isRegularSeason ?? false
  }

  get currentWeek(): number {
    return this.nflState?.week ?? 0
  }

  pointsLabel(points: number): string {
    if (points <= 0) return '—'
    return points.toFixed(2)
  }

  private buildPairs(
    matchups: { teamA: import('src/app/models/matchup.interface').Matchup; teamB: import('src/app/models/matchup.interface').Matchup }[],
  ): PairedMatchup[] {
    const rosterById = new Map(
      this.standings.map((s) => [s.roster.roster_id, s]),
    )

    const result: PairedMatchup[] = matchups
      .filter((m) => m.teamA && m.teamB)
      .map((m) => {
        const teamA = rosterById.get(m.teamA.roster_id)
        const teamB = rosterById.get(m.teamB.roster_id)

        const aIsMine = !!this.myUserId && teamA?.user?.user_id === this.myUserId
        const bIsMine = !!this.myUserId && teamB?.user?.user_id === this.myUserId

        return {
          matchupId: m.teamA.matchup_id,
          teamAName: teamA?.teamName ?? `Team ${m.teamA.roster_id}`,
          teamAAvatar: teamA?.avatar ?? null,
          teamAPoints: m.teamA.points ?? 0,
          teamAIsMine: aIsMine,
          teamBName: teamB?.teamName ?? `Team ${m.teamB.roster_id}`,
          teamBAvatar: teamB?.avatar ?? null,
          teamBPoints: m.teamB.points ?? 0,
          teamBIsMine: bIsMine,
        }
      })

    // My matchup first, then by matchupId
    return result.sort((a, b) => {
      if (a.teamAIsMine || a.teamBIsMine) return -1
      if (b.teamAIsMine || b.teamBIsMine) return 1
      return a.matchupId - b.matchupId
    })
  }
}
