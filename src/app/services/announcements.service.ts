import { Injectable } from '@angular/core'
import { HttpClient, HttpHeaders } from '@angular/common/http'
import { Observable, of } from 'rxjs'
import { map, catchError } from 'rxjs/operators'
import { environment } from 'src/environments/environment'
import {
  LeagueAnnouncement,
  AnnouncementsListResponse,
  AdminAnnouncementsListResponse,
  AnnouncementMutationResponse,
  AnnouncementCreateInput,
  mapAnnouncement,
} from '../models/league-announcement.model'
import { AdminFieldValue, adminFieldValueToJson } from '../models/admin-field-value.model'

/**
 * Public read-only + admin CRUD surface for league announcements.
 *
 * Public read: GET /announcements/list — filtered active + non-expired rows.
 * Admin CRUD: GET/POST /admin/announcements-* — all rows including inactive.
 *
 * Admin cache: listAdmin() result is held in _adminCache for getById()
 * resolution so the edit form doesn't require a separate detail endpoint
 * (mirrors iOS AnnouncementsStore behaviour).
 */
@Injectable({ providedIn: 'root' })
export class AnnouncementsService {
  private readonly apiUrl = `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev`
  private readonly apiAuthToken = environment.apiAuthToken

  /** In-memory cache from the last successful listAdmin() call. */
  private _adminCache: LeagueAnnouncement[] = []

  constructor(private http: HttpClient) {}

  private get headers(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${this.apiAuthToken}`,
      'Content-Type': 'application/json',
    })
  }

  /**
   * Fetch active + non-expired league announcements.
   * Server already filters; client re-filters defensively.
   * Sorted: critical first, then displayOrder ascending.
   */
  list(): Observable<LeagueAnnouncement[]> {
    return this.http
      .get<AnnouncementsListResponse>(`${this.apiUrl}/announcements/list`, {
        headers: this.headers,
      })
      .pipe(
        map((response) => {
          const now = new Date()
          return (response.rows ?? [])
            .map(mapAnnouncement)
            .filter((a) => {
              if (!a.isActive) return false
              if (!a.expiresAt) return true
              return new Date(a.expiresAt) > now
            })
            .sort((a, b) => {
              const priorityOrder = (p: 'critical' | 'info') =>
                p === 'critical' ? 0 : 1
              const diff = priorityOrder(a.priority) - priorityOrder(b.priority)
              if (diff !== 0) return diff
              return a.displayOrder - b.displayOrder
            })
        }),
        catchError(() => of([])),
      )
  }

  // ---------------------------------------------------------------------------
  // Admin CRUD
  // ---------------------------------------------------------------------------

  /**
   * GET /admin/announcements-list
   * Returns every row (active + inactive + expired) for the admin list view.
   * Populates _adminCache for getById() resolution.
   */
  listAdmin(): Observable<{ rows: LeagueAnnouncement[]; tableMissing: boolean }> {
    return this.http
      .get<AdminAnnouncementsListResponse>(`${this.apiUrl}/admin/announcements-list`, {
        headers: this.headers,
      })
      .pipe(
        map((response) => {
          const rows = (response.rows ?? []).map(mapAnnouncement)
          this._adminCache = rows
          return { rows, tableMissing: response.table_missing ?? false }
        }),
      )
  }

  /**
   * Resolve an announcement by ID from the in-memory admin cache.
   * If the cache is empty, fires listAdmin() first.
   */
  getById(id: string): Observable<LeagueAnnouncement | null> {
    const fromCache = this._adminCache.find((a) => a.id === id) ?? null
    if (fromCache) return of(fromCache)
    return this.listAdmin().pipe(
      map(({ rows }) => rows.find((a) => a.id === id) ?? null),
    )
  }

  /**
   * POST /admin/announcements-create
   * Creates a new announcement row. Returns the server-resolved row.
   */
  create(input: AnnouncementCreateInput): Observable<LeagueAnnouncement> {
    const body: Record<string, unknown> = {
      title: input.title,
      body: input.body,
      priority: input.priority,
      is_active: input.is_active,
      display_order: input.display_order,
    }
    if (input.expires_at != null) {
      body['expires_at'] = input.expires_at
    }
    return this.http
      .post<AnnouncementMutationResponse>(`${this.apiUrl}/admin/announcements-create`, body, {
        headers: this.headers,
      })
      .pipe(
        map((response) => {
          const row = mapAnnouncement(response.row)
          this._adminCache = [row, ...this._adminCache.filter((a) => a.id !== row.id)]
          return row
        }),
      )
  }

  /**
   * POST /admin/announcements-update
   * Sends only the changed fields (diff-on-save matching iOS). Each field
   * value is an AdminFieldValue discriminated union serialised to a JSON scalar.
   */
  update(id: string, fields: Record<string, AdminFieldValue>): Observable<LeagueAnnouncement> {
    const jsonFields: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(fields)) {
      jsonFields[key] = adminFieldValueToJson(value)
    }
    const body = { id, fields: jsonFields }
    return this.http
      .post<AnnouncementMutationResponse>(`${this.apiUrl}/admin/announcements-update`, body, {
        headers: this.headers,
      })
      .pipe(
        map((response) => {
          const row = mapAnnouncement(response.row)
          this._adminCache = this._adminCache.map((a) => (a.id === row.id ? row : a))
          return row
        }),
      )
  }

  /**
   * POST /admin/announcements-delete
   * Soft-deletes the row (sets is_active = false on the backend).
   * The row remains in the admin list; the public list stops showing it.
   */
  softDelete(id: string): Observable<void> {
    return this.http
      .post<AnnouncementMutationResponse>(
        `${this.apiUrl}/admin/announcements-delete`,
        { id },
        { headers: this.headers },
      )
      .pipe(
        map((response) => {
          const row = mapAnnouncement(response.row)
          this._adminCache = this._adminCache.map((a) => (a.id === row.id ? row : a))
        }),
      )
  }
}
