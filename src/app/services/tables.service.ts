import { Injectable } from '@angular/core'
import { HttpClient, HttpHeaders } from '@angular/common/http'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { environment } from 'src/environments/environment'
import {
  WhitelistedUser,
  UsersListResponse,
  UserUpdateResponse,
  mapWhitelistedUser,
} from '../models/whitelisted-user.model'
import {
  WhitelistedLeague,
  LeaguesListResponse,
  LeagueUpdateResponse,
  mapWhitelistedLeague,
} from '../models/whitelisted-league.model'
import { AdminFieldValue, adminFieldValueToJson } from '../models/admin-field-value.model'

/**
 * Admin Tables service — Users + Leagues CRUD.
 *
 * All endpoints are admin-gated Lambdas (no direct Supabase client reads).
 * Mirrors iOS AdminTablesStore / XomperAPIClient F4 methods.
 *
 * Users:
 *   GET  /admin/users-list   → list whitelisted_users
 *   POST /admin/users-update → partial update by updateKey (email)
 *
 * Leagues:
 *   GET  /admin/leagues-list   → list whitelisted_leagues
 *   POST /admin/leagues-update → partial update by leagueId
 */
@Injectable({ providedIn: 'root' })
export class TablesService {
  private readonly apiUrl = `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev`
  private readonly apiAuthToken = environment.apiAuthToken

  constructor(private http: HttpClient) {}

  private get headers(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${this.apiAuthToken}`,
      'Content-Type': 'application/json',
    })
  }

  // ---------------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------------

  /** GET /admin/users-list — returns all whitelisted_users rows. */
  listUsers(): Observable<WhitelistedUser[]> {
    return this.http
      .get<UsersListResponse>(`${this.apiUrl}/admin/users-list`, { headers: this.headers })
      .pipe(map((response) => (response.users ?? []).map(mapWhitelistedUser)))
  }

  /**
   * POST /admin/users-update
   * updateKey is the user's email (the backend's lookup key for whitelisted_users).
   * fields is a partial diff — only changed values should be passed.
   * Mirrors iOS updateKey / AdminFieldValue wire shape.
   */
  updateUser(
    updateKey: string,
    fields: Record<string, AdminFieldValue>,
  ): Observable<UserUpdateResponse> {
    const jsonFields: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(fields)) {
      jsonFields[key] = adminFieldValueToJson(value)
    }
    const body = { update_key: updateKey, fields: jsonFields }
    return this.http
      .post<UserUpdateResponse>(`${this.apiUrl}/admin/users-update`, body, {
        headers: this.headers,
      })
  }

  // ---------------------------------------------------------------------------
  // Leagues
  // ---------------------------------------------------------------------------

  /** GET /admin/leagues-list — returns all whitelisted_leagues rows. */
  listLeagues(): Observable<WhitelistedLeague[]> {
    return this.http
      .get<LeaguesListResponse>(`${this.apiUrl}/admin/leagues-list`, { headers: this.headers })
      .pipe(map((response) => (response.leagues ?? []).map(mapWhitelistedLeague)))
  }

  /**
   * POST /admin/leagues-update
   * leagueId is the Sleeper league ID (the backend's lookup key).
   * fields is a partial diff of changed values.
   */
  updateLeague(
    leagueId: string,
    fields: Record<string, AdminFieldValue>,
  ): Observable<LeagueUpdateResponse> {
    const jsonFields: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(fields)) {
      jsonFields[key] = adminFieldValueToJson(value)
    }
    const body = { league_id: leagueId, fields: jsonFields }
    return this.http
      .post<LeagueUpdateResponse>(`${this.apiUrl}/admin/leagues-update`, body, {
        headers: this.headers,
      })
  }
}
