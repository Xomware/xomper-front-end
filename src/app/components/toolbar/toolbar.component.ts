import { Component, HostListener, OnInit, OnDestroy } from '@angular/core'
import { Router, RouterLink, RouterLinkActive } from '@angular/router'
import { Subject } from 'rxjs'
import { SupabaseService } from 'src/app/services/supabase.service'
import { LeagueService } from 'src/app/services/league.service'
import { TeamService } from 'src/app/services/team.service'
import { UserService } from 'src/app/services/user.service'
import { NgClass, NgIf } from '@angular/common';

@Component({
    selector: 'app-toolbar',
    templateUrl: './toolbar.component.html',
    styleUrls: ['./toolbar.component.scss'],
    standalone: true,
    imports: [
        NgClass,
        RouterLink,
        RouterLinkActive,
        NgIf,
    ],
})
export class ToolbarComponent implements OnInit, OnDestroy {
  dropdownVisible = false
  leagueDropdownVisible = false
  isMobile = false

  private destroy$ = new Subject<void>()
  private resizeHandler = this.checkIfMobile.bind(this)

  constructor(
    private router: Router,
    private leagueService: LeagueService,
    private userService: UserService,
    private teamService: TeamService,
    private supabaseService: SupabaseService
  ) {
    this.checkIfMobile()
  }

  ngOnInit(): void {
    window.addEventListener('resize', this.resizeHandler)
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
    window.removeEventListener('resize', this.resizeHandler)
  }

  toggleDropdown(): void {
    this.dropdownVisible = !this.dropdownVisible
    this.leagueDropdownVisible = false
  }

  toggleLeagueDropdown(event: MouseEvent): void {
    event.stopPropagation()
    this.leagueDropdownVisible = !this.leagueDropdownVisible
  }

  navigateLeagueFeature(route: string, queryParams?: Record<string, string>): void {
    this.leagueDropdownVisible = false
    this.dropdownVisible = false
    this.router.navigate([route], queryParams ? { queryParams } : undefined)
  }

  closeMobileMenu(): void {
    this.dropdownVisible = false
    this.leagueDropdownVisible = false
  }

  @HostListener('document:click', ['$event'])
  closeDropdown(event: MouseEvent): void {
    const target = event.target as HTMLElement
    if (!target.closest('.dropdown') && !target.closest('.dropdown-button')) {
      this.dropdownVisible = false
    }
    if (!target.closest('.league-dropdown-wrapper')) {
      this.leagueDropdownVisible = false
    }
  }

  checkIfMobile(): void {
    this.isMobile = window.innerWidth <= 768
  }

  isSelected(route: string): boolean {
    return this.router.url.startsWith(route)
  }

  isLeagueRouteActive(): boolean {
    const url = this.router.url
    return url.includes('/my-league') || url.includes('/taxi-squad') || url.includes('/draft-history') || url.includes('/matchup-history')
  }

  get leagueId(): string | undefined {
    return this.leagueService.getMyLeague()?.getId()
  }

  get userId(): string | undefined {
    return this.userService.getMyUser()?.getUserId()
  }

  get teamUserName(): string | undefined {
    return this.teamService.getMyTeam()?.getUserName()
  }

  get teamLeagueId(): string | undefined {
    return this.teamService.getMyTeam()?.getLeague()?.getId()
  }

  isLoggedIn(): boolean {
    return this.supabaseService.isAuthenticated()
  }

  signOut(): void {
    this.supabaseService.signOut().subscribe(() => {
      this.leagueService.reset()
      this.userService.reset()
      this.teamService.reset()

      this.router.navigate(['/home'])
    })

    this.dropdownVisible = false
  }

  goHome(): void {
    this.dropdownVisible = false
    this.router.navigate(['/home'])
  }
}
