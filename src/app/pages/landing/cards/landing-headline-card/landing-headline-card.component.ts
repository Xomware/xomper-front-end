import { getCurrentSeason } from 'src/app/constants/season'
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
        // A report from a finished season is not a headline. Before this,
        // the home page led with "Week 17 - 2025" all through the 2026
        // preseason, which reads as current news about a season that ended.
        this.report = this.isFromCurrentSeason(report) ? report : null
        this.isLoading = false
      },
      error: () => {
        this.report = null
        this.isLoading = false
      },
    })
  }

  /**
   * Whether a report belongs to the season now in progress.
   *
   * `period` is season-prefixed -- "2025W17", "2026-PRESEASON" -- so the
   * leading four digits are the season. An unparseable period is treated as
   * current rather than hidden: losing a real report is worse than showing an
   * odd one.
   */
  private isFromCurrentSeason(report: AiReport | null): boolean {
    if (!report) return false
    const season = report.period?.slice(0, 4)
    if (!/^\d{4}$/.test(season ?? '')) return true
    return season === getCurrentSeason()
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
