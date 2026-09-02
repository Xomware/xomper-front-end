import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Router, RouterModule } from '@angular/router'

interface AdminTab {
  label: string
  subtitle: string
  /** SVG path data, not emoji — emoji are not used in Xomware product UI. */
  iconPath: string
  route: string | null
  /** Logs is deferred per D-D. */
  disabled?: boolean
}

/**
 * Admin shell — a tab bar over the section currently open.
 *
 * This was a grid of nine cards that filled the screen, so every section was
 * two navigations away: back to the menu, then into the next one. As tabs the
 * sections sit above whichever one is open and switching is one click, which
 * is how a portal someone works in all day should behave.
 *
 * Accessible only via AdminGuard. Logs is disabled ("Coming soon") per D-D.
 */
@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss'],
})
export class AdminComponent {
  readonly tabs: AdminTab[] = [
    {
      label: 'AI Review',
      subtitle: 'Trigger + preview reports',
      iconPath: 'M21 10.5h-1V8c0-1.1-.9-2-2-2h-2.5V5c0-1.66-1.34-3-3-3S9.5 3.34 9.5 5v1H7c-1.1 0-2 .9-2 2v2.5H4c-1.1 0-2 .9-2 2s.9 2 2 2h1V17c0 1.1.9 2 2 2h2.5v1c0 1.66 1.34 3 3 3s3-1.34 3-3v-1H18c1.1 0 2-.9 2-2v-2.5h1c1.1 0 2-.9 2-2s-.9-2-2-2zM9 9h2v2H9V9zm4 6h-2v-2h2v2zm2-4h-2V9h2v2z',
      route: '/admin/ai-review',
    },
    {
      label: 'Test Email',
      subtitle: 'Send test emails',
      iconPath: 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
      route: '/admin/test-email',
    },
    {
      label: 'Email Archive',
      subtitle: 'Browse + resend emails',
      iconPath: 'M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2zm-5 12H9v-2h6v2zm5-7H4V4h16v3z',
      route: '/admin/email-archive',
    },
    {
      label: 'Announcements',
      subtitle: 'Create + manage banners',
      iconPath: 'M18 11v2h4v-2h-4zm-2 6.61c.96.71 2.21 1.65 3.2 2.39.4-.53.8-1.07 1.2-1.6-.99-.74-2.24-1.68-3.2-2.4-.4.54-.8 1.08-1.2 1.61zM20.4 5.6c-.4-.53-.8-1.07-1.2-1.6-.99.74-2.24 1.68-3.2 2.4.4.53.8 1.07 1.2 1.6.96-.72 2.21-1.65 3.2-2.4zM4 9c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h1v4h2v-4h1l5 3V6L8 9H4zm11.5 3c0-1.33-.58-2.53-1.5-3.35v6.69c.92-.81 1.5-2.01 1.5-3.34z',
      route: '/admin/announcements',
    },
    {
      label: 'Sleeper Claims',
      subtitle: 'Who claimed which handle',
      iconPath: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
      route: '/admin/sleeper-claims',
    },
    {
      label: 'Tables',
      subtitle: 'Users + leagues',
      iconPath: 'M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 20H4v-4h4v4zm0-6H4v-4h4v4zm0-6H4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4z',
      route: '/admin/tables',
    },
    {
      label: 'Audit',
      subtitle: 'Admin action history',
      iconPath: 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
      route: '/admin/audit',
    },
    {
      label: 'Cron Settings',
      subtitle: 'Kill switches + test mode',
      iconPath: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
      route: '/admin/cron-settings',
    },
    {
      label: 'Logs',
      subtitle: 'Coming soon',
      iconPath: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z',
      route: null,
      disabled: true,
    },
  ]

  constructor(private router: Router) {}

  navigate(tab: AdminTab): void {
    if (tab.disabled || !tab.route) return
    this.router.navigate([tab.route])
  }

  /** True when the tab's section is the one on screen. */
  isActive(tab: AdminTab): boolean {
    return !!tab.route && this.router.url.startsWith(tab.route)
  }

  /** No section open yet, so the shell shows what the portal covers. */
  get atRoot(): boolean {
    return this.router.url === '/admin'
  }
}
