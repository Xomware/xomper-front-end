/**
 * Tests for the login flow.
 *
 * The case that matters most is the one that shipped broken: the pool
 * aliases on email, and an email alias does not resolve until an account is
 * confirmed. So Cognito answers a sign-in from an unconfirmed user with
 * "user not found" — indistinguishable from a wrong address — and the opaque
 * username needed to confirm only existed in a component field. Closing the
 * tab made the account permanently unconfirmable.
 */
import { of, throwError } from 'rxjs'
import { LoginComponent } from './login.component'

const KEY = 'xomper.pendingSignup'

function build(options: { signInError?: Partial<Error>; signUpUsername?: string } = {}) {
  const { signInError, signUpUsername = 'uuid-1' } = options
  const router = { navigate: jasmine.createSpy('navigate') }
  const cognito = {
    isReady$: of(true),
    isAuthenticated$: of(false),
    isAuthenticated: () => false,
    signIn: () =>
      signInError ? throwError(() => Object.assign(new Error(), signInError)) : of({}),
    signUp: () => of({ userConfirmed: false, username: signUpUsername }),
    confirmSignUp: () => of(true),
    resendCode: () => of(undefined),
  }
  const component = new LoginComponent(
    cognito as never,
    router as never,
    { showPositiveToast: () => undefined, showNegativeToast: () => undefined } as never,
  )
  return { component, router }
}

describe('LoginComponent signup and verification', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('remembers the opaque username after signing up', () => {
    const { component } = build({ signUpUsername: 'uuid-abc' })
    component.email = 'a@x.com'
    component.password = 'GoodPass123'
    component.confirmPassword = 'GoodPass123'
    component.emailMode = 'signup'

    component.submitEmailAuth()

    // Without this the account can never be confirmed after a reload.
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    expect(stored.username).toBe('uuid-abc')
    expect(stored.email).toBe('a@x.com')
    expect(component.authMode).toBe('verify')
  })

  it('resumes verification when Cognito cannot find an unconfirmed account', () => {
    localStorage.setItem(KEY, JSON.stringify({ email: 'a@x.com', username: 'uuid-abc' }))
    const { component } = build({ signInError: { name: 'UserNotFoundException' } })
    component.email = 'a@x.com'
    component.password = 'GoodPass123'

    component.submitEmailAuth()

    // "User not found" here means the alias does not exist yet, not that the
    // address is wrong.
    expect(component.authMode).toBe('verify')
    expect(component.resumedVerification).toBe(true)
    expect(component.authNotice).toContain('confirm')
  })

  it('still reports a genuinely wrong password', () => {
    const { component } = build({ signInError: { name: 'NotAuthorizedException' } })
    component.authMode = 'email'
    component.email = 'nobody@x.com'
    component.password = 'whatever'

    component.submitEmailAuth()

    // No pending signup for that address, so this is a real failure.
    expect(component.authMode).toBe('email')
    expect(component.authError).toBe('Incorrect email or password.')
  })

  it('does not resume for a different address', () => {
    localStorage.setItem(KEY, JSON.stringify({ email: 'someone@x.com', username: 'uuid-abc' }))
    const { component } = build({ signInError: { name: 'UserNotFoundException' } })
    component.authMode = 'email'
    component.email = 'different@x.com'
    component.password = 'GoodPass123'

    component.submitEmailAuth()

    expect(component.authMode).toBe('email')
    expect(component.authError).toBeTruthy()
  })

  it('still honours an explicit CONFIRM_SIGN_UP next step', () => {
    const { component } = build({ signInError: { message: 'CONFIRM_SIGN_UP' } })
    component.email = 'a@x.com'
    component.password = 'GoodPass123'

    component.submitEmailAuth()

    expect(component.authMode).toBe('verify')
  })

  it('forgets the pending signup once confirmed', () => {
    localStorage.setItem(KEY, JSON.stringify({ email: 'a@x.com', username: 'uuid-abc' }))
    const { component } = build()
    component.authMode = 'verify'
    component.code = '123456'

    component.submitVerification()

    expect(localStorage.getItem(KEY)).toBeNull()
    expect(component.authMode).toBe('email')
  })

  it('survives blocked storage', () => {
    const original = localStorage.setItem
    localStorage.setItem = () => {
      throw new Error('blocked')
    }
    const { component } = build()
    component.email = 'a@x.com'
    component.password = 'GoodPass123'
    component.confirmPassword = 'GoodPass123'
    component.emailMode = 'signup'

    // Private browsing throws here; verification must still work in this tab.
    expect(() => component.submitEmailAuth()).not.toThrow()
    expect(component.authMode).toBe('verify')

    localStorage.setItem = original
  })
})

/**
 * Reported live: "sign in with google kept saying failed to start sign in
 * then randomly signed me in".
 *
 * Two separate causes. Amplify's signInWithRedirect calls
 * assertUserNotAuthenticated and throws when a session already exists, which
 * the Google handler reported as a generic failure. And the page sampled auth
 * once on ready, so a session resolving later (the redirect landing back here
 * and firing a Hub event) left the user sitting on the login page while
 * actually signed in.
 */
import { Subject } from 'rxjs'

describe('LoginComponent Google sign-in', () => {
  function build(options: { signInError?: Partial<Error>; authed$?: Subject<boolean> } = {}) {
    const { signInError, authed$ } = options
    const router = { navigate: jasmine.createSpy('navigate') }
    const toasts = {
      showPositiveToast: jasmine.createSpy('pos'),
      showNegativeToast: jasmine.createSpy('neg'),
    }
    const cognito = {
      isReady$: of(true),
      isAuthenticated$: authed$ ?? of(false),
      isAuthenticated: () => false,
      signInWithGoogle: () =>
        signInError ? throwError(() => Object.assign(new Error(), signInError)) : of(undefined),
    }
    const component = new LoginComponent(cognito as never, router as never, toasts as never)
    return { component, router, toasts }
  }

  it('takes an already-signed-in user home instead of claiming failure', () => {
    const { component, router, toasts } = build({
      signInError: { name: 'UserAlreadyAuthenticatedException' },
    })

    component.signInWithGoogle()

    // "Failed to start sign in" is the opposite of what happened.
    expect(toasts.showNegativeToast).not.toHaveBeenCalled()
    expect(router.navigate).toHaveBeenCalledWith(['/home'])
    expect(component.loading).toBe(false)
  })

  it('still reports a genuine failure to start', () => {
    const { component, toasts, router } = build({
      signInError: { name: 'NetworkError' },
    })

    component.signInWithGoogle()

    expect(toasts.showNegativeToast).toHaveBeenCalledWith('Failed to start sign in')
    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('navigates when the session resolves after init, not only on ready', () => {
    const authed$ = new Subject<boolean>()
    const { component, router } = build({ authed$ })

    component.ngOnInit()
    expect(router.navigate).not.toHaveBeenCalled()

    // The redirect lands back here and Amplify's Hub event resolves auth a
    // moment later. Sampling once on ready missed this entirely.
    authed$.next(true)

    expect(router.navigate).toHaveBeenCalledWith(['/home'])
  })

  it('does not navigate while still signed out', () => {
    const authed$ = new Subject<boolean>()
    const { component, router } = build({ authed$ })

    component.ngOnInit()
    authed$.next(false)

    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('stops watching once destroyed', () => {
    const authed$ = new Subject<boolean>()
    const { component, router } = build({ authed$ })

    component.ngOnInit()
    component.ngOnDestroy()
    authed$.next(true)

    expect(router.navigate).not.toHaveBeenCalled()
  })
})
