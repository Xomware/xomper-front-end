/**
 * "Will he still be there at my next pick?"
 *
 * Logistic model fitted on 11 real drafts from unrelated leagues and validated
 * leave-one-draft-out: **+0.371 Brier skill over 102,859 held-out predictions,
 * positive in 11 of 11 drafts**, and calibrated — every predicted band lands
 * inside its own range. That last property is why this is shown as a percentage
 * rather than a vague label.
 * See docs/features/fantasy-draft-helper/SPIKE-survival-retest.md.
 *
 * An earlier spike concluded this had no skill and the feature was cut on it.
 * That was three drafts from a single friend group scored against hand-tuned
 * functional forms — evidence about those forms, not about the question.
 *
 * Board rank does most of the work: ablation drops skill to +0.294 without it,
 * while removing either ADP-difference feature costs almost nothing. What
 * predicts survival is how many better players are still on the board, not ADP
 * arithmetic — which is exactly why this belongs in a live draft tool.
 *
 * Coefficients are fitted offline and pasted here rather than served, because
 * they change only when the model is refitted and a network round trip during a
 * 60-second pick clock is a worse trade.
 */

/** Feature order: adpMinusNow, adpMinusNext, wait, rank, stdev, depth. */
const MEAN = [22.2994, 10.2249, 12.0745, 28.3325, 16.2537, 0.4439]
const SCALE = [21.725, 22.6053, 6.9025, 17.0765, 9.0057, 0.2577]
const WEIGHTS = [-0.4468, -0.091, -1.1082, 2.2777, 0.302, -0.235]
const BIAS = 2.471

/** Index of `stdev`, used when a player has no spread recorded. */
const STDEV_INDEX = 4

export interface SurvivalInput {
  /** The player's ADP in this league's format. */
  adp: number
  /** Spread of that ADP across drafts. */
  stdev: number
  /** Overall pick number on the clock now. */
  currentPick: number
  /** The user's next overall pick. */
  nextPick: number
  /** This player's index among available players sorted by ADP, 0-based. */
  rank: number
  /** Total picks in the draft. */
  totalPicks: number
}

/**
 * Probability the player is still there at `nextPick`, 0..1.
 *
 * Null when the inputs cannot support a prediction, rather than a
 * confident-looking default — a number here reads as a claim about the world.
 */
export function survivalProbability(input: SurvivalInput): number | null {
  const { adp, stdev, currentPick, nextPick, rank, totalPicks } = input
  if (!Number.isFinite(adp) || !Number.isFinite(rank) || rank < 0) return null
  if (!Number.isFinite(currentPick) || !Number.isFinite(nextPick)) return null
  if (nextPick <= currentPick) return null
  if (!Number.isFinite(totalPicks) || totalPicks <= 0) return null

  const features = [
    adp - currentPick,
    adp - nextPick,
    nextPick - currentPick,
    rank,
    Number.isFinite(stdev) && stdev > 0 ? stdev : MEAN[STDEV_INDEX],
    currentPick / totalPicks,
  ]

  let z = BIAS
  for (let i = 0; i < features.length; i++) {
    z += WEIGHTS[i] * ((features[i] - MEAN[i]) / SCALE[i])
  }
  return Math.min(1, Math.max(0, 1 / (1 + Math.exp(-z))))
}

/**
 * Wording for a probability.
 *
 * Bands, not a bare number everywhere: "73%" invites a precision the model does
 * not have about any single player, even though it is calibrated in aggregate.
 * Callers that want the number still have it.
 */
export function survivalLabel(p: number | null): string {
  if (p === null) return ''
  if (p >= 0.85) return 'should last'
  if (p >= 0.6) return 'probably lasts'
  if (p >= 0.35) return 'coin flip'
  if (p >= 0.15) return 'likely gone'
  return 'gone'
}

export interface BoardSurvival {
  playerId: string
  name: string
  position: string
  /** 0..1, or null when this player has no ADP in the league's format. */
  p: number | null
}

/**
 * Survival for every candidate on the board.
 *
 * `rank` is the player's index among *available* players ordered by ADP, which
 * is the feature doing most of the work — so it is computed here from the live
 * board rather than taken from a caller who might pass overall ADP rank by
 * mistake. Players with no ADP are ranked last and get a null probability
 * instead of a guess.
 */
export function survivalForBoard(
  board: Array<{ playerId: string; name: string; position: string }>,
  adpFor: (playerId: string, position: string) => { adp: number; stdev: number } | null,
  currentPick: number,
  nextPick: number,
  totalPicks: number,
): BoardSurvival[] {
  const withAdp = board.map((c) => ({ ...c, adp: adpFor(c.playerId, c.position) }))
  const ranked = withAdp
    .filter((c) => c.adp !== null)
    .sort((a, b) => (a.adp as { adp: number }).adp - (b.adp as { adp: number }).adp)

  const rankOf = new Map<string, number>()
  ranked.forEach((c, i) => rankOf.set(c.playerId, i))

  return withAdp.map((c) => ({
    playerId: c.playerId,
    name: c.name,
    position: c.position,
    p:
      c.adp === null
        ? null
        : survivalProbability({
            adp: c.adp.adp,
            stdev: c.adp.stdev,
            currentPick,
            nextPick,
            rank: rankOf.get(c.playerId) ?? 0,
            totalPicks,
          }),
  }))
}
