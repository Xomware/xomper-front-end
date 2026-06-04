import { Component, OnInit, OnDestroy, AfterViewInit, ElementRef, ViewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Router } from '@angular/router'
import { AuditService } from 'src/app/services/audit.service'
import { AuditEntry, auditActionDisplay } from 'src/app/models/audit-entry.model'

/**
 * Admin Audit feed — cursor-paginated with IntersectionObserver infinite scroll.
 * Mirrors iOS AuditFeedView.swift.
 *
 * Empty-state branches:
 *   tableMissing → migration message
 *   empty        → "no entries yet"
 *   error        → retry
 */
@Component({
  selector: 'app-admin-audit-feed',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-audit-feed.component.html',
  styleUrls: ['./admin-audit-feed.component.scss'],
})
export class AdminAuditFeedComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('sentinel') sentinelRef!: ElementRef<HTMLElement>

  rows: AuditEntry[] = []
  isLoading = false
  isLoadingMore = false
  error: string | null = null
  tableMissing = false
  nextCursor: string | null = null
  hasMore = false

  private observer: IntersectionObserver | null = null

  constructor(
    private auditService: AuditService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.auditService.clearCache()
    this.load(null)
  }

  ngAfterViewInit(): void {
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && this.hasMore && !this.isLoadingMore) {
          this.loadMore()
        }
      },
      { rootMargin: '200px' },
    )
    if (this.sentinelRef?.nativeElement) {
      this.observer.observe(this.sentinelRef.nativeElement)
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect()
  }

  load(cursor: string | null): void {
    this.isLoading = true
    this.error = null
    this.auditService.list(cursor).subscribe({
      next: ({ rows, nextCursor, tableMissing }) => {
        this.rows = rows
        this.nextCursor = nextCursor
        this.hasMore = !!nextCursor
        this.tableMissing = tableMissing
        this.isLoading = false
      },
      error: (err: unknown) => {
        this.error = err instanceof Error ? err.message : 'Failed to load audit log.'
        this.isLoading = false
      },
    })
  }

  loadMore(): void {
    if (!this.nextCursor || this.isLoadingMore) return
    this.isLoadingMore = true
    this.auditService.list(this.nextCursor).subscribe({
      next: ({ rows, nextCursor }) => {
        this.rows = [...this.rows, ...rows]
        this.nextCursor = nextCursor
        this.hasMore = !!nextCursor
        this.isLoadingMore = false
      },
      error: () => {
        this.isLoadingMore = false
      },
    })
  }

  retry(): void {
    this.auditService.clearCache()
    this.rows = []
    this.nextCursor = null
    this.hasMore = false
    this.load(null)
  }

  navigateDetail(entry: AuditEntry): void {
    this.router.navigate(['/admin/audit', entry.id])
  }

  actionDisplay(entry: AuditEntry): string {
    return auditActionDisplay(entry.action)
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString()
  }
}
