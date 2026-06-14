import { Injectable } from '@angular/core'
import { CanActivate, Router } from '@angular/router'
import { Observable, catchError, map, of } from 'rxjs'
import { SupabaseService } from '../services/supabase.service'
import { LeagueService } from '../services/league.service'

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(
    private supabaseService: SupabaseService,
    private leagueService: LeagueService,
    private router: Router,
  ) {}

  canActivate(): Observable<boolean> {
    if (!this.supabaseService.isAuthenticated()) {
      this.router.navigate(['/login'])
      return of(false)
    }

    return this.leagueService.loadMyLeague().pipe(
      map(() => true),
      catchError(() => of(true)),
    )
  }
}
