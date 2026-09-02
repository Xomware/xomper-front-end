/**
 * Navigating to /league painted two full-screen overlays in sequence: the
 * shell's while it resolved the league, then the child route's while it read
 * rosters. Reported as the page flashing with multiple loaders.
 */
import { fakeAsync, tick } from '@angular/core/testing'
import { LoaderCoordinator } from './loader-coordinator.service'

describe('LoaderCoordinator', () => {
  let c: LoaderCoordinator

  beforeEach(() => (c = new LoaderCoordinator()))

  it('paints only the first claimant', () => {
    const shell = {}
    const child = {}

    c.claim(shell)
    c.claim(child)

    expect(c.isPrimary(shell)).toBe(true)
    expect(c.isPrimary(child)).toBe(false)
  })

  it('promotes the next claimant when the first leaves', () => {
    const shell = {}
    const child = {}
    c.claim(shell)
    c.claim(child)

    c.release(shell)

    // The overlay stays up continuously rather than dropping and returning.
    expect(c.isPrimary(child)).toBe(true)
    expect(c.anyActive).toBe(true)
  })

  it('releases a nested claimant immediately', fakeAsync(() => {
    const shell = {}
    const child = {}
    c.claim(shell)
    c.claim(child)
    let settled = false

    c.releaseSoon(child, () => (settled = true))

    // No grace needed: another loader is still painting, so there is no gap
    // to cover.
    expect(settled).toBe(true)
    expect(c.isPrimary(shell)).toBe(true)
  }))

  it('holds the overlay briefly when the last claimant leaves', fakeAsync(() => {
    const shell = {}
    c.claim(shell)
    let settled = false

    c.releaseSoon(shell, () => (settled = true))
    expect(c.anyActive).toBe(true)
    expect(settled).toBe(false)

    tick(200)
    expect(c.anyActive).toBe(false)
    expect(settled).toBe(true)
  }))

  it('cancels the hold when a new loader claims during the grace period', fakeAsync(() => {
    const shell = {}
    const child = {}
    c.claim(shell)
    c.releaseSoon(shell, () => undefined)

    // This is the handoff: the shell finished a tick before the child route
    // started. Without the cancel, the page flashes between them.
    c.claim(child)
    tick(200)

    expect(c.anyActive).toBe(true)
    expect(c.isPrimary(shell)).toBe(true)
  }))

  it('is inactive with nothing claimed', () => {
    expect(c.anyActive).toBe(false)
    expect(c.isPrimary({})).toBe(false)
  })

  it('ignores a repeated claim from the same loader', () => {
    const shell = {}
    c.claim(shell)
    c.claim(shell)
    c.release(shell)

    expect(c.anyActive).toBe(false)
  })
})
