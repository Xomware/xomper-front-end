import { Component, OnInit } from '@angular/core'
import { NgIf, NgFor, NgClass, DecimalPipe } from '@angular/common'
import { forkJoin } from 'rxjs'
import { switchMap } from 'rxjs/operators'
import { LeagueService } from 'src/app/services/league.service'
import { PlayerService } from 'src/app/services/player.service'
import { PlayerValuesService } from 'src/app/services/player-values.service'
import { RecommendedTradeService } from 'src/app/services/recommended-trade.service'
import { TeamAnalysisService } from 'src/app/services/team-analysis.service'
import { UserService } from 'src/app/services/user.service'
import { Roster } from 'src/app/models/roster.interface'
import { ValueBook } from 'src/app/models/value-book.model'
import {
  emptyTradeSide,
  isTradeEmpty,
  ProposedTrade,
  SuggestedAddOn,
  TeamAnalysis,
  TradeEvaluation,
  TradeSide,
  verdictLabel,
} from 'src/app/models/team-analysis.model'

/** One roster's player, ready to render in a picker row. */
interface RosterPlayer {
  playerId: string
  name: string
  position: string
  value: number
  /** False when the value source does not cover this player. */
  known: boolean
}

/**
 * Trade analyzer.
 *
 * The evaluation engine (`RecommendedTradeService`) has existed since the CLT
 * app and is pure — it just had no screen. This is that screen.
 *
 * Values come from the league's own `ValueBook`, so a redraft league is priced
 * off projections and a dynasty league off FantasyCalc. The same trade grades
 * differently in different leagues, which is the point.
 */
@Component({
  selector: 'app-trade-analyzer',
  standalone: true,
  imports: [NgIf, NgFor, NgClass, DecimalPipe],
  templateUrl: './trade-analyzer.component.html',
  styleUrls: ['./trade-analyzer.component.scss'],
})
export class TradeAnalyzerComponent implements OnInit {
  loading = true
  error: string | null = null

  analyses: TeamAnalysis[] = []
  private rosters: Roster[] = []
  private book: ValueBook | null = null
  private playerMap: Record<string, { first_name?: string; last_name?: string; position?: string }> = {}

  sideARosterId: number | null = null
  sideBRosterId: number | null = null

  private selectedA = new Set<string>()
  private selectedB = new Set<string>()

  evaluation: TradeEvaluation | null = null
  suggestions: SuggestedAddOn[] = []
  unvalued: string[] = []

  constructor(
    private leagueService: LeagueService,
    private playerService: PlayerService,
    private playerValuesService: PlayerValuesService,
    private tradeService: RecommendedTradeService,
    private teamAnalysisService: TeamAnalysisService,
    private userService: UserService,
  ) {}

  ngOnInit(): void {
    this.load()
  }

  load(): void {
    this.loading = true
    this.error = null

    // The switcher's selection, via getActiveLeagueId(). A trade means
    // nothing without a league to price it in.
    const leagueId = this.leagueService.getActiveLeagueId()
    if (!leagueId) {
      this.error = 'No league selected.'
      this.loading = false
      return
    }

    this.leagueService
      .searchLeague(leagueId)
      .pipe(
        switchMap((league) =>
          forkJoin([
            this.leagueService.findLeagueRosters(leagueId),
            this.leagueService.findLeagueUsers(leagueId),
            this.playerValuesService.bookFor(league),
            this.playerService.getPlayerMap(),
          ]),
        ),
      )
      .subscribe({
        next: ([rosters, users, book, playerMap]) => {
          this.rosters = rosters
          this.book = book
          this.playerMap = playerMap as never
          this.analyses = this.teamAnalysisService.build(rosters, users, playerMap, book)
          this.pickDefaultTeams()
          this.loading = false
        },
        error: (err) => {
          this.error = err?.message ?? 'Failed to load league data.'
          this.loading = false
        },
      })
  }

  /** Default to the user's own team against the next one along. */
  private pickDefaultTeams(): void {
    const myUserId = this.userService.getMyUser()?.getUserId()
    const mine = this.analyses.find((a) => a.userId === myUserId) ?? this.analyses[0]
    const other = this.analyses.find((a) => a.rosterId !== mine?.rosterId)

    this.sideARosterId = mine?.rosterId ?? null
    this.sideBRosterId = other?.rosterId ?? null
  }

  // ---- team selection ----

