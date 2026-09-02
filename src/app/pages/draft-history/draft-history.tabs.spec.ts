/**
 * "i dont want them empty. can we just hide from leageus they dont apply for?"
 *
 * Recap reads an AI report written by a scheduled job that only ever ran for
 * one league, so every other league opened the tab on nothing. Mocks read a
 * `mock` report type that nothing in the backend has ever written, so that
 * one was empty for everybody.
 */
import { of, throwError } from 'rxjs'
import { DraftHistoryComponent } from './draft-history.component'

describe('DraftHistoryComponent sub-tabs', () => {
  function build(reports: unknown[] | 'error') {
    const aiReview = {
      list: () =>
        reports === 'error' ? throwError(() => new Error('down')) : of({ rows: reports }),
    }
    const component = new DraftHistoryComponent(
      aiReview as never,
      {
        getActiveLeagueId: () => 'L1',
        getCurrentLeague: () => ({ name: 'League' }),
        getMyLeague: () => null,
        getLeagueChain: () => of([]),
      } as never,
      {} as never,
      { showNegativeToast: () => undefined } as never,
      { navigate: () => undefined } as never,
      { snapshot: { paramMap: { get: () => null } }, params: of({}) } as never,
    )
    return component
  }

  it('offers only picks when no recap was ever written', () => {
    const component = build([])
    component.ngOnInit()

    expect(component.subTabsForYear('2026')).toEqual(['picks'])
  })

  it('offers recap once one exists', () => {
    const component = build([{ period: '2026' }])
    component.ngOnInit()

    expect(component.subTabsForYear('2026')).toEqual(['picks', 'recap'])
  })

  it('hides recap when the reports cannot be reached', () => {
    const component = build('error')
    component.ngOnInit()

    // Unreachable is indistinguishable from none, and a tab that errors is
    // the thing being fixed.
    expect(component.subTabsForYear('2026')).toEqual(['picks'])
  })

  it('always offers picks, for every season', () => {
    const component = build([])
    component.ngOnInit()

    expect(component.subTabsForYear('2026')).toContain('picks')
    expect(component.subTabsForYear('2019')).toContain('picks')
  })

  it('has no mocks tab at all', () => {
    const component = build([{ period: '2026' }])
    component.ngOnInit()

    expect(component.subTabsForYear('2026')).not.toContain('mocks' as never)
  })
})
