/**
 * Tests for season rollover resolution.
 *
 * Sleeper mints a new league_id every season and offers no forward pointer,
 * so a hardcoded id silently starts serving a completed season each autumn.
 * These cover the discovery path and, just as importantly, every way it can
 * fail — a stale league is acceptable, a broken app is not.
 */
import { of, throwError } from 'rxjs'
import { LeagueService } from './league.service'

function makeService(): LeagueService {
  // Every network method used by the resolver is stubbed per test, so the
  // collaborators can be null.
  return new LeagueService(
    null as any,
    null as any,
    null as any,
    null as any,
    { selectedLeagueId: null } as any,
  )
}

/** Minimal league shape the resolver reads. */
function league(id: string, season: string, previous: string | null = null) {
  return { league_id: id, season, previous_league_id: previous } as any
}

describe('LeagueService season rollover', () => {
  let service: LeagueService

  beforeEach(() => {
    service = makeService()
  })

  it('returns the anchor unchanged when it is already the current season', (done) => {
    spyOn(service, 'getLeagueState').and.returnValue(of({ season: '2026' } as any))
    spyOn(service, 'searchLeague').and.returnValue(of(league('A', '2026')))

    service.resolveCurrentLeagueId('A').subscribe((id) => {
      expect(id).toBe('A')
      done()
    })
  })

  it('finds the successor via a league member when the anchor is stale', (done) => {
    spyOn(service, 'getLeagueState').and.returnValue(of({ season: '2026' } as any))
    spyOn(service, 'searchLeague').and.returnValue(of(league('OLD', '2025')))
    spyOn(service, 'findLeagueUsers').and.returnValue(
      of([{ user_id: 'u1' } as any]),
    )
    spyOn(service, 'findUserLeagues').and.returnValue(
      of([league('UNRELATED', '2026', 'other'), league('NEW', '2026', 'OLD')]),
    )

    service.resolveCurrentLeagueId('OLD').subscribe((id) => {
      expect(id).toBe('NEW')
      done()
    })
  })

  it("ignores a member's other leagues that do not chain back to the anchor", (done) => {
    spyOn(service, 'getLeagueState').and.returnValue(of({ season: '2026' } as any))
    spyOn(service, 'searchLeague').and.returnValue(of(league('OLD', '2025')))
    spyOn(service, 'findLeagueUsers').and.returnValue(
      of([{ user_id: 'u1' } as any]),
    )
    spyOn(service, 'findUserLeagues').and.returnValue(
      of([league('SOMEONE_ELSES', '2026', null)]),
    )

    service.resolveCurrentLeagueId('OLD').subscribe((id) => {
      expect(id).toBe('OLD')
      done()
    })
  })

  it('caches the resolution instead of re-probing every call', (done) => {
    spyOn(service, 'getLeagueState').and.returnValue(of({ season: '2026' } as any))
    const search = spyOn(service, 'searchLeague').and.returnValue(
      of(league('OLD', '2025')),
    )
    spyOn(service, 'findLeagueUsers').and.returnValue(of([{ user_id: 'u1' } as any]))
    spyOn(service, 'findUserLeagues').and.returnValue(
      of([league('NEW', '2026', 'OLD')]),
    )

    service.resolveCurrentLeagueId('OLD').subscribe(() => {
      const callsAfterFirst = search.calls.count()
      service.resolveCurrentLeagueId('OLD').subscribe((id) => {
        expect(id).toBe('NEW')
        expect(search.calls.count()).toBe(callsAfterFirst)
        done()
      })
    })
  })

  // --- failure modes: never break the app ------------------------------------

  it('falls back to the anchor when the league lookup fails', (done) => {
    spyOn(service, 'getLeagueState').and.returnValue(of({ season: '2026' } as any))
    spyOn(service, 'searchLeague').and.returnValue(throwError(() => new Error('down')))

    service.resolveCurrentLeagueId('A').subscribe((id) => {
      expect(id).toBe('A')
      done()
    })
  })

  it('falls back to the anchor when the member list fails', (done) => {
    spyOn(service, 'getLeagueState').and.returnValue(of({ season: '2026' } as any))
    spyOn(service, 'searchLeague').and.returnValue(of(league('OLD', '2025')))
    spyOn(service, 'findLeagueUsers').and.returnValue(
      throwError(() => new Error('down')),
    )

    service.resolveCurrentLeagueId('OLD').subscribe((id) => {
      expect(id).toBe('OLD')
      done()
    })
  })

  it('falls back to the anchor when the league has no members', (done) => {
    spyOn(service, 'getLeagueState').and.returnValue(of({ season: '2026' } as any))
    spyOn(service, 'searchLeague').and.returnValue(of(league('OLD', '2025')))
    spyOn(service, 'findLeagueUsers').and.returnValue(of([]))

    service.resolveCurrentLeagueId('OLD').subscribe((id) => {
      expect(id).toBe('OLD')
      done()
    })
  })

  it('still resolves when NFL state is unavailable', (done) => {
    // Season falls back to the calendar-derived value; the anchor is from a
    // season long past either way, so discovery must still run.
    spyOn(service, 'getLeagueState').and.returnValue(throwError(() => new Error('x')))
    spyOn(service, 'searchLeague').and.returnValue(of(league('OLD', '1999')))
    spyOn(service, 'findLeagueUsers').and.returnValue(of([{ user_id: 'u1' } as any]))
    spyOn(service, 'findUserLeagues').and.returnValue(
      of([league('NEW', '2026', 'OLD')]),
    )

    service.resolveCurrentLeagueId('OLD').subscribe((id) => {
      expect(id).toBe('NEW')
      done()
    })
  })

  it('clearResolvedLeagues forces a fresh probe', (done) => {
    spyOn(service, 'getLeagueState').and.returnValue(of({ season: '2026' } as any))
    const search = spyOn(service, 'searchLeague').and.returnValue(
      of(league('OLD', '2025')),
    )
    spyOn(service, 'findLeagueUsers').and.returnValue(of([{ user_id: 'u1' } as any]))
    spyOn(service, 'findUserLeagues').and.returnValue(
      of([league('NEW', '2026', 'OLD')]),
    )

    service.resolveCurrentLeagueId('OLD').subscribe(() => {
      const before = search.calls.count()
      service.clearResolvedLeagues()
      service.resolveCurrentLeagueId('OLD').subscribe(() => {
        expect(search.calls.count()).toBeGreaterThan(before)
        done()
      })
    })
  })
})
