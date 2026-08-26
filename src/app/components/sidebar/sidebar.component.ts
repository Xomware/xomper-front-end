import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core'
import { NgClass, NgFor, NgIf } from '@angular/common'
import { DomSanitizer, SafeHtml } from '@angular/platform-browser'
import { Router, RouterLink, RouterLinkActive } from '@angular/router'
import { CognitoService } from 'src/app/services/cognito.service'
import { UserProfileService, UserProfile } from 'src/app/services/user-profile.service'
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

  constructor(
    public profiles: UserProfileService,
    public userService: UserService,
    private cognito: CognitoService,
    private router: Router,
    private sanitizer: DomSanitizer,
  ) {}

  get profile(): UserProfile | null {
    return this.profiles.getProfile()
  }

  get displayName(): string {
    return this.profile?.sleeperUsername || this.profile?.email || 'My Profile'
  }

  get avatarUrl(): string | null {
    const avatar = this.profile?.sleeperAvatar
    if (!avatar) return null
    return this.userService.buildAvatar(avatar)
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
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeProfileMenu()
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
    this.userService.reset()
    this.router.navigate(['/login'])
  }

  onEntryClick(): void {
    this.entryActivated.emit()
  }
}
