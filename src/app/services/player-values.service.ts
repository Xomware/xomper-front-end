import { Injectable } from '@angular/core'
import { Observable, of, tap } from 'rxjs'
import { League } from '../models/league.interface'
import { LeagueFormat, ValueBook } from '../models/value-book.model'
import { LeagueSettingsFingerprintService } from './league-settings-fingerprint.service'
import { CACHE_TTL_MS } from './value-providers/fantasy-calc.provider'
import { CompositeValueProvider } from './value-providers/composite.provider'
import { ValueProvider } from './value-providers/value-provider'

/**
 * Builds per-league `ValueBook`s.
 *
 * Was a singleton holding one global value map, fetched from a FantasyCalc URL
 * hardcoded to the CLT league's format. Every lookup in the app resolved
 * against that one league. Now each league resolves to its own format and gets
 * its own book.
 *
 * The provider is swappable: Phase 5 replaces `FantasyCalcDirectProvider` with
 * a warehouse-backed provider and nothing above this service changes.
 */
interface CacheEntry {
  book: ValueBook
  loadedAt: number
}

@Injectable({ providedIn: 'root' })
export class PlayerValuesService {
  private provider: ValueProvider
  private cache = new Map<string, CacheEntry>()

  constructor(
    private fingerprintService: LeagueSettingsFingerprintService,
    composite: CompositeValueProvider,
  ) {
    // Routes redraft to Sleeper projections and dynasty to FantasyCalc.
    // See CompositeValueProvider for why neither wins everywhere.
    this.provider = composite
  }

  /**
   * Swap the value source. Phase 5 calls this with the warehouse provider.
   * Clears the cache, since books from a different source aren't interchangeable.
   */
  useProvider(provider: ValueProvider): void {
    this.provider = provider
    this.cache.clear()
  }

  get providerId(): string {
    return this.provider.id
  }

  /**
   * Book for a league. Cached per format, so every 12-team superflex dynasty
   * league in a user's account shares one fetch.
   */
  bookFor(league: League, forceRefresh = false): Observable<ValueBook> {
    const format = this.fingerprintService.resolve(league)
    return this.bookForFormat(format, forceRefresh)
  }

  /** Book for an already-resolved format. */
  bookForFormat(format: LeagueFormat, forceRefresh = false): Observable<ValueBook> {
    const key = this.fingerprintService.key(format.fingerprint)
    const cached = this.cache.get(key)

    if (!forceRefresh && cached && !this.isStale(cached)) {
      return of(cached.book)
    }

    return this.provider
      .bookFor(format)
      .pipe(tap((book) => this.cache.set(key, { book, loadedAt: Date.now() })))
  }

  /** Resolve a league's format without fetching values. */
  formatFor(league: League): LeagueFormat {
    return this.fingerprintService.resolve(league)
  }

  /** True when a fresh book for this format is already cached. */
  hasBookFor(format: LeagueFormat): boolean {
    const cached = this.cache.get(this.fingerprintService.key(format.fingerprint))
    return !!cached && !this.isStale(cached)
  }

  clearCache(): void {
    this.cache.clear()
  }

  private isStale(entry: CacheEntry): boolean {
    return Date.now() - entry.loadedAt > CACHE_TTL_MS
  }
}
