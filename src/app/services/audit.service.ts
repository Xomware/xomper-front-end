import { Injectable } from '@angular/core'
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { environment } from 'src/environments/environment'
import {
  AuditEntry,
  AuditListResponse,
  mapAuditEntry,
} from '../models/audit-entry.model'

/**
 * Admin Audit service.
 * Wraps GET /admin/audit-list — cursor-paginated audit feed.
 *
 * In-memory cache: _entries holds all loaded rows so the detail component
 * can resolve an entry by ID without a separate endpoint (mirrors iOS
 * AuditFeedView which reads from an in-memory store).
 *
 * When the user navigates directly to /admin/audit/:id with an empty
 * cache, AdminAuditDetailComponent calls list(null) to seed the first page,
 * then searches in _entries. If not found → "entry not found" empty state.
 */
@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly apiUrl = `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev`
  private readonly apiAuthToken = environment.apiAuthToken

  /** In-memory store for loaded audit entries (deduped by id). */
  private _entries: AuditEntry[] = []

  constructor(private http: HttpClient) {}

  private get headers(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${this.apiAuthToken}`,
      'Content-Type': 'application/json',
    })
  }

  /** All entries loaded so far (read-only snapshot). */
  get cachedEntries(): readonly AuditEntry[] {
    return this._entries
  }

  /** Find an entry from the in-memory cache. */
  getFromCache(id: string): AuditEntry | null {
    return this._entries.find((e) => e.id === id) ?? null
  }

  /**
   * GET /admin/audit-list
   * cursor: pass null for the first page; pass the previous nextCursor for subsequent pages.
   * Merges new rows into _entries (deduped by id, newest-first order preserved).
   */
  list(cursor: string | null): Observable<{
    rows: AuditEntry[]
    nextCursor: string | null
    tableMissing: boolean
  }> {
    let params = new HttpParams()
    if (cursor) params = params.set('cursor', cursor)

    return this.http
      .get<AuditListResponse>(`${this.apiUrl}/admin/audit-list`, {
        headers: this.headers,
        params,
      })
      .pipe(
        map((response) => {
          const rows = (response.rows ?? []).map(mapAuditEntry)
          // Merge into cache — avoid duplicates.
          const existingIds = new Set(this._entries.map((e) => e.id))
          for (const row of rows) {
            if (!existingIds.has(row.id)) {
              this._entries.push(row)
              existingIds.add(row.id)
            }
          }
          return {
            rows,
            nextCursor: response.next_cursor ?? null,
            tableMissing: response.table_missing ?? false,
          }
        }),
      )
  }

  /** Clear the in-memory cache (e.g. on admin logout or forced refresh). */
  clearCache(): void {
    this._entries = []
  }
}
