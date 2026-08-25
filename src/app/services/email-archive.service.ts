import { Injectable } from '@angular/core'
import { HttpClient, HttpHeaders } from '@angular/common/http'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { environment } from 'src/environments/environment'
import {
  EmailArchiveEntry,
  EmailArchiveListResponse,
  EmailArchiveDetailEnvelope,
  ResendEmailResponse,
  ResendEmailResponseRaw,
  mapEmailArchiveEntry,
  mapResendEmailResponse,
} from '../models/email-archive.model'

export interface EmailArchiveListResult {
  rows: EmailArchiveEntry[]
  nextCursor: string | null
}

/**
 * EmailArchiveService — cursor-paginated email archive + resend.
 *
 * Wraps:
 *   GET  /admin/emails-list    → list(cursor?)
 *   GET  /admin/emails-detail  → getById(id)
 *   POST /admin/emails-resend  → resend(id, toEmail)
 *
 * resend() sends { "id": id, "to_email": toEmail } — contract verified
 * against iOS XomperAPIClient.resendArchivedEmail (Phase 0).
 */
@Injectable({ providedIn: 'root' })
export class EmailArchiveService {
  private readonly apiUrl = `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev`

  constructor(private http: HttpClient) {}

  private get headers(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
    })
  }

  /**
   * Paginated list of email archive rows.
   * cursor: opaque token from previous response; null for first page.
   */
  list(cursor?: string | null, limit = 30): Observable<EmailArchiveListResult> {
    let url = `${this.apiUrl}/admin/emails-list?limit=${limit}`
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`

    return this.http
      .get<EmailArchiveListResponse>(url, { headers: this.headers })
      .pipe(
        map((res) => ({
          rows: (res.rows ?? []).map(mapEmailArchiveEntry),
          nextCursor: res.next_cursor ?? null,
        })),
      )
  }

  /**
   * Fetch full detail for one archive entry (includes html_body / text_body).
   * GET /admin/emails-detail?id=...
   */
  getById(id: string): Observable<EmailArchiveEntry | null> {
    const url = `${this.apiUrl}/admin/emails-detail?id=${encodeURIComponent(id)}`
    return this.http
      .get<EmailArchiveDetailEnvelope>(url, { headers: this.headers })
      .pipe(map((env) => (env.row ? mapEmailArchiveEntry(env.row) : null)))
  }

  /**
   * Resend an archived email with optional recipient override.
   * POST /admin/emails-resend { id, to_email }
   * to_email override contract verified against iOS resendArchivedEmail (Phase 0).
   */
  resend(id: string, toEmail: string): Observable<ResendEmailResponse> {
    return this.http
      .post<ResendEmailResponseRaw>(
        `${this.apiUrl}/admin/emails-resend`,
        { id, to_email: toEmail },
        { headers: this.headers },
      )
      .pipe(map(mapResendEmailResponse))
  }
}
