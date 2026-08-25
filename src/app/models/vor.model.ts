/**
 * Value over replacement.
 *
 * Projected points alone don't express trade value: a QB scoring 300 points
 * in a 1QB league is ordinary, and the same 300 in superflex is scarce. What
 * matters is the margin over the worst starter a team could roster instead —
 * which depends entirely on the league's starting slots and team count.
 *
 * This is what makes superflex, TE premium and roster depth fall out of the
 * league object rather than being borrowed from a source tuned to someone
 * else's settings.
 */
import {
  ProjectedPlayer,
  ValuedPosition,
  VALUED_POSITIONS,
  isStartingSlot,
  slotEligibility,
} from './projections.model'

export interface ScoredPlayer {
  player: ProjectedPlayer
  position: ValuedPosition
  points: number
}

export type ReplacementLevels = Partial<Record<ValuedPosition, number>>

/** How many starters of each position the whole league fields. */
export function startersByPosition(
  rosterPositions: string[],
  numTeams: number,
  scored: ScoredPlayer[],
): Record<ValuedPosition, number> {
  const counts = Object.fromEntries(
    VALUED_POSITIONS.map((p) => [p, 0]),
  ) as Record<ValuedPosition, number>

  const startingSlots = rosterPositions.filter(isStartingSlot)

  // Dedicated slots are unambiguous.
  const flexSlots: string[] = []
  for (const slot of startingSlots) {
    const eligible = slotEligibility(slot)
    if (eligible.length === 1) {
      counts[eligible[0]] += numTeams
    } else {
      flexSlots.push(slot)
    }
  }

  if (flexSlots.length === 0) return counts

  // Flex slots go to whoever is actually best available once dedicated slots
  // are filled. Simulating that is more honest than assuming a fixed split:
  // in superflex the marginal flex slot goes to a QB, in a TE-premium league
  // it may go to a tight end.
  const byPosition = groupSortedByPoints(scored)
  const taken = { ...counts }

  for (const slot of flexSlots) {
    const eligible = slotEligibility(slot)
    for (let i = 0; i < numTeams; i++) {
      let bestPos: ValuedPosition | null = null
      let bestPoints = -Infinity

      for (const pos of eligible) {
        const pool = byPosition[pos]
        const next = pool?.[taken[pos]]
        if (next && next.points > bestPoints) {
          bestPoints = next.points
          bestPos = pos
        }
      }

      if (!bestPos) break
      taken[bestPos] += 1
    }
  }

  return taken
}

/**
 * Points scored by the first player at each position who would NOT start
 * anywhere in the league — the replacement.
 */
export function replacementLevels(
  scored: ScoredPlayer[],
  starters: Record<ValuedPosition, number>,
): ReplacementLevels {
  const byPosition = groupSortedByPoints(scored)
  const levels: ReplacementLevels = {}

  for (const pos of VALUED_POSITIONS) {
    const pool = byPosition[pos]
    if (!pool || pool.length === 0) continue

    const starterCount = starters[pos] ?? 0
    if (starterCount <= 0) {
      // Position isn't started at all in this league (no K slot, say).
      // Everyone is replacement-level, so nobody carries value.
      levels[pos] = pool[0].points
      continue
    }

    // Index `starterCount` is the best player who misses a starting job.
    // Clamp to the last available player for thin positions.
    const idx = Math.min(starterCount, pool.length - 1)
    levels[pos] = pool[idx].points
  }

  return levels
}

/**
 * Convert scored players into 0–10000 values, scaled so the most valuable
 * player sits at 10000. That matches the FantasyCalc range the app already
 * renders, so charts and trade thresholds stay meaningful across providers.
 */
export function valuesFromVor(
  scored: ScoredPlayer[],
  levels: ReplacementLevels,
  scale = 10000,
): Map<string, number> {
  const vor = new Map<string, number>()
  let maxVor = 0

  for (const entry of scored) {
    const replacement = levels[entry.position] ?? 0
    const value = entry.points - replacement
    if (value > maxVor) maxVor = value
    vor.set(entry.player.playerId, value)
  }

  const out = new Map<string, number>()
  for (const [id, raw] of vor) {
    // Below-replacement players are rostered but carry no trade value.
    // They stay in the map at 0 — known and worthless, not unknown.
    const normalized = maxVor > 0 ? Math.round((Math.max(raw, 0) / maxVor) * scale) : 0
    out.set(id, normalized)
  }

  return out
}

function groupSortedByPoints(
  scored: ScoredPlayer[],
): Partial<Record<ValuedPosition, ScoredPlayer[]>> {
  const groups: Partial<Record<ValuedPosition, ScoredPlayer[]>> = {}
  for (const entry of scored) {
    ;(groups[entry.position] ??= []).push(entry)
  }
  for (const pool of Object.values(groups)) {
    pool!.sort((a, b) => b.points - a.points)
  }
  return groups
}
