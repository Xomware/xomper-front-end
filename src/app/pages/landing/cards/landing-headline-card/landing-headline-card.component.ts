import { Component, OnInit } from '@angular/core'
import { NgIf } from '@angular/common'
import { RouterLink } from '@angular/router'
import { AiReviewService } from 'src/app/services/ai-review.service'
import {
  AiReport,
  aiReportDisplayTitle,
  aiReportPreviewSnippet,
} from 'src/app/models/ai-report.model'

/**
 * Hero AI Report card — mirrors iOS HeadlineAIReportCard.
 * Shows the freshest report across weekly/preseason/postDraft types,
 * or a "First report drops after draft day" placeholder when null.
 * Gold border treatment matches iOS hero card.
 *
 * Click → /ai-review/:id (placeholder route until s6 builds the detail).
 */
@Component({
  selector: 'app-landing-headline-card',
  standalone: true,
  imports: [NgIf, RouterLink],
  templateUrl: './landing-headline-card.component.html',
  styleUrls: ['./landing-headline-card.component.scss'],
})
export class LandingHeadlineCardComponent implements OnInit {
  report: AiReport | null = null
  isLoading = true

  constructor(private aiReviewService: AiReviewService) {}

  ngOnInit(): void {
    this.aiReviewService.getHeadline().subscribe({
      next: (report) => {
        this.report = report
        this.isLoading = false
      },
      error: () => {
        this.report = null
        this.isLoading = false
      },
    })
  }

  get displayTitle(): string {
    return this.report ? aiReportDisplayTitle(this.report) : ''
  }

  get previewSnippet(): string {
    return this.report ? aiReportPreviewSnippet(this.report) : ''
  }

  get typeLabel(): string {
    if (!this.report) return ''
    const labels: Record<string, string> = {
      weekly: 'WEEKLY',
      preseason: 'PRESEASON',
      postDraft: 'POST-DRAFT',
      mock: 'MOCK DRAFT',
    }
    return labels[this.report.reportType] ?? this.report.reportType.toUpperCase()
  }
}
