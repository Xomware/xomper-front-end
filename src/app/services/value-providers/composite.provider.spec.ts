/**
 * Tests for value-source routing, with the keeper blend as the focus.
 *
 * "Keeper implies dynasty" was wrong twice over. Measured on a real 12-team
 * keeper league with `max_keepers: 1` and K and DEF starting slots: the
 * dynasty source priced 165 of 199 rostered players (83%), projections priced
 * 194 (97%). Of the 34 the dynasty source missed, 31 had projections and 15
 * were defenses — every one silently worth zero.
 */
import { of } from 'rxjs'
import { CompositeValueProvider } from './composite.provider'
import {
  LeagueFormat,
  MapValueBook,
  ValueBook,
} from '../../models/value-book.model'

function format(overrides: Partial<LeagueFormat> = {}): LeagueFormat {
  return {
    fingerprint: { isDynasty: true, numQbs: 1, numTeams: 12, ppr: 1 },
    clamps: [],
    unsupportedReasons: [],
    approximations: [],
    isKeeper: false,
    teBonus: 0,
    scoringSettings: {},
    rosterPositions: [],
    maxKeepers: 0,
    startingSlots: 0,
    ...overrides,
  }
}

function book(
  fmt: LeagueFormat,
  values: Record<string, number>,
  positions: Record<string, string> = {},
  picks: Record<string, number> = {},
): ValueBook {
  return new MapValueBook(
    fmt,
    new Map(Object.entries(values)),
    new Map(Object.entries(positions)),
    new Map(Object.entries(picks)),
    new Map(),
    Date.now(),
  )
}

function build(dynastyValues: Record<string, number>, redraftValues: Record<string, number>,
               picks: Record<string, number> = {}) {
  const fantasyCalc = {
    bookFor: (f: LeagueFormat) => of(book(f, dynastyValues, {}, picks)),
  } as any
  const projections = {
    bookFor: (f: LeagueFormat) => of(book(f, redraftValues)),
  } as any
  const projectionsService = { forSeason: () => of([]) } as any
  return new CompositeValueProvider(fantasyCalc, projections, projectionsService)
}

describe('CompositeValueProvider keeper handling', () => {
  describe('keeperWeight()', () => {
    it('is near zero when almost nothing carries over', () => {
      const provider = build({}, {})
      // The real case that exposed this: keep 1 of 10 starters.
      expect(provider.keeperWeight(format({ maxKeepers: 1, startingSlots: 10 }))).toBeCloseTo(0.1)
    })

    it('is 1 when the entire roster carries over', () => {
      const provider = build({}, {})
      expect(provider.keeperWeight(format({ maxKeepers: 10, startingSlots: 10 }))).toBe(1)
    })

    it('never exceeds 1 even if more keepers than starters are allowed', () => {
      const provider = build({}, {})
      expect(provider.keeperWeight(format({ maxKeepers: 40, startingSlots: 10 }))).toBe(1)
    })

    it('is 0 when the league keeps nobody', () => {
      const provider = build({}, {})
      expect(provider.keeperWeight(format({ maxKeepers: 0, startingSlots: 10 }))).toBe(0)
    })

    it('is 0 rather than NaN when starting slots are unknown', () => {
      const provider = build({}, {})
      expect(provider.keeperWeight(format({ maxKeepers: 2, startingSlots: 0 }))).toBe(0)
    })
  })

  describe('keeper blend', () => {
    const keeper = format({
      isKeeper: true,
      maxKeepers: 1,
      startingSlots: 10,
      rosterPositions: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],
    })

    it('weights toward redraft when little carries over', (done) => {
      // 90% redraft, 10% dynasty: 1000*0.9 + 5000*0.1 = 1400
      build({ p1: 5000 }, { p1: 1000 })
        .bookFor(keeper)
        .subscribe((b) => {
          expect(b.value('p1').value).toBe(1400)
          done()
        })
    })

    it('weights toward dynasty when most of the roster carries over', (done) => {
      const deep = format({ isKeeper: true, maxKeepers: 9, startingSlots: 10 })
      // 10% redraft, 90% dynasty: 1000*0.1 + 5000*0.9 = 4600
      build({ p1: 5000 }, { p1: 1000 })
        .bookFor(deep)
        .subscribe((b) => {
          expect(b.value('p1').value).toBe(4600)
          done()
        })
    })

    it('prices a player the dynasty source has never heard of', (done) => {
      // This is the bug: kickers and defenses were silently worth zero.
      build({ p1: 5000 }, { p1: 1000, DEN: 800 })
        .bookFor(keeper)
        .subscribe((b) => {
          const lookup = b.value('DEN')
          expect(lookup.known).toBe(true)
          expect(lookup.value).toBe(800)
          done()
        })
    })

    it('keeps a dynasty-only player rather than dropping them', (done) => {
      build({ rookie: 4000 }, { p1: 1000 })
        .bookFor(keeper)
        .subscribe((b) => {
          expect(b.value('rookie').known).toBe(true)
          expect(b.value('rookie').value).toBe(4000)
          done()
        })
    })

    it('covers the union of both sources', (done) => {
      build({ a: 100, b: 200 }, { b: 300, c: 400 })
        .bookFor(keeper)
        .subscribe((b) => {
          expect(new Set(b.playerIds)).toEqual(new Set(['a', 'b', 'c']))
          done()
        })
    })

    it('discounts draft picks by how much of a dynasty league it really is', (done) => {
      // Picks matter only to the degree the league keeps players.
      build({ p1: 1 }, { p1: 1 }, { '2027 1st': 5000 })
        .bookFor(keeper)
        .subscribe((b) => {
          expect(b.pickValue('2027 1st').value).toBe(500)
          done()
        })
    })

    it('labels the blend so it is never mistaken for a published value', (done) => {
      build({ p1: 5000 }, { p1: 1000 })
        .bookFor(keeper)
        .subscribe((b) => {
          const note = b.format.approximations.find((a) => a.includes('Keeper league'))
          expect(note).toBeDefined()
          expect(note).toContain('90% redraft')
          expect(note).toContain('10% dynasty')
          done()
        })
    })
  })

  describe('routing', () => {
    it('sends a straight redraft league to projections', (done) => {
      const redraft = format({ fingerprint: { isDynasty: false, numQbs: 1, numTeams: 12, ppr: 1 } })
      build({ p1: 5000 }, { p1: 1000 })
        .bookFor(redraft)
        .subscribe((b) => {
          expect(b.value('p1').value).toBe(1000)
          done()
        })
    })
  })
})
