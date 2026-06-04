import { Component, OnInit, OnDestroy } from '@angular/core'
import { CommonModule } from '@angular/common'
import { ActivatedRoute, Router } from '@angular/router'
import { Subject } from 'rxjs'
import { takeUntil } from 'rxjs/operators'
import { AiReviewService } from '../../../../services/ai-review.service'
import { AiReportType } from '../../../../models/ai-report-type.enum'
import { AiReport } from '../../../../models/ai-report.model'
import { AiReviewPreview } from '../../../../models/ai-review-trigger.model'
import { ConfirmDialogComponent, ConfirmDialogConfig } from '../../../../components/confirm-dialog/confirm-dialog.component'

const VALID_TYPES: AiReportType[] = ['postDraft', 'preseason', 'weekly', 'weekPreview']

/**
 * AdminAiReviewPreviewComponent — pre-broadcast preview list.
 *
 * Receives preview state from the parent navigate (query params or shared store).
 * Because preview state is in-memory, this component fetches the latest report
 * of the given type to display metadata and DNB flag state.
 *
 * DNB = do_not_broadcast — disables broadcast when set.
 */
@Component({
  selector: 'app-admin-ai-review-preview',
  standalone: true,
  imports: [CommonModule, ConfirmDialogComponent],
  templateUrl: './admin-ai-review-preview.component.html',
  styleUrls: ['./admin-ai-review-preview.component.scss'],
})
export class AdminAiReviewPreviewComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>()

  type: AiReportType | null = null
  report: AiReport | null = null
  previews: AiReviewPreview[] = []

  reportLoading = true
  reportError = false

  dnbValue = false
  dnbInFlight = false

  broadcastLoading = false
  showBroadcastConfirm = false

  selectedPreview: AiReviewPreview | null = null

  readonly broadcastConfirmConfig: ConfirmDialogConfig = {
    title: 'Broadcast to all members',
    message: 'This will send the report to all league members. This cannot be undone.',
    confirmLabel: 'Broadcast',
    destructive: true,
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private aiReviewService: AiReviewService,
  ) {}

  ngOnInit(): void {
    const typeParam = this.route.snapshot.paramMap.get('type') as AiReportType
    if (!VALID_TYPES.includes(typeParam)) {
      this.router.navigate(['/admin/ai-review'])
      return
    }
    this.type = typeParam
    this.loadReport()

    // Attempt to hydrate previews from navigation state (set by AdminAiReviewComponent)
    const nav = this.router.getCurrentNavigation()
    const state = nav?.extras?.state as { previews?: AiReviewPreview[] } | undefined
    if (state?.previews) {
      this.previews = state.previews
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
  }

  get dnbActive(): boolean {
    if (!this.report) return false
    return this.report.metadata['do_not_broadcast'] === true ||
      this.report.metadata['do_not_broadcast'] === 'true'
  }

  toggleDnb(): void {
    if (!this.report || this.dnbInFlight) return
    const newValue = !this.dnbActive
    this.dnbInFlight = true
    this.aiReviewService
      .setReportFlag(this.report, 'do_not_broadcast', newValue)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (this.report) {
            this.report = {
              ...this.report,
              metadata: { ...this.report.metadata, ...res.metadata },
            }
          }
          this.dnbInFlight = false
        },
        error: () => {
          this.dnbInFlight = false
        },
      })
  }

  requestBroadcast(): void {
    if (this.dnbActive || !this.report) return
    this.showBroadcastConfirm = true
  }

  onBroadcastConfirmed(confirmed: boolean): void {
    this.showBroadcastConfirm = false
    if (!confirmed || !this.type || !this.report) return

    this.broadcastLoading = true
    this.aiReviewService
      .trigger(this.type, { dryRun: false, force: true })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.broadcastLoading = false
          this.router.navigate(['/admin/ai-review'])
        },
        error: () => {
          this.broadcastLoading = false
        },
      })
  }

  openPreview(preview: AiReviewPreview): void {
    this.selectedPreview = preview
  }

  closePreview(): void {
    this.selectedPreview = null
  }

  goBack(): void {
    this.router.navigate(['/admin/ai-review'])
  }

  private loadReport(): void {
    if (!this.type) return
    this.reportLoading = true
    this.aiReviewService
      .getLatest(this.type)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (report) => {
          this.report = report
          this.reportLoading = false
        },
        error: () => {
          this.reportError = true
          this.reportLoading = false
        },
      })
  }
}
