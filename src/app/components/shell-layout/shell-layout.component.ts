import { Component, OnDestroy, OnInit } from '@angular/core'
import { NgIf } from '@angular/common'
import { Router, RouterOutlet, NavigationEnd } from '@angular/router'
import { BehaviorSubject, Subscription, combineLatest } from 'rxjs'
import { filter } from 'rxjs/operators'
import { SidebarComponent } from '../sidebar/sidebar.component'
import { MobileDrawerComponent } from '../mobile-drawer/mobile-drawer.component'
import { ToastComponent } from '../toast/toast.component'
import { SIDEBAR_SECTIONS, SidebarSection } from '../sidebar/sidebar.entries'
import { CognitoService } from 'src/app/services/cognito.service'

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
    ToastComponent,
  ],
})
export class ShellLayoutComponent implements OnInit, OnDestroy {
  isMobile = false
  drawerOpen = false
  /** True when authenticated AND not on /login — gates sidebar/topbar/drawer. */
  showChrome = false

  readonly sections: SidebarSection[] = SIDEBAR_SECTIONS

  private mediaQuery!: MediaQueryList
  private mqListener!: (e: MediaQueryListEvent) => void
  private chromeSub!: Subscription

  constructor(private cognito: CognitoService, private router: Router) {}

  ngOnInit(): void {
    this.mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
    this.isMobile = this.mediaQuery.matches
    this.mqListener = (e: MediaQueryListEvent) => {
      this.isMobile = e.matches
      if (!e.matches) {
        this.drawerOpen = false
      }
    }
    this.mediaQuery.addEventListener('change', this.mqListener)

    // Seed with current URL then track NavigationEnd events.
    const url$ = new BehaviorSubject<string>(this.router.url)
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => url$.next(e.urlAfterRedirects))

    // showChrome is true only when the user is authenticated AND not on /login.
    this.chromeSub = combineLatest([
      this.cognito.user$,
      url$,
    ]).subscribe(([user, url]) => {
      this.showChrome = !!user && !url.startsWith('/login')
    })
  }

  ngOnDestroy(): void {
    this.mediaQuery.removeEventListener('change', this.mqListener)
    this.chromeSub?.unsubscribe()
  }

  get isAdmin(): boolean {
    return this.cognito.isAdmin
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
