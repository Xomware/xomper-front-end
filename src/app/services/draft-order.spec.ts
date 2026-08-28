/**
 * Tests for snake ownership and next-pick math.
 *
 * The round/slot fixtures are real: taken from a completed 12-team, 16-round
 * Sleeper draft (CLIT Fantasy Football 2025, reversal_round 0). The formula was
 * checked against all 192 of its picks with zero mismatches, so these spot
 * checks are pinning known-good values, not restating the implementation.
 */
import {
  overallPickNo,
  roundSlotForPick,
  ownershipByRound,
  ownerOfPick,
  nextPickFor,
  DraftOrderInput,
} from './draft-order'
import { Roster } from '../models/roster.interface'
import { TradedPick } from './league.service'

const TEAMS = 12
const ROUNDS = 16

/** userId 'u1'..'u12' sitting in slots 1..12. */
const DRAFT_ORDER: Record<string, number> = {}
for (let s = 1; s <= TEAMS; s++) DRAFT_ORDER[`u${s}`] = s

/** roster_id N belongs to userId uN, so trades are easy to read. */
const ROSTERS = Array.from({ length: TEAMS }, (_, i) => ({
  roster_id: i + 1,
  owner_id: `u${i + 1}`,
})) as unknown as Roster[]

function input(over: Partial<DraftOrderInput> = {}): DraftOrderInput {
  return {
    draftOrder: DRAFT_ORDER,
    tradedPicks: [],
    rosters: ROSTERS,
    teams: TEAMS,
    rounds: ROUNDS,
    reversalRound: 0,
    ...over,
  }
}

describe('overallPickNo', () => {
  // Real (pick, round, slot) triples from the CLIT draft.
  const REAL: Array<[number, number, number]> = [
    [1, 1, 1], [2, 1, 2], [12, 1, 12],
    [13, 2, 12], [14, 2, 11], [24, 2, 1],
    [25, 3, 1], [26, 3, 2], [36, 3, 12],
    [37, 4, 12], [180, 15, 12], [192, 16, 1],
  ]

  it('matches a real 12-team snake draft', () => {
    for (const [pick, round, slot] of REAL) {
      expect(overallPickNo(round, slot, TEAMS)).toBe(pick)
    }
  })

  it('round-trips through roundSlotForPick for every pick in the draft', () => {
    for (let pick = 1; pick <= TEAMS * ROUNDS; pick++) {
      const { round, slot } = roundSlotForPick(pick, TEAMS)
      expect(overallPickNo(round, slot, TEAMS)).toBe(pick)
    }
  })

  it('reverses from the reversal round on', () => {
    // Third-round reversal: round 3 repeats round 2's direction instead of
    // handing slot 1 both the turn and the wrap.
    expect(overallPickNo(2, 12, TEAMS, 3)).toBe(13)
    expect(overallPickNo(3, 12, TEAMS, 3)).toBe(25)
    expect(overallPickNo(3, 1, TEAMS, 3)).toBe(36)
    expect(overallPickNo(4, 1, TEAMS, 3)).toBe(37)
  })
})

describe('ownershipByRound', () => {
  it('gives every slot its drafting user when nothing is traded', () => {
    const owners = ownershipByRound(input())
    expect(owners.get(1)!.get(1)).toBe('u1')
    expect(owners.get(16)!.get(12)).toBe('u12')
  })

  it('reassigns only the traded round', () => {
    // u3 sent their round-4 pick to u7.
    const traded = [
      { season: '2025', round: 4, roster_id: 3, previous_owner_id: 3, owner_id: 7 },
    ] as TradedPick[]
    const owners = ownershipByRound(input({ tradedPicks: traded }))
    expect(owners.get(4)!.get(3)).toBe('u7')
    expect(owners.get(3)!.get(3)).toBe('u3')
    expect(owners.get(5)!.get(3)).toBe('u3')
  })

  it('is empty when the draft order is not set yet', () => {
    expect(ownershipByRound(input({ draftOrder: null })).size).toBe(0)
  })
})

describe('ownerOfPick', () => {
  it('resolves through the snake', () => {
    expect(ownerOfPick(1, input())).toBe('u1')
    expect(ownerOfPick(13, input())).toBe('u12')
    expect(ownerOfPick(24, input())).toBe('u1')
  })

  it('returns null outside the draft', () => {
    expect(ownerOfPick(0, input())).toBeNull()
    expect(ownerOfPick(TEAMS * ROUNDS + 1, input())).toBeNull()
  })
})

describe('nextPickFor', () => {
  it('finds the first pick before the draft starts', () => {
    const next = nextPickFor('u5', 0, input())!
    expect(next.pickNo).toBe(5)
    expect(next.gap).toBe(5)
    expect(next.interveningOwners).toEqual(['u1', 'u2', 'u3', 'u4'])
  })

  it('walks the turn at the snake wrap', () => {
    // u12 picks 12 and 13 back to back.
    const next = nextPickFor('u12', 12, input())!
    expect(next.pickNo).toBe(13)
    expect(next.gap).toBe(1)
    expect(next.interveningOwners).toEqual([])
  })

  it('reports the long wait across a round boundary', () => {
    // u1 picks 1, then waits until 24.
    const next = nextPickFor('u1', 1, input())!
    expect(next.pickNo).toBe(24)
    expect(next.gap).toBe(23)
    expect(next.interveningOwners.length).toBe(22)
    expect(next.interveningOwners).not.toContain('u1')
  })

  it('follows a traded pick to its new owner', () => {
    const traded = [
      { season: '2025', round: 2, roster_id: 1, previous_owner_id: 1, owner_id: 7 },
    ] as TradedPick[]
    // Slot 1 in round 2 is pick 24, now owned by u7 rather than u1.
    const forU7 = nextPickFor('u7', 13, input({ tradedPicks: traded }))!
    expect(forU7.pickNo).toBe(18)
    const afterOwn = nextPickFor('u7', 18, input({ tradedPicks: traded }))!
    expect(afterOwn.pickNo).toBe(24)

    // u1 lost that pick, so their next is in round 3.
    const forU1 = nextPickFor('u1', 1, input({ tradedPicks: traded }))!
    expect(forU1.pickNo).toBe(25)
  })

  it('returns null once the user is out of picks', () => {
    expect(nextPickFor('u1', TEAMS * ROUNDS, input())).toBeNull()
  })

  it('returns null for a user who is not in the draft', () => {
    expect(nextPickFor('nobody', 0, input())).toBeNull()
  })
})
