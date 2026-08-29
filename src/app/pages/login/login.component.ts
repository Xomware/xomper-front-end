import { Component, OnInit, OnDestroy } from '@angular/core'
import { Router } from '@angular/router'
import { Subject } from 'rxjs'
import { takeUntil, filter, take } from 'rxjs/operators'
import { NgIf } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { CognitoService } from 'src/app/services/cognito.service'
import { ToastService } from 'src/app/services/toast.service'
import { environment } from 'src/environments/environment'

type AuthMode = 'options' | 'email' | 'verify' | 'forgot'

/**
 * Where a half-finished signup is remembered.
 *
 * The pool aliases on email, and an email alias does not resolve until the
 * account is confirmed -- so an unconfirmed user cannot be looked up by email
 * at all. Confirmation needs the opaque username minted at signup, and if
 * that only ever lived in a component field, closing the tab made the account
 * permanently unconfirmable.
 */
const PENDING_SIGNUP_KEY = 'xomper.pendingSignup'

interface PendingSignup {
  email: string
  username: string
}
type EmailMode = 'signin' | 'signup'

/**
 * Login page at /login.
 *
 * Sign-in only. Once Cognito reports a session this navigates to /home and
 * `AuthGuard` does the rest — the Sleeper link check, resolving `myUser`,
 * loading the league. That work used to live here, which meant it happened on
 * the login path and nowhere else: a refresh or a deep link skipped all of it
 * and left the app empty for a perfectly valid session.
 *
 * The old `whitelisted_users` gate is gone with it. It signed out anyone
 * without a row, which was the right behaviour for a single invited league
 * and exactly wrong for a platform anyone can sign up for.
 *
 * Email and password run against Cognito directly over SRP — the password is
 * never sent, and no hosted page is involved. Google is the one flow that
 * redirects, because Cognito has no federated sign-in API outside its hosted
 * domain.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [NgIf, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit, OnDestroy {
  /** Branding comes from environment: this component ships in two apps. */
  readonly appName = environment.appName
  readonly tagline = environment.appTagline

  loading = false
  checkingAuth = true

  authMode: AuthMode = 'options'
  emailMode: EmailMode = 'signin'
  email = ''
  password = ''
  confirmPassword = ''
  code = ''
  authError = ''
  authNotice = ''

  /**
   * The opaque Cognito username minted at sign-up.
   *
   * The pool aliases on email, but an alias only resolves once an account is
   * confirmed — so the verify step has to quote the username sign-up
   * returned, not the address the user typed.
   */
  private pendingUsername = ''

  /** True when the verify screen was reached from a remembered signup. */
  resumedVerification = false

  private destroy$ = new Subject<void>()

  constructor(
    private cognito: CognitoService,
    private router: Router,
    private toastService: ToastService,
  ) {}

  ngOnInit(): void {
    this.cognito.isReady$
      .pipe(filter((ready) => ready), take(1), takeUntil(this.destroy$))
      .subscribe(() => {
        this.checkingAuth = false
        if (this.cognito.isAuthenticated()) {
          this.router.navigate(['/home'])
        }
      })
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
  }

  // ---- mode switching ----

  showEmailForm(): void {
    this.authMode = 'email'
    this.emailMode = 'signin'
    this.resetForm()
  }

  backToOptions(): void {
    this.authMode = 'options'
    this.resetForm()
  }

  toggleEmailMode(): void {
    this.emailMode = this.emailMode === 'signin' ? 'signup' : 'signin'
    this.clearMessages()
    this.password = ''
    this.confirmPassword = ''
  }

  showForgotPassword(): void {
    this.authMode = 'forgot'
    this.clearMessages()
    this.code = ''
    this.password = ''
    this.confirmPassword = ''
  }

  private resetForm(): void {
    this.clearMessages()
    this.email = ''
    this.password = ''
    this.confirmPassword = ''
    this.code = ''
  }

  private clearMessages(): void {
    this.authError = ''
    this.authNotice = ''
  }

  // ---- sign in ----

  signInWithGoogle(): void {
    this.loading = true
    this.cognito.signInWithGoogle().pipe(take(1)).subscribe({
      // The page navigates away on success, so there is nothing to do here.
      error: () => {
        this.loading = false
        this.toastService.showNegativeToast('Failed to start sign in')
      },
    })
  }

  submitEmailAuth(): void {
    this.clearMessages()

    if (!this.email.trim() || !this.password) {
      this.authError = 'Email and password are required.'
      return
    }

    if (this.emailMode === 'signup') {
      this.submitSignUp()
      return
    }

    this.loading = true
    this.cognito.signIn(this.email.trim(), this.password).pipe(take(1)).subscribe({
      next: () => this.router.navigate(['/home']),
      error: (err: Error) => {
        this.loading = false

        // An unconfirmed account is a normal state, not a failure — send them
        // to the code screen instead of showing an error they cannot act on.
        if (err.message === 'CONFIRM_SIGN_UP') {
          this.pendingUsername = this.email.trim()
          this.authMode = 'verify'
          this.authNotice = 'Enter the code we emailed you to finish signing up.'
          return
        }

        // Cognito cannot find an unconfirmed account by email, because the
        // alias does not exist until confirmation. It reports that as
        // "user not found", indistinguishable from a wrong address. If we
        // remembered a signup for this address, that is what happened.
        const pending = this.readPending()
        if (pending && pending.email === this.email.trim()) {
          this.pendingUsername = pending.username
          this.resumedVerification = true
          this.authMode = 'verify'
          this.authNotice =
            'You still need to confirm this email. Enter the code we sent, or request a new one.'
          return
        }

        this.authError = this.readableError(err)
      },
    })
  }

  private submitSignUp(): void {
    // Matches the pool's password policy: 8+, upper, lower, number. Checking
    // here keeps the failure inline rather than as a Cognito exception after
    // a round trip.
    if (!this.isPasswordAcceptable(this.password)) {
      this.authError =
        'Password must be at least 8 characters and include an uppercase letter, a lowercase letter and a number.'
      return
    }
    if (this.password !== this.confirmPassword) {
      this.authError = 'Passwords do not match.'
      return
    }

    this.loading = true
    this.cognito.signUp(this.email.trim(), this.password).pipe(take(1)).subscribe({
      next: ({ userConfirmed, username }) => {
        this.loading = false
        this.pendingUsername = username
        this.rememberPending({ email: this.email.trim(), username })

        if (userConfirmed) {
          this.authMode = 'email'
          this.emailMode = 'signin'
          this.authNotice = 'Account created. Sign in to continue.'
          return
        }

        this.authMode = 'verify'
        this.authNotice = `We emailed a code to ${this.email.trim()}.`
      },
      error: (err: Error) => {
        this.loading = false
        this.authError = this.readableError(err)
      },
    })
  }

  // ---- verify ----

  submitVerification(): void {
    this.clearMessages()
    if (!this.code.trim()) {
      this.authError = 'Enter the code from your email.'
      return
    }

    this.loading = true
    this.cognito
      .confirmSignUp(this.pendingUsername, this.code.trim())
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.loading = false
          this.clearPending()
          this.resumedVerification = false
          this.authMode = 'email'
          this.emailMode = 'signin'
          this.code = ''
          this.authNotice = 'Email confirmed. Sign in to continue.'
        },
        error: (err: Error) => {
          this.loading = false
          this.authError = this.readableError(err)
        },
      })
  }

  resendCode(): void {
    this.clearMessages()
    this.cognito.resendCode(this.pendingUsername).pipe(take(1)).subscribe({
      next: () => this.toastService.showPositiveToast('New code sent.'),
      error: (err: Error) => (this.authError = this.readableError(err)),
    })
  }

  // ---- password reset ----

  startPasswordReset(): void {
    this.clearMessages()
    if (!this.email.trim()) {
      this.authError = 'Enter your email address first.'
      return
    }

    this.loading = true
    this.cognito.startPasswordReset(this.email.trim()).pipe(take(1)).subscribe({
      next: () => {
        this.loading = false
        this.authNotice = `We emailed a reset code to ${this.email.trim()}.`
      },
      error: (err: Error) => {
        this.loading = false
        this.authError = this.readableError(err)
      },
    })
  }

  confirmPasswordReset(): void {
    this.clearMessages()

    if (!this.code.trim()) {
      this.authError = 'Enter the reset code from your email.'
      return
    }
    if (!this.isPasswordAcceptable(this.password)) {
      this.authError =
        'Password must be at least 8 characters and include an uppercase letter, a lowercase letter and a number.'
      return
    }
    if (this.password !== this.confirmPassword) {
      this.authError = 'Passwords do not match.'
      return
    }

    this.loading = true
    this.cognito
      .confirmPasswordReset(this.email.trim(), this.code.trim(), this.password)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.loading = false
          this.authMode = 'email'
          this.emailMode = 'signin'
          this.password = ''
          this.confirmPassword = ''
          this.code = ''
          this.authNotice = 'Password updated. Sign in to continue.'
        },
        error: (err: Error) => {
          this.loading = false
          this.authError = this.readableError(err)
        },
      })
  }

  // ---- pending signup ----

  private rememberPending(pending: PendingSignup): void {
    try {
      localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify(pending))
    } catch {
      // Private browsing and blocked site data both throw. Verification still
      // works in this tab; only resuming later is lost.
    }
  }

  private readPending(): PendingSignup | null {
    try {
      const raw = localStorage.getItem(PENDING_SIGNUP_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as PendingSignup
      return parsed?.email && parsed?.username ? parsed : null
    } catch {
      return null
    }
  }

  private clearPending(): void {
    try {
      localStorage.removeItem(PENDING_SIGNUP_KEY)
    } catch {
      // Nothing to do; a stale entry only ever offers verification again.
    }
  }

  // ---- helpers ----

  onEmailKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.submitEmailAuth()
  }

  onVerifyKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.submitVerification()
  }

  goToGuestSearch(): void {
    this.router.navigate(['/search'])
  }

  private isPasswordAcceptable(password: string): boolean {
    return (
      password.length >= 8 &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /[0-9]/.test(password)
    )
  }

  /**
   * Turn an Amplify error into something a person can act on.
   *
   * Amplify surfaces Cognito's exception names, which are accurate and
   * useless to a user — `UserNotFoundException` on a sign-in form reads as a
   * bug. Anything unmapped falls through to its own message rather than a
   * generic string, so an unfamiliar failure is still debuggable.
   */
  private readableError(err: Error): string {
    const name = err.name || ''
    const message = err.message || ''

    if (name === 'UserAlreadyAuthenticatedException') {
      return 'You are already signed in.'
    }
    if (name === 'UsernameExistsException' || message.includes('already exists')) {
      return 'An account with that email already exists. Try signing in.'
    }
    if (name === 'NotAuthorizedException' || name === 'UserNotFoundException') {
      // Deliberately the same message for both: saying which one is wrong
      // tells anyone with a login form which addresses have accounts.
      return 'Incorrect email or password.'
    }
    if (name === 'CodeMismatchException') {
      return 'That code is not right. Check it and try again.'
    }
    if (name === 'ExpiredCodeException') {
      return 'That code has expired. Request a new one.'
    }
    if (name === 'LimitExceededException' || name === 'TooManyRequestsException') {
      return 'Too many attempts. Wait a minute and try again.'
    }
    if (name === 'InvalidPasswordException') {
      return 'That password does not meet the requirements.'
    }
    return message || 'Something went wrong. Try again.'
  }
}
