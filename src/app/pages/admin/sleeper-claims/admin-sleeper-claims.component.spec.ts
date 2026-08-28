/**
 * Tests for the admin Sleeper claims view.
 *
 * This page exists because linking is unverified — more than one account can
 * claim the same handle and users are never told. If a contested claim does
 * not visibly stand out here, the page is not doing its one job.
 */
import { HttpClient } from '@angular/common/http'
import { of, throwError } from 'rxjs'
import { AdminSleeperClaimsComponent } from './admin-sleeper-claims.component'

function response(overrides: Record<string, unknown> = {}) {
  return {
    totalUsers: 3,
    unlinkedUsers: 1,
    linkedAccounts: 1,
    contestedAccounts: 1,
    accounts: [
      {
        sleeperUserId: '111',
        sleeperUsername: 'dom',
        claimCount: 2,
        isContested: true,
        claimants: [
          { userId: 'a', email: 'a@x.com', linkedAt: '2026-01-01T00:00:00Z' },
          { userId: 'b', email: 'b@x.com', linkedAt: '2026-06-01T00:00:00Z' },
        ],
      },
    ],
    ...overrides,
  }
}

function build(http: Partial<HttpClient>) {
  return new AdminSleeperClaimsComponent(http as HttpClient)
}

describe('AdminSleeperClaimsComponent', () => {
  it('loads and exposes the payload', () => {
    const component = build({ get: () => of(response()) as never })

    component.ngOnInit()

    expect(component.loading).toBe(false)
    expect(component.data?.contestedAccounts).toBe(1)
  })

  it('surfaces a contested account', () => {
    const component = build({ get: () => of(response()) as never })
    component.ngOnInit()

    expect(component.data!.accounts[0].isContested).toBe(true)
    expect(component.data!.accounts[0].claimants.length).toBe(2)
  })

  it('handles a clean estate', () => {
    const component = build({
      get: () => of(response({ contestedAccounts: 0, accounts: [] })) as never,
    })

    component.ngOnInit()

    expect(component.data!.accounts).toEqual([])
  })

  it('reports a 401 as not authorized', () => {
    const component = build({
      get: () => throwError(() => ({ status: 401 })) as never,
    })

    component.ngOnInit()

    expect(component.error).toBe('Not authorized.')
    expect(component.loading).toBe(false)
  })

  it('reports other failures generically', () => {
    const component = build({
      get: () => throwError(() => ({ status: 500 })) as never,
    })

    component.ngOnInit()

    expect(component.error).toBe('Failed to load claims.')
  })

  it('links a handle to its Sleeper profile', () => {
    const component = build({ get: () => of(response()) as never })

    expect(component.sleeperUrl('dom')).toBe('https://sleeper.com/user/dom')
  })
})
