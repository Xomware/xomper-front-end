/**
 * HighestPossibleCalculator — web port of iOS HighestPossibleLineup.swift.
 *
 * Pure utility (no Angular, no DI) that computes "Highest Possible Points"
 * (HPP) — the maximum a team's roster *could* have scored in a week or season
 * given the slot configuration and each player's actual points.
 *
 * Algorithm: greedy assignment with slots sorted by restrictiveness ascending
 * (specific positions filled before flex slots). Matches iOS implementation and
 * standard fantasy "perfect lineup" tools.
 *
 * Used by #57 Reverse-HPP draft order rule: non-playoff teams ranked ascending
 * by season HPP so bad lineup-setting doesn't reward tanking.
 */

/** Slot labels that are NOT part of the active starting lineup. */
const NON_STARTING_SLOTS = new Set(['BN', 'IR', 'RES', 'TAXI'])

/**
 * Slot label -> set of player positions eligible for that slot.
 * Mirrors iOS slotEligibility dict verbatim.
 */
const SLOT_ELIGIBILITY: Record<string, Set<string>> = {
  QB:         new Set(['QB']),
  RB:         new Set(['RB']),
  WR:         new Set(['WR']),
  TE:         new Set(['TE']),
  K:          new Set(['K']),
  DEF:        new Set(['DEF']),
  DST:        new Set(['DEF']),
  FLEX:       new Set(['RB', 'WR', 'TE']),
  REC_FLEX:   new Set(['WR', 'TE']),
  WRRB_FLEX:  new Set(['RB', 'WR']),
  WRRB_WT:    new Set(['RB', 'WR', 'TE']),
  SUPER_FLEX: new Set(['QB', 'RB', 'WR', 'TE']),
  'SUPER FLEX': new Set(['QB', 'RB', 'WR', 'TE']),
  'Q/W/R/T':  new Set(['QB', 'RB', 'WR', 'TE']),
  IDP_FLEX:   new Set(['DL', 'LB', 'DB']),
  DL:         new Set(['DL', 'DE', 'DT']),
  LB:         new Set(['LB', 'ILB', 'OLB']),
  DB:         new Set(['DB', 'CB', 'S', 'FS', 'SS']),
}

export interface WeeklyPoints {
  /** playerId -> points scored that week (full roster, starters + bench). */
  [playerId: string]: number
}

/**
 * Compute season HPP for a single roster.
 *
 * @param rosterId          - Roster ID (used to key weeklyRosterPoints)
 * @param rosterPositions   - League slot config (e.g. ["QB","RB","RB","WR","WR","TE","FLEX","BN",...])
 * @param weeklyRosterPoints - "{week}-{rosterId}" -> Record<playerId, points>
 * @param playerPositions   - playerId -> position string (e.g. "WR", "RB")
 * @param regularSeasonLastWeek - last regular-season week number
 * @returns total HPP across all regular-season weeks with data
 */
export function seasonHPP(
  rosterId: number,
  rosterPositions: string[],
  weeklyRosterPoints: Record<string, WeeklyPoints>,
  playerPositions: Record<string, string>,
  regularSeasonLastWeek: number
): number {
  let total = 0
  const lastWeek = Math.max(regularSeasonLastWeek, 1)
  for (let week = 1; week <= lastWeek; week++) {
    const key = `${week}-${rosterId}`
    const weekPoints = weeklyRosterPoints[key]
    if (!weekPoints || Object.keys(weekPoints).length === 0) continue
    total += optimalLineupPoints(weekPoints, rosterPositions, playerPositions)
  }
  return total
}

/**
 * Optimal lineup points for a single week.
 * Pure function — no side effects.
 *
 * @param playerPoints    - full roster points that week (starters + bench)
 * @param rosterPositions - league slot config
 * @param playerPositions - playerId -> position
 * @returns maximum possible score
 */
export function optimalLineupPoints(
  playerPoints: WeeklyPoints,
  rosterPositions: string[],
  playerPositions: Record<string, string>
): number {
  // 1. Active starting slots only
  const activeSlots = rosterPositions.filter(s => !NON_STARTING_SLOTS.has(s))
  if (activeSlots.length === 0) return 0

  // 2. Resolve eligibility per slot
  const slots = activeSlots.map(slot => ({
    slot,
    eligible: SLOT_ELIGIBILITY[slot] ?? new Set([slot]),
  }))

  // 3. Build candidate list — only players whose position we know
  interface Candidate { id: string; pos: string; pts: number }
  const candidates: Candidate[] = Object.entries(playerPoints).flatMap(([pid, pts]) => {
    const pos = playerPositions[pid]
    if (!pos) return []
    return [{ id: pid, pos, pts }]
  })

  // 4. Sort slots by restrictiveness ascending (smallest eligible set first)
  const orderedSlots = [...slots].sort((a, b) => a.eligible.size - b.eligible.size)

  // 5. Greedy assignment
  const used = new Set<string>()
  let total = 0
  for (const { eligible } of orderedSlots) {
    let best: Candidate | null = null
    for (const c of candidates) {
      if (used.has(c.id)) continue
      if (!eligible.has(c.pos)) continue
      if (best === null || c.pts > best.pts) best = c
    }
    if (best) {
      used.add(best.id)
      total += best.pts
    }
  }
  return total
}
