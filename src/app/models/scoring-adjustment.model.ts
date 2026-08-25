import {
  ProjectedPlayer,
  ValuedPosition,
  VALUED_POSITIONS,
  projectedPoints,
} from './projections.model'

/**
 * Correcting borrowed values for scoring a borrowed format cannot express.
 *
 * Dynasty values come from FantasyCalc, which is parameterized on exactly four
 * axes: dynasty, QB count, team count and PPR. Anything outside those is
 * invisible to it. TE premium is the common case and it is not small — measured
 * against the CLT league (`bonus_rec_te: 0.5`), the top 24 tight ends project
 * **20% more points** than the same players under the plain-PPR scoring
 * FantasyCalc actually served. Every trade involving a tight end in that league
 * was being graded against a number that was systematically ~20% light.
 *
 * The fix is a per-position multiplier: score the league's real settings
 * against the settings the borrowed format implies, and scale by the ratio.
 * Positions the league scores normally come out at 1.0 and are untouched.
 *
 * This corrects SCORING only. It cannot correct for age or long-term worth —
 * that is what the dynasty source is for, and why this scales those values
 * rather than replacing them.
 */

export interface PositionAdjustments {
  multipliers: Partial<Record<ValuedPosition, number>>
  /** Plain-language notes for positions moved enough to be worth stating. */
  notes: string[]
}

/** Below this, a multiplier is noise and not worth reporting to a user. */
export const MATERIAL_ADJUSTMENT = 0.05

/**
 * Multipliers are clamped. Thin projection data at a position can otherwise
 * produce an extreme ratio, and a wrong correction is worse than a known
 * approximation.
 */
export const MIN_MULTIPLIER = 0.5
export const MAX_MULTIPLIER = 2.0

/**
 * The scoring the borrowed format actually reflects.
 *
 * FantasyCalc expresses reception scoring and nothing else bespoke, so the
 * baseline is the league's own settings with every bonus removed and `rec`
 * snapped to the PPR value that was served. The difference between this and
 * the real settings is precisely what the fingerprint had to throw away.
 */
export function baselineScoring(
  scoring: Record<string, number>,
  servedPpr: number,
): Record<string, number> {
  const baseline: Record<string, number> = {}
  for (const [key, weight] of Object.entries(scoring)) {
    if (key.startsWith('bonus_')) continue
    baseline[key] = weight
  }
  if ('rec' in scoring) baseline['rec'] = servedPpr
  return baseline
}

/**
 * Per-position multipliers comparing real scoring to the served format.
 *
 * Only the players who matter are compared: a position is weighted by the top
 * N projected, where N is how many that league actually starts. A bonus that
 * only moves deep bench players should not reprice the position.
 */
export function positionAdjustments(
  players: ProjectedPlayer[],
  scoring: Record<string, number>,
  servedPpr: number,
  starters: Partial<Record<ValuedPosition, number>>,
): PositionAdjustments {
  const baseline = baselineScoring(scoring, servedPpr)
  const multipliers: Partial<Record<ValuedPosition, number>> = {}
  const notes: string[] = []

  for (const position of VALUED_POSITIONS) {
    const atPosition = players.filter(
      (p) => (p.position ?? '').toUpperCase() === position,
    )
    if (atPosition.length === 0) continue

    const scored = atPosition
      .map((p) => ({
        real: projectedPoints(p, scoring, servedPpr).points,
        base: projectedPoints(p, baseline, servedPpr).points,
      }))
      .filter((r) => r.base > 0)
      .sort((a, b) => b.real - a.real)

    if (scored.length === 0) continue

    const depth = Math.max(1, Math.round(starters[position] ?? scored.length))
    const relevant = scored.slice(0, Math.min(depth, scored.length))

    const realTotal = relevant.reduce((sum, r) => sum + r.real, 0)
    const baseTotal = relevant.reduce((sum, r) => sum + r.base, 0)
    if (baseTotal <= 0) continue

    const raw = realTotal / baseTotal
    const clamped = Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, raw))
    multipliers[position] = clamped

    if (Math.abs(clamped - 1) >= MATERIAL_ADJUSTMENT) {
      const pct = Math.round((clamped - 1) * 100)
      notes.push(
        `${position} values adjusted ${pct > 0 ? '+' : ''}${pct}% for this ` +
          `league's scoring, which the dynasty values source does not model.`,
      )
    }
  }

  return { multipliers, notes }
}