  onSideAChange(rosterId: number): void {
    this.sideARosterId = Number(rosterId)
    // The previous team's players are not on this roster; keeping them would
    // grade a trade nobody could make.
    this.selectedA.clear()
    this.recalculate()
  }

  onSideBChange(rosterId: number): void {
    this.sideBRosterId = Number(rosterId)
    this.selectedB.clear()
    this.recalculate()
  }

  teamName(rosterId: number | null): string {
    return this.analyses.find((a) => a.rosterId === rosterId)?.teamName ?? 'Team'
  }

  // ---- roster rendering ----

  playersFor(rosterId: number | null): RosterPlayer[] {
    if (rosterId == null || !this.book) return []
    const roster = this.rosters.find((r) => r.roster_id === rosterId)
    if (!roster) return []

    return (roster.players ?? [])
      .map((playerId) => {
        const meta = this.playerMap[playerId] ?? {}
        const lookup = this.book!.value(playerId)
        const name = [meta.first_name, meta.last_name].filter(Boolean).join(' ')
        return {
          playerId,
          name: name || playerId,
          position: meta.position ?? '—',
          value: lookup.value,
          known: lookup.known,
        }
      })
      .sort((a, b) => b.value - a.value)
  }

  isSelected(side: 'A' | 'B', playerId: string): boolean {
    return this.set(side).has(playerId)
  }

  toggle(side: 'A' | 'B', playerId: string): void {
    const set = this.set(side)
    if (set.has(playerId)) set.delete(playerId)
    else set.add(playerId)
    this.recalculate()
  }

  clear(): void {
    this.selectedA.clear()
    this.selectedB.clear()
    this.recalculate()
  }

  private set(side: 'A' | 'B'): Set<string> {
    return side === 'A' ? this.selectedA : this.selectedB
  }

  // ---- evaluation ----

  private buildTrade(): ProposedTrade {
    const sideA: TradeSide = {
      ...emptyTradeSide(this.sideARosterId ?? -1, this.teamName(this.sideARosterId)),
      playerIds: [...this.selectedA],
    }
    const sideB: TradeSide = {
      ...emptyTradeSide(this.sideBRosterId ?? -1, this.teamName(this.sideBRosterId)),
      playerIds: [...this.selectedB],
    }
    return { sideA, sideB }
  }

  private recalculate(): void {
    if (!this.book) return

    const trade = this.buildTrade()
    if (isTradeEmpty(trade)) {
      this.evaluation = null
      this.suggestions = []
      this.unvalued = []
      return
    }

    this.evaluation = this.tradeService.evaluate(trade, this.book)
    this.unvalued = this.tradeService.unvaluedAssets(trade, this.book)
    this.suggestions = this.tradeService.suggestBalance(
      trade,
      this.evaluation,
      this.rosters,
      this.playerMap,
      this.book,
    )
  }

  // ---- view helpers ----

  get verdict(): string {
    if (!this.evaluation) return 'Pick players from each side'
    return verdictLabel(this.evaluation.verdict)
      .replace('Side A', this.teamName(this.sideARosterId))
      .replace('Side B', this.teamName(this.sideBRosterId))
  }

  get verdictTone(): 'fair' | 'a' | 'b' | 'none' {
    switch (this.evaluation?.verdict.type) {
      case 'fair':
        return 'fair'
      case 'sideAWins':
        return 'a'
      case 'sideBWins':
        return 'b'
      default:
        return 'none'
    }
  }

  /**
   * Whether the verdict can be trusted.
   *
   * An unvalued asset scores as 0, which reads as "they gave up nothing" — a
   * confidently wrong verdict is worse than no verdict, so the template hides
   * the numbers when this is false.
   */
  get isGradable(): boolean {
    return !!this.evaluation && this.unvalued.length === 0
  }

  unvaluedNames(): string {
    return this.unvalued
      .map((id) => {
        const meta = this.playerMap[id]
        const name = [meta?.first_name, meta?.last_name].filter(Boolean).join(' ')
        return name || id
      })
      .join(', ')
  }

  addSuggestion(addOn: SuggestedAddOn): void {
    // The engine suggests from the lighter side, so it belongs to whichever
    // team the verdict says is giving up less.
    const side = this.evaluation?.verdict.type === 'sideAWins' ? 'B' : 'A'
    this.set(side).add(addOn.playerId)
    this.recalculate()
  }
}
