/**
 * What the teams picking before you still need.
 *
 * Strictly factual. It reports unfilled starter slots from roster settings and
 * the picks already made — no claim about who will actually be taken. The
 * calibrated "he won't last" prediction was cut after the ADP spike found no
 * held-out skill (docs/features/fantasy-draft-helper/SPIKE-adp-calibration.md),
 * and this must not quietly become the same claim in different words.
 *
 * Pure module, no Angular.
 */
import { DraftPick, DraftSettings } from '../models/draft.interface'

export interface PlayerPositions {
  [playerId: string]: { position?: string }
}

/** Positions a team fills with a dedicated starter slot. */
const STARTER_SLOTS: Record<string, keyof DraftSettings> = {
  QB: 'slots_qb',
  RB: 'slots_rb',
  WR: 'slots_wr',
  TE: 'slots_te',
  K: 'slots_k',
  DEF: 'slots_def',
}

/** Positions that can fill a FLEX slot once dedicated slots are covered. */
const FLEX_ELIGIBLE = ['RB', 'WR', 'TE']

export interface RosterNeed {
  /** Unfilled dedicated starter slots, by position. */
  dedicated: Record<string, number>
  /** Unfilled FLEX slots, fillable by any of RB/WR/TE. */
  flex: number
}

export interface PositionPressure {
  /** Position -> how many distinct teams ahead of you still need a starter there. */
  teamsNeeding: Record<string, number>
  /** Position -> total unfilled dedicated slots across those teams. */
  openSlots: Record<string, number>
  /** How many teams pick before you. */
  teams: number
  /** How many picks happen before yours. A team can appear twice. */
  picks: number
}

function countByPosition(
  userId: string,
  picks: DraftPick[],
  players: PlayerPositions,
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const pick of picks) {
    if (pick.picked_by !== userId || !pick.player_id) continue
    const position = players[pick.player_id]?.position
    if (!position) continue
    counts[position] = (counts[position] ?? 0) + 1
  }
  return counts
}

/**
 * One team's unfilled starter slots.
 *
 * Dedicated slots fill first; whatever is left over at a flex-eligible
 * position counts toward FLEX. A team with three RBs and two RB slots has one
 * RB spare, which is why they may still not "need" a flex body.
 */
export function needFor(
  userId: string,
  picks: DraftPick[],
  players: PlayerPositions,
  settings: DraftSettings,
): RosterNeed {
  const counts = countByPosition(userId, picks, players)

  const dedicated: Record<string, number> = {}
  let spare = 0
  for (const [position, slotKey] of Object.entries(STARTER_SLOTS)) {
    const required = Number(settings[slotKey] ?? 0)
    const held = counts[position] ?? 0
    dedicated[position] = Math.max(0, required - held)
    if (FLEX_ELIGIBLE.includes(position)) spare += Math.max(0, held - required)
  }

  return {
    dedicated,
    flex: Math.max(0, Number(settings.slots_flex ?? 0) - spare),
  }
}

/**
 * Aggregate need across the owners picking before you.
 *
 * `owners` comes from `nextPickFor().interveningOwners` and repeats a team that
 * picks twice. Slot totals count every pick; `teamsNeeding` counts distinct
 * teams, because "3 of the 5 teams ahead of you need a TE" is the legible form.
 */
export function pressureFrom(
  owners: string[],
  picks: DraftPick[],
  players: PlayerPositions,
  settings: DraftSettings,
): PositionPressure {
  const distinct = [...new Set(owners)]
  const teamsNeeding: Record<string, number> = {}
  const openSlots: Record<string, number> = {}

  for (const owner of distinct) {
    const need = needFor(owner, picks, players, settings)
    for (const [position, unfilled] of Object.entries(need.dedicated)) {
      if (unfilled <= 0) continue
      teamsNeeding[position] = (teamsNeeding[position] ?? 0) + 1
      openSlots[position] = (openSlots[position] ?? 0) + unfilled
    }
  }

  return { teamsNeeding, openSlots, teams: distinct.length, picks: owners.length }
}

/**
 * A plain sentence for the assistant panel, or null when there is nothing
 * worth saying. Deliberately reports counts, never a probability.
 */
export function pressureSummary(pressure: PositionPressure, position: string): string | null {
  const needing = pressure.teamsNeeding[position] ?? 0
  if (!needing || !pressure.teams) return null
  const teamWord = needing === 1 ? 'team' : 'teams'
  return `${needing} of the ${pressure.teams} ${teamWord} before you still need ${position}`
}
