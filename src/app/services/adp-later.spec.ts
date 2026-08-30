/**
 * Tests for "usually goes after your next pick".
 *
 * The margin is the whole point. A player whose ADP equals your next pick is a
 * coin flip dressed as information, and the calibration spike established there
 * is no held-out skill in predicting survival — so only a clear gap is shown,
 * and it is reported as ADP rather than odds.
 */
import { laterThanNextPick } from './adp.service'

const BOARD = [
  { playerId: 'a', name: 'Early Pick', position: 'RB' },
  { playerId: 'b', name: 'Late Pick', position: 'WR' },
  { playerId: 'c', name: 'Later Still', position: 'TE' },
  { playerId: 'd', name: 'No Adp', position: 'QB' },
]

const ADP: Record<string, number> = { a: 40, b: 70, c: 90 }
const lookup = (id: string) => ADP[id] ?? null

describe('laterThanNextPick', () => {
  it('is empty without a next pick', () => {
    expect(laterThanNextPick(BOARD, lookup, null)).toEqual([])
  })

  it('keeps only players comfortably past the pick', () => {
    const out = laterThanNextPick(BOARD, lookup, 52)
    expect(out.map((c) => c.name)).toEqual(['Late Pick', 'Later Still'])
  })

  it('excludes a player inside the margin', () => {
    // ADP 40 against pick 38 is two picks of daylight — not information.
    expect(laterThanNextPick(BOARD, lookup, 38).map((c) => c.name)).not.toContain('Early Pick')
  })

  it('includes a player exactly at the margin edge', () => {
    expect(laterThanNextPick(BOARD, lookup, 34).map((c) => c.name)).toContain('Early Pick')
  })

  it('skips players with no ADP rather than guessing', () => {
    expect(laterThanNextPick(BOARD, lookup, 10).map((c) => c.name)).not.toContain('No Adp')
  })

  it('rounds ADP for display', () => {
    const out = laterThanNextPick(BOARD, () => 70.4, 52, 6, 1)
    expect(out[0].adp).toBe(70)
  })

  it('respects the limit', () => {
    expect(laterThanNextPick(BOARD, lookup, 10, 6, 1).length).toBe(1)
  })
})
