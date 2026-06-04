import { Component, OnInit } from '@angular/core'
import { NgIf, NgFor } from '@angular/common'
import { forkJoin, take } from 'rxjs'
import { LeagueService } from 'src/app/services/league.service'
import { ToastService } from 'src/app/services/toast.service'
import { PlayoffBracketMatch } from 'src/app/models/playoff-bracket.interface'
import { StandingsTeamModel } from 'src/app/models/standings.model'
import { LoaderComponent } from '../../../components/loader/loader.component'

@Component({
  selector: 'app-playoffs',
  templateUrl: './playoffs.component.html',
  styleUrls: ['./playoffs.component.scss'],
  standalone: true,
  imports: [LoaderComponent, NgIf, NgFor],
})
export class PlayoffsComponent implements OnInit {
  loading = false
  winnersBracket: PlayoffBracketMatch[] = []
  losersBracket: PlayoffBracketMatch[] = []
  bracketRounds: { round: number; matches: PlayoffBracketMatch[] }[] = []
  loserRounds: { round: number; matches: PlayoffBracketMatch[] }[] = []
  playoffsLoaded = false
  private standings: StandingsTeamModel[] = []
  private leagueId = ''

  constructor(
    private leagueService: LeagueService,
    private toastService: ToastService,
  ) {}

  ngOnInit(): void {
    const league = this.leagueService.getMyLeague()
    if (!league) return
    this.leagueId = league.getId()
    this.standings = league.getStandingsTeams()
    this.loadPlayoffBracket()
  }

  loadPlayoffBracket(): void {
    this.loading = true
    forkJoin({
      winners: this.leagueService.getWinnersBracket(this.leagueId),
      losers: this.leagueService.getLosersBracket(this.leagueId),
    })
      .pipe(take(1))
      .subscribe({
        next: ({ winners, losers }) => {
          this.winnersBracket = winners as PlayoffBracketMatch[]
          this.losersBracket = losers as PlayoffBracketMatch[]
          this.bracketRounds = this.groupBracketByRound(this.winnersBracket)
          this.loserRounds = this.groupBracketByRound(this.losersBracket)
          this.playoffsLoaded = true
          this.loading = false
        },
        error: () => {
          this.toastService.showNegativeToast('Error loading playoff bracket.')
          this.loading = false
        },
      })
  }

  private groupBracketByRound(
    matches: PlayoffBracketMatch[],
  ): { round: number; matches: PlayoffBracketMatch[] }[] {
    const roundMap = new Map<number, PlayoffBracketMatch[]>()
    matches.forEach((m) => {
      if (!roundMap.has(m.r)) roundMap.set(m.r, [])
      roundMap.get(m.r)!.push(m)
    })
    return Array.from(roundMap.entries())
      .map(([round, matches]) => ({ round, matches }))
      .sort((a, b) => a.round - b.round)
  }

  getTeamName(rosterId: number | null): string {
    if (!rosterId) return 'TBD'
    const team = this.standings.find((s) => s.roster.roster_id === rosterId)
    return team?.teamName || `Roster ${rosterId}`
  }

  getTeamAvatar(rosterId: number | null): string {
    if (!rosterId) return 'assets/img/nfl.png'
    const team = this.standings.find((s) => s.roster.roster_id === rosterId)
    return team?.avatar || 'assets/img/nfl.png'
  }

  getBracketMatchLabel(match: PlayoffBracketMatch): string {
    if (match.p === 1) return 'Championship'
    if (match.p === 3) return '3rd Place'
    if (match.p === 5) return '5th Place'
    return ''
  }
}
