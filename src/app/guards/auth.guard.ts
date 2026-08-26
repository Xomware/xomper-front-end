import { Injectable } from '@angular/core'
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router'
import { firstValueFrom } from 'rxjs'
import { catchError, filter, map, of } from 'rxjs'
import { CognitoService } from '../services/cognito.service'
import { UserProfileService } from '../services/user-profile.service'
import { UserService } from '../services/user.service'
import { LeagueService } from '../services/league.service'

/**
 * AuthGuard — resolves everything a signed-in session needs before a
 * protected route renders.
 *
 * Three things happen here, in order, and each one exists because it was
 * missing somewhere it was needed:
 *
 * 1. Wait for the session. `isAuthenticated()` reads the current value
 *    synchronously, but the session resolves asynchronously, and a federated
 *    sign-in returns to `/auth/callback` where Amplify still has to exchange
 *    a code. Deciding before that settles bounces an authenticated user to
 *    the login page and discards the code before it can be redeemed.
 *    `isReady$` is BehaviorSubject-backed, so once resolved it replays
 *    immediately and costs nothing on warm navigation.
 *
 * 2. Require a linked Sleeper account. Without one the app has no identity
 *    to work with — `getMyUser()` is null, no roster matches, every surface
 *    renders empty.
 *
 * 3. Resolve `myUser` from the profile. This used to happen only on the
 *    login path, and `UserService` holds it in memory, so a refresh or a
 *    deep link left all fourteen `getMyUser()` consumers looking at null —
 *    a signed-in, fully linked user seeing an empty app. Doing it here
 *    covers every entry into a protected route, not just the one that
 *    happens to go through the login form.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(
    private cognito: CognitoService,
    private profiles: UserProfileService,
    private userService: UserService,
    private leagueService: LeagueService,
    private router: Router,
  ) {}

  async canActivate(
    _route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot,
  ): Promise<boolean> {
    await firstValueFrom(this.cognito.isReady$.pipe(filter((v) => v === true)))

    if (!this.cognito.isAuthenticated()) {
      this.router.navigate(['/login'])
      return false
    }

    // The link page is itself guarded, so exempt it or the redirect loops.
    const onLinkPage = state.url.split('?')[0] === '/link-sleeper'

    // One fetch serves both the link check and the myUser resolution below.
    // It also creates the record on first call, so a user arriving straight
    // from sign-up is provisioned here.
    const profile = await firstValueFrom(
      this.profiles.load().pipe(catchError(() => of(null))),
    )

    if (!onLinkPage && profile && !profile.hasLinkedSleeper) {
      this.router.navigate(['/link-sleeper'])
      return false
    }

    // A failed profile load leaves `profile` null. Let the user through
    // rather than trapping them in a redirect to a page they may have
    // already completed — a sparse app beats an inescapable loop.
    if (profile?.sleeperUserId && !this.userService.myUserSelected()) {
      await this.resolveMyUser(profile.sleeperUserId)
    }

    // A league that fails to load should not lock an authenticated user out.
    return firstValueFrom(
      this.leagueService.loadMyLeague().pipe(
        map(() => true),
        catchError(() => of(true)),
      ),
    )
  }

  /**
   * Populate `UserService.myUser` from the linked Sleeper id.
   *
   * Best-effort: Sleeper being unreachable should degrade the app, not block
   * navigation into it.
   */
  private async resolveMyUser(sleeperUserId: string): Promise<void> {
    const user = await firstValueFrom(
      this.userService.searchUser(sleeperUserId).pipe(catchError(() => of(null))),
    )
    if (user) {
      this.userService.setMyUser(user)
    }
  }
}
