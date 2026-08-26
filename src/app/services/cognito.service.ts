import { Injectable, OnDestroy } from '@angular/core'
import { BehaviorSubject, Observable, from, map } from 'rxjs'
import {
  signIn,
  signUp,
  confirmSignUp,
  resendSignUpCode,
  signOut,
  fetchAuthSession,
  getCurrentUser,
  signInWithRedirect,
  resetPassword,
  confirmResetPassword,
} from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'

/** The signed-in user, as far as identity is concerned. */
export interface XomUser {
  userId: string
  username: string
  email?: string
  /** Cognito groups, e.g. `['admin']`. Empty for an ordinary user. */
  groups: string[]
}

/**
 * Identity on the shared `xomware-users` Cognito pool, via the
 * `xomper-client` app client.
 *
 * The pool is estate-wide: xomware.com, xomforms and xomtracks sign into the
 * same one. This service is deliberately close to their `cognito.service.ts`
 * so a fix in one is portable to the others.
 *
 * Identity only. Anything Xomper-specific about a user — which Sleeper
 * account they linked — belongs to `UserProfileService`, which reads it from
 * the platform's own `/me` API. Keeping them apart is what lets the pool stay
 * shared without Xomper's data leaking into five other apps.
 *
 * Admin comes from `cognito:groups`, replacing the `whitelisted_users.role`
 * lookup Supabase did. That table was the CLT allowlist; on the platform
 * there is nothing to allow-list into.
 */
@Injectable({ providedIn: 'root' })
export class CognitoService implements OnDestroy {
  private readonly userSubject = new BehaviorSubject<XomUser | null>(null)
  private readonly readySubject = new BehaviorSubject<boolean>(false)
  private hubSub?: () => void

  readonly user$: Observable<XomUser | null> = this.userSubject.asObservable()
  readonly isAuthenticated$: Observable<boolean> = this.user$.pipe(map((u) => !!u))

  /**
   * Emits `true` once the first session check has settled, signed in or not.
   * Guards wait on this so the first paint never flashes protected content
   * before a redirect fires.
   */
  readonly isReady$: Observable<boolean> = this.readySubject.asObservable()

  readonly isAdmin$: Observable<boolean> = this.user$.pipe(
    map((u) => !!u?.groups.includes('admin')),
  )

  constructor() {
    this.bootstrap()

    this.hubSub = Hub.listen('auth', ({ payload }) => {
      switch (payload.event) {
        case 'signedIn':
        case 'signInWithRedirect':
        case 'tokenRefresh':
          this.refreshUser()
          break
        case 'signedOut':
          this.userSubject.next(null)
          break
      }
    })
  }

  ngOnDestroy(): void {
    this.hubSub?.()
  }

  get currentUser(): XomUser | null {
    return this.userSubject.value
  }

  get isAdmin(): boolean {
    return !!this.userSubject.value?.groups.includes('admin')
  }

  /** Synchronous check for guards, valid once `isReady$` has emitted. */
  isAuthenticated(): boolean {
    return this.userSubject.value !== null
  }

  isInitialized(): boolean {
    return this.readySubject.value
  }

  private async bootstrap(): Promise<void> {
    try {
      await this.refreshUser()
    } catch {
      // No session is the normal signed-out case; the subject is already null.
    } finally {
      this.readySubject.next(true)
    }
  }

  signIn(email: string, password: string): Observable<XomUser> {
    return from(this.signInInternal(email, password))
  }

  private async signInInternal(email: string, password: string): Promise<XomUser> {
    const result = await signIn({ username: email, password })
    if (!result.isSignedIn) {
      // Surface the next step — CONFIRM_SIGN_UP, an MFA challenge — as a typed
      // error so the caller can route to the right screen instead of showing
      // a generic failure for what is a normal flow.
      throw new Error(result.nextStep?.signInStep ?? 'SIGN_IN_INCOMPLETE')
    }
    return this.refreshUser()
  }

  /**
   * Register a new account.
   *
   * The pool uses `alias_attributes = ["email"]`, so the Cognito username has
   * to be opaque rather than the email. Email uniqueness is only enforced
   * after confirmation, so reusing the address as the username would let a
   * retry create a second unconfirmed user with the same email and break
   * verification. The caller keeps the returned username for `confirmSignUp`.
   */
  signUp(
    email: string,
    password: string,
  ): Observable<{ userConfirmed: boolean; username: string }> {
    const opaqueUsername =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`

    return from(
      signUp({
        username: opaqueUsername,
        password,
        options: { userAttributes: { email } },
      }).then((res) => ({
        userConfirmed: !!res.isSignUpComplete,
        username: opaqueUsername,
      })),
    )
  }

  confirmSignUp(username: string, code: string): Observable<boolean> {
    return from(
      confirmSignUp({ username, confirmationCode: code }).then(
        (res) => !!res.isSignUpComplete,
      ),
    )
  }

  resendCode(username: string): Observable<void> {
    return from(resendSignUpCode({ username }).then(() => undefined))
  }

  startPasswordReset(email: string): Observable<void> {
    return from(resetPassword({ username: email }).then(() => undefined))
  }

  confirmPasswordReset(
    email: string,
    code: string,
    newPassword: string,
  ): Observable<void> {
    return from(
      confirmResetPassword({
        username: email,
        confirmationCode: code,
        newPassword,
      }).then(() => undefined),
    )
  }

  /**
   * Google sign-in through the shared Hosted UI.
   *
   * This is the one flow that leaves the app. Cognito has no API for
   * federated sign-in outside its hosted domain, so the button redirects and
   * comes back to `/auth/callback`. It doubles as sign-up: the IdP
   * provisions an account on first use.
   */
  signInWithGoogle(): Observable<void> {
    return from(signInWithRedirect({ provider: 'Google' }).then(() => undefined))
  }

  signOut(): Observable<void> {
    return from(
      signOut().then(() => {
        this.userSubject.next(null)
      }),
    )
  }

  /**
   * The current ID token, or null when signed out.
   *
   * The ID token rather than the access token: only the ID token carries
   * `email` and `cognito:groups`, which the API authorizer passes through to
   * handlers for identity and admin checks.
   */
  async getJwt(): Promise<string | null> {
    try {
      const session = await fetchAuthSession()
      return session.tokens?.idToken?.toString() ?? null
    } catch {
      return null
    }
  }

  private async refreshUser(): Promise<XomUser> {
    try {
      const current = await getCurrentUser()
      const session = await fetchAuthSession()
      const claims = session.tokens?.idToken?.payload ?? {}
      const groups = (claims['cognito:groups'] as string[] | undefined) ?? []

      const user: XomUser = {
        userId: current.userId,
        username: current.username,
        email: claims['email'] as string | undefined,
        groups,
      }
      this.userSubject.next(user)
      return user
    } catch {
      this.userSubject.next(null)
      throw new Error('NO_SESSION')
    }
  }
}
