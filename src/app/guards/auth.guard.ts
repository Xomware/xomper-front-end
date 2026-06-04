import { Injectable } from '@angular/core'
import { CanActivate, Router } from '@angular/router'
import { SupabaseService } from '../services/supabase.service'

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(
    private supabaseService: SupabaseService,
    private router: Router,
  ) {}

  canActivate(): boolean {
    if (this.supabaseService.isAuthenticated()) {
      return true
    }

    // s5: redirect unauthed users to /login (was /home pre-s5)
    this.router.navigate(['/login'])
    return false
  }
}
