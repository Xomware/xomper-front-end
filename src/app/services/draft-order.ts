/**
 * Snake-draft ownership and next-pick math.
 *
 * The live board already resolves who owns a cell for display, but it maps to
 * team *names*, which cannot answer "when do I pick again". This maps to user
 * ids instead, so the assistant can ask how many picks it has to survive.
 *
 * Pure module, no Angular. Snake formula verified against all 192 picks of a
 * real 12-team/16-round Sleeper draft.
 */
import { TradedPick } from './league.service'
import { Roster } from '../models/roster.interface'

export interface DraftOrderInput {
  /** Sleeper's draft_order: userId → slot. */
  draftOrder: Record<string, number> | null
  tradedPicks: TradedPick[]
  rosters: Roster[]
  teams: number
  rounds: number
  /** Sleeper's reversal_round. 0 means no reversal. */
  reversalRound?: number
}

export interface NextPick {
  pickNo: number
  round: number
  slot: number
  /** Owners picking between `afterPickNo` and this pick, in pick order. Repeats. */
  interveningOwners: string[]
  /** How many picks elapse before this one. */
  gap: number
}

/**
 * Which slot picks Nth in a round.
 *
 * Without a reversal round this is a plain snake: odd rounds ascend, even
 * rounds descend. `reversalRound` is Sleeper's third-round-reversal knob — from
 * that round on, the round that would have ascended descends instead, so the
 * team at slot 1 does not get both the turn and the wrap.
 */
function ascends(round: number, reversalRound: number): boolean {
  if (reversalRound > 0 && round >= reversalRound) {
    return (round - reversalRound) % 2 === 1
  }
  return round % 2 === 1
}

/** Overall pick number for a round/slot. 1-indexed. */
export function overallPickNo(
  round: number,
  slot: number,
  teams: number,
  reversalRound = 0,
): number {
  const offset = ascends(round, reversalRound) ? slot : teams + 1 - slot
  return (round - 1) * teams + offset
}

/** The round/slot that owns an overall pick number. Inverse of overallPickNo. */
export function roundSlotForPick(
  pickNo: number,
  teams: number,
  reversalRound = 0,
): { round: number; slot: number } {
  const round = Math.floor((pickNo - 1) / teams) + 1
  const offset = pickNo - (round - 1) * teams
  const slot = ascends(round, reversalRound) ? offset : teams + 1 - offset
  return { round, slot }
}

/**
 * userId that owns each (round, slot) once trades are applied.
 *
 * Sleeper records traded picks by roster_id, so the original owner is resolved
 * roster → user → slot, then that round's slot is reassigned to the new owner.
 */
export function ownershipByRound(input: DraftOrderInput): Map<number, Map<number, string>> {
  const owners = new Map<number, Map<number, string>>()
  if (!input.draftOrder) return owners

  const slotToUser = new Map<number, string>()
  for (const [userId, slot] of Object.entries(input.draftOrder)) slotToUser.set(slot, userId)

  for (let round = 1; round <= input.rounds; round++) {
    const forRound = new Map<number, string>()
    for (const [slot, userId] of slotToUser) forRound.set(slot, userId)
    owners.set(round, forRound)
  }

  const rosterToUser = new Map<number, string>()
  for (const r of input.rosters) if (r.owner_id) rosterToUser.set(r.roster_id, r.owner_id)

  const userToSlot = new Map<string, number>()
  for (const [userId, slot] of Object.entries(input.draftOrder)) userToSlot.set(userId, slot)

  for (const tp of input.tradedPicks) {
    const originalUser = rosterToUser.get(tp.previous_owner_id)
    const newUser = rosterToUser.get(tp.owner_id)
    if (!originalUser || !newUser) continue
    const slot = userToSlot.get(originalUser)
    if (slot == null) continue
    owners.get(tp.round)?.set(slot, newUser)
  }

  return owners
}

/** Owner of a given overall pick, or null if it falls outside the draft. */
export function ownerOfPick(pickNo: number, input: DraftOrderInput): string | null {
  if (pickNo < 1 || pickNo > input.teams * input.rounds) return null
  const { round, slot } = roundSlotForPick(pickNo, input.teams, input.reversalRound ?? 0)
  return ownershipByRound(input).get(round)?.get(slot) ?? null
}

/**
 * The user's next pick strictly after `afterPickNo`, with everyone who picks
 * in between. Returns null once they have no picks left.
 *
 * `afterPickNo` is the last pick already made, so 0 means the draft has not
 * started and the user's first pick is still ahead of them.
 */
export function nextPickFor(
  userId: string,
  afterPickNo: number,
  input: DraftOrderInput,
): NextPick | null {
  const owners = ownershipByRound(input)
  const total = input.teams * input.rounds
  const reversal = input.reversalRound ?? 0

  const ownerAt = (pickNo: number): string | null => {
    const { round, slot } = roundSlotForPick(pickNo, input.teams, reversal)
    return owners.get(round)?.get(slot) ?? null
  }

  const intervening: string[] = []
  for (let pickNo = afterPickNo + 1; pickNo <= total; pickNo++) {
    const owner = ownerAt(pickNo)
    if (owner === userId) {
      const { round, slot } = roundSlotForPick(pickNo, input.teams, reversal)
      return { pickNo, round, slot, interveningOwners: intervening, gap: pickNo - afterPickNo }
    }
    if (owner) intervening.push(owner)
  }
  return null
}
