/**
 * Tests for LeagueFollowsService.
 *
 * The selection is what `LeagueService.getActiveLeagueId()` resolves to, so a
 * selection pointing at a league the user no longer follows shows them the
 * wrong league — or nothing. Reconciliation is the behaviour worth pinning.
 */
import { HttpClient } from '@angular/common/http'
import { of, throwError } from 'rxjs'
import { LeagueFollowsService, FollowedLeague } from './league-follows.service'

function league(overrides: Partial<FollowedLeague> = {}): FollowedLeague {
  return {
    leagueId: '1317249551823814656',
    name: 'Charlotte Dynasty League',
    season: '2026',
    status: 'in_season',
    totalRosters: 12,
    avatar: '',
    isDynasty: true,
    isFollowed: true,
    ...overrides,
  }
}

const OTHER = league({
  leagueId: '1389328793713250304',
  name: 'CLIT Fantasy Football',
  isDynasty: false,
  status: 'pre_draft',
})

function serviceWith(http: Partial<HttpClient>): LeagueFollowsService {
  return new LeagueFollowsService(http as HttpClient)
}

function withLeagues(leagues: FollowedLeague[]): LeagueFollowsService {
  return serviceWith({
    get: () => of({ season: '2026', count: leagues.length, leagues }) as never,
    request: () => of({ season: '2026', count: leagues.length, leagues }) as never,
  })
}

describe('LeagueFollowsService', () => {
  beforeEach(() => localStorage.clear())

  it('caches the loaded leagues', (done) => {
    const service = withLeagues([league(), OTHER])

    service.load().subscribe(() => {
      expect(service.leagues.length).toBe(2)
      done()
    })
  })

  it('exposes only followed leagues to the switcher', (done) => {
    const service = withLeagues([league(), OTHER, league({ leagueId: 'x', isFollowed: false })])

    service.load().subscribe(() => {
      expect(service.followed.length).toBe(2)
      done()
    })
  })

  it('selects the first followed league when nothing is stored', (done) => {
    const service = withLeagues([league(), OTHER])

    service.load().subscribe(() => {
      // The API already sorts followed and in-season first, so the head of
      // the list is the sensible default without re-deriving that rule.
      expect(service.selectedLeagueId).toBe('1317249551823814656')
      done()
    })
  })

  it('keeps a stored selection that is still followed', (done) => {
    localStorage.setItem('xomper.selectedLeagueId', OTHER.leagueId)
    const service = withLeagues([league(), OTHER])

    service.load().subscribe(() => {
      expect(service.selectedLeagueId).toBe(OTHER.leagueId)
      done()
    })
  })

  it('replaces a stored selection the user no longer follows', (done) => {
    localStorage.setItem('xomper.selectedLeagueId', 'left-this-league')
    const service = withLeagues([league()])

    service.load().subscribe(() => {
      // A stored id outlives the league it names — unfollowed, left, or a new
      // season minting a new id. Pointing at nothing is the worse outcome.
      expect(service.selectedLeagueId).toBe('1317249551823814656')
      done()
    })
  })

  it('clears the selection when nothing is followed', (done) => {
    const service = withLeagues([league({ isFollowed: false })])

    service.load().subscribe(() => {
      expect(service.selectedLeagueId).toBeNull()
      done()
    })
  })

  it('persists a selection across instances', (done) => {
    const service = withLeagues([league(), OTHER])

    service.load().subscribe(() => {
      service.select(OTHER.leagueId)
      // A refresh must not silently switch which league the user is looking at.
      expect(new LeagueFollowsService({} as HttpClient).selectedLeagueId).toBe(OTHER.leagueId)
      done()
    })
  })

  it('resolves the selected league object', (done) => {
    const service = withLeagues([league(), OTHER])

    service.load().subscribe(() => {
      service.select(OTHER.leagueId)
      expect(service.selectedLeague?.name).toBe('CLIT Fantasy Football')
      done()
    })
  })

  it('returns an empty list rather than failing', (done) => {
    const service = serviceWith({ get: () => throwError(() => new Error('down')) as never })

    // The list only populates a switcher. Erroring here would block
    // navigation on something non-essential.
    service.load().subscribe((leagues) => {
      expect(leagues).toEqual([])
      done()
    })
  })

  it('re-syncs from the response when following', (done) => {
    const service = withLeagues([league(), OTHER])

    service.follow(OTHER).subscribe(() => {
      // Both endpoints return the refreshed list, so one call mutates and
      // re-syncs — no second GET, no chance of the two disagreeing.
      expect(service.leagues.length).toBe(2)
      done()
    })
  })

  it('clears everything on sign out', (done) => {
    const service = withLeagues([league()])

    service.load().subscribe(() => {
      service.clear()
      expect(service.leagues).toEqual([])
      expect(service.selectedLeagueId).toBeNull()
      // Otherwise the next account on this browser inherits the selection.
      expect(localStorage.getItem('xomper.selectedLeagueId')).toBeNull()
      done()
    })
  })
})
