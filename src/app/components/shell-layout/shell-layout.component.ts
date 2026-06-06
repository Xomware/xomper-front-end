import { Component, OnDestroy, OnInit } from '@angular/core'
import { NgIf } from '@angular/common'
import { Router, RouterOutlet } from '@angular/router'
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

  constructor(private supabase: SupabaseService, private router: Router) {}

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
    return this.supabase.isAdmin
  }

  toggleDrawer(): void {
    this.drawerOpen = !this.drawerOpen
  }

  closeDrawer(): void {
    this.drawerOpen = false
  }

  goToSearch(): void {
    this.router.navigate(['/search'])
  }
}
