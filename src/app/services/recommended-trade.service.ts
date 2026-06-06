import { Injectable } from '@angular/core'
import { Roster } from '../models/roster.interface'
import {
  FAIR_THRESHOLD,
  isTradeEmpty,
  isVerdictFair,
  PlayerSummary,
  ProposedTrade,
  RecommendedTrade,
  SuggestedAddOn,
  TeamAnalysis,
  TradeEvaluation,
  TradeSide,
  TradeVerdict,
} from '../models/team-analysis.model'
import { hexAxes } from '../models/team-analysis.model'
import { PlayerValuesService } from './player-values.service'
import { TeamAnalysisService } from './team-analysis.service'

/**
 * Trade evaluation + recommendation engine.
 * Port of iOS `TradeEvaluator` + `RecommendedTradeBuilder` (ProposedTrade.swift).
 *
 * All methods are pure functions keyed on service-injected data — no
 * side effects, safe to call on every UI change.
 */
@Injectable({ providedIn: 'root' })
export class RecommendedTradeService {
  constructor(
    private valuesService: PlayerValuesService,
    private teamAnalysisService: TeamAnalysisService,
  ) {}

  // ---------------------------------------------------------------------------
  // TradeEvaluator — port of iOS enum TradeEvaluator
  // ---------------------------------------------------------------------------

  /**
   * Run the full trade evaluation.
   * Both player and pick values contribute to each side.
   * Port of iOS `TradeEvaluator.evaluate(_:valuesStore:)`.
   */
  evaluate(trade: ProposedTrade): TradeEvaluation {
    const aValue = this.sideValue(trade.sideA)
    const bValue = this.sideValue(trade.sideB)
    const delta = aValue - bValue
    const larger = Math.max(aValue, bValue)
    const gap = larger > 0 ? Math.abs(delta) / larger : 0

    let verdict: TradeVerdict
    if (isTradeEmpty(trade)) {
      verdict = { type: 'empty' }
    } else if (gap <= FAIR_THRESHOLD) {
      verdict = { type: 'fair' }
    } else if (aValue > bValue) {
      verdict = { type: 'sideAWins', byPercent: gap }
    } else {
      verdict = { type: 'sideBWins', byPercent: gap }
    }

    return { sideAValue: aValue, sideBValue: bValue, delta, percentGap: gap, verdict }
  }

  /**
   * Total dynasty value of one trade side (players + picks).
   * Port of iOS `TradeEvaluator.sideValue(_:valuesStore:)`.
   */
  sideValue(side: TradeSide): number {
    const players = side.playerIds.reduce(
      (sum, pid) => sum + this.valuesService.value(pid),
      0,
    )
    const picks = side.pickNames.reduce(
      (sum, name) => sum + this.valuesService.pickValue(name),
      0,
    )
    return players + picks
  }

  /**
   * Suggest add-ons from the lighter side that would close the value gap.
   * Returns up to `limit` players sorted by proximity to "perfect balance."
   * Excludes players already in either side of the trade.
   * Port of iOS `TradeEvaluator.suggestBalance(for:evaluation:rosters:...)`.
   */
  suggestBalance(
    trade: ProposedTrade,
    evaluation: TradeEvaluation,
    rosters: Roster[],
    playerMap: Record<string, { first_name?: string; last_name?: string; position?: string }>,
    limit = 5,
  ): SuggestedAddOn[] {
    if (isVerdictFair(evaluation.verdict) || isTradeEmpty(trade)) return []

    let lighterSide: TradeSide
    let lighterValue: number
    let heavierValue: number

    if (evaluation.verdict.type === 'sideAWins') {
      lighterSide = trade.sideB
      lighterValue = evaluation.sideBValue
      heavierValue = evaluation.sideAValue
    } else if (evaluation.verdict.type === 'sideBWins') {
      lighterSide = trade.sideA
      lighterValue = evaluation.sideAValue
      heavierValue = evaluation.sideBValue
    } else {
      return []
    }

    const neededValue = heavierValue - lighterValue
    const fairBand = heavierValue * FAIR_THRESHOLD
    const upperBound = neededValue + fairBand
    const lowerBound = neededValue - fairBand

    const roster = rosters.find((r) => r.roster_id === lighterSide.rosterId)
    if (!roster) return []

    const alreadyInTrade = new Set([
      ...trade.sideA.playerIds,
      ...trade.sideB.playerIds,
    ])

    const candidates: SuggestedAddOn[] = (roster.players ?? []).flatMap((pid) => {
      if (alreadyInTrade.has(pid)) return []
      const value = this.valuesService.value(pid)
      if (value <= 0) return []
      const player = playerMap[pid]
      const name = player
        ? `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim()
        : `Player #${pid}`
      const position = player?.position ?? this.valuesService.position(pid) ?? '?'
      return [
        {
          playerId: pid,
          playerName: name,
          position,
          value,
          gapClosed: Math.abs(value - neededValue),
        },
      ]
    })

    // In-band candidates first; fall back to closest-to-needed
    const inBand = candidates
      .filter((c) => c.value >= lowerBound && c.value <= upperBound)
      .sort((a, b) => a.gapClosed - b.gapClosed)

    if (inBand.length > 0) return inBand.slice(0, limit)

    return candidates.sort((a, b) => a.gapClosed - b.gapClosed).slice(0, limit)
  }

  // ---------------------------------------------------------------------------
  // RecommendedTradeBuilder — port of iOS enum RecommendedTradeBuilder
  // ---------------------------------------------------------------------------

