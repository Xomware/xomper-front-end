import { Injectable } from '@angular/core'
import { CanActivate, Router } from '@angular/router'
import { firstValueFrom } from 'rxjs'
import { filter, take } from 'rxjs/operators'
import { SupabaseService } from '../services/supabase.service'

/**
 * AdminGuard — async canActivate that avoids the cold-load race.
 *
 * Problem: SupabaseService.isAdmin is derived from _whitelistedUser which
 * resolves asynchronously after session init. Reading it synchronously on
 * cold nav returns false → incorrect redirect to /home for valid admins.
 *
 * Fix: wait for initialized$ to emit true, THEN read isAdmin$ (Observable).
 * Both are BehaviorSubject-backed so they replay the current value immediately
 * once initialized — no extra round-trip.
 */
@Injectable({ providedIn: 'root' })
export class AdminGuard implements CanActivate {
  constructor(
    private supabaseService: SupabaseService,
    private router: Router,
  ) {}

  async canActivate(): Promise<boolean> {
    // Wait until the Supabase session + whitelisted_user row have resolved.
    await firstValueFrom(
      this.supabaseService.initialized$.pipe(filter((v) => v === true)),
    )

    // Read the current admin state (replays immediately from BehaviorSubject).
    const isAdmin = await firstValueFrom(
      this.supabaseService.isAdmin$.pipe(take(1)),
    )

    if (isAdmin) return true

    this.router.navigate(['/home'])
    return false
  }
}
