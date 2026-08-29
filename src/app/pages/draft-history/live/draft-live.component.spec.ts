/**
 * Tests for the live board's poll-health signals.
 *
 * The board used to freeze silently: one failed request ended the RxJS stream
 * and the last good picks sat there looking current. These signals are what
 * tell the drafter the board has stopped moving, so they have to be right at
 * the boundaries.
 */
import { DraftLiveComponent } from './draft-live.component'

type Probe = Pick<DraftLiveComponent, 'lastPollAt' | 'boardIsStale' | 'lastUpdatedLabel'> & {
  draft: { status: string } | null
}

/** Exercises the getters without standing up the component's DI graph. */
function probe(status: string | null, agoMs: number | null): Probe {
  const c = Object.create(DraftLiveComponent.prototype) as DraftLiveComponent
  ;(c as unknown as { draft: unknown }).draft = status ? { status } : null
  c.lastPollAt = agoMs === null ? 0 : Date.now() - agoMs
  return c as unknown as Probe
}

describe('DraftLiveComponent poll health', () => {
  describe('boardIsStale', () => {
    it('is false before the first poll lands', () => {
      expect(probe('drafting', null).boardIsStale).toBe(false)
    })

    it('is false while polls are arriving on time', () => {
      expect(probe('drafting', 4_000).boardIsStale).toBe(false)
    })

    it('is false at exactly three poll intervals', () => {
      expect(probe('drafting', 15_000).boardIsStale).toBe(false)
    })

    it('is true past three poll intervals while drafting', () => {
      expect(probe('drafting', 15_001).boardIsStale).toBe(true)
    })

    it('uses the slower pre_draft cadence', () => {
      expect(probe('pre_draft', 60_000).boardIsStale).toBe(false)
      expect(probe('pre_draft', 90_001).boardIsStale).toBe(true)
    })

    it('never nags on a completed draft', () => {
      expect(probe('complete', 600_000).boardIsStale).toBe(false)
    })

    it('is false with no draft loaded', () => {
      expect(probe(null, 600_000).boardIsStale).toBe(false)
    })
  })

  describe('lastUpdatedLabel', () => {
    it('is empty before the first poll', () => {
      expect(probe('drafting', null).lastUpdatedLabel).toBe('')
    })

    it('reads "just now" under five seconds', () => {
      expect(probe('drafting', 2_000).lastUpdatedLabel).toBe('just now')
    })

    it('counts seconds up to a minute', () => {
      expect(probe('drafting', 30_000).lastUpdatedLabel).toBe('30s ago')
    })

    it('switches to minutes past a minute', () => {
      expect(probe('drafting', 125_000).lastUpdatedLabel).toBe('2m ago')
    })
  })
})
