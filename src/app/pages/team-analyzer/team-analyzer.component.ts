import { Component, OnInit } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { forkJoin } from 'rxjs'

import { TeamAnalysisService } from '../../services/team-analysis.service'
import { RecommendedTradeService } from '../../services/recommended-trade.service'
import { PlayerValuesService } from '../../services/player-values.service'
import { LeagueService } from '../../services/league.service'
import { PlayerService } from '../../services/player.service'
import { UserService } from '../../services/user.service'

import {
  TeamAnalysis,
  HexAxis,
  hexAxes,
  totalValue,
  ProposedTrade,
  TradeSide,
  TradeEvaluation,
  SuggestedAddOn,
  RecommendedTrade,
  emptyTradeSide,
  isTradeEmpty,
  verdictLabel,
  isVerdictFair,
} from '../../models/team-analysis.model'
import { Roster } from '../../models/roster.interface'
import { Player } from '../../models/player.interface'

import { HexagonChartComponent } from './hexagon-chart/hexagon-chart.component'
import { PositionBreakdownCardComponent } from './position-breakdown-card/position-breakdown-card.component'
import { RecommendedTradeCardComponent } from './recommended-trade-card/recommended-trade-card.component'

type AnalyzerTab = 'compare' | 'league' | 'trade'

/** Minimal trade side picker modal state */
interface SidePicker {
  side: 'a' | 'b'
  kind: 'player' | 'pick'
  rosterId: number
  teamName: string
  show: boolean
}

/**
 * Team Analyzer page — 3-tab shell (Compare / League / Trade).
 * Port of iOS `TeamAnalyzerView.swift` for the standalone `/team-analyzer` route.
 *
 * All data flows through the 8a services:
 * - `TeamAnalysisService` — hex axes, maxes, averages
 * - `RecommendedTradeService` — evaluate, suggestBalance, recommend
 * - `PlayerValuesService` — pick names / values
 */
@Component({
  selector: 'app-team-analyzer',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HexagonChartComponent,
    PositionBreakdownCardComponent,
    RecommendedTradeCardComponent,
  ],
  templateUrl: './team-analyzer.component.html',
  styleUrls: ['./team-analyzer.component.scss'],
})
export class TeamAnalyzerComponent implements OnInit {
  activeTab: AnalyzerTab = 'compare'
  tabs: AnalyzerTab[] = ['compare', 'league', 'trade']

  // Data state
  loading = true
  error: string | null = null
  analyses: TeamAnalysis[] = []
  rosters: Roster[] = []
  playerMap: Record<string, Player> = {}
  axisMaxes: Record<string, number> = {}
  leagueAverages: HexAxis[] = []
  myUserId: string | null = null

  // Compare tab
  comparisonRosterId: number | null = null

  // Trade tab — local state (no shared controller)
  tradePartnerRosterId: number | null = null
  tradeSideAPlayerIds: string[] = []
  tradeSideBPlayerIds: string[] = []
  tradeSideAPickNames: string[] = []
  tradeSideBPickNames: string[] = []
  tradeEvaluation: TradeEvaluation | null = null
  tradeBalance: SuggestedAddOn[] = []
  recommendations: RecommendedTrade[] = []

  // Player / pick picker modal
  sidePicker: SidePicker | null = null
  pickerPlayerEntries: Array<{ playerId: string; name: string; position: string; value: number }> = []
  pickerPickEntries: string[] = []

  constructor(
    private teamAnalysisService: TeamAnalysisService,
    private recommendedTradeService: RecommendedTradeService,
    private playerValuesService: PlayerValuesService,
    private leagueService: LeagueService,
    private playerService: PlayerService,
    private userService: UserService,
  ) {}

  ngOnInit(): void {
    this.myUserId = this.userService.getMyUser()?.getUserId() ?? null
    this.loadData()
  }

