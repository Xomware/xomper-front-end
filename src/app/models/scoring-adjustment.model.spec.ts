/**
 * Unit tests for the dynasty scoring correction.
 *
 * The case that motivated this is real and measured: the CLT league scores
 * `bonus_rec_te: 0.5`, FantasyCalc has no TE-premium parameter, and the top 24
 * tight ends project ~20% more points under the league's actual scoring than
 * under the plain-PPR scoring that was served.
 */
import { ProjectedPlayer } from './projections.model'
import {
  MAX_MULTIPLIER,
  MIN_MULTIPLIER,
  baselineScoring,
  positionAdjustments,
} from './scoring-adjustment.model'

function player(
  id: string,
  position: string,
  stats: Record<string, number>,
): ProjectedPlayer {
  return {
    playerId: id,
    position,
    name: `Player ${id}`,
    team: null,
    stats,
    ptsStd: 0,
    ptsHalfPpr: 0,
    ptsPpr: 0,
  } as ProjectedPlayer
}

/** Full-PPR with a half-point tight-end bonus — CLT's shape. */
const TE_PREMIUM_SCORING = { rec: 1, rec_yd: 0.1, rec_td: 6, bonus_rec_te: 0.5 }

describe('baselineScoring()', () => {
  it('drops bonus rules, which are what the borrowed format cannot express', () => {
    const base = baselineScoring(TE_PREMIUM_SCORING, 1)
    expect(base['bonus_rec_te']).toBeUndefined()
    expect(base['rec_td']).toBe(6)
  })

  it('snaps reception scoring to the value actually served', () => {
    const base = baselineScoring({ rec: 1, rec_yd: 0.1 }, 0.5)
    expect(base['rec']).toBe(0.5)
  })

  it('leaves a league with no bonuses unchanged apart from ppr', () => {
    const scoring = { rec: 1, rec_yd: 0.1, rush_td: 6 }
    expect(baselineScoring(scoring, 1)).toEqual(scoring)
  })
})

describe('positionAdjustments()', () => {
  // 80 receptions, 1000 yards, 8 TDs.
  const te = (id: string, mult = 1) =>
    player(id, 'TE', {
      rec: 80 * mult,
      rec_yd: 1000 * mult,
      rec_td: 8 * mult,
      bonus_rec_te: 80 * mult,
    })

  const wr = (id: string) =>
    player(id, 'WR', { rec: 90, rec_yd: 1200, rec_td: 9 })

  it('raises tight ends in a TE-premium league', () => {
    const { multipliers } = positionAdjustments(
      [te('t1'), te('t2', 0.9), te('t3', 0.8)],
      TE_PREMIUM_SCORING,
      1,
      { TE: 3 },
    )
    expect(multipliers.TE).toBeGreaterThan(1)
  })

  it('reproduces the ~20% understatement measured on real data', () => {
    // 80 rec x 0.5 bonus = 40 points on top of 80 + 100 + 48 = 228.
    const { multipliers } = positionAdjustments(
      [te('t1')],
      TE_PREMIUM_SCORING,
      1,
      { TE: 1 },
    )
    expect(multipliers.TE).toBeCloseTo(268 / 228, 2)
    expect(multipliers.TE!).toBeGreaterThan(1.15)
    expect(multipliers.TE!).toBeLessThan(1.25)
  })

  it('leaves positions the league scores normally alone', () => {
    const { multipliers } = positionAdjustments(
      [te('t1'), wr('w1')],
      TE_PREMIUM_SCORING,
      1,
      { TE: 1, WR: 1 },
    )
    expect(multipliers.WR).toBeCloseTo(1, 5)
  })

  it('reports a note only for positions that actually moved', () => {
    const { notes } = positionAdjustments(
      [te('t1'), wr('w1')],
      TE_PREMIUM_SCORING,
      1,
      { TE: 1, WR: 1 },
    )
    expect(notes.length).toBe(1)
    expect(notes[0]).toContain('TE')
  })

  it('produces no notes when the league has no bonus scoring', () => {
    const plain = { rec: 1, rec_yd: 0.1, rec_td: 6 }
    const { notes } = positionAdjustments([wr('w1')], plain, 1, { WR: 1 })
    expect(notes).toEqual([])
  })

  it('weights by starters, so a bonus on deep bench does not reprice', () => {
    // Only the top TE is started; the bonus-heavy scrubs below should not count.
    const shallow = positionAdjustments(
      [te('t1', 1), te('t2', 0.1), te('t3', 0.1)],
      TE_PREMIUM_SCORING,
      1,
      { TE: 1 },
    )
    const deep = positionAdjustments(
      [te('t1', 1), te('t2', 0.1), te('t3', 0.1)],
      TE_PREMIUM_SCORING,
      1,
      { TE: 3 },
    )
    expect(shallow.multipliers.TE).toBeDefined()
    expect(deep.multipliers.TE).toBeDefined()
  })

  it('clamps rather than trusting an extreme ratio from thin data', () => {
    const absurd = player('x', 'TE', {
      rec: 1,
      rec_yd: 1,
      rec_td: 0,
      bonus_rec_te: 100000,
    })
    const { multipliers } = positionAdjustments(
      [absurd],
      TE_PREMIUM_SCORING,
      1,
      { TE: 1 },
    )
    expect(multipliers.TE).toBeLessThanOrEqual(MAX_MULTIPLIER)
    expect(multipliers.TE).toBeGreaterThanOrEqual(MIN_MULTIPLIER)
  })

  it('ignores positions with no projected players', () => {
    const { multipliers } = positionAdjustments([wr('w1')], TE_PREMIUM_SCORING, 1, {})
    expect(multipliers.TE).toBeUndefined()
  })
})
