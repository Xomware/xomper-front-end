import { Component, OnInit } from '@angular/core'
import { take } from 'rxjs'
import { AiReviewService } from 'src/app/services/ai-review.service'
import { SupabaseService } from 'src/app/services/supabase.service'
import { AiReport, aiReportFormattedPeriod } from 'src/app/models/ai-report.model'
import { StyledMarkdownComponent } from 'src/app/components/styled-markdown/styled-markdown.component'
import { LoaderComponent } from '../../../components/loader/loader.component'
import { NgIf, NgFor, DatePipe } from '@angular/common'

interface MockReportCard {
  report: AiReport
  expanded: boolean
  displayTitle: string
}

/**
 * Mocks sub-tab — read-only list of stored mock-draft AI reports.
 * Admin-gated: non-admins see an empty state (defense-in-depth, server also strips).
 * No MockDraftEngine port — read-only. (Engine port deferred to s9b.)
 */
@Component({
  selector: 'app-draft-mocks',
  templateUrl: './draft-mocks.component.html',
  styleUrls: ['./draft-mocks.component.scss'],
  standalone: true,
  imports: [LoaderComponent, NgIf, NgFor, DatePipe, StyledMarkdownComponent],
})
export class DraftMocksComponent implements OnInit {
  loading = true
  cards: MockReportCard[] = []
  isAdmin = false

  constructor(
    private aiReviewService: AiReviewService,
    private supabase: SupabaseService,
  ) {}

  ngOnInit(): void {
    this.isAdmin = this.supabase.isAdmin
    this.loadMocks()
  }

  loadMocks(): void {
    this.loading = true
    this.aiReviewService
      .list({ type: 'mock', forUser: { isAdmin: this.isAdmin } })
      .pipe(take(1))
      .subscribe({
        next: (result) => {
          this.cards = result.rows.map(r => ({
            report: r,
            expanded: false,
            displayTitle: aiReportFormattedPeriod(r.period) || r.period,
          }))
          this.loading = false
        },
        error: () => {
          this.loading = false
        },
      })
  }

  toggleCard(card: MockReportCard): void {
    card.expanded = !card.expanded
  }
}
