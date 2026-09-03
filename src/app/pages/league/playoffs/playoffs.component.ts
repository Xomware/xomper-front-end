import { Component, OnInit } from '@angular/core'
import { NgIf, NgFor, NgTemplateOutlet } from '@angular/common'
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
  imports: [LoaderComponent, NgIf, NgFor, NgTemplateOutlet],
})
export class PlayoffsComponent implements OnInit {
  loading = false
  winnersBracket: PlayoffBracketMatch[] = []
  losersBracket: PlayoffBracketMatch[] = []
  bracketRounds: { round: number; label: string; matches: PlayoffBracketMatch[] }[] = []
  loserRounds: { round: number; label: string; matches: PlayoffBracketMatch[] }[] = []
  playoffsLoaded = false
  private standings: StandingsTeamModel[] = []
  private leagueId = ''

  constructor(
    private leagueService: LeagueService,
    private toastService: ToastService,
  ) {}

  ngOnInit(): void {
    // getActiveLeagueId, not getMyLeague: the latter is whichever league
    // loaded first, so this read the wrong league's bracket after a switch.
    const leagueId = this.leagueService.getActiveLeagueId()
    if (!leagueId) return
    this.leagueId = leagueId
    this.standings = this.leagueService.getMyLeague()?.getStandingsTeams() ?? []
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
          this.winnersPlacements = this.placementsIn(this.winnersBracket)
          this.losersPlacements = this.placementsIn(this.losersBracket)
          this.playoffsLoaded = true
          this.loading = false
        },
        error: () => {
          this.toastService.showNegativeToast('Error loading playoff bracket.')
          this.loading = false
        },
      })
  }

  /**
   * Name the round from the end backwards.
   *
   * "Round 3" tells a reader nothing; "Final" and "Semifinal" tell them where
   * they are. Numbered only when a bracket is deep enough that names run out.
   */
  private labelForRound(round: number, total: number): string {
    const fromEnd = total - round
    if (fromEnd === 0) return 'Final'
    if (fromEnd === 1) return 'Semifinal'
    if (fromEnd === 2) return 'Quarterfinal'
    return `Round ${round}`
  }

  /**
   * A match that decides a placing rather than who advances.
   *
   * `p` is the place a match settles: 1 is the championship, 3 and 5 are the
   * consolation games played alongside it.
   */
  private isPlacement(match: PlayoffBracketMatch): boolean {
    return match.p !== undefined && match.p !== 1
  }

  /**
   * Placement games, flattened out of the rounds.
   *
   * They used to sit inside the round columns, which is what stopped this
   * looking like a bracket: a semifinal has to sit centred between the two
   * quarterfinals feeding it, and a 5th-place game in the same column pushes
   * everything off that line.
   */
  winnersPlacements: PlayoffBracketMatch[] = []
  losersPlacements: PlayoffBracketMatch[] = []

  private placementsIn(matches: PlayoffBracketMatch[]): PlayoffBracketMatch[] {
    return matches.filter((m) => this.isPlacement(m)).sort((a, b) => (a.p ?? 0) - (b.p ?? 0))
  }

  private groupBracketByRound(
    matches: PlayoffBracketMatch[],
  ): { round: number; label: string; matches: PlayoffBracketMatch[] }[] {
    const roundMap = new Map<number, PlayoffBracketMatch[]>()
    matches.filter((m) => !this.isPlacement(m)).forEach((m) => {
      if (!roundMap.has(m.r)) roundMap.set(m.r, [])
      roundMap.get(m.r)!.push(m)
    })
    const rounds = Array.from(roundMap.entries()).sort((a, b) => a[0] - b[0])
    const last = rounds.length ? rounds[rounds.length - 1][0] : 0
    return rounds.map(([round, matches]) => ({
      round,
      label: this.labelForRound(round, last),
      matches,
    }))
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

  /** Nothing has been played, so the bracket is a shape with no teams in it. */
  get bracketIsEmpty(): boolean {
    return !this.bracketRounds.length && !this.loserRounds.length
  }

  /**
   * A slot with no team yet.
   *
   * Sleeper fills `t1`/`t2` as earlier rounds resolve, so mid-playoffs half
   * the bracket is legitimately blank -- that is a slot waiting on a winner,
   * not missing data.
   */
  isPending(rosterId: number | null): boolean {
    return !rosterId
  }

  getBracketMatchLabel(match: PlayoffBracketMatch): string {
    if (match.p === 1) return 'Championship'
    if (match.p === 3) return '3rd Place'
    if (match.p === 5) return '5th Place'
    return ''
  }
}
