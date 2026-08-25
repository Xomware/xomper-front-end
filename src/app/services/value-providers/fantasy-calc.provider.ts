import { Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable, map, shareReplay, catchError, throwError } from 'rxjs'
import {
  FantasyCalcPlayerRaw,
  PlayerValue,
  parsePlayerValue,
  parseYearPrefix,
} from '../../models/player-value.model'
import {
  FormatFingerprint,
  LeagueFormat,
  MapValueBook,
  ValueBook,
} from '../../models/value-book.model'
import { ValueProvider } from './value-provider'

/**
 * Fetches values straight from FantasyCalc in the browser, one request per
 * league format.
 *
 * This is Phase 2's provider. It keeps the existing direct-fetch behaviour but
 * parameterizes the endpoint by fingerprint instead of hardcoding the CLT
 * league's format. Phase 5 replaces it with a warehouse provider; browser
 * fan-out and the FantasyCalc rate-limit exposure both go away then.
 */
const FANTASYCALC_BASE = 'https://api.fantasycalc.com/values/current'

/** 12-hour cache TTL. Values move slowly, especially in dynasty. */
export const CACHE_TTL_MS = 12 * 60 * 60 * 1000

export function fantasyCalcUrl(fp: FormatFingerprint): string {
  const params = new URLSearchParams({
    isDynasty: String(fp.isDynasty),
    numQbs: String(fp.numQbs),
    numTeams: String(fp.numTeams),
    ppr: String(fp.ppr),
  })
  return `${FANTASYCALC_BASE}?${params.toString()}`
}

@Injectable({ providedIn: 'root' })
export class FantasyCalcDirectProvider implements ValueProvider {
  readonly id = 'fantasycalc-direct'

  /** In-flight and cached requests, keyed by fingerprint. */
  private inFlight = new Map<string, Observable<ValueBook>>()

  constructor(private http: HttpClient) {}

  bookFor(format: LeagueFormat): Observable<ValueBook> {
    const url = fantasyCalcUrl(format.fingerprint)
    const cached = this.inFlight.get(url)
    if (cached) return cached

    const request = this.http.get<FantasyCalcPlayerRaw[]>(url).pipe(
      map((raw) => this.toBook(format, raw.map(parsePlayerValue))),
      shareReplay(1),
      catchError((err) => {
        // Drop the cache entry so a later call retries rather than replaying
        // a failed request forever.
        this.inFlight.delete(url)
        return throwError(() => err)
      }),
    )

    this.inFlight.set(url, request)
    return request
  }

  /** Drop cached books. Called on TTL expiry and by manual refresh. */
  invalidate(): void {
    this.inFlight.clear()
  }

  private toBook(format: LeagueFormat, entries: PlayerValue[]): ValueBook {
    const valuesById = new Map<string, number>()
    const positionsById = new Map<string, string>()
    const pickValuesByName = new Map<string, number>()
    const pickYearsByName = new Map<string, number>()

    for (const entry of entries) {
      if (entry.isPick) {
        const name = entry.name
        if (!name || name.trim() === '') continue
        pickValuesByName.set(name, entry.value)
        const year = parseYearPrefix(name)
        if (year !== null) pickYearsByName.set(name, year)
        continue
      }

      const sid = entry.sleeperId
      if (!sid || sid.trim() === '') continue
      valuesById.set(sid, entry.value)
      if (entry.position) positionsById.set(sid, entry.position)
    }

    return new MapValueBook(
      format,
      valuesById,
      positionsById,
      pickValuesByName,
      pickYearsByName,
      Date.now(),
    )
  }
}
