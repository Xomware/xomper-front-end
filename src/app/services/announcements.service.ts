import { Injectable } from '@angular/core'
import { HttpClient, HttpHeaders } from '@angular/common/http'
import { Observable, of } from 'rxjs'
import { map, catchError } from 'rxjs/operators'
import { environment } from 'src/environments/environment'
import {
  LeagueAnnouncement,
  AnnouncementsListResponse,
  mapAnnouncement,
} from '../models/league-announcement.model'

/**
 * Public read-only surface for league announcements.
 * Mirrors iOS AnnouncementsStore.load() — calls GET /announcements/list,
 * then applies the same defensive client-side filter iOS uses:
 *   isActive && (!expiresAt || expiresAt > now)
 * Sort: critical-first, then displayOrder ascending.
 *
 * Admin CRUD surface lands in s7.
 */
@Injectable({ providedIn: 'root' })
export class AnnouncementsService {
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
}
