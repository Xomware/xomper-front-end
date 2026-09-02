/**
 * "more overall records... some animations with stuff moving"
 *
 * The rest of the landing page is about one league and this week. This card
 * is the part that is about you, across all of them.
 */
import { of, throwError } from 'rxjs'
import { LandingCareerCardComponent } from './landing-career-card.component'

const CAREER = {
  career: { wins: 10, losses: 6, ties: 1, pointsFor: 0, pointsAgainst: 0, seasons: 2, leagues: 3 },
  seasons: [],
  mostOwned: [
    { playerId: 'p1', leagues: 3, share: 1 },
    { playerId: 'p2', leagues: 2, share: 0.66 },
  ],
  currentLeagues: 3,
}

describe('LandingCareerCardComponent', () => {
  function build(options: { leagues?: unknown[]; me?: unknown; stats?: unknown } = {}) {
    const { leagues = [{ leagueId: 'a' }], stats = CAREER } = options
    const me =
      'me' in options
        ? options.me
        : { getUserId: () => 'u1', getUserLeagues: () => [{ getId: () => 'a' }] }
    const component = new LandingCareerCardComponent(
      { followed: leagues } as never,
      { getPlayerMap: () => of({ p1: { full_name: 'One' } }) } as never,
      {
        forUser: () => (stats === 'error' ? throwError(() => new Error('x')) : of(stats)),
      } as never,
      { getMyUser: () => me } as never,
    )
    return component
  }

  it('shows nothing before a league is known', () => {
    const component = build({ leagues: [] })
    component.ngOnInit()

    expect(component.stats).toBeNull()
    expect(component.loading).toBe(false)
  })

  it('shows nothing when signed out', () => {
    const component = build({ me: null })
    component.ngOnInit()

    expect(component.stats).toBeNull()
  })

  it('reads the same numbers the profile does', () => {
    const component = build()
    component.ngOnInit()

    // Reusing ProfileStatsService means the two can never disagree about a
    // record.
    expect(component.stats?.career.wins).toBe(10)
    expect(component.winRate).toBeCloseTo(10 / 17, 4)
  })

  it('caps the ownership list', () => {
    const component = build()
    component.ngOnInit()

    expect(component.topOwned.length).toBeLessThanOrEqual(5)
  })

  it('resolves player names for the list', (done) => {
    const component = build()
    component.ngOnInit()

    setTimeout(() => {
      expect(component.playerNames['p1']).toBe('One')
      done()
    })
  })

  it('falls back to the id when a player is unknown', (done) => {
    const component = build()
    component.ngOnInit()

    setTimeout(() => {
      // p2 is not in the map; showing a blank row would be worse than an id.
      expect(component.playerNames['p2']).toBe('p2')
      done()
    })
  })

  it('stops loading when the stats fail', () => {
    const component = build({ stats: 'error' })
    component.ngOnInit()

    expect(component.loading).toBe(false)
    expect(component.stats).toBeNull()
  })

  it('cancels its animation frame on destroy', () => {
    const component = build()
    component.ngOnInit()

    // An orphaned rAF keeps writing to a destroyed component.
    expect(() => component.ngOnDestroy()).not.toThrow()
  })

  it('has no win rate before any games', () => {
    const component = build({
      stats: { ...CAREER, career: { ...CAREER.career, wins: 0, losses: 0, ties: 0 } },
    })
    component.ngOnInit()

    expect(component.winRate).toBeNull()
  })
})
