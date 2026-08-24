/**
 * Unit tests for TeamAnalysisService pure computation: build(), axisMaxes(), leagueAverageAxes().
 * Services are instantiated with stubbed constructor args — no Angular DI needed.
 */
import { TeamAnalysisService } from './team-analysis.service'
import { TeamAnalysis } from '../models/team-analysis.model'
import { Roster } from '../models/roster.interface'
import { User } from '../models/user.interface'
import {
  LeagueFormat,
  MapValueBook,
  ValueBook,
  emptyCoverage,
} from '../models/value-book.model'

/** CLT's format: dynasty, superflex, 12-team, full PPR. */
const CLT_FORMAT: LeagueFormat = {
  fingerprint: { isDynasty: true, numQbs: 2, numTeams: 12, ppr: 1 },
  clamps: [],
  unsupportedReasons: [],
  approximations: [],
  isKeeper: false,
  teBonus: 0,
}

/**
 * Build a book from a plain value map. Ids absent from the map are UNKNOWN,
 * which is the distinction the old bare-number API could not express.
 */
function makeBook(
  valueMap: Record<string, number> = {},
  positions: Record<string, string> = {},
  picks: Record<string, number> = {},
): ValueBook {
  return new MapValueBook(
    CLT_FORMAT,
    new Map(Object.entries(valueMap)),
    new Map(Object.entries(positions)),
    new Map(Object.entries(picks)),
    new Map(),
    Date.now(),
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRoster(
  rosterId: number,
  ownerId: string,
  players: string[],
  starters: string[] = [],
  taxi: string[] = [],
  reserve: string[] = [],
): Roster {
  return {
    roster_id: rosterId, owner_id: ownerId, players, starters, taxi, reserve,
    co_owners: null, keepers: null, league_id: 'test', metadata: null, player_map: null,
    settings: { wins: 0, losses: 0, ties: 0, division: 1, fpts: 0, fpts_decimal: 0, fpts_against: 0, fpts_against_decimal: 0 },
  }
}

function makeUser(userId: string, displayName: string, teamName?: string): User {
  return {
    user_id: userId, username: displayName.toLowerCase(), display_name: displayName,
    avatar: null, is_bot: false, is_owner: false, is_commissioner: false,
    metadata: teamName ? { team_name: teamName } : null,
  }
}

function makeTeam(
  rosterId: number,
  vals: { qb?: number; rb?: number; wr?: number; te?: number; bench?: number; taxi?: number } = {},
): TeamAnalysis {
  return {
    rosterId, teamName: `Team ${rosterId}`, userId: `u${rosterId}`, avatarId: null,
    qbValue: vals.qb ?? 0, rbValue: vals.rb ?? 0, wrValue: vals.wr ?? 0, teValue: vals.te ?? 0,
    benchValue: vals.bench ?? 0, taxiValue: vals.taxi ?? 0,
    coverage: emptyCoverage(),
  }
}

function makeService(): TeamAnalysisService {
  return new TeamAnalysisService(null as any, null as any, null as any)
}

const playerMap: Record<string, { position: string; first_name: string; last_name: string }> = {
  qb1: { position: 'QB', first_name: 'QB', last_name: 'One' },
  rb1: { position: 'RB', first_name: 'RB', last_name: 'One' },
  wr1: { position: 'WR', first_name: 'WR', last_name: 'One' },
  te1: { position: 'TE', first_name: 'TE', last_name: 'One' },
  flex1: { position: 'FLEX', first_name: 'Flex', last_name: 'One' },
  bench_qb: { position: 'QB', first_name: 'Bench', last_name: 'QB' },
  taxi_rb: { position: 'RB', first_name: 'Taxi', last_name: 'RB' },
}

const defaultValues: Record<string, number> = {
  qb1: 5000, rb1: 4000, wr1: 3500, te1: 2000, flex1: 1500, bench_qb: 1000, taxi_rb: 800,
}

// ---------------------------------------------------------------------------
// build()
// ---------------------------------------------------------------------------

describe('TeamAnalysisService.build()', () => {
  const service = makeService()
  const book = makeBook(defaultValues)

  it('buckets starters by position', () => {
    const roster = makeRoster(1, 'u1', ['qb1', 'rb1', 'wr1', 'te1'], ['qb1', 'rb1', 'wr1', 'te1'])
    const [a] = service.build([roster], [makeUser('u1', 'Team A')], playerMap, book)
    expect(a.qbValue).toBe(5000)
    expect(a.rbValue).toBe(4000)
    expect(a.wrValue).toBe(3500)
    expect(a.teValue).toBe(2000)
    expect(a.benchValue).toBe(0)
    expect(a.taxiValue).toBe(0)
  })

  it('puts non-starter players on bench', () => {
    const roster = makeRoster(1, 'u1', ['qb1', 'rb1', 'bench_qb'], ['qb1', 'rb1'])
    const [a] = service.build([roster], [makeUser('u1', 'Team A')], playerMap, book)
    expect(a.qbValue).toBe(5000)
    expect(a.rbValue).toBe(4000)
    expect(a.benchValue).toBe(1000) // bench_qb not a starter → bench
  })

  it('excludes reserve players from bench', () => {
    const roster = makeRoster(1, 'u1', ['qb1', 'rb1'], ['qb1'], [], ['rb1'])
    const [a] = service.build([roster], [makeUser('u1', 'Team A')], playerMap, book)
    expect(a.benchValue).toBe(0)
    expect(a.rbValue).toBe(0) // reserve not counted anywhere
  })

  it('puts taxi players in taxiValue only', () => {
    const roster = makeRoster(1, 'u1', ['qb1', 'taxi_rb'], ['qb1'], ['taxi_rb'])
    const [a] = service.build([roster], [makeUser('u1', 'Team A')], playerMap, book)
    expect(a.taxiValue).toBe(800)
    expect(a.rbValue).toBe(0)
    expect(a.benchValue).toBe(0)
  })

  it('puts FLEX/unknown position players in bench regardless of starter status', () => {
    const roster = makeRoster(1, 'u1', ['flex1'], ['flex1'])
    const [a] = service.build([roster], [makeUser('u1', 'Team A')], playerMap, book)
    expect(a.benchValue).toBe(1500)
    expect(a.qbValue + a.rbValue + a.wrValue + a.teValue).toBe(0)
  })

  it('uses team_name metadata over display_name', () => {
    const [a] = service.build([makeRoster(1, 'u1', [])], [makeUser('u1', 'JohnDoe', 'The Champs')], playerMap, book)
    expect(a.teamName).toBe('The Champs')
  })

  it('falls back to display_name when no team_name metadata', () => {
    const [a] = service.build([makeRoster(1, 'u1', [])], [makeUser('u1', 'JohnDoe')], playerMap, book)
    expect(a.teamName).toBe('JohnDoe')
  })

  it('falls back to Roster #N when no user found', () => {
    const [a] = service.build([makeRoster(1, 'u_missing', [])], [], playerMap, book)
    expect(a.teamName).toBe('Roster #1')
  })

  it('contributes nothing for players the source does not carry', () => {
    const emptyBook = makeBook({})
    const [a] = service.build(
      [makeRoster(1, 'u1', ['qb1', 'rb1'], ['qb1', 'rb1'])],
      [makeUser('u1', 'Team A')],
      playerMap,
      emptyBook,
    )
    expect(a.qbValue + a.rbValue).toBe(0)
  })

  // --- coverage: the silent-zero fix ---------------------------------------

  it('records unknown players as uncovered instead of dropping them', () => {
    const partial = makeBook({ qb1: 5000 })
    const [a] = service.build(
      [makeRoster(1, 'u1', ['qb1', 'rb1', 'wr1'], ['qb1', 'rb1'])],
      [makeUser('u1', 'Team A')],
      playerMap,
      partial,
    )
    expect(a.coverage.rostered).toBe(3)
    expect(a.coverage.valued).toBe(1)
    expect(a.coverage.unvaluedIds).toEqual(['rb1', 'wr1'])
  })

  it('flags uncovered players who are in the starting lineup', () => {
    const partial = makeBook({ qb1: 5000 })
    const [a] = service.build(
      [makeRoster(1, 'u1', ['qb1', 'rb1', 'wr1'], ['qb1', 'rb1'])],
      [makeUser('u1', 'Team A')],
      playerMap,
      partial,
    )
    expect(a.coverage.unvaluedStarterIds).toEqual(['rb1'])
  })

  it('distinguishes a known zero value from an unknown player', () => {
    const zeroBook = makeBook({ qb1: 0 })
    const [a] = service.build(
      [makeRoster(1, 'u1', ['qb1'], ['qb1'])],
      [makeUser('u1', 'Team A')],
      playerMap,
      zeroBook,
    )
    expect(a.coverage.valued).toBe(1)
    expect(a.coverage.unvaluedIds).toEqual([])
  })

  // --- regression gate (PLAN.md 2.6) ---------------------------------------
  // CLT's numbers must not move as a result of the multi-league refactor.

  it('produces unchanged position sums for a fully covered roster', () => {
    const roster = makeRoster(
      1, 'u1',
      ['qb1', 'rb1', 'wr1', 'te1', 'bench_qb', 'taxi_rb'],
      ['qb1', 'rb1', 'wr1', 'te1'],
      ['taxi_rb'],
    )
    const [a] = service.build([roster], [makeUser('u1', 'Team A')], playerMap, book)
    expect(a.qbValue).toBe(5000)
    expect(a.rbValue).toBe(4000)
    expect(a.wrValue).toBe(3500)
    expect(a.teValue).toBe(2000)
    expect(a.benchValue).toBe(1000)
    expect(a.taxiValue).toBe(800)
    expect(a.coverage.unvaluedIds).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// axisMaxes()
// ---------------------------------------------------------------------------

describe('TeamAnalysisService.axisMaxes()', () => {
  const service = makeService()

  it('returns per-axis max across all teams', () => {
    const maxes = service.axisMaxes([
      makeTeam(1, { qb: 5000, rb: 2000, wr: 3000, te: 1000, bench: 500 }),
      makeTeam(2, { qb: 3000, rb: 4000, wr: 2500, te: 1500, bench: 800, taxi: 200 }),
    ])
    expect(maxes['QB']).toBe(5000)
    expect(maxes['RB']).toBe(4000)
    expect(maxes['WR']).toBe(3000)
    expect(maxes['TE']).toBe(1500)
    expect(maxes['Bench']).toBe(800)
    expect(maxes['Taxi']).toBe(200)
  })

  it('returns zeros for empty team list', () => {
    expect(Object.values(service.axisMaxes([])).every((v) => v === 0)).toBe(true)
  })

  it('handles a single team', () => {
    const maxes = service.axisMaxes([makeTeam(1, { qb: 4000, rb: 3000 })])
    expect(maxes['QB']).toBe(4000)
    expect(maxes['RB']).toBe(3000)
  })
})

// ---------------------------------------------------------------------------
// leagueAverageAxes()
// ---------------------------------------------------------------------------

describe('TeamAnalysisService.leagueAverageAxes()', () => {
  const service = makeService()

  it('computes per-axis averages across all teams', () => {
    const avgMap = Object.fromEntries(
      service.leagueAverageAxes([
        makeTeam(1, { qb: 4000, rb: 3000, wr: 2000, te: 1000, bench: 500 }),
        makeTeam(2, { qb: 2000, rb: 1000, wr: 4000, te: 3000, bench: 1500 }),
      ]).map((a) => [a.label, a.value]),
    )
    expect(avgMap['QB']).toBe(3000)
    expect(avgMap['RB']).toBe(2000)
    expect(avgMap['WR']).toBe(3000)
    expect(avgMap['TE']).toBe(2000)
    expect(avgMap['Bench']).toBe(1000)
    expect(avgMap['Taxi']).toBe(0)
  })

  it('returns zeros for empty team list', () => {
    const avgs = service.leagueAverageAxes([])
    expect(avgs.every((a) => a.value === 0)).toBe(true)
    expect(avgs.map((a) => a.label)).toEqual(['QB', 'RB', 'WR', 'TE', 'Bench', 'Taxi'])
  })

  it('returns axes in canonical hex order', () => {
    const avgs = service.leagueAverageAxes([makeTeam(1, { qb: 1, rb: 2, wr: 3, te: 4, bench: 5, taxi: 6 })])
    expect(avgs.map((a) => a.label)).toEqual(['QB', 'RB', 'WR', 'TE', 'Bench', 'Taxi'])
  })

  it('rounds fractional averages to integer', () => {
    const avgs = service.leagueAverageAxes([makeTeam(1, { qb: 3000 }), makeTeam(2, { qb: 2001 })])
    const qb = avgs.find((a) => a.label === 'QB')!
    expect(Number.isInteger(qb.value)).toBe(true)
  })
})
