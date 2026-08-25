import { HttpInterceptorFn } from '@angular/common/http'
import { inject } from '@angular/core'
import { from, switchMap } from 'rxjs'
import { SupabaseService } from '../services/supabase.service'

/**
 * Attaches the caller's Supabase access token to Xomper API requests.
 *
 * This fixes a mismatch that made every authenticated endpoint fail. The
 * backend authorizer verifies Supabase ES256 tokens against the project's
 * published JWKS (see xomper-backend lambdas/authorizer/handler.py), but the
 * frontend was still sending `environment.apiAuthToken` — a static HS256 token
 * baked into the bundle at build time. The authorizer cannot find a signing
 * key for it:
 *
 *   Authorizer: decode error - Unable to find a signing key that matches: "None"
 *   Authorizer: Deny - token decode failed
 *
 * CloudWatch showed **zero** Allow decisions in seven days. Admin, email,
 * announcements, audit, cron and AI-review calls have all been returning 403.
 *
 * Sending the session token instead also closes the first half of security
 * must-fix #1 in the rebrand plan: the request is now authorised as a real
 * user rather than by a shared secret that shipped in a public JS bundle.
 *
 * Only our own API is touched. Sleeper's endpoints are public and would reject
 * an unexpected Authorization header, so they are left alone.
 */
const XOMPER_API_HOST_FRAGMENT = '.execute-api.'

export const apiAuthInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes(XOMPER_API_HOST_FRAGMENT)) {
    return next(req)
  }

  const supabase = inject(SupabaseService)

  return from(supabase.getAccessToken()).pipe(
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
