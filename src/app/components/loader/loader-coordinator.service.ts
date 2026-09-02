import { Injectable } from '@angular/core'

/** How long the overlay lingers after the last loader releases. */
const HANDOFF_GRACE_MS = 180

/**
 * Keeps exactly one loading overlay on screen.
 *
 * Every page renders its own `app-loader`, and the loader is a fixed
 * full-screen panel. Navigating to /league therefore painted two in
 * sequence -- the shell's while it resolved the league, then the child
 * route's while it read rosters -- which reads as the app flashing rather
 * than working.
 *
 * Claimants are ordered, and only the first paints. The rest are silent, so
 * a nested page still reports its state without a second overlay.
 *
 * The grace period covers the handoff: the shell often releases a tick
 * before the child claims, and without it that gap is a flash of content
 * that is about to be covered again.
 */
@Injectable({ providedIn: 'root' })
export class LoaderCoordinator {
  private claims: object[] = []
  private pendingRelease: ReturnType<typeof setTimeout> | null = null

  claim(token: object): void {
    if (this.pendingRelease) {
      clearTimeout(this.pendingRelease)
      this.pendingRelease = null
    }
    if (!this.claims.includes(token)) {
      this.claims.push(token)
    }
  }

  release(token: object): void {
    this.claims = this.claims.filter((c) => c !== token)
  }

  /**
   * Release, but hold the overlay briefly in case another loader is about to
   * claim. Returns immediately; the caller re-renders on the next check.
   */
  releaseSoon(token: object, onSettled: () => void): void {
    if (this.claims.length > 1) {
      this.release(token)
      onSettled()
      return
    }
    this.pendingRelease = setTimeout(() => {
      this.release(token)
      this.pendingRelease = null
      onSettled()
    }, HANDOFF_GRACE_MS)
  }

  /** Only the first claimant paints. */
  isPrimary(token: object): boolean {
    return this.claims[0] === token
  }

  get anyActive(): boolean {
    return this.claims.length > 0
  }
}
