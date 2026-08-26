/**
 * Tests for UserProfileService.
 *
 * The contract that matters is `hasLinkedSleeper()`, because the guard routes
 * on it. Getting it wrong in either direction is bad in a different way:
 * false when the user is linked traps them on the link page, and a hard
 * failure on a network blip locks them out of the app entirely.
 */
import { HttpClient } from '@angular/common/http'
import { of, throwError } from 'rxjs'
import { UserProfileService, UserProfile } from './user-profile.service'

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: 'cog-1',
    email: 'd@x.com',
    sleeperUserId: '594625531702460416',
    sleeperUsername: 'domgiordano',
    sleeperAvatar: 'abc',
    hasLinkedSleeper: true,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

function serviceWith(http: Partial<HttpClient>): UserProfileService {
  // Constructor injection, so a stub client goes straight in — no TestBed
  // needed for a service with one dependency.
  return new UserProfileService(http as HttpClient)
}

describe('UserProfileService', () => {
  it('caches the loaded profile for synchronous reads', (done) => {
    const service = serviceWith({ get: () => of({ user: profile() }) as never })

    expect(service.getProfile()).toBeNull()
    service.load().subscribe(() => {
      expect(service.getProfile()?.sleeperUsername).toBe('domgiordano')
      done()
    })
  })

  it('emits the profile to subscribers', (done) => {
    const service = serviceWith({ get: () => of({ user: profile() }) as never })

    service.load().subscribe(() => {
      service.profile$.subscribe((p) => {
        expect(p?.userId).toBe('cog-1')
        done()
      })
    })
  })

  it('reports a linked account', async () => {
    const service = serviceWith({ get: () => of({ user: profile() }) as never })

    await expectAsync(service.hasLinkedSleeper()).toBeResolvedTo(true)
  })

  it('reports an unlinked account', async () => {
    const service = serviceWith({
      get: () => of({ user: profile({ hasLinkedSleeper: false }) }) as never,
    })

    await expectAsync(service.hasLinkedSleeper()).toBeResolvedTo(false)
  })

  it('treats a failed lookup as linked', async () => {
    const service = serviceWith({ get: () => throwError(() => new Error('down')) as never })

    // Reporting false here would bounce the user to /link-sleeper on every
    // navigation, with no way out while the API is unhappy.
    await expectAsync(service.hasLinkedSleeper()).toBeResolvedTo(true)
  })

  it('sends only the username when linking', (done) => {
    let sentBody: unknown = null
    const service = serviceWith({
      put: (_url: string, body: unknown) => {
        sentBody = body
        return of({ user: profile() }) as never
      },
    })

    service.linkSleeper('domgiordano').subscribe(() => {
      // The API re-resolves the handle and stores the id itself, so the id
      // the page found cannot drift from the one that gets saved.
      expect(sentBody).toEqual({ sleeperUsername: 'domgiordano' })
      done()
    })
  })

  it('surfaces a link failure rather than swallowing it', (done) => {
    const service = serviceWith({
      put: () => throwError(() => new Error('bad handle')) as never,
    })

    service.linkSleeper('nope').subscribe({
      next: () => done.fail('should not emit'),
      error: (err) => {
        // The caller needs the message to tell the user what was wrong with
        // what they typed.
        expect(String(err)).toContain('bad handle')
        done()
      },
    })
  })

  it('clears the cache on sign-out', (done) => {
    const service = serviceWith({ get: () => of({ user: profile() }) as never })

    service.load().subscribe(() => {
      service.clear()
      expect(service.getProfile()).toBeNull()
      done()
    })
  })
})
