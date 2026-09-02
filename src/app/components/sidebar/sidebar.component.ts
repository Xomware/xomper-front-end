import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core'
import { NgClass, NgFor, NgIf } from '@angular/common'
import { DomSanitizer, SafeHtml } from '@angular/platform-browser'
import { Router, RouterLink, RouterLinkActive } from '@angular/router'
import { CognitoService } from 'src/app/services/cognito.service'
import { UserProfileService, UserProfile } from 'src/app/services/user-profile.service'
import { LeagueFollowsService, FollowedLeague } from 'src/app/services/league-follows.service'
import { LeagueService } from 'src/app/services/league.service'
import { FriendsService } from 'src/app/services/friends.service'
import { UserService } from 'src/app/services/user.service'
import { SidebarSection, SidebarEntry } from './sidebar.entries'

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
  standalone: true,
  imports: [NgClass, NgFor, NgIf, RouterLink, RouterLinkActive],
})
export class SidebarComponent {
  @Input() sections: SidebarSection[] = []
  @Input() isAdmin = false
  /** Emitted when an entry is activated (mobile drawer uses this to close). */
  @Output() entryActivated = new EventEmitter<void>()

  /** Whether the account dropdown is showing. */
  profileMenuOpen = false

  /** Whether the league switcher is showing. */
  leagueMenuOpen = false

  constructor(
    public profiles: UserProfileService,
    public userService: UserService,
    private cognito: CognitoService,
    private follows: LeagueFollowsService,
    private friends: FriendsService,
    private leagueService: LeagueService,
    private router: Router,
    private sanitizer: DomSanitizer,
  ) {}

  get profile(): UserProfile | null {
    return this.profiles.getProfile()
  }

  get displayName(): string {
    // displayName first: the Sleeper handle is unverified, so leading with it
    // makes the app assert an identity nobody confirmed. The handle remains
    // the fallback for records predating the field.
    return (
      this.profile?.displayName ||
      this.profile?.sleeperUsername ||
      this.profile?.email ||
      'My Profile'
    )
  }

  get avatarUrl(): string | null {
    const avatar = this.profile?.sleeperAvatar
    if (!avatar) return null
    return this.userService.buildAvatar(avatar)
  }

  /** Incoming friend requests. Zero hides the badge entirely. */
  get pendingCount(): number {
    return this.friends.pendingCount
  }

  get followedLeagues(): FollowedLeague[] {
    return this.follows.followed
  }

  get selectedLeagueId(): string | null {
    return this.follows.selectedLeagueId
  }

  get selectedLeagueName(): string {
    return this.follows.selectedLeague?.name ?? 'Select a league'
  }

  toggleLeagueMenu(event: Event): void {
    event.stopPropagation()
    this.leagueMenuOpen = !this.leagueMenuOpen
  }

  /**
   * Switch the app to another league, staying on the page you are reading.
   *
   * Everything cached in LeagueService is scoped to one league — rosters, the
   * season chain, resolved ids, the current team — so it all has to go, or
   * the new league renders with the old one's data under its name.
   *
   * Re-navigating through a throwaway URL rather than calling navigate() with
   * the same path: Angular reuses a component when the route does not change,
   * so the page would keep the old league's already-rendered data. This
   * forces it to build again and re-read the new selection.
   */
  selectLeague(league: FollowedLeague): void {
    this.leagueMenuOpen = false
    if (league.leagueId === this.follows.selectedLeagueId) return

    this.follows.select(league.leagueId)
    this.leagueService.clearForLeagueSwitch()

    const target = this.pageToReturnTo()
    this.router
      .navigateByUrl('/', { skipLocationChange: true })
      .then(() => this.router.navigateByUrl(target))
    this.onEntryClick()
  }

  /**
   * Where to land after a switch.
   *
   * Usually right back where you were. The exception is a page pinned to one
   * league by its own URL — /selected-league?leagueId=, /team-analyzer/:id —
   * which is about that league specifically, not about whichever is selected.
   * Reloading it would show the old league under the new league's name.
   */
  private pageToReturnTo(): string {
    const url = this.router.url
    const pinned =
      url.includes('leagueId=') || /\/team-analyzer\/[^/?]+/.test(url)
    return pinned ? '/home' : url
  }

  get visibleSections(): SidebarSection[] {
    return this.sections.filter(s => !s.adminOnly || this.isAdmin)
  }

  visibleEntries(section: SidebarSection): SidebarEntry[] {
    return section.entries.filter(e => !e.adminOnly || this.isAdmin)
  }

  /** Bypass Angular's HTML sanitizer for trusted inline SVG strings. */
  safeIcon(entry: SidebarEntry): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(entry.svg)
  }

  toggleProfileMenu(event: Event): void {
    // Stop the document listener below from seeing this click and closing
    // the menu in the same tick it opens.
    event.stopPropagation()
    this.profileMenuOpen = !this.profileMenuOpen
  }

  closeProfileMenu(): void {
    this.profileMenuOpen = false
  }

  /** Any click outside the menu dismisses it. */
  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeProfileMenu()
    this.leagueMenuOpen = false
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeProfileMenu()
    this.leagueMenuOpen = false
  }

  signOut(): void {
    this.closeProfileMenu()
    this.cognito.signOut().subscribe({
      next: () => this.afterSignOut(),
      // Amplify can reject if the session is already gone. The user asked to
      // leave either way, so clear local state and go rather than stranding
      // them on a page they no longer have a session for.
      error: () => this.afterSignOut(),
    })
  }

  private afterSignOut(): void {
    this.profiles.clear()
    this.follows.clear()
    this.friends.clear()
    this.userService.reset()
    this.router.navigate(['/login'])
  }

  onEntryClick(): void {
    this.entryActivated.emit()
  }
}
