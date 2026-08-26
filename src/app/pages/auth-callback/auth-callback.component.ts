import { Component, OnInit } from '@angular/core'
import { Router } from '@angular/router'
import { filter, take } from 'rxjs/operators'
import { CognitoService } from 'src/app/services/cognito.service'

/**
 * Landing point for the Cognito hosted redirect, at /auth/callback.
 *
 * Only Google sign-in comes through here — email and password run against
 * Cognito directly and never leave the app. Amplify handles the code
 * exchange itself on load; this page exists to hold the user still while
 * that finishes, then send them on.
 *
 * It must not be behind AuthGuard. The guard would run before the exchange
 * completes, redirect to /login, and drop the `?code=` from the URL — the
 * code can then never be redeemed, and a successful sign-in silently ends up
 * back at the login form.
 */
@Component({
  selector: 'app-auth-callback',
  standalone: true,
  template: `
    <div class="callback-page" role="status" aria-live="polite">
      <div class="spinner" aria-hidden="true"></div>
      <p>Signing you in…</p>
    </div>
  `,
  styleUrls: ['./auth-callback.component.scss'],
})
export class AuthCallbackComponent implements OnInit {
  constructor(
    private cognito: CognitoService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cognito.isReady$
      .pipe(filter((ready) => ready), take(1))
      .subscribe(() => {
        // Either way the destination is guarded, so a failed exchange lands
        // on /login through the guard rather than needing its own branch.
        this.router.navigate([this.cognito.isAuthenticated() ? '/home' : '/login'])
      })
  }
}
