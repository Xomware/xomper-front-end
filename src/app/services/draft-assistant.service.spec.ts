/**
 * Tests for the draft assistant.
 *
 * The live draft board showed what had happened and nothing about what to do
 * next. This ranks who is left, so the ordering rules are the product — a
 * wrong order is a wrong recommendation at the moment someone is on the
 * clock.
 */
import { DraftAssistantService, emptyPrefs, BoardPrefs } from './draft-assistant.service'
import { MapValueBook, LeagueFormat } from '../models/value-book.model'
import { DraftPick } from '../models/draft.interface'

const FORMAT: LeagueFormat = {
  fingerprint: { isDynasty: true, numQbs: 1, numTeams: 12, ppr: 1 },
  clamps: [],
  unsupportedReasons: [],
  approximations: [],
  isKeeper: false,
  teBonus: 0,
  scoringSettings: { rec: 1 },
  rosterPositions: ['QB', 'RB', 'WR', 'TE'],
  leagueId: 'league-1',
  maxKeepers: 0,
  startingSlots: 4,
}

const PLAYERS = {
  rb1: { first_name: 'Best', last_name: 'Back', position: 'RB' },
  wr1: { first_name: 'Top', last_name: 'Receiver', position: 'WR' },
  qb1: { first_name: 'Good', last_name: 'Passer', position: 'QB' },
  te1: { first_name: 'Some', last_name: 'End', position: 'TE' },
  k1: { first_name: 'A', last_name: 'Kicker', position: 'K' },
  unpriced: { first_name: 'No', last_name: 'Value', position: 'WR' },
}

function book() {
  // `unpriced` and `k1` deliberately absent from the value map.
  return new MapValueBook(
    FORMAT,
    new Map([
      ['rb1', 9000],
      ['wr1', 8800],
      ['qb1', 8000],
      ['te1', 4000],
    ]),
    new Map([
      ['rb1', 'RB'],
      ['wr1', 'WR'],
      ['qb1', 'QB'],
      ['te1', 'TE'],
    ]),
    new Map(),
    new Map(),
    Date.now(),
  )
}

function pick(playerId: string, pickedBy: string, no = 1): DraftPick {
  return { player_id: playerId, picked_by: pickedBy, pick_no: no } as DraftPick
}

function prefs(overrides: Partial<BoardPrefs> = {}): BoardPrefs {
  return { ...emptyPrefs(), ...overrides }
}

describe('DraftAssistantService', () => {
  let service: DraftAssistantService

  beforeEach(() => (service = new DraftAssistantService()))

  it('ranks by raw value under best-available', () => {
    const board = service.suggest([], PLAYERS, book(), prefs(), 'me')

    expect(board.map((c) => c.playerId)).toEqual(['rb1', 'wr1', 'qb1', 'te1'])
  })

  it('removes players already drafted', () => {
    const board = service.suggest([pick('rb1', 'someone')], PLAYERS, book(), prefs(), 'me')

    expect(board.map((c) => c.playerId)).not.toContain('rb1')
  })

  it('ignores picks that have not resolved to a player', () => {
    const unresolved = { player_id: '', picked_by: 'x', pick_no: 1 } as DraftPick

    const board = service.suggest([unresolved], PLAYERS, book(), prefs(), 'me')

    // An empty player_id is a pick still on the clock, not a taken player.
    expect(board.length).toBe(4)
  })

  it('skips positions nobody drafts off a value board', () => {
    const board = service.suggest([], PLAYERS, book(), prefs(), 'me')

    expect(board.map((c) => c.playerId)).not.toContain('k1')
  })

  it('skips players this league cannot price', () => {
    const board = service.suggest([], PLAYERS, book(), prefs(), 'me')

    // An unknown value is not a zero-value player. Guessing would rank
    // someone the source simply does not cover.
    expect(board.map((c) => c.playerId)).not.toContain('unpriced')
  })

  it('lifts the weighted position under a positional preset', () => {
    const bpa = service.suggest([], PLAYERS, book(), prefs({ preset: 'qb-early' }), 'me')

    // qb1 is worth less than rb1 and wr1 raw; the preset is what moves it.
    expect(bpa[0].playerId).toBe('qb1')
    expect(bpa[0].reason).toBe('QB early')
  })

  it('leaves the order alone for positions a preset does not weight', () => {
    const board = service.suggest([], PLAYERS, book(), prefs({ preset: 'rb-heavy' }), 'me')

    expect(board[0].playerId).toBe('rb1')
    expect(board.find((c) => c.playerId === 'wr1')?.reason).toBe('Best available')
  })

  it('counts only my own picks when working out needs', () => {
    const picks = [pick('rb1', 'someone-else'), pick('wr1', 'me')]

    const counts = service.positionCounts(picks, PLAYERS, 'me')

    expect(counts).toEqual({ WR: 1 })
  })

  it('weights positions I am short of under the needs preset', () => {
    const board = service.suggest([], PLAYERS, book(), prefs({ preset: 'needs' }), 'me')

    expect(board[0].reason).toBe('You need RB')
  })

  it('stops weighting a position once I have enough', () => {
    // Target for TE is 2; take two so it is no longer a need.
    const picks = [pick('te1', 'me', 1), pick('other-te', 'me', 2)]
    const withTe = { ...PLAYERS, 'other-te': { position: 'TE' } }

    const board = service.suggest(picks, withTe, book(), prefs({ preset: 'needs' }), 'me')
    const te = board.find((c) => c.position === 'TE')

    expect(te).toBeUndefined() // te1 is drafted; nothing else at TE is priced
    expect(service.positionCounts(picks, withTe, 'me')['TE']).toBe(2)
  })

  it('floats a liked player above everyone', () => {
    const board = service.suggest(
      [],
      PLAYERS,
      book(),
      prefs({ likes: new Set(['te1']) }),
      'me',
    )

    // te1 is the cheapest player on the board. The user's own read wins.
    expect(board[0].playerId).toBe('te1')
    expect(board[0].reason).toBe('On your list')
  })

  it('buries a disliked player below everyone', () => {
    const board = service.suggest(
      [],
      PLAYERS,
      book(),
      prefs({ dislikes: new Set(['rb1']) }),
      'me',
    )

    expect(board[board.length - 1].playerId).toBe('rb1')
    expect(board[board.length - 1].reason).toBe('Buried by you')
  })

  it('lets a like beat a dislike-free preset', () => {
    const board = service.suggest(
      [],
      PLAYERS,
      book(),
      prefs({ preset: 'qb-early', likes: new Set(['te1']) }),
      'me',
    )

    expect(board[0].playerId).toBe('te1')
  })

  it('caps the board', () => {
    const board = service.suggest([], PLAYERS, book(), prefs(), 'me', 2)

    // A draft pool is thousands deep and nobody scrolls it mid-pick.
    expect(board.length).toBe(2)
  })

  it('carries the raw value alongside the weighted score', () => {
    const board = service.suggest([], PLAYERS, book(), prefs({ preset: 'qb-early' }), 'me')
    const qb = board.find((c) => c.playerId === 'qb1')!

    // The user sees what the player is actually worth, not just our number.
    expect(qb.value).toBe(8000)
    expect(qb.score).toBeGreaterThan(qb.value)
  })

  it('works with no signed-in user', () => {
    const board = service.suggest([], PLAYERS, book(), prefs({ preset: 'needs' }), null)

    // Guest viewing a draft: no needs to compute, but the board still ranks.
    expect(board.length).toBe(4)
  })
})

