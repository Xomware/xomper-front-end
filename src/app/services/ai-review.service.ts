import { Injectable } from '@angular/core'
import { HttpClient, HttpHeaders } from '@angular/common/http'
import { Observable, forkJoin, of, EMPTY, expand, reduce, throwError } from 'rxjs'
import { map, catchError, take } from 'rxjs/operators'
import { environment } from 'src/environments/environment'
import {
  AiReport,
  AiReportLatestResponse,
  AiReportListResponse,
  mapAiReport,
} from '../models/ai-report.model'
import { AiReportType } from '../models/ai-report-type.enum'

export interface AiReportListResult {
  rows: AiReport[]
  nextCursor: string | null
}

export interface AiReviewListOpts {
  type?: AiReportType
  /** Default 20 to match iOS. */
  limit?: number
  cursor?: string | null
  /** When provided, filters mock reportType for non-admin users (defense-in-depth). */
  forUser?: { isAdmin: boolean }
}

/**
 * AI Review service — extended in s6 with list() / loadMore() / getById().
 *
 * Headline (s5):
 *   Fan out three GET /ai-reports/latest?type=... in parallel (forkJoin),
 *   pick the newest by created_at. Mirrors iOS AIReviewStore.mostRecentLatest.
 *
 * Archive (s6):
 *   list() / loadMore() wrap GET /ai-reports/list with cursor pagination.
 *   getById() cursor-walks up to 5 pages looking for a composite-id match,
 *   mirroring iOS XomperAPIClient.fetchAIReportByPeriod.
 *
 * Mock-gating:
 *   list({ forUser }) filters mock-type rows for non-admin users.
 *   Defense-in-depth — the server already strips them but the iOS client
 *   filters too and we mirror that.
 */
@Injectable({ providedIn: 'root' })
export class AiReviewService {
  private readonly apiUrl = `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev`
  private readonly apiAuthToken = environment.apiAuthToken

  constructor(private http: HttpClient) {}

  private get headers(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${this.apiAuthToken}`,
      'Content-Type': 'application/json',
    })
  }

  private fetchLatest(type: AiReportType): Observable<AiReport | null> {
    return this.http
      .get<AiReportLatestResponse>(
        `${this.apiUrl}/ai-reports/latest?type=${type}`,
        { headers: this.headers },
      )
      .pipe(
        map((res) => (res.report ? mapAiReport(res.report) : null)),
        catchError(() => of(null)),
      )
  }

  /**
   * Returns the freshest AI report across (weekly | preseason | postDraft),
   * or null if none exist. Matches iOS AIReviewStore.mostRecentLatest.
   */
  getHeadline(): Observable<AiReport | null> {
    return forkJoin([
      this.fetchLatest('weekly'),
      this.fetchLatest('preseason'),
      this.fetchLatest('postDraft'),
    ]).pipe(
      map((results) => {
        const reports = results.filter((r): r is AiReport => r !== null)
        if (reports.length === 0) return null
        return reports.reduce((newest, r) =>
          new Date(r.createdAt) > new Date(newest.createdAt) ? r : newest,
        )
      }),
    )
  }

  /**
   * Paginated archive. Filters mock rows for non-admin users.
   * Mirrors iOS AIReviewStore.loadArchive.
   */
  list(opts: AiReviewListOpts = {}): Observable<AiReportListResult> {
    return this._fetchPage(opts.type, opts.limit ?? 20, opts.cursor ?? null).pipe(
      map(result => this._applyMockGate(result, opts.forUser)),
    )
  }

  /**
   * Convenience over list({ cursor }) for cursor-advance after scroll.
   * Mirrors iOS AIReviewStore.loadMore.
   */
  loadMore(cursor: string, opts: Omit<AiReviewListOpts, 'cursor'> = {}): Observable<AiReportListResult> {
    return this.list({ ...opts, cursor })
  }

  /**
   * Look up a single report by its composite id (pk|sk).
   * Walks /ai-reports/list (up to 5 pages × 20 rows) and returns the first
   * row whose id matches. Returns null when not found.
   * Mirrors iOS XomperAPIClient.fetchAIReportByPeriod cursor walk.
   */
  getById(id: string): Observable<AiReport | null> {
    // Seed the walk with a null cursor and walk up to 5 pages.
    const seed: { cursor: string | null; found: AiReport | null; done: boolean; page: number } = {
      cursor: null,
      found: null,
      done: false,
      page: 0,
    }

    return of(seed).pipe(
      expand(state => {
        if (state.done || state.found !== null || state.page >= 5) return EMPTY
        return this._fetchPage(undefined, 20, state.cursor).pipe(
          map(result => {
            const hit = result.rows.find(r => r.id === id) ?? null
            return {
              cursor: result.nextCursor,
              found: hit,
              done: !result.nextCursor,
              page: state.page + 1,
            }
          }),
          catchError(() => of({ ...state, done: true })),
        )
      }),
      reduce((_acc, state) => state, seed),
      map(state => state.found),
    )
  }

  private _fetchPage(
    type: AiReportType | undefined,
    limit: number,
    cursor: string | null,
  ): Observable<AiReportListResult> {
    let url = `${this.apiUrl}/ai-reports/list?limit=${limit}`
    if (type) url += `&type=${type}`
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`

    return this.http
      .get<AiReportListResponse>(url, { headers: this.headers })
      .pipe(
        map(res => ({
          rows: (res.rows ?? []).map(mapAiReport),
          nextCursor: res.next_cursor ?? null,
        })),
      )
  }

  private _applyMockGate(
    result: AiReportListResult,
    forUser?: { isAdmin: boolean },
  ): AiReportListResult {
    if (forUser && !forUser.isAdmin) {
      return { ...result, rows: result.rows.filter(r => r.reportType !== 'mock') }
    }
    return result
  }
}
