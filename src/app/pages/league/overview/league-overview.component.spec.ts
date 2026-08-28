/**
 * Tests for the league overview.
 *
 * It replaces standings as what you land on for a league, so the ranking is
 * the page. Ordering it wrong tells someone their league looks different than
 * it does.
 */
import { of, throwError } from 'rxjs'
import { LeagueOverviewComponent } from './league-overview.component'

function analysis(rosterId: number, teamName: string, userId: string, values: number[]) {
  const [qb, rb, wr, te, bench, taxi] = values
  return {
    rosterId,
    teamName,
    userId,
    avatarId: null,
    qbValue: qb,
    rbValue: rb,
    wrValue: wr,
    teValue: te,
    benchValue: bench,
    taxiValue: taxi,
    coverage: { valued: 1, total: 1 },
  }
}

const ANALYSES = [
  // total 2600 — strongest WR, thinnest TE
  analysis(1, 'Mine', 'u1', [500, 700, 900, 100, 300, 100]),
  // total 5200 — strongest RB, thinnest QB
  analysis(2, 'Loaded', 'u2', [200, 3000, 1000, 400, 500, 100]),
]

function build(options: { fails?: boolean; analyses?: unknown[]; myUserId?: string } = {}) {
  const { fails = false, analyses = ANALYSES, myUserId = 'u1' } = options

  const component = new LeagueOverviewComponent(
    {
      getActiveLeagueId: () => 'l1',
      searchLeague: () =>
        fails ? throwError(() => new Error('boom')) : of({ getDisplayName: () => 'CLT' }),
      findLeagueRosters: () => of([]),
      findLeagueUsers: () => of([]),
    } as never,
    { getPlayerMap: () => of({}) } as never,
    { bookFor: () => of({}) } as never,
    { build: () => analyses } as never,
    { getMyUser: () => ({ getUserId: () => myUserId }) } as never,
    { selectedLeague: { isDynasty: true, totalRosters: 12 } } as never,
    { navigate: jasmine.createSpy('navigate') } as never,
  )
  return component
}

describe('LeagueOverviewComponent', () => {
  it('ranks by total roster value, strongest first', () => {
    const component = build()

    component.ngOnInit()

    expect(component.rows.map((r) => r.teamName)).toEqual(['Loaded', 'Mine'])
    expect(component.rows[0].rank).toBe(1)
  })

  it('sums every group into the total', () => {
    const component = build()
    component.ngOnInit()

    // 200 + 3000 + 1000 + 400 + 500 + 100
    expect(component.rows[0].total).toBe(5200)
  })

  it('scales the bar against the strongest roster', () => {
    const component = build()
    component.ngOnInit()

    expect(component.rows[0].share).toBe(1)
    expect(component.rows[1].share).toBeCloseTo(2600 / 5200, 5)
  })

  it('names the strongest and thinnest starting groups', () => {
    const component = build()
    component.ngOnInit()

    const loaded = component.rows[0]
    expect(loaded.strength).toBe('RB')
    expect(loaded.weakness).toBe('QB')
  })

  it('ignores bench and taxi when naming groups', () => {
    // Bench is this roster's biggest number but is not a position to fix.
    const component = build({
      analyses: [analysis(1, 'Deep', 'u1', [100, 200, 300, 50, 9000, 8000])],
    })

    component.ngOnInit()

    expect(component.rows[0].strength).toBe('WR')
    expect(component.rows[0].weakness).toBe('TE')
  })

  it('marks which roster is mine', () => {
    const component = build({ myUserId: 'u1' })

    component.ngOnInit()

    expect(component.rows.find((r) => r.isMine)?.teamName).toBe('Mine')
  })

  it('marks nothing when the viewer is not in the league', () => {
    const component = build({ myUserId: 'stranger' })

    component.ngOnInit()

    expect(component.rows.some((r) => r.isMine)).toBe(false)
  })

  it('surfaces a load failure instead of spinning', () => {
    const component = build({ fails: true })

    component.ngOnInit()

    expect(component.error).toBeTruthy()
    expect(component.loading).toBe(false)
  })

  it('says so when no league is active', () => {
    const component = build()
    ;(component as unknown as { leagueService: { getActiveLeagueId: () => null } }).leagueService =
      { getActiveLeagueId: () => null }

    component.ngOnInit()

    expect(component.error).toContain('No league')
  })

  it('offers routes deeper into the league', () => {
    const component = build()

    const routes = component.deeper.map((d) => d.route)
    expect(routes).toContain('/league/standings')
    expect(routes).toContain('/trades')
  })
})
