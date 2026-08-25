/**
 * Unit tests for RecommendedTradeService: evaluate(), sideValue(), recommend().
 * Services are instantiated with stubbed constructor args — no Angular DI needed.
 */
import { RecommendedTradeService } from './recommended-trade.service'
import { TeamAnalysisService } from './team-analysis.service'
import {
  FAIR_THRESHOLD,
  HexAxis,
  ProposedTrade,
  TeamAnalysis,
  TradeSide,
  emptyTradeSide,
} from '../models/team-analysis.model'
import { Roster } from '../models/roster.interface'
import {
  LeagueFormat,
  MapValueBook,
  ValueBook,
  emptyCoverage,
} from '../models/value-book.model'

const CLT_FORMAT: LeagueFormat = {
  fingerprint: { isDynasty: true, numQbs: 2, numTeams: 12, ppr: 1 },
  clamps: [],
  unsupportedReasons: [],
  approximations: [],
  isKeeper: false,
  teBonus: 0,
  scoringSettings: { rec: 1 },
  rosterPositions: [],
}

function bookOf(
  valueMap: Record<string, number> = {},
  pickMap: Record<string, number> = {},
): ValueBook {
  return new MapValueBook(
    CLT_FORMAT,
    new Map(Object.entries(valueMap)),
    new Map(),
    new Map(Object.entries(pickMap)),
    new Map(),
    Date.now(),
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRoster(rosterId: number, players: string[], ownerId?: string): Roster {
  return {
    roster_id: rosterId, owner_id: ownerId ?? `u${rosterId}`, players,
    starters: [], taxi: [], reserve: [], co_owners: null, keepers: null, league_id: 'test',
    metadata: null, player_map: null,
    settings: { wins: 0, losses: 0, ties: 0, division: 1, fpts: 0, fpts_decimal: 0, fpts_against: 0, fpts_against_decimal: 0 },
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

/**
 * Binds a service to one `ValueBook` so the tests read the same as before the
 * multi-league refactor. The book is a real `MapValueBook`, so an id absent
 * from `valueMap` is genuinely UNKNOWN rather than silently worth zero.
 */
function makeService(
  valueMap: Record<string, number> = {},
  pickMap: Record<string, number> = {},
  leagueAvg?: HexAxis[],
) {
  const avg5k = (): HexAxis[] =>
    ['QB', 'RB', 'WR', 'TE', 'Bench', 'Taxi'].map((label) => ({ label, value: 0 }))

  const teamAnalysisStub = {
    leagueAverageAxes: (_: TeamAnalysis[]) => leagueAvg ?? avg5k(),
  } as unknown as TeamAnalysisService

  const service = new RecommendedTradeService(null as any, teamAnalysisStub)
  const book = bookOf(valueMap, pickMap)

  return {
    book,
    evaluate: (trade: ProposedTrade) => service.evaluate(trade, book),
    sideValue: (side: TradeSide) => service.sideValue(side, book),
    unvaluedAssets: (trade: ProposedTrade) => service.unvaluedAssets(trade, book),
    suggestBalance: (
      trade: Parameters<RecommendedTradeService['suggestBalance']>[0],
      evaluation: Parameters<RecommendedTradeService['suggestBalance']>[1],
      rosters: Parameters<RecommendedTradeService['suggestBalance']>[2],
      playerMap: Parameters<RecommendedTradeService['suggestBalance']>[3],
      limit?: number,
    ) => service.suggestBalance(trade, evaluation, rosters, playerMap, book, limit),
    recommend: (
      myAnalysis: Parameters<RecommendedTradeService['recommend']>[0],
      analyses: Parameters<RecommendedTradeService['recommend']>[1],
      rosters: Parameters<RecommendedTradeService['recommend']>[2],
      playerMap: Parameters<RecommendedTradeService['recommend']>[3],
      limit?: number,
    ) => service.recommend(myAnalysis, analyses, rosters, playerMap, book, limit),
  }
}

function avg5000(): HexAxis[] {
  return ['QB', 'RB', 'WR', 'TE'].map((label) => ({ label, value: 5000 }))
    .concat([{ label: 'Bench', value: 0 }, { label: 'Taxi', value: 0 }])
}

function tradeOf(aIds: string[], bIds: string[]): ProposedTrade {
  return {
    sideA: { rosterId: 1, teamName: 'A', playerIds: aIds, pickNames: [] },
    sideB: { rosterId: 2, teamName: 'B', playerIds: bIds, pickNames: [] },
  }
}

// ---------------------------------------------------------------------------
// FAIR_THRESHOLD constant
// ---------------------------------------------------------------------------

describe('FAIR_THRESHOLD', () => {
  it('is 0.05 (5%)', () => {
    expect(FAIR_THRESHOLD).toBe(0.05)
  })
})

// ---------------------------------------------------------------------------
// unvaluedAssets() — a trade containing an unpriceable asset can't be graded
// ---------------------------------------------------------------------------

describe('RecommendedTradeService.unvaluedAssets()', () => {
  it('returns nothing when every asset is covered', () => {
    const svc = makeService({ p1: 5000, p2: 4000 })
    expect(svc.unvaluedAssets(tradeOf(['p1'], ['p2']))).toEqual([])
  })

  it('reports players the source does not carry', () => {
    const svc = makeService({ p1: 5000 })
    expect(svc.unvaluedAssets(tradeOf(['p1'], ['kicker1']))).toEqual(['kicker1'])
  })

  it('reports unvalued picks as well as players', () => {
    const svc = makeService({ p1: 5000 })
    const trade: ProposedTrade = {
      sideA: { rosterId: 1, teamName: 'A', playerIds: ['p1'], pickNames: [] },
      sideB: { rosterId: 2, teamName: 'B', playerIds: [], pickNames: ['2099 1st'] },
    }
    expect(svc.unvaluedAssets(trade)).toEqual(['2099 1st'])
  })

  it('treats a known zero-valued asset as covered', () => {
    const svc = makeService({ p1: 5000, p2: 0 })
    expect(svc.unvaluedAssets(tradeOf(['p1'], ['p2']))).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// evaluate()
// ---------------------------------------------------------------------------

describe('RecommendedTradeService.evaluate()', () => {
  it('returns empty verdict for an empty trade', () => {
    const result = makeService().evaluate({ sideA: emptyTradeSide(1, 'A'), sideB: emptyTradeSide(2, 'B') })
    expect(result.verdict.type).toBe('empty')
    expect(result.sideAValue).toBe(0)
    expect(result.sideBValue).toBe(0)
  })

  it('returns fair verdict when gap is 0%', () => {
    const result = makeService({ p1: 5000, p2: 5000 }).evaluate(tradeOf(['p1'], ['p2']))
    expect(result.verdict.type).toBe('fair')
    expect(result.percentGap).toBe(0)
  })

  it('returns fair verdict when gap is exactly 5%', () => {
    // 5000 vs 4750 → gap = 250/5000 = 0.05
    const result = makeService({ p1: 5000, p2: 4750 }).evaluate(tradeOf(['p1'], ['p2']))
    expect(result.verdict.type).toBe('fair')
  })

  it('returns sideAWins when side A is >5% more valuable', () => {
    // 5000 vs 1000 → gap = 4000/5000 = 0.8
    const result = makeService({ p1: 5000, p3: 1000 }).evaluate(tradeOf(['p1'], ['p3']))
    expect(result.verdict.type).toBe('sideAWins')
    if (result.verdict.type === 'sideAWins') {
      expect(result.verdict.byPercent).toBeCloseTo(0.8, 2)
    }
  })

  it('returns sideBWins when side B is more valuable', () => {
    const result = makeService({ p1: 1000, p2: 5000 }).evaluate(tradeOf(['p1'], ['p2']))
    expect(result.verdict.type).toBe('sideBWins')
  })

  it('includes pick values in sideValue', () => {
    const service = makeService({ p3: 1000 }, { '2026 1st': 3000 })
    const trade: ProposedTrade = {
      sideA: { rosterId: 1, teamName: 'A', playerIds: [], pickNames: ['2026 1st'] },
      sideB: { rosterId: 2, teamName: 'B', playerIds: ['p3'], pickNames: [] },
    }
    const result = service.evaluate(trade)
    expect(result.sideAValue).toBe(3000)
    expect(result.sideBValue).toBe(1000)
    expect(result.verdict.type).toBe('sideAWins')
  })

  it('computes delta correctly', () => {
    const result = makeService({ p1: 6000, p2: 4000 }).evaluate(tradeOf(['p1'], ['p2']))
    expect(result.delta).toBe(2000)
  })
})

// ---------------------------------------------------------------------------
// sideValue()
// ---------------------------------------------------------------------------

describe('RecommendedTradeService.sideValue()', () => {
  it('sums players + picks', () => {
    const service = makeService({ p1: 5000, p2: 3000 }, { '2027 1st': 2500 })
    const side: TradeSide = { rosterId: 1, teamName: 'A', playerIds: ['p1', 'p2'], pickNames: ['2027 1st'] }
    expect(service.sideValue(side)).toBe(10500)
  })

  it('returns 0 for an empty side', () => {
    expect(makeService().sideValue(emptyTradeSide(1, 'A'))).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// recommend()
// ---------------------------------------------------------------------------

describe('RecommendedTradeService.recommend()', () => {
  type PMap = Record<string, { position: string; first_name: string; last_name: string }>

  it('returns [] when I have no weak positions (all at league avg)', () => {
    const service = makeService({}, {}, avg5000())
    const myTeam = makeTeam(1, { qb: 5000, rb: 5000, wr: 5000, te: 5000 })
    const partner = makeTeam(2, { qb: 5000, rb: 5000, wr: 5000, te: 5000 })
    expect(service.recommend(myTeam, [myTeam, partner], [], {})).toEqual([])
  })

  it('returns [] when I have no strong positions to give', () => {
    const service = makeService({}, {}, avg5000())
    // Weak at QB but no position ≥ 1.05 of avg
    const myTeam = makeTeam(1, { qb: 800, rb: 3000, wr: 3000, te: 3000 })
    const partner = makeTeam(2, { qb: 8000, rb: 5000, wr: 5000, te: 5000 })
    expect(service.recommend(myTeam, [myTeam, partner], [], {})).toEqual([])
  })

  it('does not include myAnalysis team as a partner', () => {
    const service = makeService({}, {}, avg5000())
    const myTeam = makeTeam(1, { qb: 800, wr: 6000, rb: 5000, te: 5000 })
    expect(service.recommend(myTeam, [myTeam], [], {})).toEqual([])
  })

  it('surfaces a fair-value trade when conditions are met', () => {
    // My QB is weak (800/5000 = 0.16 ≤ 0.85), WR is surplus (6000/5000 = 1.2 ≥ 1.05)
    // Partner has surplus QB (8000/5000 = 1.6 ≥ 1.05)
    // Trade: myWR1=4000 for theirQB1=4200 → gap = 200/4200 ≈ 0.048 ≤ 0.05 → fair
    const service = makeService({ myWR1: 4000, theirQB1: 4200 }, {}, avg5000())

    const myTeam = makeTeam(1, { qb: 800, wr: 6000, rb: 5000, te: 5000 })
    const partner = makeTeam(2, { qb: 8000, wr: 5000, rb: 5000, te: 5000 })
    const myRoster = makeRoster(1, ['myWR1'])
    const partnerRoster = makeRoster(2, ['theirQB1'])
    const playerMap: PMap = {
      myWR1: { position: 'WR', first_name: 'My', last_name: 'WR' },
      theirQB1: { position: 'QB', first_name: 'Their', last_name: 'QB' },
    }

    const result = service.recommend(myTeam, [myTeam, partner], [myRoster, partnerRoster], playerMap)

    expect(result.length).toBeGreaterThan(0)
    expect(result[0].give.position).toBe('WR')
    expect(result[0].receive.position).toBe('QB')
    expect(result[0].partnerRosterId).toBe(2)
    expect(result[0].percentGap).toBeLessThanOrEqual(FAIR_THRESHOLD)
  })

  it('respects the limit parameter', () => {
    const service = makeService({}, {}, avg5000())
    const myTeam = makeTeam(1, { qb: 800, wr: 6000, rb: 5000, te: 5000 })
    const partners = Array.from({ length: 10 }, (_, i) =>
      makeTeam(i + 2, { qb: 8000, wr: 5000, rb: 5000, te: 5000 }),
    )
    const result = service.recommend(myTeam, [myTeam, ...partners], [], {}, 3)
    expect(result.length).toBeLessThanOrEqual(3)
  })

  it('deduplicates identical pair keys', () => {
    const service = makeService({ myWR1: 4000, theirQB1: 4200 }, {}, avg5000())
    const myTeam = makeTeam(1, { qb: 800, wr: 6000, rb: 5000, te: 5000 })
    const partner = makeTeam(2, { qb: 8000, wr: 5000, rb: 5000, te: 5000 })
    const playerMap: PMap = {
      myWR1: { position: 'WR', first_name: 'My', last_name: 'WR' },
      theirQB1: { position: 'QB', first_name: 'Their', last_name: 'QB' },
    }
    const result = service.recommend(
      myTeam, [myTeam, partner],
      [makeRoster(1, ['myWR1']), makeRoster(2, ['theirQB1'])],
      playerMap,
    )
    const ids = result.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ranks results by myImprovement descending', () => {
    // theirQB1=3800 → improvement = min(3800, 5000−800) = min(3800,4200) = 3800
    // theirQB2=3000 → improvement = min(3000, 4200) = 3000
    const service = makeService(
      { myWR1: 3850, myWR2: 3050, theirQB1: 3800, theirQB2: 3000 },
      {},
      avg5000(),
    )
    const myTeam = makeTeam(1, { qb: 800, wr: 6000, rb: 5000, te: 5000 })
    const p1 = makeTeam(2, { qb: 8000, wr: 5000, rb: 5000, te: 5000 })
    const p2 = makeTeam(3, { qb: 7000, wr: 5000, rb: 5000, te: 5000 })
    const playerMap: PMap = {
      myWR1: { position: 'WR', first_name: 'My', last_name: 'WR1' },
      myWR2: { position: 'WR', first_name: 'My', last_name: 'WR2' },
      theirQB1: { position: 'QB', first_name: 'Their', last_name: 'QB1' },
      theirQB2: { position: 'QB', first_name: 'Their', last_name: 'QB2' },
    }
    const result = service.recommend(
      myTeam, [myTeam, p1, p2],
      [makeRoster(1, ['myWR1', 'myWR2']), makeRoster(2, ['theirQB1']), makeRoster(3, ['theirQB2'])],
      playerMap,
    )
    if (result.length >= 2) {
      expect(result[0].myImprovement).toBeGreaterThanOrEqual(result[1].myImprovement)
    }
  })
})
