import { Injectable } from '@angular/core'
import { CanActivate, Router } from '@angular/router'
import { firstValueFrom } from 'rxjs'
import { filter, take } from 'rxjs/operators'
import { CognitoService } from '../services/cognito.service'

/**
 * AdminGuard — async canActivate that avoids the cold-load race.
 *
 * `isAdmin` is derived from the `cognito:groups` claim, which is only
 * available once the session has resolved. Reading it synchronously on a cold
 * navigation returns false and redirects a valid admin to /home.
 *
 * Waiting on `isReady$` first fixes that. It is BehaviorSubject-backed, so
 * once resolved it replays immediately and costs nothing on warm nav.
 *
 * Admin used to mean a `whitelisted_users` row with `role = 'admin'`. It now
 * means membership of the `admin` group on the shared pool, which is checked
 * again server-side from the same claim — the guard only decides what to
 * render.
 */
@Injectable({ providedIn: 'root' })
export class AdminGuard implements CanActivate {
  constructor(
    private cognito: CognitoService,
    private router: Router,
  ) {}

  async canActivate(): Promise<boolean> {
    await firstValueFrom(this.cognito.isReady$.pipe(filter((v) => v === true)))

    const isAdmin = await firstValueFrom(this.cognito.isAdmin$.pipe(take(1)))
    if (isAdmin) return true

    this.router.navigate(['/home'])
    return false
  }
}
