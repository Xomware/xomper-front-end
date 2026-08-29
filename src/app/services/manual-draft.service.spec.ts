/**
 * Tests for manual mark-off.
 *
 * This is the only way an ESPN, Yahoo or in-person draft gets tracked at all,
 * so the arithmetic has to hold under mis-taps. The case that matters most is
 * the duplicate: appending one would shift every later pick onto the wrong
 * team and silently corrupt opponent need for the rest of the draft.
 */
import {
  emptyManualDraft,
  isMyTurn,
  onTheClock,
  ownerForSlot,
  recordPick,
  searchAvailable,
  toDraftPicks,
  totalPicks,
  undoLastPick,
  ManualDraft,
  PlayerLookup,
} from './manual-draft.service'
import { DraftAssistantService } from './draft-assistant.service'

const PLAYERS: PlayerLookup = {
  rb1: { first_name: 'Bijan', last_name: 'Robinson', position: 'RB' },
  wr1: { first_name: 'JaMarr', last_name: 'Chase', position: 'WR' },
  wr2: { first_name: 'Will', last_name: 'Fuller', position: 'WR' },
  qb1: { first_name: 'Caleb', last_name: 'Williams', position: 'QB' },
  qb2: { first_name: 'Will', last_name: 'Levis', position: 'QB' },
}

function drafted(...ids: string[]): ManualDraft {
  return ids.reduce(recordPick, emptyManualDraft(12, 15, 3))
}

describe('turn tracking', () => {
  it('starts on slot 1', () => {
    expect(onTheClock(emptyManualDraft())).toBe(1)
  })

  it('follows the snake into round 2', () => {
    const draft = { ...emptyManualDraft(), picks: Array(12).fill(0).map((_, i) => `p${i}`) }
    // Pick 13 is slot 12 again — the wrap.
    expect(onTheClock(draft)).toBe(12)
  })

  it('knows when it is the user turn', () => {
    const mine = emptyManualDraft(12, 15, 3)
    expect(isMyTurn(mine)).toBe(false)
    expect(isMyTurn(recordPick(recordPick(mine, 'rb1'), 'wr1'))).toBe(true)
  })

  it('returns null once the board is full', () => {
    const full = { ...emptyManualDraft(2, 1, 1), picks: ['a', 'b'] }
    expect(onTheClock(full)).toBeNull()
  })
})

describe('recordPick', () => {
  it('appends in order', () => {
    expect(drafted('rb1', 'wr1').picks).toEqual(['rb1', 'wr1'])
  })

  it('refuses a duplicate', () => {
    // A double tap would shift every later pick onto the wrong team.
    const twice = recordPick(drafted('rb1'), 'rb1')
    expect(twice.picks).toEqual(['rb1'])
  })

  it('refuses an empty id', () => {
    expect(recordPick(emptyManualDraft(), '').picks).toEqual([])
  })

  it('refuses to overfill the board', () => {
    const full = { ...emptyManualDraft(2, 1, 1), picks: ['a', 'b'] }
    expect(recordPick(full, 'c').picks).toEqual(['a', 'b'])
  })

  it('does not mutate the input', () => {
    const before = emptyManualDraft()
    recordPick(before, 'rb1')
    expect(before.picks).toEqual([])
  })
})

describe('undoLastPick', () => {
  it('removes the most recent', () => {
    expect(undoLastPick(drafted('rb1', 'wr1')).picks).toEqual(['rb1'])
  })

  it('is safe on an empty board', () => {
    expect(undoLastPick(emptyManualDraft()).picks).toEqual([])
  })

  it('frees the player to be taken again', () => {
    const back = undoLastPick(drafted('rb1'))
    expect(recordPick(back, 'rb1').picks).toEqual(['rb1'])
  })
})

describe('toDraftPicks', () => {
  it('numbers picks from 1 and walks the snake', () => {
    const picks = toDraftPicks(drafted('rb1', 'wr1'), PLAYERS)
    expect(picks[0].pick_no).toBe(1)
    expect(picks[0].draft_slot).toBe(1)
    expect(picks[1].draft_slot).toBe(2)
  })

  it('carries position metadata the assistant reads', () => {
    expect(toDraftPicks(drafted('rb1'), PLAYERS)[0].metadata.position).toBe('RB')
  })

  it('tolerates a player missing from the lookup', () => {
    const picks = toDraftPicks(drafted('ghost'), PLAYERS)
    expect(picks[0].player_id).toBe('ghost')
    expect(picks[0].metadata.position).toBe('')
  })

  it('feeds positionCounts unchanged', () => {
    // The point of the whole module: a manual draft is not a second code path.
    const draft = drafted('rb1', 'wr1', 'qb1')
    const picks = toDraftPicks(draft, PLAYERS)
    const counts = new DraftAssistantService().positionCounts(
      picks,
      PLAYERS as never,
      ownerForSlot(1),
    )
    expect(counts['RB']).toBe(1)
  })
})

describe('searchAvailable', () => {
  const none = new Set<string>()

  it('is empty for an empty query', () => {
    expect(searchAvailable('  ', PLAYERS, none)).toEqual([])
  })

  it('matches on either name', () => {
    expect(searchAvailable('chase', PLAYERS, none)).toEqual(['wr1'])
    expect(searchAvailable('bijan', PLAYERS, none)).toEqual(['rb1'])
  })

  it('ranks a prefix hit above a mid-string one', () => {
    // "will" should reach Will Levis before Caleb Williams.
    expect(searchAvailable('will', PLAYERS, none)[0]).toBe('qb2')
  })

  it('hides players already taken', () => {
    expect(searchAvailable('chase', PLAYERS, new Set(['wr1']))).toEqual([])
  })

  it('is case insensitive', () => {
    expect(searchAvailable('CHASE', PLAYERS, none)).toEqual(['wr1'])
  })

  it('respects the limit', () => {
    expect(searchAvailable('will', PLAYERS, none, 1).length).toBe(1)
  })
})

describe('totalPicks', () => {
  it('is teams times rounds', () => {
    expect(totalPicks(emptyManualDraft(10, 16, 1))).toBe(160)
  })
})