  loadData(): void {
    this.loading = true
    this.error = null

    const leagueId = this.leagueService.getWhitelistedLeagueId()

    forkJoin([
      this.leagueService.findLeagueRosters(leagueId),
      this.leagueService.findLeagueUsers(leagueId),
      this.playerValuesService.load(),
      this.playerService.getPlayerMap(),
    ]).subscribe({
      next: ([rosters, users, _values, playerMap]) => {
        this.rosters = rosters
        this.playerMap = playerMap as Record<string, Player>
        this.analyses = this.teamAnalysisService.build(rosters, users, playerMap)
        this.axisMaxes = this.teamAnalysisService.axisMaxes(this.analyses)
        this.leagueAverages = this.teamAnalysisService.leagueAverageAxes(this.analyses)
        this.recommendations = this.buildRecommendations()
        this.loading = false
      },
      error: (err) => {
        this.error = err?.message ?? 'Failed to load team data.'
        this.loading = false
      },
    })
  }

  // ---------------------------------------------------------------------------
  // Derived getters
  // ---------------------------------------------------------------------------

  get myAnalysis(): TeamAnalysis | null {
    if (!this.myUserId) return this.analyses[0] ?? null
    return this.analyses.find((a) => a.userId === this.myUserId) ?? this.analyses[0] ?? null
  }

  get comparisonAnalysis(): TeamAnalysis | null {
    if (this.comparisonRosterId === null) return null
    return this.analyses.find((a) => a.rosterId === this.comparisonRosterId) ?? null
  }

  get tradePartner(): TeamAnalysis | null {
    if (this.tradePartnerRosterId === null) return null
    return this.analyses.find((a) => a.rosterId === this.tradePartnerRosterId) ?? null
  }

  get rankedTeams(): TeamAnalysis[] {
    return [...this.analyses].sort((a, b) => totalValue(b) - totalValue(a))
  }

  get compareOpponents(): TeamAnalysis[] {
    const myId = this.myAnalysis?.rosterId
    return [...this.analyses]
      .filter((a) => a.rosterId !== myId)
      .sort((a, b) => totalValue(b) - totalValue(a))
  }

  get tradePartnerCandidates(): TeamAnalysis[] {
    const myId = this.myAnalysis?.rosterId
    return [...this.analyses]
      .filter((a) => a.rosterId !== myId)
      .sort((a, b) => totalValue(b) - totalValue(a))
  }

  totalValue(team: TeamAnalysis): number {
    return totalValue(team)
  }

  hexAxes(team: TeamAnalysis): HexAxis[] {
    return hexAxes(team)
  }

  leagueAvgTotal(): number {
    if (this.analyses.length === 0) return 0
    return Math.round(
      this.analyses.reduce((s, a) => s + totalValue(a), 0) / this.analyses.length,
    )
  }

  tabLabel(tab: AnalyzerTab): string {
    return tab.charAt(0).toUpperCase() + tab.slice(1)
  }

  // ---------------------------------------------------------------------------
  // Compare tab actions
  // ---------------------------------------------------------------------------

  selectComparison(rosterId: number | null): void {
    this.comparisonRosterId = rosterId
  }

  // ---------------------------------------------------------------------------
  // League tab helpers
  // ---------------------------------------------------------------------------

  isMyTeam(team: TeamAnalysis): boolean {
    return team.userId === this.myUserId
  }

  teamRank(team: TeamAnalysis): number {
    return this.rankedTeams.findIndex((t) => t.rosterId === team.rosterId) + 1
  }

  deltaClass(myValue: number, avgValue: number): string {
    if (avgValue <= 0) return ''
    const ratio = myValue / avgValue
    if (ratio >= 1.05) return 'delta--gold'
    if (ratio <= 0.85) return 'delta--red'
    return ''
  }

  fillFraction(value: number, max: number): number {
    return max > 0 ? Math.min(1, value / max) : 0
  }

  // ---------------------------------------------------------------------------
  // Trade tab — partner selection
  // ---------------------------------------------------------------------------

