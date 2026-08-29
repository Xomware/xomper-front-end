/**
 * Tests for FriendsService.
 *
 * Every mutation returns the whole graph, so one call both changes and
 * re-syncs. The important asymmetry is that load() swallows failures and
 * mutations do not: a bell that cannot load is a non-event, but a friend
 * request that silently failed is a lie.
 */
import { HttpClient } from '@angular/common/http'
import { of, throwError } from 'rxjs'
import { FriendsService, FriendGraph } from './friends.service'

function person(userId: string, displayName = 'Bee') {
  return { userId, displayName, sleeperUsername: 'bee', sleeperAvatar: '', since: '' }
}

function graph(overrides: Partial<FriendGraph> = {}): FriendGraph {
  return {
    friends: [],
    incoming: [],
    outgoing: [],
    pendingCount: 0,
    suggestions: [],
    ...overrides,
  }
}

function serviceWith(http: Partial<HttpClient>): FriendsService {
  return new FriendsService(http as HttpClient)
}

describe('FriendsService', () => {
  it('starts empty', () => {
    expect(serviceWith({}).graph.friends).toEqual([])
    expect(serviceWith({}).pendingCount).toBe(0)
  })

  it('caches the loaded graph', (done) => {
    const service = serviceWith({
      get: () => of(graph({ friends: [person('b')], pendingCount: 0 })) as never,
    })

    service.load().subscribe(() => {
      expect(service.graph.friends.length).toBe(1)
      done()
    })
  })

  it('exposes the pending count for the bell', (done) => {
    const service = serviceWith({
      get: () => of(graph({ incoming: [person('b')], pendingCount: 1 })) as never,
    })

    service.load().subscribe(() => {
      expect(service.pendingCount).toBe(1)
      done()
    })
  })

  it('returns an empty graph rather than failing to load', (done) => {
    const service = serviceWith({ get: () => throwError(() => new Error('down')) as never })

    // The bell is secondary; a social outage must not block navigation.
    service.load().subscribe((g) => {
      expect(g.pendingCount).toBe(0)
      done()
    })
  })

  it('re-syncs from the mutation response', (done) => {
    let sent: unknown = null
    const service = serviceWith({
      request: ((_m: string, _u: string, opts: { body: unknown }) => {
        sent = opts.body
        return of(graph({ outgoing: [person('b')] }))
      }) as never,
    })

    service.request('b').subscribe(() => {
      expect(sent).toEqual({ userId: 'b' })
      // One call mutates and re-syncs — no second GET to race.
      expect(service.graph.outgoing.length).toBe(1)
      done()
    })
  })

  it('surfaces a mutation failure instead of swallowing it', (done) => {
    const service = serviceWith({
      request: (() => throwError(() => new Error('already friends'))) as never,
    })

    service.request('b').subscribe({
      next: () => done.fail('should not emit'),
      error: (err) => {
        // The user asked for this; they need to know it did not happen.
        expect(String(err)).toContain('already friends')
        done()
      },
    })
  })

  it('accept and remove hit their own routes', (done) => {
    const urls: string[] = []
    const service = serviceWith({
      request: ((_m: string, url: string) => {
        urls.push(url.split('/').pop() ?? '')
        return of(graph())
      }) as never,
    })

    service.accept('b').subscribe(() => {
      service.remove('b').subscribe(() => {
        expect(urls).toEqual(['friend-accept', 'friend-remove'])
        done()
      })
    })
  })

  it('clears on sign out', (done) => {
    const service = serviceWith({
      get: () => of(graph({ friends: [person('b')], pendingCount: 2 })) as never,
    })

    service.load().subscribe(() => {
      service.clear()
      // Otherwise the next account on this browser inherits a bell count.
      expect(service.pendingCount).toBe(0)
      expect(service.graph.friends).toEqual([])
      done()
    })
  })
})

describe('FriendsService suggestions', () => {
  it('only asks for suggestions when told to', () => {
    const urls: string[] = []
    const http = { get: (url: string) => (urls.push(url), of(graph())) }
    const service = serviceWith(http as unknown as HttpClient)

    service.load().subscribe()
    service.load(true).subscribe()

    // The auth guard loads this on every protected navigation, and building
    // suggestions costs the server a scan plus a fan-out over Sleeper.
    expect(urls[0]).not.toContain('suggest')
    expect(urls[1]).toContain('suggest=1')
  })

  it('fills in suggestions the server left off', () => {
    const legacy = { friends: [], incoming: [], outgoing: [], pendingCount: 0 }
    const http = { get: () => of(legacy) }
    const service = serviceWith(http as unknown as HttpClient)

    let seen: FriendGraph | undefined
    service.load().subscribe((g) => (seen = g))

    // A response predating this field must not leave `suggestions` undefined
    // for a template that iterates it.
    expect(seen?.suggestions).toEqual([])
  })
})
