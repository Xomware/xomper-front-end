import { Injectable } from '@angular/core'
import { HttpClient, HttpHeaders } from '@angular/common/http'
import { Observable, of } from 'rxjs'
import { map, catchError } from 'rxjs/operators'
import { environment } from 'src/environments/environment'
import {
  AdminNotificationLogEntry,
  AdminNotificationListOpts,
  AdminNotificationsResponse,
  mapNotificationEntry,
} from '../models/admin-notification-log.model'
import {
  TestEmailRecipient,
  TestEmailRecipientsResponse,
  TestEmailResponse,
  TestEmailResponseRaw,
  TestEmailTemplateResponse,
  TestEmailTemplateResponseRaw,
  mapTestEmailRecipient,
  mapTestEmailResponse,
  mapTestEmailTemplateResponse,
} from '../models/test-email.model'

export interface AdminTestSendOpts {
  sleeperUserId: string
  email?: string
  kind: string
  channels?: Array<'push' | 'email'>
}

export interface AdminTestSendResponse {
  kind: string
  pushSent: number
  emailSent: number
}

/**
 * AdminService — umbrella for admin-only portal actions.
 * Wraps:
 *   GET  /admin/notifications        → listNotifications()
 *   GET  /admin/email-test-recipients → listEmailTestRecipients()
 *   POST /admin/email-test            → sendTestEmail() (AI Review kinds)
 *   POST /admin/email-test-template   → sendTestEmailTemplate() (template kinds)
 *   POST /admin/test-send             → sendTestPush()
 *
 * All reads go through Lambdas (not direct Supabase) — RLS is admin-service-role only.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly apiUrl = `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev`
  private readonly apiAuthToken = environment.apiAuthToken

  constructor(private http: HttpClient) {}

  private get headers(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${this.apiAuthToken}`,
      'Content-Type': 'application/json',
    })
  }

  /**
   * Fetch notification log entries for a given user.
   * GET /admin/notifications?sleeper_user_id=...&days_back=...
   */
  listNotifications(
    opts: AdminNotificationListOpts,
  ): Observable<AdminNotificationLogEntry[]> {
    let url = `${this.apiUrl}/admin/notifications?sleeper_user_id=${encodeURIComponent(opts.sleeperUserId)}`
    url += `&days_back=${opts.daysBack ?? 7}`
    url += `&limit=${opts.limit ?? 100}`
    if (opts.kind) url += `&kind=${opts.kind}`
    if (opts.status) url += `&status=${opts.status}`

    return this.http
      .get<AdminNotificationsResponse>(url, { headers: this.headers })
      .pipe(
        map((res) => (res.rows ?? []).map(mapNotificationEntry)),
        catchError(() => of([])),
      )
  }

  /**
   * Fetch whitelisted users eligible to receive a test email.
   * GET /admin/email-test-recipients
   */
  listEmailTestRecipients(): Observable<TestEmailRecipient[]> {
    return this.http
      .get<TestEmailRecipientsResponse>(
        `${this.apiUrl}/admin/email-test-recipients`,
        { headers: this.headers },
      )
      .pipe(
        map((res) => (res.recipients ?? []).map(mapTestEmailRecipient)),
        catchError(() => of([])),
      )
  }

  /**
   * Send an AI Review test email (requires reportId).
   * POST /admin/email-test
   */
  sendTestEmail(opts: {
    recipientSleeperUserId: string
    reportId: string
  }): Observable<TestEmailResponse> {
    return this.http
      .post<TestEmailResponseRaw>(
        `${this.apiUrl}/admin/email-test`,
        {
          recipient_user_id: opts.recipientSleeperUserId,
          report_id: opts.reportId,
        },
        { headers: this.headers },
      )
      .pipe(map(mapTestEmailResponse))
  }

  /**
   * Send a template test email (no reportId needed).
   * POST /admin/email-test-template
   */
  sendTestEmailTemplate(opts: {
    kind: string
    recipientSleeperUserId: string
  }): Observable<TestEmailTemplateResponse> {
    return this.http
      .post<TestEmailTemplateResponseRaw>(
        `${this.apiUrl}/admin/email-test-template`,
        {
          kind: opts.kind,
          recipient_sleeper_user_id: opts.recipientSleeperUserId,
        },
        { headers: this.headers },
      )
      .pipe(map(mapTestEmailTemplateResponse))
  }

  /**
   * Admin test send (push + email channels).
   * POST /admin/test-send
   */
  sendTestPush(opts: AdminTestSendOpts): Observable<AdminTestSendResponse> {
    const body: Record<string, unknown> = {
      sleeper_user_id: opts.sleeperUserId,
      kind: opts.kind,
      channels: opts.channels ?? ['push', 'email'],
    }
    if (opts.email) body['email'] = opts.email

    return this.http
      .post<{ kind: string; push_sent: number; email_sent: number }>(
        `${this.apiUrl}/admin/test-send`,
        body,
        { headers: this.headers },
      )
      .pipe(
        map((raw) => ({
          kind: raw.kind,
          pushSent: raw.push_sent,
          emailSent: raw.email_sent,
        })),
      )
  }
}
