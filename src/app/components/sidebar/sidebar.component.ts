import { Component, EventEmitter, Input, Output } from '@angular/core'
import { NgClass, NgFor, NgIf } from '@angular/common'
import { DomSanitizer, SafeHtml } from '@angular/platform-browser'
import { RouterLink, RouterLinkActive } from '@angular/router'
import { SupabaseService, Profile } from 'src/app/services/supabase.service'
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

  constructor(
    public supabase: SupabaseService,
    public userService: UserService,
    private sanitizer: DomSanitizer,
  ) {}

  get profile(): Profile | null {
    return this.supabase.getProfile()
  }

  get displayName(): string {
    return this.profile?.display_name ?? this.profile?.email ?? 'My Profile'
  }

  get avatarUrl(): string | null {
    const avatar = this.profile?.sleeper_avatar
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

  onEntryClick(): void {
    this.entryActivated.emit()
  }
}
