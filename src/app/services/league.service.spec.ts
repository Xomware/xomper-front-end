/**
 * The build-time league default used to sit at the bottom of
 * getActiveLeagueId(). It could only ever fire for a user who follows nothing
 * and has loaded nothing -- and it handed them the Charlotte Dynasty League,
 * a stranger's league presented as their own.
 */
import { LeagueService } from './league.service'

function service(overrides: { selectedLeagueId?: string | null } = {}) {
  const follows = { selectedLeagueId: overrides.selectedLeagueId ?? null }
  return new LeagueService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    follows as never,
  )
}

describe('LeagueService.getActiveLeagueId', () => {
  it('is null when the user has no league of their own', () => {
    expect(service().getActiveLeagueId()).toBeNull()
  })

  it('uses the switcher selection when there is one', () => {
    expect(service({ selectedLeagueId: 'L9' }).getActiveLeagueId()).toBe('L9')
  })

  it('prefers a league opened this session over the selection', () => {
    const s = service({ selectedLeagueId: 'L9' })
    s.setCurrentLeague({ league_id: 'L1' } as never)

    // Guest browsing and search open a league explicitly; that beats whatever
    // the switcher points at.
    expect(s.getActiveLeagueId()).toBe('L1')
  })
})
