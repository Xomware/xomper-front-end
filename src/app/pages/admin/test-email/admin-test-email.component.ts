import { Component, OnInit, OnDestroy } from '@angular/core'
import { CommonModule } from '@angular/common'
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms'
import { Subject } from 'rxjs'
import { takeUntil } from 'rxjs/operators'
import { AdminService } from '../../../services/admin.service'
import { AiReviewService } from '../../../services/ai-review.service'
import { ConfirmDialogComponent, ConfirmDialogConfig } from '../../../components/confirm-dialog/confirm-dialog.component'
import {
  TestEmailKind,
  TestEmailRecipient,
  TEST_EMAIL_KIND_LABELS,
  AI_REVIEW_KINDS,
  isAiReviewKind,
} from '../../../models/test-email.model'
import { AiReport } from '../../../models/ai-report.model'
import { AiReportType } from '../../../models/ai-report-type.enum'

/**
 * AdminTestEmailComponent — send test emails.
 *
 * Kind picker (all TestEmailKind values).
 * Recipient picker (whitelisted users from /admin/email-test-recipients).
 * Conditional report picker — only shown when kind is an AI Review kind.
 * Confirm dialog before send.
 * Success/error toast feedback.
 */
@Component({
  selector: 'app-admin-test-email',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ConfirmDialogComponent],
  templateUrl: './admin-test-email.component.html',
  styleUrls: ['./admin-test-email.component.scss'],
})
export class AdminTestEmailComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>()

  readonly allKinds: TestEmailKind[] = Object.keys(TEST_EMAIL_KIND_LABELS) as TestEmailKind[]
  readonly kindLabels = TEST_EMAIL_KIND_LABELS

  form: FormGroup
  recipients: TestEmailRecipient[] = []
  recipientsLoading = true

  /** Latest reports keyed by type, loaded when kind is AI Review. */
  latestReports: Record<string, AiReport | null> = {}
  reportsLoading = false

  sending = false
  sendSuccess: string | null = null
  sendError: string | null = null

  showConfirm = false
  readonly confirmConfig: ConfirmDialogConfig = {
    title: 'Send test email',
    message: 'Send a test email to the selected recipient?',
    confirmLabel: 'Send',
    destructive: false,
  }

  constructor(
    private fb: FormBuilder,
    private adminService: AdminService,
    private aiReviewService: AiReviewService,
  ) {
    this.form = this.fb.group({
      kind: ['weekly_recap' as TestEmailKind],
      recipientUserId: [''],
      reportId: [''],
    })
  }

  ngOnInit(): void {
    this.loadRecipients()

    // When kind changes, conditionally load latest reports.
    this.form.get('kind')!.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((kind: TestEmailKind) => {
        if (isAiReviewKind(kind)) {
          this.loadLatestReports()
        }
        // Clear report selection when kind changes.
        this.form.patchValue({ reportId: '' }, { emitEvent: false })
      })

    // Load reports for the initial kind if it's AI Review.
    if (isAiReviewKind(this.form.value.kind)) {
      this.loadLatestReports()
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
  }

  get currentKind(): TestEmailKind {
    return this.form.value.kind as TestEmailKind
  }

  get showReportPicker(): boolean {
    return isAiReviewKind(this.currentKind)
  }

  get aiReviewKindsForPicker(): TestEmailKind[] {
    return AI_REVIEW_KINDS
  }

  getKindLabel(kind: TestEmailKind): string {
    return TEST_EMAIL_KIND_LABELS[kind]
  }

  reportLabel(report: AiReport): string {
    return `${report.reportType} — ${report.period} (${new Date(report.createdAt).toLocaleDateString()})`
  }

  requestSend(): void {
    const val = this.form.value
    if (!val.recipientUserId) return
    this.showConfirm = true
  }

  onConfirmed(confirmed: boolean): void {
    this.showConfirm = false
    if (!confirmed) return
    this.send()
  }

  private send(): void {
    const val = this.form.value
    this.sending = true
    this.sendSuccess = null
    this.sendError = null

    if (isAiReviewKind(val.kind) && val.reportId) {
      this.adminService
        .sendTestEmail({ recipientSleeperUserId: val.recipientUserId, reportId: val.reportId })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (res) => {
            this.sendSuccess = `Sent to ${res.recipientEmail}`
            this.sending = false
          },
          error: (err) => {
            this.sendError = err?.error?.message ?? 'Send failed'
            this.sending = false
          },
        })
    } else {
      this.adminService
        .sendTestEmailTemplate({ kind: val.kind, recipientSleeperUserId: val.recipientUserId })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (res) => {
            this.sendSuccess = `Sent "${res.subject}" to ${res.recipientEmail}`
            this.sending = false
          },
          error: (err) => {
            this.sendError = err?.error?.message ?? 'Send failed'
            this.sending = false
          },
        })
    }
  }

  private loadRecipients(): void {
    this.recipientsLoading = true
    this.adminService
      .listEmailTestRecipients()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (recipients) => {
          this.recipients = recipients
          if (recipients.length > 0) {
            this.form.patchValue({ recipientUserId: recipients[0].userId }, { emitEvent: false })
          }
          this.recipientsLoading = false
        },
        error: () => {
          this.recipientsLoading = false
        },
      })
  }

  private loadLatestReports(): void {
    if (this.reportsLoading) return
    this.reportsLoading = true
    const types: AiReportType[] = ['weekly', 'preseason', 'postDraft', 'weekPreview', 'mock']
    let completed = 0
    for (const type of types) {
      this.aiReviewService
        .getLatest(type)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (report) => {
            this.latestReports[type] = report
            completed++
            if (completed === types.length) this.reportsLoading = false
          },
          error: () => {
            completed++
            if (completed === types.length) this.reportsLoading = false
          },
        })
    }
  }
}
