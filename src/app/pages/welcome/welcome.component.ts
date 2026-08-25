import { Component, OnInit } from '@angular/core'
import { NgIf } from '@angular/common'
import { Router, RouterLink } from '@angular/router'
import { environment } from '../../../environments/environment'
import { SupabaseService } from '../../services/supabase.service'

/**
 * Public landing page at `/`.
 *
 * Before this existed, `/` redirected to `/home`, which is auth-gated — so
 * every unauthenticated visitor was dropped straight onto a login form with
 * no indication of what the site is. This is the page that answers that.
 *
 * Branding comes from `environment` rather than being hardcoded, because the
 * same component ships in two apps: the Xomper platform, and the CLT Dynasty
 * League app that is powered by it. Only the values differ.
 */
@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [NgIf, RouterLink],
  templateUrl: './welcome.component.html',
  styleUrls: ['./welcome.component.scss'],
})
export class WelcomeComponent implements OnInit {
  readonly appName = environment.appName
  readonly tagline = environment.appTagline
  /** True in the CLT app: shows "powered by" with the Xomper mark. */
  readonly showPoweredBy = environment.poweredByXomper

  constructor(
    private router: Router,
    private supabaseService: SupabaseService,
  ) {}

  ngOnInit(): void {
    // Someone already signed in has no use for a marketing page.
    if (this.supabaseService.isAuthenticated()) {
      this.router.navigate(['/home'])
    }
  }
}
