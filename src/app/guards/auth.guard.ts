import { Injectable } from '@angular/core'
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router'
import { firstValueFrom } from 'rxjs'
import { catchError, filter, map, of } from 'rxjs'
import { SupabaseService } from '../services/supabase.service'
import { LeagueService } from '../services/league.service'

/**
 * AuthGuard — async canActivate that avoids the cold-load race.
 *
 * This is the same race `AdminGuard` already documents, and it is what broke
 * Google sign-in.
 *
 * `isAuthenticated()` reads `currentUser.value` synchronously, but the session
 * resolves asynchronously — and with PKCE, OAuth returns the user to
 * `/home?code=...` where supabase-js still has to exchange that code. On that
 * first navigation the sequence was:
 *
 *   1. client created with detectSessionInUrl, exchange starts
 *   2. initSession() has not resolved, so currentUser.value is null
 *   3. this guard reads it, sees false, navigates to /login
 *   4. that redirect drops `?code=` from the URL, so the exchange can never
 *      finish
 *
 * The user lands back on the login page having authenticated successfully,
 * with no error anywhere — the code was simply thrown away before it could be
 * redeemed.
 *
 * Fix: wait for `initialized$` before deciding. It is BehaviorSubject-backed,
 * so once resolved it replays immediately and costs nothing on warm nav.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(
    private supabaseService: SupabaseService,
    private leagueService: LeagueService,
    private router: Router,
  ) {}

  async canActivate(
    _route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot,
  ): Promise<boolean> {
    // Wait until session init (including any PKCE code exchange) has settled.
    await firstValueFrom(
      this.supabaseService.initialized$.pipe(filter((v) => v === true)),
    )

    if (!this.supabaseService.isAuthenticated()) {
      this.router.navigate(['/login'])
      return false
    }

    // A signed-in account with no linked Sleeper user has no identity in the
    // app: getMyUser() is null, no roster matches, and every surface renders
    // empty. The link page existed but nothing ever routed anyone to it, so
    // all six accounts sat unlinked and the app looked broken rather than
    // incomplete.
    // The link page is itself guarded, so exempt it or the redirect loops.
    const onLinkPage = state.url.split('?')[0] === '/link-sleeper'

    if (!onLinkPage && !(await this.supabaseService.hasLinkedSleeper())) {
      this.router.navigate(['/link-sleeper'])
      return false
    }

    // A league that fails to load should not lock an authenticated user out.
    return firstValueFrom(
      this.leagueService.loadMyLeague().pipe(
        map(() => true),
        catchError(() => of(true)),
      ),
    )
  }
}
