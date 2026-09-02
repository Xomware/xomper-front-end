/**
 * "users profile needs haavey lift. all we have is their leagues. need stats.
 * all time. season by sesason... most common players they have in mutlope
 * leagues by %."
 *
 * Built from rosters, not matchups: a roster's settings already carry wins,
 * losses, ties and points, so a season costs one request rather than
 * seventeen.
 */
import { of, throwError } from 'rxjs'
import { ProfileStatsService } from './profile-stats.service'

function league(id: string, season: string, name = `League ${id}`) {
  return { getId: () => id, season, getDisplayName: () => name }
}

function roster(ownerId: string, settings: Record<string, unknown>, players: string[] = []) {
  return { owner_id: ownerId, settings, players }
}

describe('ProfileStatsService', () => {
  function build(chains: Record<string, unknown[]>, rosters: Record<string, unknown[]>) {
    const leagues = {
      getLeagueChain: (id: string) => of(chains[id] ?? []),
      findLeagueRosters: (id: string) => of(rosters[id] ?? []),
    }
    return new ProfileStatsService(leagues as never)
  }

  it('is empty for someone in no leagues', (done) => {
    build({}, {}).forUser('me', []).subscribe((stats) => {
      expect(stats.seasons).toEqual([])
      expect(stats.career.wins).toBe(0)
      done()
    })
  })

  it('reads a record from each season of the chain', (done) => {
    const service = build(
      { L2026: [league('L2026', '2026'), league('L2025', '2025')] },
      {
        L2026: [roster('me', { wins: 3, losses: 1, ties: 0, fpts: 400, fpts_decimal: 50 })],
        L2025: [roster('me', { wins: 8, losses: 6, ties: 1, fpts: 1200, fpts_decimal: 25 })],
      },
    )

    service.forUser('me', [league('L2026', '2026')] as never).subscribe((stats) => {
      expect(stats.career.wins).toBe(11)
      expect(stats.career.losses).toBe(7)
      expect(stats.career.ties).toBe(1)
      // Sleeper splits points into whole and hundredths.
      expect(stats.career.pointsFor).toBeCloseTo(1600.75, 2)
      expect(stats.career.seasons).toBe(2)
      done()
    })
  })

  it('lists seasons newest first', (done) => {
    const service = build(
      { L1: [league('L1', '2024'), league('L0', '2023')] },
      { L1: [roster('me', { wins: 1 })], L0: [roster('me', { wins: 2 })] },
    )

    service.forUser('me', [league('L1', '2024')] as never).subscribe((stats) => {
      expect(stats.seasons.map((s) => s.season)).toEqual(['2024', '2023'])
      done()
    })
  })

  it('ignores seasons the user was not in', (done) => {
    const service = build(
      { L1: [league('L1', '2024'), league('L0', '2023')] },
      { L1: [roster('me', { wins: 5 })], L0: [roster('someone-else', { wins: 9 })] },
    )

    service.forUser('me', [league('L1', '2024')] as never).subscribe((stats) => {
      expect(stats.career.wins).toBe(5)
      expect(stats.seasons.length).toBe(1)
      done()
    })
  })

  it('counts a player owned across current leagues', (done) => {
    const service = build(
      { A: [league('A', '2026')], B: [league('B', '2026')] },
      {
        A: [roster('me', {}, ['p1', 'p2'])],
        B: [roster('me', {}, ['p1', 'p3'])],
      },
    )

    service
      .forUser('me', [league('A', '2026'), league('B', '2026')] as never)
      .subscribe((stats) => {
        expect(stats.mostOwned.length).toBe(1)
        expect(stats.mostOwned[0].playerId).toBe('p1')
        expect(stats.mostOwned[0].leagues).toBe(2)
        expect(stats.mostOwned[0].share).toBe(1)
        done()
      })
  })

  it('does not count a player held in only one league', (done) => {
    const service = build(
      { A: [league('A', '2026')], B: [league('B', '2026')] },
      { A: [roster('me', {}, ['solo'])], B: [roster('me', {}, ['other'])] },
    )

    service
      .forUser('me', [league('A', '2026'), league('B', '2026')] as never)
      .subscribe((stats) => {
        // One roster is a player, not a pattern.
        expect(stats.mostOwned).toEqual([])
        done()
      })
  })

  it('counts ownership on the current season only', (done) => {
    const service = build(
      { A: [league('A', '2026'), league('A0', '2025')] },
      {
        A: [roster('me', {}, ['now'])],
        A0: [roster('me', {}, ['then', 'then2'])],
      },
    )

    service.forUser('me', [league('A', '2026')] as never).subscribe((stats) => {
      // A player rostered once in 2025 must not outrank one held today.
      expect(stats.mostOwned.every((p) => p.playerId !== 'then')).toBe(true)
      done()
    })
  })

  it('keeps going when one league cannot be read', (done) => {
    const leagues = {
      getLeagueChain: (id: string) =>
        id === 'bad' ? throwError(() => new Error('gone')) : of([league(id, '2026')]),
      findLeagueRosters: () => of([roster('me', { wins: 4 })]),
    }
    const service = new ProfileStatsService(leagues as never)

    service
      .forUser('me', [league('bad', '2026'), league('good', '2026')] as never)
      .subscribe((stats) => {
        // The broken league falls back to itself rather than emptying the page.
        expect(stats.career.wins).toBe(8)
        done()
      })
  })

  it('survives rosters failing to load', (done) => {
    const leagues = {
      getLeagueChain: () => of([league('A', '2026')]),
      findLeagueRosters: () => throwError(() => new Error('down')),
    }
    const service = new ProfileStatsService(leagues as never)

    service.forUser('me', [league('A', '2026')] as never).subscribe((stats) => {
      expect(stats.seasons).toEqual([])
      done()
    })
  })
})