/**
 * Reported live: "why does it show best available and its players that arent
 * available in my dynasty league".
 *
 * The board excluded only players drafted in THIS draft. In a dynasty league
 * almost nobody in the pool is free -- they were drafted in an earlier season
 * and kept, so they never appear in this draft's picks.
 */
describe('DraftAssistantService availability in a keeper league', () => {
  const service = new DraftAssistantService()

  const playerMap = {
    p1: { position: 'RB', first_name: 'A', last_name: 'One' },
    p2: { position: 'WR', first_name: 'B', last_name: 'Two' },
    p3: { position: 'QB', first_name: 'C', last_name: 'Three' },
  } as never

  const book = {
    playerIds: ['p1', 'p2', 'p3'],
    value: (id: string) => ({ known: true, value: { p1: 30, p2: 20, p3: 10 }[id] ?? 0 }),
    position: (id: string) => ({ p1: 'RB', p2: 'WR', p3: 'QB' }[id] ?? ''),
  } as never

  const prefs = { preset: 'bpa', likes: new Set<string>(), dislikes: new Set<string>() } as never

  it('collects every rostered player id', () => {
    const ids = service.rosteredIds([
      { players: ['p1', 'p2'] },
      { players: ['p3'] },
    ])

    expect([...ids].sort()).toEqual(['p1', 'p2', 'p3'])
  })

  it('survives a roster with no players', () => {
    expect(service.rosteredIds([{ players: null }, {}]).size).toBe(0)
  })

  it('leaves rostered players off the board', () => {
    const rostered = service.rosteredIds([{ players: ['p1'] }])

    const board = service.suggest([], playerMap, book, prefs, null, 25, rostered)

    // p1 is the highest value in the book and would otherwise lead the board
    // while sitting on someone's dynasty roster.
    expect(board.map((c) => c.playerId)).toEqual(['p2', 'p3'])
  })

  it('still excludes players drafted in this draft', () => {
    const picks = [{ player_id: 'p2' }] as never

    const board = service.suggest(picks, playerMap, book, prefs, null, 25, new Set())

    expect(board.map((c) => c.playerId)).toEqual(['p1', 'p3'])
  })

  it('excludes both sources at once', () => {
    const picks = [{ player_id: 'p2' }] as never
    const rostered = service.rosteredIds([{ players: ['p1'] }])

    const board = service.suggest(picks, playerMap, book, prefs, null, 25, rostered)

    expect(board.map((c) => c.playerId)).toEqual(['p3'])
  })

  it('offers everyone in a startup draft, where nobody is rostered yet', () => {
    const board = service.suggest([], playerMap, book, prefs, null, 25, new Set())

    expect(board.map((c) => c.playerId)).toEqual(['p1', 'p2', 'p3'])
  })
})
