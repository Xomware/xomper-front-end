/**
 * Tests for survival probability.
 *
 * The important ones are the reference vectors: they come from the Python model
 * that was actually validated, so they catch a transcription slip in the
 * coefficients. A wrong constant here would not throw or look odd — it would
 * quietly show users a confident wrong percentage, which is the failure this
 * whole feature was cut for once already.
 */
import { survivalProbability, survivalLabel } from './survival.service'

// Generated from final_model.py. Do not hand-edit.
const VECTORS = [
  { adp: 45, stdev: 8, currentPick: 40, nextPick: 65, rank: 2, totalPicks: 180, p: 0.062172 },
  { adp: 60, stdev: 10, currentPick: 40, nextPick: 65, rank: 6, totalPicks: 180, p: 0.077134 },
  { adp: 80, stdev: 14, currentPick: 40, nextPick: 65, rank: 20, totalPicks: 180, p: 0.274425 },
  { adp: 120, stdev: 20, currentPick: 40, nextPick: 65, rank: 45, totalPicks: 180, p: 0.829177 },
  { adp: 15, stdev: 6, currentPick: 10, nextPick: 15, rank: 1, totalPicks: 180, p: 0.591067 },
  { adp: 200, stdev: 30, currentPick: 150, nextPick: 170, rank: 55, totalPicks: 180, p: 0.985401 },
  { adp: 55, stdev: 12, currentPick: 50, nextPick: 51, rank: 3, totalPicks: 180, p: 0.778992 },
  { adp: 90, stdev: 9, currentPick: 12, nextPick: 36, rank: 30, totalPicks: 168, p: 0.390173 },
]

describe('survivalProbability matches the fitted model', () => {
  VECTORS.forEach((v) => {
    it(`ADP ${v.adp} rank ${v.rank}, pick ${v.currentPick} to ${v.nextPick}`, () => {
      const p = survivalProbability(v)
      expect(p).not.toBeNull()
      expect(p as number).toBeCloseTo(v.p, 5)
    })
  })
})

describe('refuses to guess', () => {
  const base = { adp: 50, stdev: 10, currentPick: 40, nextPick: 65, rank: 5, totalPicks: 180 }

  it('returns null when the next pick is not ahead', () => {
    // Nothing to predict, and 0 or 1 would both read as a claim.
    expect(survivalProbability({ ...base, nextPick: 40 })).toBeNull()
    expect(survivalProbability({ ...base, nextPick: 10 })).toBeNull()
  })

  it('returns null without an ADP', () => {
    expect(survivalProbability({ ...base, adp: NaN })).toBeNull()
  })

  it('returns null without a board rank', () => {
    expect(survivalProbability({ ...base, rank: NaN })).toBeNull()
    expect(survivalProbability({ ...base, rank: -1 })).toBeNull()
  })

  it('returns null without a draft length', () => {
    expect(survivalProbability({ ...base, totalPicks: 0 })).toBeNull()
  })

  it('substitutes the mean when a player has no stdev', () => {
    // Missing spread is common; missing ADP is not. One is recoverable.
    expect(survivalProbability({ ...base, stdev: 0 })).not.toBeNull()
    expect(survivalProbability({ ...base, stdev: NaN })).not.toBeNull()
  })
})

describe('behaviour makes sense', () => {
  const base = { adp: 60, stdev: 10, currentPick: 40, nextPick: 65, rank: 6, totalPicks: 180 }

  it('a longer wait lowers the odds', () => {
    const near = survivalProbability({ ...base, nextPick: 45 }) as number
    const far = survivalProbability({ ...base, nextPick: 90 }) as number
    expect(far).toBeLessThan(near)
  })

  it('a worse board rank raises them', () => {
    // Rank is the dominant feature — ablation costs +0.077 BSS without it.
    const top = survivalProbability({ ...base, rank: 1 }) as number
    const deep = survivalProbability({ ...base, rank: 40 }) as number
    expect(deep).toBeGreaterThan(top)
  })

  it('always returns a probability', () => {
    const extreme = survivalProbability({ ...base, rank: 5000, adp: 9999 }) as number
    expect(extreme).toBeGreaterThanOrEqual(0)
    expect(extreme).toBeLessThanOrEqual(1)
  })
})

describe('survivalLabel', () => {
  it('is empty for no prediction', () => {
    expect(survivalLabel(null)).toBe('')
  })

  it('bands the range', () => {
    expect(survivalLabel(0.95)).toBe('should last')
    expect(survivalLabel(0.7)).toBe('probably lasts')
    expect(survivalLabel(0.5)).toBe('coin flip')
    expect(survivalLabel(0.2)).toBe('likely gone')
    expect(survivalLabel(0.05)).toBe('gone')
  })
})
