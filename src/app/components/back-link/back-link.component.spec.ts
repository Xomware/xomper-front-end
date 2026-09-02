/**
 * "we need back arrows too to get back to where we came from."
 *
 * History rather than a fixed parent route: a team page is reached from
 * standings, from search, or from a matchup, and a hardcoded parent would
 * send people somewhere they were never coming from.
 */
import { BackLinkComponent } from './back-link.component'

describe('BackLinkComponent', () => {
  function build(historyLength: number) {
    const location = { back: jasmine.createSpy('back') }
    const router = { navigateByUrl: jasmine.createSpy('navigateByUrl') }
    const component = new BackLinkComponent(location as never, router as never)
    spyOnProperty(window.history, 'length', 'get').and.returnValue(historyLength)
    return { component, location, router }
  }

  it('goes back when there is somewhere to go back to', () => {
    const { component, location, router } = build(3)

    component.goBack()

    expect(location.back).toHaveBeenCalled()
    expect(router.navigateByUrl).not.toHaveBeenCalled()
  })

  it('falls back on a cold entry rather than leaving the app', () => {
    const { component, location, router } = build(1)

    component.goBack()

    // A shared link or a refresh leaves one history entry; popping it would
    // navigate away from Xomper entirely.
    expect(location.back).not.toHaveBeenCalled()
    expect(router.navigateByUrl).toHaveBeenCalledWith('/home')
  })

  it('honours a page-specific fallback', () => {
    const { component, router } = build(1)
    component.fallback = '/league/standings'

    component.goBack()

    expect(router.navigateByUrl).toHaveBeenCalledWith('/league/standings')
  })
})
