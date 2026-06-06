import { Component, OnInit } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { take } from 'rxjs'
import { AiReviewService } from 'src/app/services/ai-review.service'
import { AiReport } from 'src/app/models/ai-report.model'
import { StyledMarkdownComponent } from 'src/app/components/styled-markdown/styled-markdown.component'
import { LoaderComponent } from '../../../components/loader/loader.component'
import { NgIf, DatePipe } from '@angular/common'

/**
 * Recap sub-tab — renders the stored post-draft AI report for the selected year.
 *
 * Year matching: postDraft reports use `period` = season year (e.g. "2025").
 * This is confirmed by `aiReportFormattedPeriod` returning the period unchanged
 * when no 'W' char is found — postDraft periods are year-only strings.
 * Fallback: also matches on createdAt calendar year if period match fails.
 *
 * TODO(grades): DraftGradesCard port deferred — no web FantasyCalc values service exists.
 * Track in follow-up s4b-draft-grades.
 */
@Component({
  selector: 'app-draft-recap',
  templateUrl: './draft-recap.component.html',
  styleUrls: ['./draft-recap.component.scss'],
  standalone: true,
  imports: [LoaderComponent, NgIf, DatePipe, StyledMarkdownComponent],
})
export class DraftRecapComponent implements OnInit {
  loading = true
  report: AiReport | null = null
  year = ''

  constructor(
    private aiReviewService: AiReviewService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.year = this.route.parent?.snapshot.paramMap.get('year') ?? ''
    this.loadRecap()
  }

  loadRecap(): void {
    this.loading = true
    this.aiReviewService.list({ type: 'postDraft', limit: 20 }).pipe(take(1)).subscribe({
      next: (result) => {
        // Match on period (year string like "2025") — primary strategy
        let match = result.rows.find(r => r.period === this.year)

        // Fallback: match on createdAt calendar year
        if (!match && this.year) {
          match = result.rows.find(r =>
            new Date(r.createdAt).getFullYear().toString() === this.year,
          )
        }

        this.report = match ?? null
        this.loading = false
      },
      error: () => {
        this.loading = false
      },
    })
  }
}
