import { Component, OnInit } from '@angular/core'
import { CommonModule } from '@angular/common'
import { ActivatedRoute, Router } from '@angular/router'
import { AuditService } from 'src/app/services/audit.service'
import { AuditEntry, auditActionDisplay } from 'src/app/models/audit-entry.model'

/**
 * Admin Audit detail — 3 collapsible JSON blocks: Before / After / Metadata.
 *
 * Resolution strategy (mirrors iOS: no separate detail endpoint):
 *   1. Try AuditService.getFromCache(id).
 *   2. If cache is empty, fire list(null) to seed the first page and retry.
 *   3. If still not found → "entry not found" empty state.
 */
@Component({
  selector: 'app-admin-audit-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-audit-detail.component.html',
  styleUrls: ['./admin-audit-detail.component.scss'],
})
export class AdminAuditDetailComponent implements OnInit {
  entry: AuditEntry | null = null
  isLoading = false
  error: string | null = null
  notFound = false

  /** Collapse state for each JSON block. */
  collapsed: Record<'before' | 'after' | 'metadata', boolean> = {
    before: false,
    after: false,
    metadata: true,
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private auditService: AuditService,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')
    if (!id) {
      this.notFound = true
      return
    }
    this.resolve(id)
  }

  private resolve(id: string): void {
    const cached = this.auditService.getFromCache(id)
    if (cached) {
      this.entry = cached
      return
    }
    // Cache is empty (direct navigation / page refresh) — load first page.
    this.isLoading = true
    this.auditService.list(null).subscribe({
      next: () => {
        this.isLoading = false
        const found = this.auditService.getFromCache(id)
        if (found) {
          this.entry = found
        } else {
          this.notFound = true
        }
      },
      error: (err: unknown) => {
        this.isLoading = false
        this.error = err instanceof Error ? err.message : 'Failed to load audit entry.'
      },
    })
  }

  toggleBlock(block: 'before' | 'after' | 'metadata'): void {
    this.collapsed[block] = !this.collapsed[block]
  }

  prettyJson(value: unknown): string {
    if (value === null || value === undefined) return 'null'
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  actionDisplay(action: string): string {
    return auditActionDisplay(action)
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString()
  }

  back(): void {
    this.router.navigate(['/admin/audit'])
  }
}