/**
 * "why load all that? do we need it all? will it change page?"
 *
 * Mostly it will not. A completed season's record is final; only the current
 * one moves, and weekly. So the honest cost is one fetch, not one per visit
 * -- sixteen league chains plus a roster call per season is around forty
 * requests, and the landing card asks for the same thing.
 */
describe('ProfileStatsService caching', () => {
  function service() {
    const leagues = {
      getLeagueChain: (id: string) => of([{ getId: () => id, season: '2026', getDisplayName: () => 'L' }]),
      findLeagueRosters: () => of([{ owner_id: 'me', settings: { wins: 4, losses: 1 }, players: [] }]),
    }
    return new ProfileStatsService(leagues as never)
  }

  const oneLeague = [{ getId: () => 'A', season: '2026', getDisplayName: () => 'L' }]

  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('has nothing cached to begin with', () => {
    expect(service().cached('me')).toBeNull()
    expect(service().isFresh('me')).toBe(false)
  })

  it('caches what it computed', (done) => {
    const s = service()
    s.forUser('me', oneLeague as never).subscribe(() => {
      expect(s.cached('me')?.career.wins).toBe(4)
      done()
    })
  })

  it('serves the cache to a second instance', (done) => {
    service()
      .forUser('me', oneLeague as never)
      .subscribe(() => {
        // The landing card is a different component asking the same question.
        expect(service().cached('me')?.career.wins).toBe(4)
        done()
      })
  })

  it('does not hand one user another user cache', (done) => {
    const s = service()
    s.forUser('me', oneLeague as never).subscribe(() => {
      expect(s.cached('someone-else')).toBeNull()
      done()
    })
  })

  it('counts a just-written cache as fresh', (done) => {
    const s = service()
    s.forUser('me', oneLeague as never).subscribe(() => {
      expect(s.isFresh('me')).toBe(true)
      done()
    })
  })

  it('counts an old cache as stale', (done) => {
    const s = service()
    s.forUser('me', oneLeague as never).subscribe(() => {
      const raw = JSON.parse(localStorage.getItem('xomper.profileStats')!)
      raw.at = Date.now() - 60 * 60 * 1000
      localStorage.setItem('xomper.profileStats', JSON.stringify(raw))

      // Still served, so the page is not blank; just refreshed behind it.
      expect(s.cached('me')).not.toBeNull()
      expect(s.isFresh('me')).toBe(false)
      done()
    })
  })

  it('ignores a cache it cannot parse', () => {
    localStorage.setItem('xomper.profileStats', 'not json')

    expect(service().cached('me')).toBeNull()
  })

  it('survives blocked storage', (done) => {
    const original = localStorage.setItem
    localStorage.setItem = () => {
      throw new Error('blocked')
    }
    const s = service()

    s.forUser('me', oneLeague as never).subscribe((stats) => {
      // A missed cache costs requests, not correctness.
      expect(stats.career.wins).toBe(4)
      localStorage.setItem = original
      done()
    })
  })
})
