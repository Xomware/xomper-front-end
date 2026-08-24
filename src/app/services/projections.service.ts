import { Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable, map, shareReplay, catchError, throwError } from 'rxjs'
import {
  ProjectedPlayer,
  SleeperProjectionRaw,
  parseProjection,
} from '../models/projections.model'

/**
 * Season-long Sleeper projections.
 *
 * Note the host: projections live on `api.sleeper.com`, not the documented
 * `api.sleeper.app/v1` the rest of the app uses.
 *
 * Verified 2026-08-24 against the 2025 season: 3,305 entries — QB 355,
 * RB 679, WR 1367, TE 644, K 153, DEF 32 — versus FantasyCalc redraft's 193
 * with no kickers or defenses at all.
 */
const PROJECTIONS_BASE = 'https://api.sleeper.com/projections/nfl'

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

/** Projections shift week to week in-season but not minute to minute. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

export function projectionsUrl(season: string | number): string {
  const params = new URLSearchParams({ season_type: 'regular' })
  for (const pos of POSITIONS) params.append('position[]', pos)
  params.append('order_by', 'adp_ppr')
  return `${PROJECTIONS_BASE}/${season}?${params.toString()}`
}

interface CacheEntry {
  request: Observable<ProjectedPlayer[]>
  loadedAt: number
}

@Injectable({ providedIn: 'root' })
export class ProjectionsService {
  private cache = new Map<string, CacheEntry>()

  constructor(private http: HttpClient) {}

  /** Season projections, cached per season. */
  forSeason(season: string | number): Observable<ProjectedPlayer[]> {
    const key = String(season)
    const cached = this.cache.get(key)
    if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
      return cached.request
    }

    const request = this.http
      .get<SleeperProjectionRaw[]>(projectionsUrl(season))
      .pipe(
        map((raw) => raw.map(parseProjection)),
        shareReplay(1),
        catchError((err) => {
          this.cache.delete(key)
          return throwError(() => err)
        }),
      )

    this.cache.set(key, { request, loadedAt: Date.now() })
    return request
  }

  clearCache(): void {
    this.cache.clear()
  }
}
