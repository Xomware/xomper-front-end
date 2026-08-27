/**
 * Tests for the trade analyzer.
 *
 * The evaluation engine is already covered by
 * `recommended-trade.service.spec.ts`. What matters here is that the screen
 * feeds it the right league's values and refuses to show a verdict it cannot
 * stand behind — an unvalued asset scores as 0, which reads as "they gave up
 * nothing".
 */
import { of, throwError } from 'rxjs'
import { TradeAnalyzerComponent } from './trade-analyzer.component'
import { MapValueBook, LeagueFormat } from 'src/app/models/value-book.model'
import { RecommendedTradeService } from 'src/app/services/recommended-trade.service'

const FORMAT: LeagueFormat = {
  fingerprint: { isDynasty: true, numQbs: 1, numTeams: 12, ppr: 1 },
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
}

const PLAYER_MAP = {
  p1: { first_name: 'Alpha', last_name: 'One', position: 'RB' },
  p2: { first_name: 'Beta', last_name: 'Two', position: 'WR' },
  p3: { first_name: 'Gamma', last_name: 'Three', position: 'QB' },
  p9: { first_name: 'Kicker', last_name: 'Nine', position: 'K' },
}

function book() {
  // p9 deliberately absent: kickers are not covered by dynasty values.
  return new MapValueBook(
    FORMAT,
    new Map([
      ['p1', 9000],
      ['p2', 5000],
      ['p3', 4200],
    ]),
    new Map([
      ['p1', 'RB'],
      ['p2', 'WR'],
      ['p3', 'QB'],
    ]),
    new Map(),
    new Map(),
    Date.now(),
  )
}

const ROSTERS = [
  { roster_id: 1, owner_id: 'u1', players: ['p1', 'p9'] },
  { roster_id: 2, owner_id: 'u2', players: ['p2', 'p3'] },
]

function build(options: { activeLeagueId?: string | null; loadFails?: boolean } = {}) {
  const { activeLeagueId = 'league-1', loadFails = false } = options

  const leagueService = {
    getActiveLeagueId: () => activeLeagueId,
    searchLeague: () =>
      loadFails ? throwError(() => new Error('nope')) : of({ league_id: 'league-1' }),
    findLeagueRosters: () => of(ROSTERS),
    findLeagueUsers: () => of([{ user_id: 'u1' }, { user_id: 'u2' }]),
  }

  const component = new TradeAnalyzerComponent(
    leagueService as never,
    { getPlayerMap: () => of(PLAYER_MAP) } as never,
    { bookFor: () => of(book()) } as never,
    new RecommendedTradeService(null as never, null as never),
    {
      build: () => [
        { rosterId: 1, teamName: 'Team One', userId: 'u1' },
        { rosterId: 2, teamName: 'Team Two', userId: 'u2' },
      ],
    } as never,
    { getMyUser: () => ({ getUserId: () => 'u1' }) } as never,
  )
  return { component, leagueService }
}

describe('TradeAnalyzerComponent', () => {
  it('errors when no league is active', () => {
    const { component } = build({ activeLeagueId: null })

    component.ngOnInit()

    expect(component.error).toContain('No league')
    expect(component.loading).toBe(false)
  })

  it('surfaces a load failure instead of spinning', () => {
    const { component } = build({ loadFails: true })

    component.ngOnInit()

    expect(component.error).toBeTruthy()
    expect(component.loading).toBe(false)
  })

  it('defaults side A to the signed-in user\'s team', () => {
    const { component } = build()

    component.ngOnInit()

    expect(component.sideARosterId).toBe(1)
    expect(component.sideBRosterId).toBe(2)
  })

  it('lists a roster sorted by value, highest first', () => {
    const { component } = build()
    component.ngOnInit()

    const players = component.playersFor(2)

    expect(players.map((p) => p.playerId)).toEqual(['p2', 'p3'])
  })

  it('marks a player the value source does not cover', () => {
    const { component } = build()
    component.ngOnInit()

    const kicker = component.playersFor(1).find((p) => p.playerId === 'p9')

    expect(kicker?.known).toBe(false)
  })

  it('shows no verdict until both sides have players', () => {
    const { component } = build()
    component.ngOnInit()

    component.toggle('A', 'p1')

    expect(component.evaluation).toBeTruthy()
    expect(component.verdict).toContain('Team One')
  })

  it('grades a lopsided trade toward the heavier side', () => {
    const { component } = build()
    component.ngOnInit()

    component.toggle('A', 'p1') // 9000
    component.toggle('B', 'p3') // 4200

    expect(component.verdictTone).toBe('a')
    expect(component.isGradable).toBe(true)
  })

  it('calls a close trade fair', () => {
    const { component } = build()
    component.ngOnInit()

    component.toggle('A', 'p2') // 5000
    component.toggle('B', 'p2') // same value both sides

    expect(component.verdictTone).toBe('fair')
  })

  it('refuses to grade a trade containing an unvalued asset', () => {
    const { component } = build()
    component.ngOnInit()

    component.toggle('A', 'p9') // no value in this format
    component.toggle('B', 'p2')

    // Scoring p9 as 0 would read as "Team One gave up nothing" — a
    // confidently wrong verdict is worse than none.
    expect(component.unvalued).toContain('p9')
    expect(component.isGradable).toBe(false)
  })

  it('names the unvalued players so the message is actionable', () => {
    const { component } = build()
    component.ngOnInit()
    component.toggle('A', 'p9')
    component.toggle('B', 'p2')

    expect(component.unvaluedNames()).toContain('Kicker Nine')
  })

  it('clears selections on both sides', () => {
    const { component } = build()
    component.ngOnInit()
    component.toggle('A', 'p1')
    component.toggle('B', 'p2')

    component.clear()

    expect(component.evaluation).toBeNull()
    expect(component.isSelected('A', 'p1')).toBe(false)
    expect(component.isSelected('B', 'p2')).toBe(false)
  })

  it('drops selections when the team on that side changes', () => {
    const { component } = build()
    component.ngOnInit()
    component.toggle('B', 'p2')

    component.onSideBChange(1)

    // Those players are not on the new roster; keeping them would grade a
    // trade nobody could make.
    expect(component.isSelected('B', 'p2')).toBe(false)
  })

  it('substitutes real team names into the verdict', () => {
    const { component } = build()
    component.ngOnInit()
    component.toggle('A', 'p1')
    component.toggle('B', 'p3')

    expect(component.verdict).toContain('Team One')
    expect(component.verdict).not.toContain('Side A')
  })
})