  selectTradePartner(rosterId: number | null): void {
    if (rosterId !== this.tradePartnerRosterId) {
      this.tradeSideBPlayerIds = []
      this.tradeSideBPickNames = []
    }
    this.tradePartnerRosterId = rosterId
    this.reEvaluateTrade()
  }

  clearTrade(): void {
    this.tradeSideAPlayerIds = []
    this.tradeSideBPlayerIds = []
    this.tradeSideAPickNames = []
    this.tradeSideBPickNames = []
    this.reEvaluateTrade()
  }

  get tradeIsEmpty(): boolean {
    return isTradeEmpty(this.currentTrade)
  }

  // ---------------------------------------------------------------------------
  // Trade evaluation
  // ---------------------------------------------------------------------------

  get currentTrade(): ProposedTrade {
    const my = this.myAnalysis
    const partner = this.tradePartner
    return {
      sideA: {
        rosterId: my?.rosterId ?? 0,
        teamName: my?.teamName ?? '',
        playerIds: this.tradeSideAPlayerIds,
        pickNames: this.tradeSideAPickNames,
      },
      sideB: {
        rosterId: partner?.rosterId ?? 0,
        teamName: partner?.teamName ?? '',
        playerIds: this.tradeSideBPlayerIds,
        pickNames: this.tradeSideBPickNames,
      },
    }
  }

  private reEvaluateTrade(): void {
    const trade = this.currentTrade
    if (isTradeEmpty(trade) || !this.tradePartner) {
      this.tradeEvaluation = null
      this.tradeBalance = []
      return
    }
    this.tradeEvaluation = this.recommendedTradeService.evaluate(trade)
    this.tradeBalance = this.recommendedTradeService.suggestBalance(
      trade,
      this.tradeEvaluation,
      this.rosters,
      this.playerMap,
    )
  }

  get verdictLabel(): string {
    if (!this.tradeEvaluation) return 'Add players to evaluate'
    return verdictLabel(this.tradeEvaluation.verdict)
  }

  get verdictClass(): string {
    if (!this.tradeEvaluation) return 'verdict--empty'
    switch (this.tradeEvaluation.verdict.type) {
      case 'empty': return 'verdict--empty'
      case 'fair': return 'verdict--fair'
      default: return 'verdict--uneven'
    }
  }

  get balanceLighterLabel(): string {
    if (!this.tradeEvaluation) return ''
    return this.tradeEvaluation.verdict.type === 'sideAWins' ? 'you receive' : 'you give'
  }

  // ---------------------------------------------------------------------------
  // Trade — add/remove players & picks
  // ---------------------------------------------------------------------------

  removeFromSideA(playerId: string): void {
    this.tradeSideAPlayerIds = this.tradeSideAPlayerIds.filter((id) => id !== playerId)
    this.reEvaluateTrade()
  }

  removeFromSideB(playerId: string): void {
    this.tradeSideBPlayerIds = this.tradeSideBPlayerIds.filter((id) => id !== playerId)
    this.reEvaluateTrade()
  }

  removePickFromSideA(name: string): void {
    this.tradeSideAPickNames = this.tradeSideAPickNames.filter((n) => n !== name)
    this.reEvaluateTrade()
  }

  removePickFromSideB(name: string): void {
    this.tradeSideBPickNames = this.tradeSideBPickNames.filter((n) => n !== name)
    this.reEvaluateTrade()
  }

  playerValue(pid: string): number {
    return this.playerValuesService.value(pid)
  }

  pickValue(name: string): number {
    return this.playerValuesService.pickValue(name)
  }

  playerName(pid: string): string {
    const p = this.playerMap[pid]
    if (!p) return `Player #${pid}`
    return `${(p as any).first_name ?? ''} ${(p as any).last_name ?? ''}`.trim() || `Player #${pid}`
  }

