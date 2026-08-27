/**
 * Tests for LeagueComponent's mode selection and loading state.
 *
 * Both cases here shipped broken. The s3 league split routed /league without
 * a mode, so the component's 'selected' default sent it down the query-param
 * path with no query param — it searched for league `undefined`, 404'd, and
 * because `complete` never fires after `error`, sat on "Loading..." forever.
 * Every page under /league was dead.
 */
import { of, throwError } from 'rxjs'
import { LeagueComponent } from './league.component'

function league(id = '1317249551823814656') {
  return {
    league_id: id,
    getId: () => id,
    getUsers: () => [],
    getRosters: () => [],
    getProfilePicture: () => '',
    getDisplayName: () => 'Charlotte Dynasty League',
    setDivisions: () => undefined,
    setUsers: () => undefined,
    setRosters: () => undefined,
    setStandingsTeams: () => undefined,
    setTaxiSquadIds: () => undefined,
    getTaxiSquadIds: () => [],
    metadata: {},
  }
}

function build(options: { data?: Record<string, unknown>; myLeague?: unknown; searchFails?: boolean } = {}) {
  const { data = {}, myLeague = league(), searchFails = false } = options

  // Stateful: the component sets the current league and immediately reads it
  // back, so a no-op setter leaves it holding null.
  let current: unknown = null
  const leagueService = {
    getMyLeague: () => myLeague,
    getCurrentLeague: () => current,
    setCurrentLeague: (l: unknown) => { current = l },
    setMyLeague: () => undefined,
    searchLeague: jasmine.createSpy('searchLeague').and.callFake(() =>
      searchFails ? throwError(() => new Error('404')) : of(league()),
    ),
    getLeagueChain: () => of([league()]),
    loadLeagueContext: () => of({ league: league(), users: [], rosters: [] }),
    findLeagueUsers: () => of([]),
    findLeagueRosters: () => of([]),
  }
  const toastService = {
    showPositiveToast: jasmine.createSpy('pos'),
    showNegativeToast: jasmine.createSpy('neg'),
  }
  const component = new LeagueComponent(
    leagueService as never,
    { navigate: () => undefined } as never,
    toastService as never,
    { buildStandings: (s: unknown[]) => s } as never,
    { setMyTeam: () => undefined } as never,
    { getMyUser: () => null, buildAvatar: () => '' } as never,
    { currentUser: { userId: 'cog-1' } } as never,
    { snapshot: { data }, queryParams: of({}) } as never,
  )
  return { component, leagueService, toastService }
}

describe('LeagueComponent', () => {
  it("takes mode 'my' from route data", () => {
    const { component, leagueService } = build({ data: { mode: 'my' } })

    component.ngOnInit()

    // The whole bug: without this it read a query param that was never there.
    expect(component.mode).toBe('my')
    expect(leagueService.searchLeague).not.toHaveBeenCalled()
  })

  it("takes mode 'selected' from route data", () => {
    const { component, leagueService } = build({ data: { mode: 'selected' } })

    component.ngOnInit()

    expect(component.mode).toBe('selected')
    expect(leagueService.searchLeague).toHaveBeenCalled()
  })

  it('finishes loading on the my-league path', () => {
    const { component } = build({ data: { mode: 'my' } })

    component.ngOnInit()

    expect(component.loading).toBe(false)
  })

  it('finishes loading when the league search fails', () => {
    const { component, toastService } = build({ data: { mode: 'selected' }, searchFails: true })

    component.ngOnInit()

    // `complete` does not fire after `error`. Clearing the flag only there is
    // what left the page on "Loading..." with no way out.
    expect(component.loading).toBe(false)
    expect(toastService.showNegativeToast).toHaveBeenCalled()
  })

  it('finishes loading and says so when there is no league yet', () => {
    const { component, toastService } = build({ data: { mode: 'my' }, myLeague: null })

    component.ngOnInit()

    expect(component.loading).toBe(false)
    expect(toastService.showNegativeToast).toHaveBeenCalled()
  })
})
