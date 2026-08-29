/**
 * Tests for search.
 *
 * League search takes a league id, which nobody knows. Reaching a league you
 * are not in realistically means going through someone who is in it, so a
 * username search has to surface their leagues.
 */
import { of, throwError } from 'rxjs'
import { SearchComponent } from './search.component'

const USER = { user_id: '594625531702460416', username: 'domgiordano', display_name: 'domgiordano', avatar: 'abc' }
const LEAGUES = [
  { league_id: 'l1', name: 'Charlotte Dynasty League', season: '2026', total_rosters: 12, status: 'in_season' },
  { league_id: 'l2', name: 'Smirnoff League', season: '2026', total_rosters: 14, status: 'pre_draft' },
]

function build(options: { user?: unknown; leaguesFail?: boolean; userFails?: boolean } = {}) {
  const { user = USER, leaguesFail = false, userFails = false } = options
  const router = { navigate: jasmine.createSpy('navigate') }

  // Argument order matches the component: league, user, player, router, toast.
  const component = new SearchComponent(
    { searchLeague: () => of(null) } as never,
    {
      searchUser: () => (userFails ? throwError(() => new Error('x')) : of(user)),
      findUserLeagues: () => (leaguesFail ? throwError(() => new Error('x')) : of(LEAGUES)),
    } as never,
    { searchPlayers: () => of([]) } as never,
    router as never,
    { showNegativeToast: () => undefined, showPositiveToast: () => undefined } as never,
  )
  component.searchMode = 'user'
  component.searchTerm = 'domgiordano'
  return { component, router }
}

describe('SearchComponent user search', () => {
  it('lists the leagues that user is in', () => {
    const { component } = build()

    component.search()

    expect(component.leagueResults.length).toBe(2)
    expect(component.foundUser?.username).toBe('domgiordano')
  })

  it('does not navigate away from the results', () => {
    const { component, router } = build()

    component.search()

    // Bouncing to their profile hides the leagues, which are the reason for
    // searching a username in the first place.
    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('still shows the user when they have no leagues', () => {
    const { component } = build({ leaguesFail: true })

    component.search()

    // No leagues this season is a real answer, not a failure.
    expect(component.foundUser).toBeTruthy()
    expect(component.leagueResults).toEqual([])
    expect(component.errorMessage).toBe('')
  })

  it('reports an unknown username', () => {
    const { component } = build({ user: null })

    component.search()

    expect(component.errorMessage).toBe('No user found.')
  })

  it('reports a failed lookup', () => {
    const { component } = build({ userFails: true })

    component.search()

    expect(component.errorMessage).toBe('No user found.')
    expect(component.loading).toBe(false)
  })

  it('opens a league the viewer is not in', () => {
    const { component, router } = build()
    component.search()

    component.openLeague(component.leagueResults[1])

    expect(router.navigate).toHaveBeenCalledWith(['/selected-league'], {
      queryParams: { leagueId: 'l2', view: 'league' },
    })
  })

  it('opens the profile on demand', () => {
    const { component, router } = build()
    component.search()

    component.openProfile()

    expect(router.navigate).toHaveBeenCalledWith(['/selected-profile'], {
      queryParams: { userId: USER.user_id },
    })
  })

  it('clears previous results on a new search', () => {
    const { component } = build()
    component.search()
    expect(component.leagueResults.length).toBe(2)

    component.searchTerm = 'someone-else'
    component.search()

    expect(component.foundUser).toBeTruthy()
  })
})
