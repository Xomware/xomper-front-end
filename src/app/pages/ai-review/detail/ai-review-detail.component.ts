import { Component, OnInit } from '@angular/core'
import { NgIf } from '@angular/common'
import { ActivatedRoute } from '@angular/router'
import { AiReviewService } from 'src/app/services/ai-review.service'
import {
  AiReport,
  aiReportFormattedPeriod,
  aiReportTypeDisplayName,
  aiReportTypeAccentColor,
} from 'src/app/models/ai-report.model'
import { StyledMarkdownComponent } from 'src/app/components/styled-markdown/styled-markdown.component'

/**
 * Detail view for a single AI Review report at /ai-review/:id.
 * Mirrors iOS AIReviewDetailView.
 *
 * Resolves the report in priority order:
 *   1. `history.state.report` — pre-populated when navigating from the list
 *      (avoids the cursor-walk cost on the common path)
 *   2. `AiReviewService.getById(id)` — cursor-walk fallback for deep links
 *
 * Back navigation is handled by the browser; no custom chrome needed.
 */
@Component({
  selector: 'app-ai-review-detail',
  standalone: true,
  imports: [NgIf, StyledMarkdownComponent],
  templateUrl: './ai-review-detail.component.html',
  styleUrls: ['./ai-review-detail.component.scss'],
})
export class AiReviewDetailComponent implements OnInit {
  report: AiReport | null = null
  isLoading = true
  hasError = false

  constructor(
    private route: ActivatedRoute,
    private aiReview: AiReviewService,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? ''

    // Prefer report from navigation state (list → detail path)
    const stateReport = history.state?.report as AiReport | undefined
    if (stateReport && stateReport.id === id) {
      this.report = stateReport
      this.isLoading = false
      return
    }

    // Deep-link fallback: cursor walk
    this.aiReview.getById(id).subscribe({
      next: report => {
        this.report = report
        this.isLoading = false
      },
      error: () => {
        this.hasError = true
        this.isLoading = false
      },
    })
  }

  get typeLabel(): string {
    if (!this.report) return ''
    return aiReportTypeDisplayName(this.report.reportType).toUpperCase()
  }

  get accentColor(): string {
    if (!this.report) return ''
    return aiReportTypeAccentColor(this.report.reportType)
  }

  get formattedPeriod(): string {
    if (!this.report) return ''
    return aiReportFormattedPeriod(this.report.period)
  }

  get createdAtDisplay(): string {
    if (!this.report) return ''
    const d = new Date(this.report.createdAt)
    if (isNaN(d.getTime())) return this.report.createdAt
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  goBack(): void {
    history.back()
  }
}
