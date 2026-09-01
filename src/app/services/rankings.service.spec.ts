/**
 * Tests for consensus rankings.
 *
 * The behaviour worth pinning is when the UI stays QUIET. A disagreement badge
 * on every row is noise, and the entire value of pulling three lists is that
 * the genuine disagreements stand out from the rest.
 */
import { disagreementLabel, sourceRows, PlayerRanks, NOTABLE_SPREAD } from './rankings.service'

function row(ranks: Record<string, number>): PlayerRanks {
  const values = Object.values(ranks)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const spread = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)
  return { ranks, consensus: mean, spread, sourceCount: values.length }
}

describe('disagreementLabel', () => {
  it('is empty when the lists broadly agree', () => {
    expect(disagreementLabel(row({ ffc: 10, espn: 12, fantasycalc: 11 }))).toBe('')
  })

  it('shows the range when they do not', () => {
    // The real case: FantasyCalc 107, ESPN 416.
    expect(disagreementLabel(row({ ffc: 179, espn: 416, fantasycalc: 107 }))).toBe('107-416')
  })

  it('is empty for a single source', () => {
    // spread is 0 with one opinion, but that is not agreement.
    expect(disagreementLabel(row({ ffc: 12 }))).toBe('')
  })

  it('is empty for a missing player', () => {
    expect(disagreementLabel(undefined)).toBe('')
  })

  it('respects the threshold', () => {
    const quiet = { ranks: { a: 1, b: 2 }, consensus: 1.5, spread: NOTABLE_SPREAD - 1, sourceCount: 2 }
    const loud = { ranks: { a: 1, b: 90 }, consensus: 45, spread: NOTABLE_SPREAD + 1, sourceCount: 2 }
    expect(disagreementLabel(quiet)).toBe('')
    expect(disagreementLabel(loud)).toBe('1-90')
  })
})

describe('sourceRows', () => {
  it('orders by rank so the most bullish list reads first', () => {
    const out = sourceRows(row({ ffc: 179, espn: 416, fantasycalc: 107 }))
    expect(out.map((r) => r.source)).toEqual(['fantasycalc', 'ffc', 'espn'])
  })

  it('is empty for a missing player', () => {
    expect(sourceRows(undefined)).toEqual([])
  })
})