  /**
   * Find fair-value trades that improve the user's weakest position(s).
   *
   * Algorithm (mirrors iOS exactly):
   * 1. Compute league averages per position.
   * 2. Identify my weak positions (≤85% of league avg) and surplus
   *    positions (≥105% of league avg).
   * 3. For each partner: find positions where THEY are surplus and I am weak.
   *    Take their highest-value player at that position.
   *    Find one of my surplus-position players within fairThreshold.
   * 4. Rank by myImprovement (capped at gap-to-league-avg), descending.
   *
   * Port of iOS `RecommendedTradeBuilder.recommend(...)`.
   */
  recommend(
    myAnalysis: TeamAnalysis,
    analyses: TeamAnalysis[],
    rosters: Roster[],
    playerMap: Record<string, { first_name?: string; last_name?: string; position?: string }>,
    limit = 5,
  ): RecommendedTrade[] {
    const leagueAverages = this.teamAnalysisService.leagueAverageAxes(analyses)
    const avgByPos = new Map<string, number>(leagueAverages.map((a) => [a.label, a.value]))

    const myByPos = new Map<string, number>(
      hexAxes(myAnalysis).map((a) => [a.label, a.value]),
    )

    const positionLabels = ['QB', 'RB', 'WR', 'TE']

    const weakPositions = positionLabels.filter((pos) => {
      const mine = myByPos.get(pos) ?? 0
      const avg = avgByPos.get(pos) ?? 1
      return avg > 0 && mine / avg <= 0.85
    })

    const strongPositions = positionLabels.filter((pos) => {
      const mine = myByPos.get(pos) ?? 0
      const avg = avgByPos.get(pos) ?? 1
      return avg > 0 && mine / avg >= 1.05
    })

    if (weakPositions.length === 0 || strongPositions.length === 0) return []

    const myRoster = rosters.find((r) => r.roster_id === myAnalysis.rosterId)
    const partners = analyses.filter((a) => a.rosterId !== myAnalysis.rosterId)

    const seenPairs = new Set<string>()
    const candidates: RecommendedTrade[] = []

    for (const partner of partners) {
      const partnerByPos = new Map<string, number>(
        hexAxes(partner).map((a) => [a.label, a.value]),
      )
      const partnerRoster = rosters.find((r) => r.roster_id === partner.rosterId)
      if (!partnerRoster) continue

      for (const weak of weakPositions) {
        const partnerStrength = partnerByPos.get(weak) ?? 0
        const avg = avgByPos.get(weak) ?? 1
        if (avg <= 0 || partnerStrength / avg < 1.05) continue

        const theirPlayer = this.topPlayer(weak, partnerRoster, playerMap)
        if (!theirPlayer) continue

        for (const strong of strongPositions) {
          if (!myRoster) continue

          const myCandidates = this.playersAtPosition(strong, myRoster, playerMap)
            .sort((a, b) => b.value - a.value)

          const mine = myCandidates.find((candidate) => {
            const larger = Math.max(candidate.value, theirPlayer.value)
            if (larger <= 0) return false
            const gap = Math.abs(candidate.value - theirPlayer.value) / larger
            return gap <= FAIR_THRESHOLD
          })

          if (!mine) continue

          const pairKey = `${partner.rosterId}:${mine.playerId}:${theirPlayer.playerId}`
          if (seenPairs.has(pairKey)) continue
          seenPairs.add(pairKey)

          const larger = Math.max(mine.value, theirPlayer.value)
          const gap = larger > 0 ? Math.abs(mine.value - theirPlayer.value) / larger : 0

          // Improvement capped at gap-to-league-avg (mirrors iOS comment)
          const myImprovement = Math.min(
            theirPlayer.value,
            Math.max(0, (avgByPos.get(weak) ?? 0) - (myByPos.get(weak) ?? 0)),
          )

          candidates.push({
            id: pairKey,
            partnerRosterId: partner.rosterId,
            partnerTeamName: partner.teamName,
            give: mine,
            receive: theirPlayer,
            myImprovement,
            percentGap: gap,
          })
        }
      }
    }

    return candidates
      .sort((a, b) => b.myImprovement - a.myImprovement)
      .slice(0, limit)
  }

  // ---------------------------------------------------------------------------
  // Private helpers — port of iOS private static funcs in RecommendedTradeBuilder
  // ---------------------------------------------------------------------------

  private topPlayer(
    position: string,
    roster: Roster,
    playerMap: Record<string, { first_name?: string; last_name?: string; position?: string }>,
  ): PlayerSummary | null {
    const players = this.playersAtPosition(position, roster, playerMap)
    if (players.length === 0) return null
    return players.reduce((best, p) => (p.value > best.value ? p : best))
  }

  private playersAtPosition(
    position: string,
    roster: Roster,
    playerMap: Record<string, { first_name?: string; last_name?: string; position?: string }>,
  ): PlayerSummary[] {
    return (roster.players ?? []).flatMap((pid) => {
      const value = this.valuesService.value(pid)
      if (value <= 0) return []
      const player = playerMap[pid]
      const pos = player?.position ?? this.valuesService.position(pid) ?? '?'
      if (pos.toUpperCase() !== position.toUpperCase()) return []
      const name = player
        ? `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim()
        : `Player #${pid}`
      return [{ playerId: pid, name, position: pos, value }]
    })
  }
}
