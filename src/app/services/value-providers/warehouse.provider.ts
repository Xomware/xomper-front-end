import { Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable, map, shareReplay, catchError, throwError } from 'rxjs'
import { environment } from '../../../environments/environment'
import {
  LeagueFormat,
  MapValueBook,
  ValueBook,
} from '../../models/value-book.model'
import { ValueProvider } from './value-provider'

/**
 * Values computed server-side by the warehouse.
 *
 * Same numbers as `ProjectionsValueProvider`, produced somewhere better. That
 * provider downloads Sleeper's projections into the browser and scores them
 * there; this asks the warehouse, which already holds the nightly projections
 * as Parquet and prices a league in about 10 ms.
 *
 * Parity is not assumed. The backend valuation was diffed against the
 * TypeScript engine on identical inputs and matched on all 3,227 scored
 * players — points and value both, flex allocation included. Swapping this in
 * should not move a single number.
 *
 * What the browser stops doing:
 *   - fetching ~3,300 projection records per session
 *   - running the scoring dot product on the main thread
 *   - re-running all of it for every league the user opens
 */
interface WarehouseValue {
  playerId: string
  position: string
  points: number
  value: number
}

interface WarehouseValuesResponse {
  leagueId: string
  season: string
  numTeams: number
  /** Starters per position the values were built against. */
  starters: Record<string, number>
  count: number
  values: WarehouseValue[]
}

@Injectable({ providedIn: 'root' })
export class WarehouseProvider implements ValueProvider {
  readonly id = 'warehouse'

  /** Cached per league id — the warehouse answer is stable for a session. */
  private inFlight = new Map<string, Observable<ValueBook>>()

  constructor(private http: HttpClient) {}

  private get endpoint(): string {
    return `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev/values/compute`
  }

  bookFor(format: LeagueFormat): Observable<ValueBook> {
    const leagueId = format.leagueId
    if (!leagueId) {
      // Without a league id the warehouse has nothing to price. Fail loudly
      // rather than returning an empty book, which would read downstream as
      // "every player is unknown" and blank the whole analysis.
      return throwError(
        () => new Error('WarehouseProvider requires a league id on the format'),
      )
    }

    const cached = this.inFlight.get(leagueId)
    if (cached) return cached

    const request = this.http
      .post<WarehouseValuesResponse>(this.endpoint, { leagueId })
      .pipe(
        map((response) => this.toBook(format, response)),
        shareReplay(1),
        catchError((err) => {
          // Drop the cache entry so a later call retries instead of replaying
          // a failed request for the rest of the session.
          this.inFlight.delete(leagueId)
          return throwError(() => err)
        }),
      )

    this.inFlight.set(leagueId, request)
    return request
  }

  invalidate(): void {
    this.inFlight.clear()
  }

  private toBook(
    format: LeagueFormat,
    response: WarehouseValuesResponse,
  ): ValueBook {
    const values = new Map<string, number>()
    const positions = new Map<string, string>()

    for (const entry of response.values ?? []) {
      if (!entry?.playerId) continue
      values.set(entry.playerId, entry.value)
      if (entry.position) positions.set(entry.playerId, entry.position)
    }

    // Projections carry no draft picks, here or client-side. Empty rather than
    // fabricated, so pick lookups return UNKNOWN and the UI can say so.
    return new MapValueBook(
      format,
      values,
      positions,
      new Map(),
      new Map(),
      Date.now(),
    )
  }
}
