import { Observable } from 'rxjs'
import { LeagueFormat, ValueBook } from '../../models/value-book.model'

/**
 * Source of player values for one league format.
 *
 * The seam exists so Phase 5 can swap `FantasyCalcDirectProvider` for a
 * warehouse-backed provider without touching the analysis engine. Everything
 * upstream of this interface depends on `ValueBook`, never on FantasyCalc.
 */
export interface ValueProvider {
  /** Stable id for logging and cache namespacing. */
  readonly id: string
  /** Build a book for the given format. Implementations must not mutate it. */
  bookFor(format: LeagueFormat): Observable<ValueBook>
}

export const VALUE_PROVIDER_TOKEN = 'VALUE_PROVIDER'
