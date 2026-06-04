import { Component, OnInit, OnDestroy } from '@angular/core'
import { CommonModule } from '@angular/common'
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { DomSanitizer, SafeHtml } from '@angular/platform-browser'
import { Subject } from 'rxjs'
import { takeUntil } from 'rxjs/operators'
import { EmailArchiveService } from '../../../../services/email-archive.service'
import { EmailArchiveEntry } from '../../../../models/email-archive.model'
import { ConfirmDialogComponent, ConfirmDialogConfig } from '../../../../components/confirm-dialog/confirm-dialog.component'

/**
 * AdminEmailArchiveDetailComponent — metadata + HTML preview + resend.
 *
 * HTML body: rendered via [innerHTML] with DomSanitizer.bypassSecurityTrustHtml.
 * This is admin-only content (our own generated email HTML), not user-supplied.
 * Using [innerHTML] per plan decision (not iframe — see PLAN.md operational rules).
 *
 * Resend: optional to_email override. Contract verified Phase 0.
 */
@Component({
  selector: 'app-admin-email-archive-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ConfirmDialogComponent],
  templateUrl: './admin-email-archive-detail.component.html',
  styleUrls: ['./admin-email-archive-detail.component.scss'],
})
export class AdminEmailArchiveDetailComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>()

  entry: EmailArchiveEntry | null = null
  loading = true
  error = false

  safeHtml: SafeHtml | null = null

  resendForm: FormGroup
  resendLoading = false
  resendSuccess: string | null = null
  resendError: string | null = null

  showResendConfirm = false
  readonly resendConfirmConfig: ConfirmDialogConfig = {
    title: 'Resend email',
    message: 'Resend this email to the specified recipient?',
    confirmLabel: 'Resend',
    destructive: false,
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private emailArchiveService: EmailArchiveService,
    private sanitizer: DomSanitizer,
    private fb: FormBuilder,
  ) {
    this.resendForm = this.fb.group({ toEmail: [''] })
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')
    if (!id) {
      this.router.navigate(['/admin/email-archive'])
      return
    }
    this.loadDetail(id)
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
  }

  get formattedDate(): string {
    if (!this.entry) return ''
    try {
      return new Date(this.entry.sentAt).toLocaleString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    } catch {
      return this.entry.sentAt
    }
  }

  requestResend(): void {
    this.showResendConfirm = true
  }

  onResendConfirmed(confirmed: boolean): void {
    this.showResendConfirm = false
    if (!confirmed || !this.entry) return

    const toEmail = (this.resendForm.value.toEmail as string).trim() || this.entry.recipientEmail

    this.resendLoading = true
    this.resendSuccess = null
    this.resendError = null

    this.emailArchiveService
      .resend(this.entry.id, toEmail)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.resendSuccess = `Resent to ${res.recipientEmail}`
          this.resendLoading = false
        },
        error: (err) => {
          this.resendError = err?.error?.message ?? 'Resend failed'
          this.resendLoading = false
        },
      })
  }

  goBack(): void {
    this.router.navigate(['/admin/email-archive'])
  }

  private loadDetail(id: string): void {
    this.emailArchiveService
      .getById(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (entry) => {
          this.entry = entry
          if (entry?.htmlBody) {
            // Admin-only content (our own SES email HTML). Safe to bypass.
            this.safeHtml = this.sanitizer.bypassSecurityTrustHtml(entry.htmlBody)
          }
          this.loading = false
          // Pre-populate resend form with original recipient.
          if (entry) {
            this.resendForm.patchValue({ toEmail: entry.recipientEmail })
          }
        },
        error: () => {
          this.error = true
          this.loading = false
        },
      })
  }
}
