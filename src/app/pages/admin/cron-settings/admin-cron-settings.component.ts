import { Component, OnInit } from '@angular/core'
import { CommonModule } from '@angular/common'
import { CronService } from 'src/app/services/cron.service'
import { CronSetting, cronDisplayTitle } from 'src/app/models/cron-setting.model'
import {
  ConfirmDialogComponent,
  ConfirmDialogConfig,
} from 'src/app/components/confirm-dialog/confirm-dialog.component'

/**
 * Admin Cron Settings — per-row enabled/test-mode toggle pair.
 *
 * "Test mode active" gold sticky banner when any row has testMode=true.
 * Per-row pending spinner while an in-flight toggle call resolves.
 * ConfirmDialog before flipping `enabled` to false (kill-switch).
 *
 * Mirrors iOS CronSettingsView.swift + CronSettingsStore.swift.
 */
@Component({
  selector: 'app-admin-cron-settings',
  standalone: true,
  imports: [CommonModule, ConfirmDialogComponent],
  templateUrl: './admin-cron-settings.component.html',
  styleUrls: ['./admin-cron-settings.component.scss'],
})
export class AdminCronSettingsComponent implements OnInit {
  rows: CronSetting[] = []
  isLoading = false
  tableMissing = false
  error: string | null = null

  /** Per-row in-flight tracker. cronKey → true while request is pending. */
  pendingKeys: Record<string, boolean> = {}

  /** Confirm dialog for toggling enabled off. */
  showDialog = false
  dialogConfig: ConfirmDialogConfig = {
    title: 'Disable Cron',
    message: '',
    confirmLabel: 'Disable',
    destructive: true,
  }
  private _pendingToggle: { cronKey: string } | null = null

  constructor(private cronService: CronService) {}

  ngOnInit(): void {
    this.load()
  }

  load(): void {
    this.isLoading = true
    this.error = null
    this.cronService.list().subscribe({
      next: ({ rows, tableMissing }) => {
        this.rows = rows
        this.tableMissing = tableMissing
        this.isLoading = false
      },
      error: (err: unknown) => {
        this.error = err instanceof Error ? err.message : 'Failed to load cron settings.'
        this.isLoading = false
      },
    })
  }

  get anyTestModeActive(): boolean {
    return this.rows.some((r) => r.testMode)
  }

  displayTitle(row: CronSetting): string {
    return cronDisplayTitle(row)
  }

  toggleEnabled(row: CronSetting): void {
    const newEnabled = !row.enabled
    if (!newEnabled) {
      // Disabling a cron is destructive — confirm first.
      this._pendingToggle = { cronKey: row.cronKey }
      this.dialogConfig = {
        ...this.dialogConfig,
        message: `Disable "${this.displayTitle(row)}"? This will stop the cron from firing in production.`,
      }
      this.showDialog = true
      return
    }
    this.applyEnabledToggle(row.cronKey, newEnabled)
  }

  onDialogConfirmed(confirmed: boolean): void {
    this.showDialog = false
    if (!confirmed || !this._pendingToggle) return
    const { cronKey } = this._pendingToggle
    this._pendingToggle = null
    const row = this.rows.find((r) => r.cronKey === cronKey)
    if (!row) return
    this.applyEnabledToggle(cronKey, false)
  }

  private applyEnabledToggle(cronKey: string, enabled: boolean): void {
    this.pendingKeys[cronKey] = true
    // Optimistic update.
    this.rows = this.rows.map((r) =>
      r.cronKey === cronKey ? { ...r, enabled } : r,
    )
    this.cronService.setEnabled(cronKey, enabled).subscribe({
      next: (patch) => {
        this.pendingKeys[cronKey] = false
        // Reconcile with server echo.
        this.rows = this.rows.map((r) =>
          r.cronKey === cronKey ? { ...r, ...patch } : r,
        )
      },
      error: () => {
        this.pendingKeys[cronKey] = false
        // Revert optimistic update.
        this.rows = this.rows.map((r) =>
          r.cronKey === cronKey ? { ...r, enabled: !enabled } : r,
        )
      },
    })
  }

  toggleTestMode(row: CronSetting): void {
    if (!row.enabled) return  // test-mode disabled when cron is off (iOS UX rule)
    const newTestMode = !row.testMode
    const cronKey = row.cronKey
    this.pendingKeys[cronKey] = true
    // Optimistic.
    this.rows = this.rows.map((r) =>
      r.cronKey === cronKey ? { ...r, testMode: newTestMode } : r,
    )
    this.cronService.setTestMode(cronKey, newTestMode).subscribe({
      next: (patch) => {
        this.pendingKeys[cronKey] = false
        this.rows = this.rows.map((r) =>
          r.cronKey === cronKey ? { ...r, ...patch } : r,
        )
      },
      error: () => {
        this.pendingKeys[cronKey] = false
        // Revert.
        this.rows = this.rows.map((r) =>
          r.cronKey === cronKey ? { ...r, testMode: !newTestMode } : r,
        )
      },
    })
  }

  isPending(cronKey: string): boolean {
    return !!this.pendingKeys[cronKey]
  }
}
