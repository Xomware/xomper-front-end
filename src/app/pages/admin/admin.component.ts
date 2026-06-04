import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Router, RouterModule } from '@angular/router'

interface AdminTile {
  label: string
  subtitle: string
  icon: string
  route: string | null
  /** Logs tile is deferred per D-D. */
  disabled?: boolean
}

/**
 * Admin shell — 8-tile menu mirroring iOS AdminView.
 * Accessible only via AdminGuard (/admin). Each tile navigates to a
 * nested child route. Logs tile is disabled ("Coming soon") per D-D.
 *
 * PR 7a ships: AI Review, Test Email, Email Archive tiles (active).
 * PR 7b ships: Announcements, Tables, Audit, Cron (active) — routes already
 * registered in app-routing but components land in 7b.
 */
@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss'],
})
export class AdminComponent {
  readonly tiles: AdminTile[] = [
    {
      label: 'AI Review',
      subtitle: 'Trigger + preview reports',
      icon: '🤖',
      route: '/admin/ai-review',
    },
    {
      label: 'Test Email',
      subtitle: 'Send test emails',
      icon: '✉️',
      route: '/admin/test-email',
    },
    {
      label: 'Email Archive',
      subtitle: 'Browse + resend emails',
      icon: '📬',
      route: '/admin/email-archive',
    },
    {
      label: 'Announcements',
      subtitle: 'Create + manage banners',
      icon: '📢',
      route: '/admin/announcements',
    },
    {
      label: 'Tables',
      subtitle: 'Users + leagues',
      icon: '🗃️',
      route: '/admin/tables',
    },
    {
      label: 'Audit',
      subtitle: 'Admin action history',
      icon: '🔍',
      route: '/admin/audit',
    },
    {
      label: 'Cron Settings',
      subtitle: 'Kill switches + test mode',
      icon: '⏱️',
      route: '/admin/cron-settings',
    },
    {
      label: 'Logs',
      subtitle: 'Coming soon',
      icon: '🖥️',
      route: null,
      disabled: true,
    },
  ]

  constructor(private router: Router) {}

  navigate(tile: AdminTile): void {
    if (tile.disabled || !tile.route) return
    this.router.navigate([tile.route])
  }
}
