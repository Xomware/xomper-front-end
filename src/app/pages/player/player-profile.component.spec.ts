/**
 * Tests for the player profile.
 *
 * This is not a stat page — `xomper-stats-current` is empty, so anything
 * resembling production numbers would be invented. What it claims is the
 * player's identity, their value under *this* league's settings, where that
 * ranks at their position, and who holds them. Each of those is wrong in a
 * different way if it silently defaults.
 */
import { of, throwError } from 'rxjs'
import { PlayerProfileComponent } from './player-profile.component'
import { MapValueBook, LeagueFormat } from 'src/app/models/value-book.model'

const FORMAT: LeagueFormat = {
  fingerprint: { isDynasty: true, numQbs: 1, numTeams: 12, ppr: 1 },
  clamps: [],
  unsupportedReasons: [],
  approximations: [],
  isKeeper: false,
  teBonus: 0,
  scoringSettings: { rec: 1 },
  rosterPositions: ['QB', 'RB', 'WR', 'TE'],
  leagueId: 'l1',
  maxKeepers: 0,
  startingSlots: 4,
}

const PLAYERS = {
  wr1: { first_name: 'Top', last_name: 'Wideout', full_name: 'Top Wideout', position: 'WR', team: 'BUF', age: 25, years_exp: 3, height: '73', weight: '200', college: 'Somewhere', number: 11 },
  wr2: { first_name: 'Other', last_name: 'Wideout', position: 'WR', team: 'MIA' },
  k1: { first_name: 'A', last_name: 'Kicker', position: 'K', team: 'NYJ' },
}

function book() {
  return new MapValueBook(
    FORMAT,
    new Map([['wr1', 9000], ['wr2', 4000]]),
    new Map([['wr1', 'WR'], ['wr2', 'WR']]),
    new Map(),
    new Map(),
    Date.now(),
  )
}

const ROSTERS = [{ roster_id: 3, owner_id: 'u9', players: ['wr1'] }]
const USERS = [{ user_id: 'u9', display_name: 'someone', metadata: { team_name: 'Big Club' } }]

function build(playerId: string, options: { leagueId?: string | null; leagueFails?: boolean } = {}) {
  const { leagueId = 'l1', leagueFails = false } = options
  return new PlayerProfileComponent(
    { snapshot: { paramMap: { get: () => playerId } } } as never,
    { navigate: jasmine.createSpy('navigate') } as never,
    { getPlayerMap: () => of(PLAYERS) } as never,
    { bookFor: () => of(book()) } as never,
    {
      getActiveLeagueId: () => leagueId,
      searchLeague: () =>
        leagueFails ? throwError(() => new Error('x')) : of({ getDisplayName: () => 'CLT' }),
      findLeagueRosters: () => of(ROSTERS),
      findLeagueUsers: () => of(USERS),
    } as never,
  )
}

describe('PlayerProfileComponent', () => {
  it('shows identity from the player map', () => {
    const component = build('wr1')

    component.ngOnInit()

    expect(component.name).toBe('Top Wideout')
    expect(component.position).toBe('WR')
    expect(component.team).toBe('BUF')
  })

  it('falls back to first and last when full_name is missing', () => {
    const component = build('wr2')

    component.ngOnInit()

    expect(component.name).toBe('Other Wideout')
  })

  it('lists only facts that exist', () => {
    const component = build('wr2')

    component.ngOnInit()

    // A row reading "College —" is worse than no row.
    expect(component.facts).toEqual([])
  })

  it('formats height in feet and inches', () => {
    const component = build('wr1')

    component.ngOnInit()

    expect(component.facts.find((f) => f.label === 'Height')?.value).toBe("6'1\"")
  })

  it('shows the value and positional rank for this league', () => {
    const component = build('wr1')

    component.ngOnInit()

    expect(component.value).toBe(9000)
    expect(component.positionRank).toBe(1)
    expect(component.positionCount).toBe(2)
  })

  it('ranks a lesser player correctly', () => {
    const component = build('wr2')

    component.ngOnInit()

    expect(component.positionRank).toBe(2)
  })

  it('reports an unpriced player as not priced, not zero', () => {
    const component = build('k1')

    component.ngOnInit()

    // Kickers carry no dynasty value. Zero would read as worthless.
    expect(component.value).toBeNull()
    expect(component.positionRank).toBeNull()
  })

  it('names the roster holding the player', () => {
    const component = build('wr1')

    component.ngOnInit()

    expect(component.ownerTeam).toBe('Big Club')
  })

  it('reports an unrostered player as a free agent', () => {
    const component = build('wr2')

    component.ngOnInit()

    expect(component.ownerTeam).toBeNull()
  })

  it('still shows the player when no league is active', () => {
    const component = build('wr1', { leagueId: null })

    component.ngOnInit()

    // Value and owner are league-scoped; identity is not.
    expect(component.name).toBe('Top Wideout')
    expect(component.value).toBeNull()
    expect(component.error).toBeNull()
  })

  it('still shows the player when the league fails to load', () => {
    const component = build('wr1', { leagueFails: true })

    component.ngOnInit()

    expect(component.name).toBe('Top Wideout')
    expect(component.error).toBeNull()
  })

  it('errors on an unknown player', () => {
    const component = build('nobody')

    component.ngOnInit()

    expect(component.error).toBeTruthy()
    expect(component.loading).toBe(false)
  })
})
