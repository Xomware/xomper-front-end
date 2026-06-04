import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  ViewChild,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { Router } from '@angular/router'
import { Subject } from 'rxjs'
import { takeUntil } from 'rxjs/operators'
import { EmailArchiveService } from '../../../../services/email-archive.service'
import { EmailArchiveEntry } from '../../../../models/email-archive.model'

/**
 * AdminEmailArchiveListComponent — paginated email archive list.
 *
 * Uses IntersectionObserver (same pattern as s6 AI Review list) to trigger
 * loadMore() as the sentinel element enters the viewport.
 * Double-fire protection: loading flag prevents concurrent fetches.
 */
@Component({
  selector: 'app-admin-email-archive-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-email-archive-list.component.html',
  styleUrls: ['./admin-email-archive-list.component.scss'],
})
export class AdminEmailArchiveListComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('scrollSentinel') private sentinelRef!: ElementRef<HTMLElement>
  private observer?: IntersectionObserver
  private destroy$ = new Subject<void>()

  rows: EmailArchiveEntry[] = []
  loading = false
  loadingMore = false
  error = false
  nextCursor: string | null = null

  constructor(
    private emailArchiveService: EmailArchiveService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.loadFirst()
  }

  ngAfterViewInit(): void {
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !this.loadingMore && this.nextCursor) {
          this.loadMore()
        }
      },
      { threshold: 0.1 },
    )
    if (this.sentinelRef) {
      this.observer.observe(this.sentinelRef.nativeElement)
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect()
    this.destroy$.next()
    this.destroy$.complete()
  }

  navigateToDetail(entry: EmailArchiveEntry): void {
    this.router.navigate(['/admin/email-archive', entry.id])
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    } catch {
      return iso
    }
  }

  private loadFirst(): void {
    this.loading = true
    this.error = false
    this.emailArchiveService
      .list(null)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.rows = result.rows
          this.nextCursor = result.nextCursor
          this.loading = false
        },
        error: () => {
          this.error = true
          this.loading = false
        },
      })
  }

  private loadMore(): void {
    if (!this.nextCursor || this.loadingMore) return
    this.loadingMore = true
    this.emailArchiveService
      .list(this.nextCursor)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.rows = [...this.rows, ...result.rows]
          this.nextCursor = result.nextCursor
          this.loadingMore = false
        },
        error: () => {
          this.loadingMore = false
        },
      })
  }
}
