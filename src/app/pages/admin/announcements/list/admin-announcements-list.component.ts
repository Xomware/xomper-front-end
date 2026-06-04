import { Component, OnInit } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Router } from '@angular/router'
import { AnnouncementsService } from 'src/app/services/announcements.service'
import { LeagueAnnouncement } from 'src/app/models/league-announcement.model'
import {
  ConfirmDialogComponent,
  ConfirmDialogConfig,
} from 'src/app/components/confirm-dialog/confirm-dialog.component'

@Component({
  selector: 'app-admin-announcements-list',
  standalone: true,
  imports: [CommonModule, ConfirmDialogComponent],
  templateUrl: './admin-announcements-list.component.html',
  styleUrls: ['./admin-announcements-list.component.scss'],
})
export class AdminAnnouncementsListComponent implements OnInit {
  rows: LeagueAnnouncement[] = []
  isLoading = false
  tableMissing = false
  error: string | null = null

  /** ID of the row currently being deleted (for per-row spinner). */
  pendingDeleteId: string | null = null

  /** Controls the confirm dialog visibility. */
  showDeleteDialog = false
  deleteDialogConfig: ConfirmDialogConfig = {
    title: 'Delete Announcement',
    message: '',
    confirmLabel: 'Delete',
    destructive: true,
  }
  private _pendingDeleteTarget: LeagueAnnouncement | null = null

  constructor(
    private announcementsService: AnnouncementsService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.load()
  }

  load(): void {
    this.isLoading = true
    this.error = null
    this.announcementsService.listAdmin().subscribe({
      next: ({ rows, tableMissing }) => {
        this.rows = rows
        this.tableMissing = tableMissing
        this.isLoading = false
      },
      error: (err: unknown) => {
        this.error = err instanceof Error ? err.message : 'Failed to load announcements.'
        this.isLoading = false
      },
    })
  }

  navigateNew(): void {
    this.router.navigate(['/admin/announcements/new'])
  }

  navigateEdit(id: string): void {
    this.router.navigate(['/admin/announcements', id])
  }

  confirmDelete(row: LeagueAnnouncement): void {
    this._pendingDeleteTarget = row
    this.deleteDialogConfig = {
      ...this.deleteDialogConfig,
      message: `Delete "${row.title}"? This will set it inactive on the backend. The row stays in the database.`,
    }
    this.showDeleteDialog = true
  }

  onDeleteConfirmed(confirmed: boolean): void {
    this.showDeleteDialog = false
    if (!confirmed || !this._pendingDeleteTarget) return
    const target = this._pendingDeleteTarget
    this._pendingDeleteTarget = null
    this.pendingDeleteId = target.id
    this.announcementsService.softDelete(target.id).subscribe({
      next: () => {
        this.pendingDeleteId = null
        this.load()
      },
      error: (err: unknown) => {
        this.pendingDeleteId = null
        this.error = err instanceof Error ? err.message : 'Delete failed.'
      },
    })
  }

  priorityLabel(priority: 'critical' | 'info'): string {
    return priority === 'critical' ? 'Critical' : 'Info'
  }

  expiryLabel(row: LeagueAnnouncement): string {
    if (!row.expiresAt) return ''
    const d = new Date(row.expiresAt)
    const now = new Date()
    if (d < now) return 'Expired'
    return `Expires ${d.toLocaleDateString()}`
  }

  isExpired(row: LeagueAnnouncement): boolean {
    if (!row.expiresAt) return false
    return new Date(row.expiresAt) < new Date()
  }
}
