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
