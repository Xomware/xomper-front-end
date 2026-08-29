/**
 * Drafting somewhere we cannot read.
 *
 * ESPN, Yahoo, CBS and a room with a whiteboard all have the same problem: no
 * live pick feed. Rather than integrate with each, the user taps players off as
 * they go and everything downstream behaves as if the picks arrived normally.
 *
 * The whole design constraint is that this emits `DraftPick[]`. `suggest()`,
 * `draftedIds()`, `positionCounts()` and `pressureFrom()` then work untouched —
 * a manual draft is not a second code path through the assistant, it is the
 * same one with a different source of picks.
 *
 * Pure module, no Angular. Persistence is the caller's job.
 */
import { DraftPick } from '../models/draft.interface'
import { roundSlotForPick } from './draft-order'

export interface ManualDraft {
  teams: number
  rounds: number
  /** Which slot the user drafts from, 1-indexed. */
  mySlot: number
  /** Sleeper's third-round-reversal knob. 0 means a plain snake. */
  reversalRound: number
  /** Player ids in the order taken. Index 0 is overall pick 1. */
  picks: string[]
}

export interface PlayerLookup {
  [playerId: string]: { first_name?: string; last_name?: string; position?: string }
}

/**
 * Synthetic owner id for a draft slot.
 *
 * Opponent need is derived by comparing `pick.picked_by` across teams, so the
 * ids only have to be stable and distinct — there are no real accounts here.
 */
export function ownerForSlot(slot: number): string {
  return `slot-${slot}`
}

export function emptyManualDraft(teams = 12, rounds = 15, mySlot = 1): ManualDraft {
  return { teams, rounds, mySlot, reversalRound: 0, picks: [] }
}

export function totalPicks(draft: ManualDraft): number {
  return draft.teams * draft.rounds
}

/** Whose turn it is, or null once the board is full. */
export function onTheClock(draft: ManualDraft): number | null {
  const next = draft.picks.length + 1
  if (next > totalPicks(draft)) return null
  return roundSlotForPick(next, draft.teams, draft.reversalRound).slot
}

export function isMyTurn(draft: ManualDraft): boolean {
  return onTheClock(draft) === draft.mySlot
}

/**
 * Record a pick. Returns the draft unchanged if the player is already gone or
 * the board is full.
 *
 * Rejecting a duplicate rather than appending it matters: a double tap during a
 * fast round would otherwise shift every subsequent pick to the wrong team and
 * silently corrupt opponent need for the rest of the draft.
 */
export function recordPick(draft: ManualDraft, playerId: string): ManualDraft {
  if (!playerId) return draft
  if (draft.picks.length >= totalPicks(draft)) return draft
  if (draft.picks.includes(playerId)) return draft
  return { ...draft, picks: [...draft.picks, playerId] }
}

/** Undo the last pick. Mis-taps happen at speed and there is no other way back. */
export function undoLastPick(draft: ManualDraft): ManualDraft {
  if (!draft.picks.length) return draft
  return { ...draft, picks: draft.picks.slice(0, -1) }
}

/**
 * The picks so far, in the shape the rest of the assistant already reads.
 */
export function toDraftPicks(draft: ManualDraft, players: PlayerLookup): DraftPick[] {
  return draft.picks.map((playerId, index) => {
    const pickNo = index + 1
    const { round, slot } = roundSlotForPick(pickNo, draft.teams, draft.reversalRound)
    const player = players[playerId] ?? {}

    return {
      player_id: playerId,
      picked_by: ownerForSlot(slot),
      roster_id: String(slot),
      round,
      draft_slot: slot,
      pick_no: pickNo,
      is_keeper: null,
      draft_id: 'manual',
      metadata: {
        first_name: player.first_name ?? '',
        last_name: player.last_name ?? '',
        position: player.position ?? '',
        player_id: playerId,
        team: '',
        status: '',
        sport: 'nfl',
        number: '',
        news_updated: '',
        injury_status: '',
      },
    }
  })
}

/**
 * Players still on the board, ranked by a search string.
 *
 * Substring rather than fuzzy: at ten seconds a pick the user is typing a name
 * they already know, and fuzzy matching mostly surfaces surprises. A prefix hit
 * outranks a mid-string one so "will" reaches Will Levis before Caleb Williams.
 */
export function searchAvailable(
  query: string,
  players: PlayerLookup,
  drafted: Set<string>,
  limit = 20,
): string[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  const hits: Array<{ id: string; rank: number }> = []
  for (const [playerId, player] of Object.entries(players)) {
    if (drafted.has(playerId)) continue
    const name = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim().toLowerCase()
    if (!name) continue
    const at = name.indexOf(needle)
    if (at < 0) continue
    hits.push({ id: playerId, rank: at === 0 ? 0 : 1 })
  }

  return hits
    .sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((hit) => hit.id)
}
