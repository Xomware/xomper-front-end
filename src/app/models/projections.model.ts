/**
 * Sleeper season projections, and the scoring math that turns them into
 * league-specific projected points.
 *
 * Why this exists: borrowed value sources (FantasyCalc, DynastyProcess) only
 * publish QB/RB/WR/TE, and FantasyCalc's redraft set is ~193 players — less
 * than a 12-team league rosters. Every kicker and defense scores zero.
 *
 * Sleeper's projections carry 3,300+ entries including 153 K and 32 DEF, and
 * — the decisive part — their `stats` keys share a namespace with a league's
 * `scoring_settings`. So a league's scoring is a dot product over projected
 * stats, and TE premium, PPR variants and custom scoring stop being
 * approximations and become arithmetic.
 */

/** Raw entry from `api.sleeper.com/projections/nfl/{season}`. */
export interface SleeperProjectionRaw {
  player_id: string
  player?: {
    position?: string | null
    first_name?: string | null
    last_name?: string | null
    [key: string]: unknown
  } | null
  team?: string | null
  stats?: Record<string, number> | null
  [key: string]: unknown
}

export interface ProjectedPlayer {
  playerId: string
  position: string | null
  name: string
  team: string | null
  stats: Record<string, number>
}

/** Positions that can occupy a starting slot and that we can value. */
export const VALUED_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const
export type ValuedPosition = (typeof VALUED_POSITIONS)[number]

export function parseProjection(raw: SleeperProjectionRaw): ProjectedPlayer {
  const first = raw.player?.first_name ?? ''
  const last = raw.player?.last_name ?? ''
  const name = `${first} ${last}`.trim() || `Player #${raw.player_id}`
  return {
    playerId: raw.player_id,
    position: raw.player?.position ?? null,
    name,
    team: raw.team ?? null,
    stats: raw.stats ?? {},
  }
}

/**
 * Scoring keys a league can define that Sleeper's projections do not provide.
 *
 * Verified against the CLT league on 2026-08-24: 24 of 45 scoring keys matched
 * projection stat keys. The misses are sub-40-yard field-goal buckets and
 * DEF/ST detail — `pts_allow_*` tiers beyond `pts_allow_0`, return
 * touchdowns, forced fumbles. For K and DEF we fall back to Sleeper's own
 * precomputed `pts_*`; we do NOT pretend to component-level DEF precision.
 */
export interface ScoringResult {
  points: number
  /** Scoring keys the league defines that projections don't carry. */
  ignoredKeys: string[]
  /** True when points came from Sleeper's precomputed total, not the dot product. */
  usedFallback: boolean
}

/** Sleeper's precomputed totals, in preference order by league PPR setting. */
function precomputedFor(stats: Record<string, number>, ppr: number): number | null {
  if (ppr >= 0.75 && typeof stats['pts_ppr'] === 'number') return stats['pts_ppr']
  if (ppr >= 0.25 && typeof stats['pts_half_ppr'] === 'number') return stats['pts_half_ppr']
  if (typeof stats['pts_std'] === 'number') return stats['pts_std']
  return (
    stats['pts_ppr'] ?? stats['pts_half_ppr'] ?? stats['pts_std'] ?? null
  )
}

/**
 * Projected fantasy points for one player under one league's scoring.
 *
 * Skill positions use the dot product, so custom scoring and TE premium are
 * exact. K and DEF use Sleeper's precomputed total, because their scoring
 * detail (FG distance buckets, points-allowed tiers) isn't in the projection
 * payload — computing from partial keys would be worse than the precomputed
 * number, not better.
 */
export function projectedPoints(
  player: ProjectedPlayer,
  scoringSettings: Record<string, number>,
  ppr: number,
): ScoringResult {
  const stats = player.stats
  const position = (player.position ?? '').toUpperCase()

  if (position === 'K' || position === 'DEF') {
    const fallback = precomputedFor(stats, ppr)
    return {
      points: fallback ?? 0,
      ignoredKeys: [],
      usedFallback: true,
    }
  }

  let points = 0
  const ignoredKeys: string[] = []
  let matchedAny = false

  for (const [key, weight] of Object.entries(scoringSettings)) {
    const projected = stats[key]
    if (typeof projected === 'number') {
      points += projected * weight
      matchedAny = true
    } else if (weight !== 0) {
      ignoredKeys.push(key)
    }
  }

  // A player with no matching stats at all (rookie with no projection, say)
  // shouldn't silently read as 0.0 points earned — fall back if we can.
  if (!matchedAny) {
    const fallback = precomputedFor(stats, ppr)
    if (fallback !== null) {
      return { points: fallback, ignoredKeys, usedFallback: true }
    }
  }

  return { points, ignoredKeys, usedFallback: false }
}

/** Which positions a roster slot can be filled by. */
export function slotEligibility(slot: string): ValuedPosition[] {
  switch (slot.toUpperCase()) {
    case 'QB': return ['QB']
    case 'RB': return ['RB']
    case 'WR': return ['WR']
    case 'TE': return ['TE']
    case 'K': return ['K']
    case 'DEF': return ['DEF']
    case 'FLEX': return ['RB', 'WR', 'TE']
    case 'WRRB_FLEX': return ['RB', 'WR']
    case 'REC_FLEX': return ['WR', 'TE']
    case 'SUPER_FLEX': return ['QB', 'RB', 'WR', 'TE']
    default: return []
  }
}

/** Slots that don't start anyone. */
export function isStartingSlot(slot: string): boolean {
  const s = slot.toUpperCase()
  return s !== 'BN' && s !== 'IR' && s !== 'TAXI' && slotEligibility(s).length > 0
}
