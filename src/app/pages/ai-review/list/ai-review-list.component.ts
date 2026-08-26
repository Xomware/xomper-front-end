import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewChecked,
  ElementRef,
  ViewChild,
  ChangeDetectorRef,
} from '@angular/core'
import { NgFor, NgIf } from '@angular/common'
import { Router } from '@angular/router'
import { AiReviewService } from 'src/app/services/ai-review.service'
import { CognitoService } from 'src/app/services/cognito.service'
import { AiReport } from 'src/app/models/ai-report.model'
import { AiReportCardRowComponent } from 'src/app/components/ai-report-card-row/ai-report-card-row.component'

/**
 * Paginated AI Review archive list at /ai-review.
 * Mirrors iOS AIReviewView archive list surface.
 *
 * Infinite scroll via IntersectionObserver on the last-row sentinel.
 * Mock rows are filtered for non-admin users (defense-in-depth).
 */
@Component({
  selector: 'app-ai-review-list',
  standalone: true,
  imports: [NgIf, NgFor, AiReportCardRowComponent],
  templateUrl: './ai-review-list.component.html',
  styleUrls: ['./ai-review-list.component.scss'],
})
export class AiReviewListComponent implements OnInit, OnDestroy, AfterViewChecked {
  reports: AiReport[] = []
  isLoading = true
  isLoadingMore = false
  hasError = false
  nextCursor: string | null = null
  private observerActive = false

  @ViewChild('sentinel') sentinelRef?: ElementRef<HTMLElement>
  private observer?: IntersectionObserver

  constructor(
    private aiReview: AiReviewService,
    private cognito: CognitoService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadFirst()
  }

  ngAfterViewChecked(): void {
    this.attachObserver()
  }

  ngOnDestroy(): void {
    this.observer?.disconnect()
  }

  loadFirst(): void {
    this.isLoading = true
    this.hasError = false
    this.aiReview.list({ forUser: { isAdmin: this.cognito.isAdmin } }).subscribe({
      next: result => {
        this.reports = result.rows
        this.nextCursor = result.nextCursor
        this.isLoading = false
        this.cdr.detectChanges()
      },
      error: () => {
        this.hasError = true
        this.isLoading = false
        this.cdr.detectChanges()
      },
    })
  }

  retry(): void {
    this.loadFirst()
  }

  private loadMore(): void {
    if (!this.nextCursor || this.isLoadingMore) return
    this.isLoadingMore = true
    this.aiReview.loadMore(this.nextCursor, { forUser: { isAdmin: this.cognito.isAdmin } }).subscribe({
      next: result => {
        this.reports = [...this.reports, ...result.rows]
        this.nextCursor = result.nextCursor
        this.isLoadingMore = false
        this.cdr.detectChanges()
      },
      error: () => {
        this.isLoadingMore = false
        this.cdr.detectChanges()
      },
    })
  }

  private attachObserver(): void {
    if (this.observerActive || !this.sentinelRef?.nativeElement) return
    this.observerActive = true
    this.observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting && this.nextCursor && !this.isLoadingMore) {
          this.loadMore()
        }
      },
      { rootMargin: '200px' },
    )
    this.observer.observe(this.sentinelRef.nativeElement)
  }

  navigateToDetail(report: AiReport): void {
    this.router.navigate(['/ai-review', report.id], { state: { report } })
  }
}
