/**
 * Tests for the overview card.
 *
 * This is the only league-agnostic thing on the home page. The behaviour that
 * matters is that opening a league actually switches the app to it — leaving
 * the old league selected would render the new one's name over the old one's
 * data.
 */
import { of } from 'rxjs'
import { LandingOverviewCardComponent } from './landing-overview-card.component'
import { FollowedLeague } from 'src/app/services/league-follows.service'

function league(overrides: Partial<FollowedLeague> = {}): FollowedLeague {
  return {
    leagueId: 'a',
    name: 'Charlotte Dynasty League',
    season: '2026',
    status: 'in_season',
    totalRosters: 12,
    avatar: '',
    isDynasty: true,
    isFollowed: true,
    ...overrides,
  }
}

function build(options: { followed?: FollowedLeague[]; selected?: string | null } = {}) {
  const { followed = [league(), league({ leagueId: 'b', name: 'Other' })], selected = 'a' } =
    options

  const follows = {
    followed,
    selectedLeagueId: selected,
    select: jasmine.createSpy('select'),
    load: () => of(followed),
  }
  const leagueService = { clearForLeagueSwitch: jasmine.createSpy('clear') }
  const router = { navigate: jasmine.createSpy('navigate') }

  const component = new LandingOverviewCardComponent(
    follows as never,
    leagueService as never,
    router as never,
  )
  return { component, follows, leagueService, router }
}

describe('LandingOverviewCardComponent', () => {
  it('shows the leagues already loaded by the guard', () => {
    const { component } = build()

    component.ngOnInit()

    expect(component.leagues.length).toBe(2)
  })

  it('fetches on a cold navigation when nothing is loaded', () => {
    const { component } = build({ followed: [] })
    ;(component as unknown as { follows: { load: () => unknown } }).follows.load = () =>
      of([league(), league({ leagueId: 'b', isFollowed: false })])

    component.ngOnInit()

    // Only followed leagues belong on this card.
    expect(component.leagues.length).toBe(1)
  })

  it('switches and opens a different league', () => {
    const { component, follows, leagueService, router } = build({ selected: 'a' })
    component.ngOnInit()

    component.open(league({ leagueId: 'b' }))

    expect(follows.select).toHaveBeenCalledWith('b')
    // Every LeagueService cache is league-scoped; leaving them renders the
    // new league's name over the old league's data.
    expect(leagueService.clearForLeagueSwitch).toHaveBeenCalled()
    expect(router.navigate).toHaveBeenCalledWith(['/league/standings'])
  })

  it('does not re-switch when opening the league already selected', () => {
    const { component, follows, leagueService, router } = build({ selected: 'a' })
    component.ngOnInit()

    component.open(league({ leagueId: 'a' }))

    expect(follows.select).not.toHaveBeenCalled()
    expect(leagueService.clearForLeagueSwitch).not.toHaveBeenCalled()
    // Still navigates — the user asked to open it.
    expect(router.navigate).toHaveBeenCalledWith(['/league/standings'])
  })

  it('routes a quick action', () => {
    const { component, router } = build()

    component.go(component.actions[1])

    expect(router.navigate).toHaveBeenCalledWith(['/trades'])
  })

  it('labels league status readably', () => {
    const { component } = build()

    expect(component.statusLabel(league({ status: 'pre_draft' }))).toBe('Pre-draft')
    expect(component.statusLabel(league({ status: 'in_season' }))).toBe('In season')
  })

  it('offers every tool the app has', () => {
    const { component } = build()

    const routes = component.actions.map((a) => a.route)
    expect(routes).toContain('/team-analyzer')
    expect(routes).toContain('/trades')
    expect(routes).toContain('/live-draft')
  })
})
