/**
 * Tests for the API auth interceptor.
 *
 * The failure this guards against is silent: sending the wrong token, or no
 * token, produces a 403 from API Gateway that looks like a backend problem.
 * That is exactly what happened before the interceptor existed — a static
 * build-time token went up, the authorizer could not find a signing key for
 * it, and every authenticated endpoint returned 403 for seven days.
 */
import { HttpRequest, HttpHandlerFn, HttpEvent } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { Observable, of, firstValueFrom } from 'rxjs'
import { apiAuthInterceptor } from './api-auth.interceptor'
import { CognitoService } from '../services/cognito.service'

const API_URL = 'https://abc123.execute-api.us-east-1.amazonaws.com/dev/me/profile'
const SLEEPER_URL = 'https://api.sleeper.app/v1/user/12345'

describe('apiAuthInterceptor', () => {
  let captured: HttpRequest<unknown> | null

  function run(url: string, token: string | null): Promise<HttpEvent<unknown>> {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CognitoService,
          useValue: { getJwt: () => Promise.resolve(token) },
        },
      ],
    })

    captured = null
    const next: HttpHandlerFn = (req): Observable<HttpEvent<unknown>> => {
      captured = req
      return of({} as HttpEvent<unknown>)
    }

    return TestBed.runInInjectionContext(() =>
      firstValueFrom(apiAuthInterceptor(new HttpRequest('GET', url), next)),
    )
  }

  it('attaches the token to Xomper API requests', async () => {
    await run(API_URL, 'id-token-123')

    expect(captured!.headers.get('Authorization')).toBe('Bearer id-token-123')
  })

  it('leaves Sleeper requests alone', async () => {
    await run(SLEEPER_URL, 'id-token-123')

    // Sleeper's endpoints are public and reject an unexpected Authorization
    // header, so touching them breaks reads that currently work.
    expect(captured!.headers.has('Authorization')).toBe(false)
  })

  it('passes the request through unchanged when signed out', async () => {
    await run(API_URL, null)

    // Forwarding without a header lets the API return its own 401 rather than
    // the interceptor swallowing the call and hiding the reason.
    expect(captured!.headers.has('Authorization')).toBe(false)
  })

  it('does not mutate the original request', async () => {
    const original = new HttpRequest('GET', API_URL)
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CognitoService,
          useValue: { getJwt: () => Promise.resolve('tok') },
        },
      ],
    })

    const next: HttpHandlerFn = (req) => {
      captured = req
      return of({} as HttpEvent<unknown>)
    }
    await TestBed.runInInjectionContext(() =>
      firstValueFrom(apiAuthInterceptor(original, next)),
    )

    expect(original.headers.has('Authorization')).toBe(false)
    expect(captured).not.toBe(original)
  })
})
