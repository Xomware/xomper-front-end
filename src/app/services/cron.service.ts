import { Injectable } from '@angular/core'
import { HttpClient, HttpHeaders } from '@angular/common/http'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { environment } from 'src/environments/environment'
import {
  CronSetting,
  CronSettingsListResponse,
  CronSettingUpdateResponse,
  mapCronSetting,
  mapCronSettingUpdate,
} from '../models/cron-setting.model'

/**
 * Admin Cron Settings service.
 *
 * GET  /admin/cron-settings-list  — list all admin_cron_settings rows.
 * POST /admin/cron-settings-update — patch enabled or test_mode for one row.
 *
 * Note: iOS uses /admin/cron-settings-list and /admin/cron-settings-update.
 * The plan's service signatures use /admin/cron-list and /admin/cron-update —
 * the iOS source (XomperAPIClient.swift lines 1319–1346) confirms the actual
 * endpoints are cron-settings-list and cron-settings-update. Using those.
 */
@Injectable({ providedIn: 'root' })
export class CronService {
  private readonly apiUrl = `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev`

  constructor(private http: HttpClient) {}

  private get headers(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
    })
  }

  /** GET /admin/cron-settings-list — returns all cron rows. */
  list(): Observable<{ rows: CronSetting[]; tableMissing: boolean }> {
    return this.http
      .get<CronSettingsListResponse>(`${this.apiUrl}/admin/cron-settings-list`, {
        headers: this.headers,
      })
      .pipe(
        map((response) => ({
          rows: (response.rows ?? []).map(mapCronSetting),
          tableMissing: response.table_missing ?? false,
        })),
      )
  }

  /**
   * POST /admin/cron-settings-update
   * Patch the `enabled` field for one row. Backend echoes the resolved row.
   * Mirrors iOS updateCronSetting(cronKey:enabled:testMode:) with only enabled set.
   */
  setEnabled(cronKey: string, enabled: boolean): Observable<Partial<CronSetting>> {
    const body: Record<string, unknown> = { cron_key: cronKey, enabled }
    return this.http
      .post<CronSettingUpdateResponse>(`${this.apiUrl}/admin/cron-settings-update`, body, {
        headers: this.headers,
      })
      .pipe(map(mapCronSettingUpdate))
  }

  /**
   * POST /admin/cron-settings-update
   * Patch the `test_mode` field for one row. Backend echoes the resolved row.
   */
  setTestMode(cronKey: string, testMode: boolean): Observable<Partial<CronSetting>> {
    const body: Record<string, unknown> = { cron_key: cronKey, test_mode: testMode }
    return this.http
      .post<CronSettingUpdateResponse>(`${this.apiUrl}/admin/cron-settings-update`, body, {
        headers: this.headers,
      })
      .pipe(map(mapCronSettingUpdate))
  }
}
