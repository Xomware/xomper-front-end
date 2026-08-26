import { HttpInterceptorFn } from '@angular/common/http'
import { inject } from '@angular/core'
import { from, switchMap } from 'rxjs'
import { CognitoService } from '../services/cognito.service'

/**
 * Attaches the caller's Cognito ID token to Xomper API requests.
 *
 * This is the request half of real per-user auth. Before it existed the
 * frontend sent `environment.apiAuthToken` — a static HS256 token baked into
 * the bundle at build time — which the authorizer could not find a signing
 * key for, so every authenticated endpoint returned 403:
 *
 *   Authorizer: decode error - Unable to find a signing key that matches: "None"
 *
 * CloudWatch showed zero Allow decisions in seven days. A shared secret
 * shipping in a public JS bundle was also the first security must-fix in the
 * rebrand plan; the request is now authorised as a real user instead.
 *
 * The ID token, not the access token: only the ID token carries `email` and
 * `cognito:groups`, which the authorizer forwards to handlers for identity
 * and admin checks.
 *
 * Only our own API is touched. Sleeper's endpoints are public and reject an
 * unexpected Authorization header, so they are left alone.
 */
const XOMPER_API_HOST_FRAGMENT = '.execute-api.'

export const apiAuthInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes(XOMPER_API_HOST_FRAGMENT)) {
    return next(req)
  }

  const cognito = inject(CognitoService)

  return from(cognito.getJwt()).pipe(
    switchMap((token) => {
      // No session means no token to send. Let the request through unmodified
      // so the API returns its own 401/403 rather than this silently
      // swallowing the call.
      if (!token) return next(req)

      return next(
        req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }),
      )
    }),
  )
}
