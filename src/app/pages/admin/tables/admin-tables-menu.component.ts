import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Router } from '@angular/router'

interface TablesTile {
  label: string
  subtitle: string
  route: string
  external?: boolean
  tooltip?: string
}

/**
 * Admin Tables menu — 3 tiles:
 *   1. Users  → /admin/tables/users
 *   2. Leagues → /admin/tables/leagues
 *   3. Reports Flags → /admin/ai-review (tooltip: "flags live on each report row")
 * Mirrors iOS AdminView's 3rd tile deep-link to the AI Review redact menu.
 */
@Component({
  selector: 'app-admin-tables-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-tables-menu.component.html',
  styleUrls: ['./admin-tables-menu.component.scss'],
})
export class AdminTablesMenuComponent {
  tiles: TablesTile[] = [
    {
      label: 'Users',
      subtitle: 'Manage whitelisted users',
      route: '/admin/tables/users',
    },
    {
      label: 'Leagues',
      subtitle: 'Manage whitelisted leagues',
      route: '/admin/tables/leagues',
    },
    {
      label: 'Report Flags',
      subtitle: 'Do-not-broadcast / redact flags',
      route: '/admin/ai-review',
      tooltip: 'Flags live on each report row in AI Review',
    },
  ]

  constructor(private router: Router) {}

  navigate(tile: TablesTile): void {
    this.router.navigate([tile.route])
  }
}
