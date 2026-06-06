import { Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import {
  Observable,
  shareReplay,
  map,
  tap,
  catchError,
  throwError,
  of,
} from 'rxjs'
import {
  FantasyCalcPlayerRaw,
  PlayerValue,
  parsePlayerValue,
  parseYearPrefix,
} from '../models/player-value.model'

/**
 * FantasyCalc dynasty-superflex values endpoint.
 * Params: dynasty, 2-QB (superflex), 12-team, full PPR.
 * Closest publicly-available proxy for our league's TE-premium scoring.
 *
 * Swappable constant — changing direct→proxy is a one-line edit here.
 * Port of the `private let endpoint` constant in iOS `PlayerValuesStore.swift`.
 */
const FANTASYCALC_ENDPOINT =
  'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=12&ppr=1'

/** 12-hour cache TTL in milliseconds. Values move slowly in dynasty. */
const CACHE_TTL_MS = 12 * 60 * 60 * 1000

/**
 * Fetches and caches dynasty superflex player values from FantasyCalc.
 * Single fetch per session (12h TTL); ~460 entries (~350 players + ~64 picks).
 *
 * Port of iOS `PlayerValuesStore.swift`.
 *
 * Usage:
 *   playerValuesService.values$.subscribe(loaded => { ... })
 *   playerValuesService.value('4984')        // Josh Allen → 10214
 *   playerValuesService.pickValue('2026 1st') // pick by name
 */
@Injectable({ providedIn: 'root' })
export class PlayerValuesService {
  /** Shared, cached stream of parsed player values. Replays to late subscribers. */
  private values$: Observable<PlayerValue[]> | null = null
  private lastLoadedAt: number | null = null

  // In-memory lookup maps populated after first fetch
  private _valuesById = new Map<string, number>()
  private _positionsById = new Map<string, string>()
  private _pickValuesByName = new Map<string, number>()
  private _pickYearsByName = new Map<string, number>()
  private _loaded = false

  constructor(private http: HttpClient) {}

  /**
   * Lazy-loaded, cached observable of all FantasyCalc entries.
   * Emits once per session (12h TTL). Subscribe to trigger the
   * initial fetch; subsequent subscribers get the cached result.
   */
  load(forceRefresh = false): Observable<PlayerValue[]> {
    const now = Date.now()
    const isStale =
      !this.lastLoadedAt || now - this.lastLoadedAt > CACHE_TTL_MS

    if (!this.values$ || forceRefresh || isStale) {
      this.values$ = this.http
        .get<FantasyCalcPlayerRaw[]>(FANTASYCALC_ENDPOINT)
        .pipe(
          map((raw) => raw.map(parsePlayerValue)),
          tap((entries) => this.hydrateMaps(entries)),
          shareReplay(1),
          catchError((err) => {
            // Reset so next call retries
            this.values$ = null
            return throwError(() => err)
          }),
        )
    }

    return this.values$
  }

  // ---------------------------------------------------------------------------
  // Lookup accessors — safe to call after load() has emitted
  // ---------------------------------------------------------------------------

  /**
   * Dynasty value for a Sleeper player ID.
   * Returns 0 if unknown (matches iOS `value(for:)` default).
   */
  value(playerId: string): number {
    return this._valuesById.get(playerId) ?? 0
  }

  /**
   * Position string (QB/RB/WR/TE) for a Sleeper player ID.
   * Returns null if unknown.
   */
  position(playerId: string): string | null {
    return this._positionsById.get(playerId) ?? null
  }

  /**
   * Dynasty value for a pick by display name (e.g. "2026 Pick 1.01").
   * Returns 0 if unknown (matches iOS `pickValue(for:)` default).
   */
  pickValue(name: string): number {
    return this._pickValuesByName.get(name) ?? 0
  }

  /**
   * All pick names currently loaded, sorted by value descending.
   * Port of iOS `var allPickNames: [String]`.
   */
  get allPickNames(): string[] {
    return [...this._pickValuesByName.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([name]) => name)
  }

  /**
   * Pick names filtered to a set of years, sorted by value descending.
   * Port of iOS `pickNames(forYears:)`.
   */
  pickNames(forYears: Set<number>): string[] {
    return [...this._pickValuesByName.entries()]
      .filter(([name]) => {
        const year = this._pickYearsByName.get(name)
        return year !== undefined && forYears.has(year)
      })
      .sort(([, a], [, b]) => b - a)
      .map(([name]) => name)
  }

  /** True once the first successful fetch has populated the maps. */
  get hasValues(): boolean {
    return this._loaded
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private hydrateMaps(entries: PlayerValue[]): void {
    this._valuesById.clear()
    this._positionsById.clear()
    this._pickValuesByName.clear()
    this._pickYearsByName.clear()

    for (const entry of entries) {
      if (entry.isPick) {
        const name = entry.name
        if (!name || name.trim() === '') continue
        this._pickValuesByName.set(name, entry.value)
        const year = parseYearPrefix(name)
        if (year !== null) {
          this._pickYearsByName.set(name, year)
        }
      } else {
        const sid = entry.sleeperId
        if (!sid || sid.trim() === '') continue
        this._valuesById.set(sid, entry.value)
        if (entry.position) {
          this._positionsById.set(sid, entry.position)
        }
      }
    }

    this._loaded = true
    this.lastLoadedAt = Date.now()
  }
}
