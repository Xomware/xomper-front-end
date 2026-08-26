/**
 * Regression tests for the cold-load race that broke Google sign-in.
 *
 * With PKCE, OAuth returns the user to `/home?code=...` and supabase-js has to
 * exchange that code before a session exists. The guard used to read the
 * session synchronously, find nothing, and redirect to /login — which dropped
 * `?code=` from the URL so the exchange could never complete. The user landed
 * back on the login page having signed in successfully, with no error shown.
 */
import { BehaviorSubject, of, throwError } from 'rxjs'
import { AuthGuard } from './auth.guard'
import { SupabaseService } from '../services/supabase.service'
import { LeagueService } from '../services/league.service'

/** The guard now takes (route, state); tests only care about the url. */
function canActivate(guard: AuthGuard, url = '/home') {
  return guard.canActivate({} as any, { url } as any)
}

describe('AuthGuard', () => {
  let initialized: BehaviorSubject<boolean>
  let authenticated: boolean
  let hasLink: boolean
  let navigate: jasmine.Spy
  let guard: AuthGuard

  function build(loadMyLeague = () => of({} as any)) {
    const supabase = {
      initialized$: initialized.asObservable(),
      isAuthenticated: () => authenticated,
      hasLinkedSleeper: () => Promise.resolve(hasLink),
    } as unknown as SupabaseService

    const league = { loadMyLeague } as unknown as LeagueService
    navigate = jasmine.createSpy('navigate')
    guard = new AuthGuard(supabase, league, { navigate } as any)
  }

  beforeEach(() => {
    initialized = new BehaviorSubject<boolean>(false)
    authenticated = false
    hasLink = true
  })

  it('waits for session init instead of deciding on an unresolved session', async () => {
    build()
    let settled = false
    const result = canActivate(guard).then((v) => {
      settled = true
      return v
    })

    // Session has not resolved yet: the guard must not have decided anything,
    // and above all must not have navigated away and dropped the PKCE code.
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(navigate).not.toHaveBeenCalled()

    // The code exchange completes and a session appears.
    authenticated = true
    initialized.next(true)

    expect(await result).toBe(true)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('redirects to login once init settles with no session', async () => {
    build()
    const result = canActivate(guard)
    initialized.next(true)

    expect(await result).toBe(false)
    expect(navigate).toHaveBeenCalledWith(['/login'])
  })

  it('allows an already-initialized authenticated user straight through', async () => {
    initialized.next(true)
    authenticated = true
    build()

    expect(await canActivate(guard)).toBe(true)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('does not lock out an authenticated user when the league fails to load', async () => {
    initialized.next(true)
    authenticated = true
    build(() => throwError(() => new Error('league unavailable')))

    expect(await canActivate(guard)).toBe(true)
    expect(navigate).not.toHaveBeenCalled()
  })

  // --- Sleeper link gate ----------------------------------------------------
  // All six accounts sat unlinked because nothing ever routed anyone to the
  // link page, and the app rendered empty rather than incomplete.

  it('sends a signed-in account with no Sleeper link to the link page', async () => {
    initialized.next(true)
    authenticated = true
    hasLink = false
    build()

    expect(await canActivate(guard)).toBe(false)
    expect(navigate).toHaveBeenCalledWith(['/link-sleeper'])
  })

  it('does not bounce the link page to itself', async () => {
    initialized.next(true)
    authenticated = true
    hasLink = false
    build()

    expect(await canActivate(guard, '/link-sleeper')).toBe(true)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('lets a linked account straight through', async () => {
    initialized.next(true)
    authenticated = true
    hasLink = true
    build()

    expect(await canActivate(guard)).toBe(true)
    expect(navigate).not.toHaveBeenCalled()
  })
})
