/**
 * PlayerPointsService — web port of iOS PlayerPointsStore.loadRegularSeason.
 *
 * Walks regular-season weeks (1..regularSeasonLastWeek) for a given league,
 * fetches `/league/{id}/matchups/{week}` per week, and builds two data stores:
 *
 *   - `weeklyRosterPoints["{week}-{rosterId}"]`: Record<playerId, points>
 *     The full roster's per-player scores that week (starters + bench),
 *     used by HighestPossibleCalculator to pick the optimal lineup retroactively.
 *
 *   - `seasonStarterPoints[playerId]`: cumulative starter points over the season
 *     (drives Position MVP payouts — bench points excluded).
 *
 * Cache key is (leagueId + week). Already-fetched weeks are skipped.
 * Non-fatal fetch errors skip the week and continue.
 *
 * NOTE: this service also unblocks s4 deferred draft grades which need
 * per-week per-roster scoring data.
 */

import { Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { firstValueFrom } from 'rxjs'
import { Matchup } from '../models/matchup.interface'

@Injectable({
  providedIn: 'root',
})
export class PlayerPointsService {
  /** playerId -> cumulative starter points (regular season). */
  private _seasonStarterPoints: Record<string, number> = {}

  /**
   * "{week}-{rosterId}" -> Record<playerId, points>.
   * Full roster (starters + bench) for each week — HPP calc needs all of them.
   */
  private _weeklyRosterPoints: Record<string, Record<string, number>> = {}

  /** "(leagueId)#(week)" keys already loaded. Persists until reset(). */
  private _fetched: Set<string> = new Set()

  private _isLoading = false
  private _loadError: string | null = null

  /** Progress for multi-week fetch — 0..1. */
  private _progress = 0

  private readonly baseUrl = 'https://api.sleeper.app/v1'

  constructor(private http: HttpClient) {}

  // ---------------------------------------------------------------------------
  // Public accessors
  // ---------------------------------------------------------------------------

  get weeklyRosterPoints(): Record<string, Record<string, number>> {
    return this._weeklyRosterPoints
  }

  get seasonStarterPoints(): Record<string, number> {
    return this._seasonStarterPoints
  }

  get isLoading(): boolean {
    return this._isLoading
  }

  get loadError(): string | null {
    return this._loadError
  }

  /** 0–1 fetch progress across all weeks. */
  get progress(): number {
    return this._progress
  }

  get hasData(): boolean {
    return Object.keys(this._weeklyRosterPoints).length > 0
  }

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  /**
   * Walks weeks 1..regularSeasonLastWeek and populates weeklyRosterPoints.
   * Already-fetched weeks are skipped (caches by leagueId+week).
   * Safe to call multiple times — idempotent for fetched weeks.
   */
  async loadRegularSeason(leagueId: string, regularSeasonLastWeek: number): Promise<void> {
    if (this._isLoading) return
    this._isLoading = true
    this._loadError = null
    this._progress = 0

    const lastWeek = Math.max(regularSeasonLastWeek, 1)
    const weeks = Array.from({ length: lastWeek }, (_, i) => i + 1)
    const weeksTodo = weeks.filter(w => !this._fetched.has(this.cacheKey(leagueId, w)))

    if (weeksTodo.length === 0) {
      this._isLoading = false
      this._progress = 1
      return
    }

    let completed = 0

    for (const week of weeksTodo) {
      try {
        const matchups = await firstValueFrom(
          this.http.get<Matchup[]>(`${this.baseUrl}/league/${leagueId}/matchups/${week}`)
        )
        this.processWeek(week, matchups)
        this._fetched.add(this.cacheKey(leagueId, week))
      } catch {
        // Non-fatal: skip and continue
      }
      completed++
      this._progress = completed / weeksTodo.length
    }

    this._isLoading = false
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private processWeek(week: number, matchups: Matchup[]): void {
    for (const matchup of matchups) {
      // --- Starter accumulation (Position MVP payouts) ---
      if (matchup.starters?.length && matchup.starters_points?.length) {
        const count = Math.min(matchup.starters.length, matchup.starters_points.length)
        for (let i = 0; i < count; i++) {
          const pid = matchup.starters[i]
          const pts = matchup.starters_points[i]
          if (!pid || pid === '0') continue
          this._seasonStarterPoints[pid] = (this._seasonStarterPoints[pid] ?? 0) + pts
        }
      }

      // --- Full-roster per-week points (HPP calc) ---
      if (matchup.players?.length && matchup.players_points) {
        const rosterScores: Record<string, number> = {}
        for (const pid of matchup.players) {
          if (!pid || pid === '0') continue
          const pts = matchup.players_points[pid]
          if (pts !== undefined) rosterScores[pid] = pts
        }
        const key = `${week}-${matchup.roster_id}`
        this._weeklyRosterPoints[key] = rosterScores
      }
    }
  }

  private cacheKey(leagueId: string, week: number): string {
    return `${leagueId}#${week}`
  }

  reset(): void {
    this._seasonStarterPoints = {}
    this._weeklyRosterPoints = {}
    this._fetched = new Set()
    this._loadError = null
    this._progress = 0
  }
}
