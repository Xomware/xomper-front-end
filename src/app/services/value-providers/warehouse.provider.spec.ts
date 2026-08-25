/**
 * Tests for the warehouse-backed value provider.
 *
 * The provider itself is thin — the valuation happens server-side, and that
 * side was already diffed against the TypeScript engine on identical inputs
 * (3,227 players, points and value both). What is worth testing here is the
 * mapping and the failure behaviour, because the failure mode of a value
 * source is "every player silently unknown", which blanks an analysis without
 * looking like an error.
 */
import { HttpClient } from '@angular/common/http'
import { of, throwError } from 'rxjs'
import { WarehouseProvider } from './warehouse.provider'
import { LeagueFormat } from '../../models/value-book.model'

function format(overrides: Partial<LeagueFormat> = {}): LeagueFormat {
  return {
    fingerprint: { isDynasty: false, numQbs: 1, numTeams: 12, ppr: 1 },
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
    ...overrides,
  }
}

const RESPONSE = {
  leagueId: 'league-1',
  season: '2026',
  numTeams: 12,
  starters: { QB: 12, RB: 24, WR: 24, TE: 12 },
  count: 3,
  values: [
    { playerId: '4984', position: 'QB', points: 351.5, value: 8520 },
    { playerId: '9221', position: 'RB', points: 331.4, value: 10000 },
    { playerId: 'DEN', position: 'DEF', points: 120.0, value: 400 },
  ],
}

function providerWith(post: () => any): WarehouseProvider {
  return new WarehouseProvider({ post } as unknown as HttpClient)
}

describe('WarehouseProvider', () => {
  it('maps the response into a value book', (done) => {
    providerWith(() => of(RESPONSE))
      .bookFor(format())
      .subscribe((book) => {
        expect(book.value('4984')).toEqual({ value: 8520, known: true })
        expect(book.value('9221').value).toBe(10000)
        expect(book.position('4984')).toBe('QB')
        done()
      })
  })

  it('carries defenses through, which the dynasty source cannot', (done) => {
    providerWith(() => of(RESPONSE))
      .bookFor(format())
      .subscribe((book) => {
        expect(book.value('DEN').known).toBe(true)
        done()
      })
  })

  it('reports an absent player as unknown, not as worth zero', (done) => {
    providerWith(() => of(RESPONSE))
      .bookFor(format())
      .subscribe((book) => {
        expect(book.value('nobody').known).toBe(false)
        done()
      })
  })

  it('has no picks — projections do not carry them', (done) => {
    providerWith(() => of(RESPONSE))
      .bookFor(format())
      .subscribe((book) => {
        expect(book.allPickNames).toEqual([])
        expect(book.pickValue('2027 1st').known).toBe(false)
        done()
      })
  })

  it('errors without a league id rather than returning an empty book', (done) => {
    // An empty book reads downstream as "every player unknown" and blanks the
    // analysis without surfacing anything as broken.
    providerWith(() => of(RESPONSE))
      .bookFor(format({ leagueId: '' }))
      .subscribe({
        next: () => done.fail('should not emit a book'),
        error: (e) => {
          expect(String(e)).toContain('league id')
          done()
        },
      })
  })

  it('caches per league so one session makes one request', (done) => {
    let calls = 0
    const provider = providerWith(() => {
      calls++
      return of(RESPONSE)
    })
    provider.bookFor(format()).subscribe(() => {
      provider.bookFor(format()).subscribe(() => {
        expect(calls).toBe(1)
        done()
      })
    })
  })

  it('retries after a failure instead of replaying it all session', (done) => {
    let calls = 0
    const provider = providerWith(() => {
      calls++
      return calls === 1 ? throwError(() => new Error('boom')) : of(RESPONSE)
    })
    provider.bookFor(format()).subscribe({
      error: () => {
        provider.bookFor(format()).subscribe((book) => {
          expect(calls).toBe(2)
          expect(book.value('4984').known).toBe(true)
          done()
        })
      },
    })
  })
})
