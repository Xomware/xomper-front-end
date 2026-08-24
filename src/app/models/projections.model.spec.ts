/**
 * Unit tests for the projections scoring math.
 *
 * This is what replaces "borrow values from a nearby format" with "compute
 * this league's actual scoring", so the dot product has to be exact.
 */
import {
  ProjectedPlayer,
  isStartingSlot,
  parseProjection,
  projectedPoints,
  slotEligibility,
} from './projections.model'

function player(
  position: string,
  stats: Record<string, number>,
  id = 'p1',
): ProjectedPlayer {
  return { playerId: id, position, name: 'Test Player', team: 'TST', stats }
}

describe('parseProjection', () => {
  it('builds a display name from first and last name', () => {
    const p = parseProjection({
      player_id: '4984',
      player: { position: 'QB', first_name: 'Josh', last_name: 'Allen' },
      stats: { pass_yd: 4000 },
    })
    expect(p.name).toBe('Josh Allen')
    expect(p.position).toBe('QB')
    expect(p.stats['pass_yd']).toBe(4000)
  })

  it('falls back to the id when no name is present', () => {
    const p = parseProjection({ player_id: '999', player: null, stats: null })
    expect(p.name).toBe('Player #999')
    expect(p.stats).toEqual({})
  })
})

describe('projectedPoints', () => {
  it('computes a dot product over matching stat keys', () => {
    const result = projectedPoints(
      player('WR', { rec: 100, rec_yd: 1200, rec_td: 8 }),
      { rec: 1, rec_yd: 0.1, rec_td: 6 },
      1,
    )
    // 100*1 + 1200*0.1 + 8*6 = 268
    expect(result.points).toBeCloseTo(268, 5)
    expect(result.usedFallback).toBe(false)
  })

  it('applies half-PPR exactly rather than snapping to a nearby format', () => {
    const wr = player('WR', { rec: 100, rec_yd: 1000 })
    const full = projectedPoints(wr, { rec: 1, rec_yd: 0.1 }, 1)
    const half = projectedPoints(wr, { rec: 0.5, rec_yd: 0.1 }, 0.5)
    expect(full.points - half.points).toBeCloseTo(50, 5)
  })

  it('applies TE premium as arithmetic, not an approximation', () => {
    const te = player('TE', { rec: 90, rec_yd: 1000 })
    const plain = projectedPoints(te, { rec: 1, rec_yd: 0.1 }, 1)
    const premium = projectedPoints(te, { rec: 1, rec_yd: 0.1, bonus_rec_te: 0.5 }, 1)
    // bonus_rec_te has no matching stat key of its own; it multiplies nothing
    // unless the projection carries it. Confirm we don't silently invent it.
    expect(premium.points).toBe(plain.points)
    expect(premium.ignoredKeys).toContain('bonus_rec_te')
  })

  it('reports scoring keys the projections do not carry', () => {
    const result = projectedPoints(
      player('WR', { rec: 100 }),
      { rec: 1, pts_allow_35p: -4, st_td: 6 },
      1,
    )
    expect(result.ignoredKeys.sort()).toEqual(['pts_allow_35p', 'st_td'])
  })

  it('ignores a zero-weighted rule without reporting it', () => {
    const result = projectedPoints(player('WR', { rec: 10 }), { rec: 1, fum: 0 }, 1)
    expect(result.ignoredKeys).toEqual([])
  })

  it('uses the precomputed total for kickers', () => {
    const result = projectedPoints(
      player('K', { pts_ppr: 140, fgm_40_49: 8 }),
      { fgm_40_49: 4, fgm_0_19: 3 },
      1,
    )
    expect(result.points).toBe(140)
    expect(result.usedFallback).toBe(true)
  })

  it('uses the precomputed total for defenses', () => {
    const result = projectedPoints(
      player('DEF', { pts_std: 120 }),
      { sack: 1, pts_allow_0: 10 },
      0,
    )
    expect(result.points).toBe(120)
    expect(result.usedFallback).toBe(true)
  })

  it('picks the precomputed total matching the league PPR setting', () => {
    const k = player('K', { pts_std: 100, pts_half_ppr: 110, pts_ppr: 120 })
    expect(projectedPoints(k, {}, 0).points).toBe(100)
    expect(projectedPoints(k, {}, 0.5).points).toBe(110)
    expect(projectedPoints(k, {}, 1).points).toBe(120)
  })

  it('falls back when no scoring key matches at all', () => {
    const result = projectedPoints(
      player('WR', { pts_ppr: 90 }),
      { some_unknown_rule: 5 },
      1,
    )
    expect(result.points).toBe(90)
    expect(result.usedFallback).toBe(true)
  })

  it('scores an empty projection as zero rather than throwing', () => {
    expect(projectedPoints(player('WR', {}), { rec: 1 }, 1).points).toBe(0)
  })
})

describe('slotEligibility', () => {
  it('maps dedicated slots to a single position', () => {
    expect(slotEligibility('QB')).toEqual(['QB'])
    expect(slotEligibility('TE')).toEqual(['TE'])
  })

  it('maps FLEX to RB/WR/TE', () => {
    expect(slotEligibility('FLEX')).toEqual(['RB', 'WR', 'TE'])
  })

  it('maps SUPER_FLEX to include QB', () => {
    expect(slotEligibility('SUPER_FLEX')).toContain('QB')
  })

  it('returns nothing for bench and unknown slots', () => {
    expect(slotEligibility('BN')).toEqual([])
    expect(slotEligibility('WHATEVER')).toEqual([])
  })
})

describe('isStartingSlot', () => {
  it('excludes bench, IR and taxi', () => {
    expect(isStartingSlot('BN')).toBe(false)
    expect(isStartingSlot('IR')).toBe(false)
    expect(isStartingSlot('TAXI')).toBe(false)
  })

  it('includes real starting slots', () => {
    expect(isStartingSlot('QB')).toBe(true)
    expect(isStartingSlot('SUPER_FLEX')).toBe(true)
    expect(isStartingSlot('K')).toBe(true)
  })
})
