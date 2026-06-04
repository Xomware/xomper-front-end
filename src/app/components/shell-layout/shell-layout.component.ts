import { Component, OnDestroy, OnInit } from '@angular/core'
import { NgIf } from '@angular/common'
import { RouterOutlet } from '@angular/router'
import { SidebarComponent } from '../sidebar/sidebar.component'
import { MobileDrawerComponent } from '../mobile-drawer/mobile-drawer.component'
import { FooterComponent } from '../footer/footer.component'
import { ToastComponent } from '../toast/toast.component'
import { SIDEBAR_SECTIONS, SidebarSection } from '../sidebar/sidebar.entries'
import { SupabaseService } from 'src/app/services/supabase.service'

const MOBILE_BREAKPOINT = 768

@Component({
  selector: 'app-shell-layout',
  templateUrl: './shell-layout.component.html',
  styleUrls: ['./shell-layout.component.scss'],
  standalone: true,
  imports: [
    NgIf,
    RouterOutlet,
    SidebarComponent,
    MobileDrawerComponent,
    FooterComponent,
    ToastComponent,
  ],
})
export class ShellLayoutComponent implements OnInit, OnDestroy {
  isMobile = false
  drawerOpen = false

  readonly sections: SidebarSection[] = SIDEBAR_SECTIONS

  private mediaQuery!: MediaQueryList
  private mqListener!: (e: MediaQueryListEvent) => void

  constructor(private supabase: SupabaseService) {}

  ngOnInit(): void {
    this.mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
    this.isMobile = this.mediaQuery.matches
    this.mqListener = (e: MediaQueryListEvent) => {
      this.isMobile = e.matches
      if (!e.matches) {
        // Desktop: close drawer if it was open from mobile
        this.drawerOpen = false
      }
    }
    this.mediaQuery.addEventListener('change', this.mqListener)
  }

  ngOnDestroy(): void {
    this.mediaQuery.removeEventListener('change', this.mqListener)
  }

  get isAdmin(): boolean {
    const profile = this.supabase.getProfile()
    // Admin if role field is set; fall back to false while profile loads
    // The whitelisted_users table has a role field; profile table doesn't surface it
    // directly here. Use SupabaseService.getWhitelistedUser check via a simple pattern:
    // for now, read from profile if role were present, else check email-based heuristic.
    // The real admin gate will use the whitelisted_users.role column via s7.
    // For s1 purposes: hide Admin section for everyone (safest default).
    return false
  }

  toggleDrawer(): void {
    this.drawerOpen = !this.drawerOpen
  }

  closeDrawer(): void {
    this.drawerOpen = false
  }
}
