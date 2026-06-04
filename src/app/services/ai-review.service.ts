import { Injectable } from '@angular/core'
import { HttpClient, HttpHeaders } from '@angular/common/http'
import { Observable, forkJoin, of } from 'rxjs'
import { map, catchError } from 'rxjs/operators'
import { environment } from 'src/environments/environment'
import {
  AiReport,
  AiReportLatestResponse,
  mapAiReport,
} from '../models/ai-report.model'
import { AiReportType } from '../models/ai-report-type.enum'

/**
 * Headline-only AI Review surface for the Landing hub.
 * s6 will extend with list() + getByPeriod().
 *
 * Mirrors iOS AIReviewStore.mostRecentLatest:
 *   fan out three GET /ai-reports/latest?type=... calls in parallel (forkJoin),
 *   pick the one with the newest created_at.
 *   A per-call catchError swallows individual 5xx so one bad type
 *   doesn't blank the hero — matches iOS swallow-and-show-placeholder behavior.
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
}
