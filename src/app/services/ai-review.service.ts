import { Injectable } from '@angular/core'
import { HttpClient, HttpHeaders } from '@angular/common/http'
import { Observable, forkJoin, of, EMPTY, expand, reduce } from 'rxjs'
import { map, catchError, take } from 'rxjs/operators'
import { environment } from 'src/environments/environment'
import {
  AiReport,
  AiReportLatestResponse,
  AiReportListResponse,
  mapAiReport,
} from '../models/ai-report.model'
import { AiReportType } from '../models/ai-report-type.enum'
import {
  AiReviewTriggerOpts,
  AiReviewTriggerResponse,
  AiReviewTriggerResponseRaw,
  AiReviewPreview,
  AiReviewPreviewRaw,
  AiReportRaw,
  ReportFlagResponse,
  ReportFlagResponseRaw,
} from '../models/ai-review-trigger.model'

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

  constructor(private http: HttpClient) {}

  private get headers(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
    })
  }

  /**
   * Public surface for admin components: fetch the latest report of a given type.
   * Promotes the private fetchLatest — mirrors iOS XomperAPIClient.fetchLatestAIReport.
   */
  getLatest(type: AiReportType): Observable<AiReport | null> {
    return this.fetchLatest(type)
  }

  /**
   * Admin: trigger an AI Review report.
   * Maps to one of four backend endpoints based on type.
   * week/seasonsBack are omitted from the JSON body entirely when absent (not sent as null).
   */
  trigger(type: AiReportType, opts: AiReviewTriggerOpts): Observable<AiReviewTriggerResponse> {
    const endpoint = this._triggerEndpoint(type)
    const body: Record<string, unknown> = {
      dry_run: opts.dryRun,
      force: opts.force,
    }
    if (opts.week !== undefined) body['week'] = opts.week
    if (opts.seasonsBack !== undefined) body['seasons_back'] = opts.seasonsBack

    return this.http
      .post<AiReviewTriggerResponseRaw>(endpoint, body, { headers: this.headers })
      .pipe(
        map((raw) => this._mapTriggerResponse(raw)),
        catchError((err) => {
          const message = err?.error?.message ?? err?.message ?? 'Trigger failed'
          return of({
            success: false,
            report: null,
            previews: [],
            dryRun: opts.dryRun,
            message,
          })
        }),
      )
  }

  /**
   * Admin: set a boolean flag on a report row.
   * flag: 'do_not_broadcast' | 'redact'
   * Mirrors iOS XomperAPIClient.setReportFlag.
   */
  setReportFlag(
    report: AiReport,
    flag: 'do_not_broadcast' | 'redact',
    value: boolean,
  ): Observable<ReportFlagResponse> {
    // Derive leagueId and period from the report (period is the sk value).
    const body = {
      league_id: report.leagueId,
      report_type: report.reportType,
      period: report.period,
      flag,
      value,
    }
    return this.http
      .post<ReportFlagResponseRaw>(`${this.apiUrl}/admin/reports-flag`, body, {
        headers: this.headers,
      })
      .pipe(
        map((raw): ReportFlagResponse => ({ success: raw.success, metadata: raw.metadata ?? {} })),
      )
  }

  private _triggerEndpoint(type: AiReportType): string {
    switch (type) {
      case 'postDraft':   return `${this.apiUrl}/admin/ai-review-postdraft-trigger`
      case 'preseason':   return `${this.apiUrl}/admin/ai-review-preseason-trigger`
      case 'weekly':      return `${this.apiUrl}/admin/ai-review-weekly-trigger`
      case 'weekPreview': return `${this.apiUrl}/admin/ai-review-week-preview-trigger`
      default:            return `${this.apiUrl}/admin/ai-review-weekly-trigger`
    }
  }

  private _mapTriggerResponse(raw: AiReviewTriggerResponseRaw): AiReviewTriggerResponse {
    let report: AiReport | null = null
    if (raw.report) {
      const r = raw.report as AiReportRaw
      const id = r.id ?? `${r.pk ?? ''}|${r.sk ?? ''}`
      report = {
        id,
        leagueId: r.league_id,
        reportType: r.report_type,
        period: r.period,
        bodyMarkdown: r.body_markdown,
        metadata: r.metadata ?? {},
        createdAt: r.created_at,
        model: r.model ?? null,
        promptVersion: r.prompt_version ?? null,
      }
    }
    const previews: AiReviewPreview[] = (raw.previews ?? []).map((p: AiReviewPreviewRaw) => ({
      userId: p.user_id,
      displayName: p.display_name,
      email: p.email,
      subject: p.subject,
      bodyHtml: p.body_html,
      bodyMarkdown: p.body_markdown,
    }))
    return {
      success: raw.success,
      report,
      previews,
      dryRun: raw.dry_run ?? false,
      message: raw.message,
    }
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
