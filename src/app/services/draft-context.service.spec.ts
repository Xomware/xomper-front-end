/**
 * Tests for opponent roster need.
 *
 * The value of this is that it states facts — unfilled slots — rather than
 * predicting who gets taken. The tests pin the arithmetic that makes those
 * facts true, especially FLEX, which is the part that quietly goes wrong: a
 * team with a spare RB does not need a flex body.
 */
import {
  needFor,
  pressureFrom,
  pressureSummary,
  PlayerPositions,
} from './draft-context.service'
import { DraftPick, DraftSettings } from '../models/draft.interface'

const SETTINGS = {
  teams: 12,
  slots_qb: 1,
  slots_rb: 2,
  slots_wr: 2,
  slots_te: 1,
  slots_k: 1,
  slots_def: 1,
  slots_flex: 1,
  slots_bn: 6,
  rounds: 15,
  pick_timer: 0,
} as DraftSettings

const PLAYERS: PlayerPositions = {
  qb1: { position: 'QB' },
  rb1: { position: 'RB' },
  rb2: { position: 'RB' },
  rb3: { position: 'RB' },
  wr1: { position: 'WR' },
  te1: { position: 'TE' },
  unknown: {},
}

function pick(userId: string, playerId: string): DraftPick {
  return { picked_by: userId, player_id: playerId } as DraftPick
}

describe('needFor', () => {
  it('reports every starter slot as open on an empty roster', () => {
    const need = needFor('u1', [], PLAYERS, SETTINGS)
    expect(need.dedicated).toEqual({ QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 })
    expect(need.flex).toBe(1)
  })

  it('counts only the given user', () => {
    const picks = [pick('u2', 'rb1'), pick('u2', 'rb2')]
    expect(needFor('u1', picks, PLAYERS, SETTINGS).dedicated['RB']).toBe(2)
    expect(needFor('u2', picks, PLAYERS, SETTINGS).dedicated['RB']).toBe(0)
  })

  it('fills dedicated slots before flex', () => {
    // Two RBs exactly cover the two RB slots, so FLEX is still open.
    const need = needFor('u1', [pick('u1', 'rb1'), pick('u1', 'rb2')], PLAYERS, SETTINGS)
    expect(need.dedicated['RB']).toBe(0)
    expect(need.flex).toBe(1)
  })

  it('spends a spare flex-eligible player on FLEX', () => {
    const picks = [pick('u1', 'rb1'), pick('u1', 'rb2'), pick('u1', 'rb3')]
    const need = needFor('u1', picks, PLAYERS, SETTINGS)
    expect(need.dedicated['RB']).toBe(0)
    expect(need.flex).toBe(0)
  })

  it('does not let a spare QB fill FLEX', () => {
    const two = { ...PLAYERS, qb2: { position: 'QB' } }
    const picks = [pick('u1', 'qb1'), pick('u1', 'qb2')]
    expect(needFor('u1', picks, two, SETTINGS).flex).toBe(1)
  })

  it('never goes negative', () => {
    const picks = [pick('u1', 'rb1'), pick('u1', 'rb2'), pick('u1', 'rb3')]
    expect(needFor('u1', picks, PLAYERS, SETTINGS).dedicated['RB']).toBe(0)
  })

  it('ignores picks whose player has no position', () => {
    const need = needFor('u1', [pick('u1', 'unknown')], PLAYERS, SETTINGS)
    expect(need.dedicated['RB']).toBe(2)
  })
})

describe('pressureFrom', () => {
  it('counts distinct teams but every pick', () => {
    // u2 picks twice before our next turn.
    const p = pressureFrom(['u2', 'u3', 'u2'], [], PLAYERS, SETTINGS)
    expect(p.teams).toBe(2)
    expect(p.picks).toBe(3)
  })

  it('totals open slots across teams', () => {
    const p = pressureFrom(['u2', 'u3'], [], PLAYERS, SETTINGS)
    expect(p.teamsNeeding['RB']).toBe(2)
    expect(p.openSlots['RB']).toBe(4)
  })

  it('drops a position once every team ahead has filled it', () => {
    const picks = [
      pick('u2', 'qb1'),
      pick('u3', 'qb1'),
    ]
    const p = pressureFrom(['u2', 'u3'], picks, PLAYERS, SETTINGS)
    expect(p.teamsNeeding['QB']).toBeUndefined()
    expect(p.teamsNeeding['RB']).toBe(2)
  })

  it('is empty when nobody picks before you', () => {
    const p = pressureFrom([], [], PLAYERS, SETTINGS)
    expect(p).toEqual({ teamsNeeding: {}, openSlots: {}, teams: 0, picks: 0 })
  })
})

describe('pressureSummary', () => {
  it('reads as a plain sentence', () => {
    const p = pressureFrom(['u2', 'u3', 'u4'], [], PLAYERS, SETTINGS)
    expect(pressureSummary(p, 'TE')).toBe('3 of the 3 teams before you still need TE')
  })

  it('singularises one team', () => {
    const p = pressureFrom(['u2'], [], PLAYERS, SETTINGS)
    expect(pressureSummary(p, 'TE')).toBe('1 of the 1 team before you still need TE')
  })

  it('says nothing when no team needs the position', () => {
    const p = pressureFrom(['u2'], [pick('u2', 'qb1')], PLAYERS, SETTINGS)
    expect(pressureSummary(p, 'QB')).toBeNull()
  })

  it('says nothing when nobody picks before you', () => {
    expect(pressureSummary(pressureFrom([], [], PLAYERS, SETTINGS), 'RB')).toBeNull()
  })
})
