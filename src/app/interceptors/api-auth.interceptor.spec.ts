/**
 * Tests for the API auth interceptor.
 *
 * This is the fix for a live break: the backend authorizer verifies Supabase
 * ES256 tokens against the project JWKS, while the frontend was sending a
 * static HS256 token baked into the bundle. CloudWatch recorded zero Allow
 * decisions in seven days — every admin, email, announcements, audit, cron and
 * AI-review call was returning 403.
 */
import { HttpRequest, HttpHandlerFn, HttpEvent } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { Observable, of, lastValueFrom } from 'rxjs'
import { apiAuthInterceptor } from './api-auth.interceptor'
import { SupabaseService } from '../services/supabase.service'

const API_URL = 'https://abc123.execute-api.us-east-1.amazonaws.com/dev/admin/list'
const SLEEPER_URL = 'https://api.sleeper.app/v1/league/123'

function runWith(token: string | null, url: string) {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: SupabaseService,
        useValue: { getAccessToken: () => Promise.resolve(token) },
      },
    ],
  })

  const req = new HttpRequest('GET', url)
  let seen: HttpRequest<unknown> | null = null

  const next: HttpHandlerFn = (r): Observable<HttpEvent<unknown>> => {
    seen = r
    return of({} as HttpEvent<unknown>)
  }

  return TestBed.runInInjectionContext(async () => {
    await lastValueFrom(apiAuthInterceptor(req, next))
    return seen!
  })
}

describe('apiAuthInterceptor', () => {
  it('attaches the Supabase session token to Xomper API requests', async () => {
    const seen = await runWith('session-jwt', API_URL)
    expect(seen.headers.get('Authorization')).toBe('Bearer session-jwt')
  })

  it('leaves Sleeper requests untouched', async () => {
    // Sleeper is public and rejects unexpected auth headers.
    const seen = await runWith('session-jwt', SLEEPER_URL)
    expect(seen.headers.has('Authorization')).toBe(false)
  })

  it('sends no Authorization header when signed out', async () => {
    // The API should answer with its own 401/403 rather than the interceptor
    // silently swallowing the call.
    const seen = await runWith(null, API_URL)
    expect(seen.headers.has('Authorization')).toBe(false)
  })

  it('never sends a static build-time token', async () => {
    const seen = await runWith('session-jwt', API_URL)
    const auth = seen.headers.get('Authorization') ?? ''
    expect(auth).not.toContain('---')
    expect(auth.startsWith('Bearer ')).toBe(true)
  })
})