  playerPosition(pid: string): string {
    const p = this.playerMap[pid]
    return (p as any)?.position ?? this.playerValuesService.position(pid) ?? '?'
  }

  addBalanceSuggestion(suggestion: SuggestedAddOn): void {
    if (!this.tradeEvaluation) return
    if (this.tradeEvaluation.verdict.type === 'sideAWins') {
      if (!this.tradeSideBPlayerIds.includes(suggestion.playerId)) {
        this.tradeSideBPlayerIds = [...this.tradeSideBPlayerIds, suggestion.playerId]
      }
    } else if (this.tradeEvaluation.verdict.type === 'sideBWins') {
      if (!this.tradeSideAPlayerIds.includes(suggestion.playerId)) {
        this.tradeSideAPlayerIds = [...this.tradeSideAPlayerIds, suggestion.playerId]
      }
    }
    this.reEvaluateTrade()
  }

  // ---------------------------------------------------------------------------
  // Recommended trades
  // ---------------------------------------------------------------------------

  private buildRecommendations(): RecommendedTrade[] {
    const my = this.myAnalysis
    if (!my) return []
    return this.recommendedTradeService.recommend(my, this.analyses, this.rosters, this.playerMap)
  }

  loadRecommendation(rec: RecommendedTrade): void {
    this.tradePartnerRosterId = rec.partnerRosterId
    this.tradeSideAPlayerIds = [rec.give.playerId]
    this.tradeSideBPlayerIds = [rec.receive.playerId]
    this.tradeSideAPickNames = []
    this.tradeSideBPickNames = []
    this.reEvaluateTrade()
  }

  // ---------------------------------------------------------------------------
  // Picker modal — player selection
  // ---------------------------------------------------------------------------

  openPlayerPicker(side: 'a' | 'b', rosterId: number, teamName: string): void {
    const alreadyPicked = new Set([
      ...this.tradeSideAPlayerIds,
      ...this.tradeSideBPlayerIds,
    ])
    const roster = this.rosters.find((r) => r.roster_id === rosterId)
    this.pickerPlayerEntries = (roster?.players ?? [])
      .flatMap((pid) => {
        if (alreadyPicked.has(pid)) return []
        const value = this.playerValuesService.value(pid)
        if (value <= 0) return []
        return [{ playerId: pid, name: this.playerName(pid), position: this.playerPosition(pid), value }]
      })
      .sort((a, b) => b.value - a.value)

    this.sidePicker = { side, kind: 'player', rosterId, teamName, show: true }
  }

  openPickPicker(side: 'a' | 'b', rosterId: number, teamName: string): void {
    const alreadyPicked = new Set([
      ...this.tradeSideAPickNames,
      ...this.tradeSideBPickNames,
    ])
    const currentYear = new Date().getFullYear()
    this.pickerPickEntries = this.playerValuesService
      .pickNames(new Set([currentYear, currentYear + 1, currentYear + 2]))
      .filter((n) => !alreadyPicked.has(n))

    this.sidePicker = { side, kind: 'pick', rosterId, teamName, show: true }
  }

  closePicker(): void {
    this.sidePicker = null
  }

  selectPickerPlayer(entry: { playerId: string }): void {
    if (!this.sidePicker) return
    if (this.sidePicker.side === 'a') {
      this.tradeSideAPlayerIds = [...this.tradeSideAPlayerIds, entry.playerId]
    } else {
      this.tradeSideBPlayerIds = [...this.tradeSideBPlayerIds, entry.playerId]
    }
    this.closePicker()
    this.reEvaluateTrade()
  }

  selectPickerPick(name: string): void {
    if (!this.sidePicker) return
    if (this.sidePicker.side === 'a') {
      this.tradeSideAPickNames = [...this.tradeSideAPickNames, name]
    } else {
      this.tradeSideBPickNames = [...this.tradeSideBPickNames, name]
    }
    this.closePicker()
    this.reEvaluateTrade()
  }
}
