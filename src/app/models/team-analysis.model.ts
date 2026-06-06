/**
 * Per-team aggregate of dynasty value broken down by position group +
 * roster slot. Drives the hexagon chart on TeamAnalyzerComponent.
 *
 * Port of iOS `TeamAnalysis.swift` (struct + nested HexAxis).
 */
export interface HexAxis {
  label: string
  value: number
}

/**
 * Canonical hex-axis label order. Used by both `TeamAnalysis.hexAxes`
 * and `leagueAverageAxes` so they iterate in the same order.
 */
export const HEX_AXIS_LABELS = ['QB', 'RB', 'WR', 'TE', 'Bench', 'Taxi'] as const
export type HexAxisLabel = (typeof HEX_AXIS_LABELS)[number]

export interface TeamAnalysis {
  rosterId: number
  teamName: string
  userId: string
  avatarId: string | null

  /** Sum of dynasty values per position group (starters only). */
  qbValue: number
  rbValue: number
  wrValue: number
  teValue: number
  /** Players on bench (not in starters / taxi / reserve). */
  benchValue: number
  /** Players on taxi squad. */
  taxiValue: number
}

/** Compute total value across all axes. */
export function totalValue(a: TeamAnalysis): number {
  return a.qbValue + a.rbValue + a.wrValue + a.teValue + a.benchValue + a.taxiValue
}

/** Returns hex axes in canonical order. Port of iOS `var hexAxes: [HexAxis]`. */
export function hexAxes(a: TeamAnalysis): HexAxis[] {
  return [
    { label: 'QB', value: a.qbValue },
    { label: 'RB', value: a.rbValue },
    { label: 'WR', value: a.wrValue },
    { label: 'TE', value: a.teValue },
    { label: 'Bench', value: a.benchValue },
    { label: 'Taxi', value: a.taxiValue },
  ]
}

// ---------------------------------------------------------------------------
// Trade evaluation types — port of iOS ProposedTrade.swift
// ---------------------------------------------------------------------------

export interface TradeSide {
  rosterId: number
  teamName: string
  playerIds: string[]
  /** Pick names from FantasyCalc (e.g. "2026 Pick 1.01"). */
  pickNames: string[]
}

export function emptyTradeSide(rosterId: number, teamName: string): TradeSide {
  return { rosterId, teamName, playerIds: [], pickNames: [] }
}

export function isTradeSideEmpty(side: TradeSide): boolean {
  return side.playerIds.length === 0 && side.pickNames.length === 0
}

export interface ProposedTrade {
  sideA: TradeSide
  sideB: TradeSide
}

export function isTradeEmpty(trade: ProposedTrade): boolean {
  return isTradeSideEmpty(trade.sideA) && isTradeSideEmpty(trade.sideB)
}

export type TradeVerdict =
  | { type: 'empty' }
  | { type: 'fair' }
  | { type: 'sideAWins'; byPercent: number }
  | { type: 'sideBWins'; byPercent: number }

export function verdictLabel(v: TradeVerdict): string {
  switch (v.type) {
    case 'empty':
      return 'Add players to evaluate'
    case 'fair':
      return 'Fair (within 5%)'
    case 'sideAWins':
      return `Side A wins by ${(v.byPercent * 100).toFixed(0)}%`
    case 'sideBWins':
      return `Side B wins by ${(v.byPercent * 100).toFixed(0)}%`
  }
}

export function isVerdictFair(v: TradeVerdict): boolean {
  return v.type === 'fair'
}

/** Result of evaluating a proposed trade. */
export interface TradeEvaluation {
  sideAValue: number
  sideBValue: number
  delta: number
  percentGap: number
  verdict: TradeVerdict
}

/** 5% fair threshold — port of iOS `TradeEvaluation.fairThreshold`. */
export const FAIR_THRESHOLD = 0.05

/** A suggested add-on player to balance an unequal trade. */
export interface SuggestedAddOn {
  playerId: string
  playerName: string
  position: string
  value: number
  /** |candidate.value − neededValue|. Lower = closer to balanced. */
  gapClosed: number
}

// ---------------------------------------------------------------------------
// RecommendedTrade — port of iOS ProposedTrade.swift (RecommendedTrade + PlayerSummary)
// ---------------------------------------------------------------------------

export interface PlayerSummary {
  playerId: string
  name: string
  position: string
  value: number
}

/**
 * A pre-built fair-value trade that improves the user's weakest position.
 * Port of iOS `RecommendedTrade.swift`.
 */
export interface RecommendedTrade {
  /** Stable identity: `{partnerRosterId}:{give.playerId}:{receive.playerId}`. */
  id: string
  partnerRosterId: number
  partnerTeamName: string
  /** Player you'd give up (surplus on a strong position). */
  give: PlayerSummary
  /** Player you'd receive (partner's surplus at your weak position). */
  receive: PlayerSummary
  /** How much this trade lifts your weak position toward league avg. */
  myImprovement: number
  /** Final value gap as a fraction of the larger side (≤ fairThreshold). */
  percentGap: number
}
