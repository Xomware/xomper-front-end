/**
 * "we dont have their stats? cant derive their points from the stats? im sure
 * sleeper api has stats for past seasons and players"
 *
 * Correct. Sleeper returns players_points for every player on a roster and
 * starters_points for the lineup, for every past season -- so best weeks and
 * worst start-sit calls are on record and do not need this season to start.
 */
import { of, throwError } from 'rxjs'
import { SeasonHighlightsService } from './season-highlights.service'

function league(id: string, season: string) {
  return { getId: () => id, season }
}

function matchupRow(overrides: Record<string, unknown> = {}) {
  return {
    roster_id: 1,
    points: 100,
    players: ['a', 'b', 'bench'],
    starters: ['a', 'b'],
    players_points: { a: 20, b: 5, bench: 30 },
    ...overrides,
  }
}

describe('SeasonHighlightsService', () => {
  function build(rows: unknown, rosters: unknown = [{ owner_id: 'me', roster_id: 1 }]) {
    const leagues = {
      findLeagueRosters: () => of(rosters),
      getLeagueMatchups: () =>
        rows === 'error' ? throwError(() => new Error('gone')) : of(rows),
    }
    return new SeasonHighlightsService(leagues as never)
  }

  it('is empty with no chain', (done) => {
    build([]).forLeagueChain([], 'me').subscribe((h) => {
      expect(h.weeksRead).toBe(0)
      done()
    })
  })

  it('is empty when the user never had a roster', (done) => {
    build([matchupRow()], [{ owner_id: 'someone-else', roster_id: 1 }])
      .forLeagueChain([league('L', '2025')] as never, 'me')
      .subscribe((h) => {
        expect(h.bestTeamWeeks).toEqual([])
        done()
      })
  })

  it('finds the best single player week', (done) => {
    build([matchupRow()])
      .forLeagueChain([league('L', '2025')] as never, 'me')
      .subscribe((h) => {
        expect(h.bestPlayerWeeks[0].playerId).toBe('bench')
        expect(h.bestPlayerWeeks[0].points).toBe(30)
        done()
      })
  })

  it('catches a bench player who beat a starter', (done) => {
    build([matchupRow()])
      .forLeagueChain([league('L', '2025')] as never, 'me')
      .subscribe((h) => {
        const miss = h.worstDecisions[0]
        // bench scored 30, the worst starter scored 5.
        expect(miss.benchedId).toBe('bench')
        expect(miss.startedId).toBe('b')
        expect(miss.margin).toBe(25)
        done()
      })
  })

  it('reports no miss when the lineup was right', (done) => {
    const row = matchupRow({ players_points: { a: 20, b: 15, bench: 2 } })

    build([row])
      .forLeagueChain([league('L', '2025')] as never, 'me')
      .subscribe((h) => {
        expect(h.worstDecisions).toEqual([])
        done()
      })
  })

  it('ignores a week nobody scored in', (done) => {
    const row = matchupRow({ players_points: { a: 0, b: 0, bench: 0 }, points: 0 })

    build([row])
      .forLeagueChain([league('L', '2025')] as never, 'me')
      .subscribe((h) => {
        // Preseason and future weeks come back as zeros; that is not a week
        // where everyone scored nothing.
        expect(h.weeksRead).toBe(0)
        expect(h.bestTeamWeeks).toEqual([])
        done()
      })
  })

  it('skips empty roster slots', (done) => {
    const row = matchupRow({
      players: ['a', '0', 'bench'],
      starters: ['a', '0'],
      players_points: { a: 20, bench: 30 },
    })

    build([row])
      .forLeagueChain([league('L', '2025')] as never, 'me')
      .subscribe((h) => {
        expect(h.bestPlayerWeeks.every((p) => p.playerId !== '0')).toBe(true)
        done()
      })
  })

  it('survives a week that cannot be read', (done) => {
    build('error')
      .forLeagueChain([league('L', '2025')] as never, 'me')
      .subscribe((h) => {
        // A week that never happened 404s; losing the other sixteen over it
        // would be worse than reporting nothing for that one.
        expect(h.weeksRead).toBe(0)
        done()
      })
  })

  it('keeps only the top few of each', (done) => {
    build([matchupRow()])
      .forLeagueChain([league('L', '2025')] as never, 'me')
      .subscribe((h) => {
        expect(h.bestPlayerWeeks.length).toBeLessThanOrEqual(5)
        expect(h.bestTeamWeeks.length).toBeLessThanOrEqual(5)
        expect(h.worstDecisions.length).toBeLessThanOrEqual(5)
        done()
      })
  })

  it('ranks misses by what the swap was worth', (done) => {
    build([matchupRow()])
      .forLeagueChain([league('L', '2025')] as never, 'me')
      .subscribe((h) => {
        const margins = h.worstDecisions.map((m) => m.margin)
        expect(margins).toEqual([...margins].sort((a, b) => b - a))
        done()
      })
  })
})
