import { Injectable } from '@angular/core'
import { Observable } from 'rxjs'
import { LeagueFormat, ValueBook } from '../../models/value-book.model'
import { FantasyCalcDirectProvider } from './fantasy-calc.provider'
import { ProjectionsValueProvider } from './projections.provider'
import { ValueProvider } from './value-provider'

/**
 * Routes each league to the source that can actually answer it honestly.
 *
 * Neither source is better everywhere:
 *
 *   Redraft  -> projections. FantasyCalc's redraft set is ~193 players with
 *               no K and no DEF, which is thinner than a 12-team league's
 *               rostered players. Projections carry 3,300+ including both,
 *               and compute the league's exact scoring rather than snapping
 *               to a nearby format.
 *
 *   Dynasty  -> FantasyCalc. Single-season projections can't express
 *               long-term worth: a 32-year-old and a rookie projected for the
 *               same points are not the same asset. Dynasty also needs draft
 *               pick values, which projections don't carry at all.
 *
 * Keeper resolves as dynasty, and is already labelled an approximation by the
 * fingerprint service.
 */
@Injectable({ providedIn: 'root' })
export class CompositeValueProvider implements ValueProvider {
  readonly id = 'composite'

  constructor(
    private fantasyCalc: FantasyCalcDirectProvider,
    private projections: ProjectionsValueProvider,
  ) {}

  /** Which source will answer for this format. Exposed so the UI can say so. */
  providerFor(format: LeagueFormat): ValueProvider {
    return format.fingerprint.isDynasty ? this.fantasyCalc : this.projections
  }

  bookFor(format: LeagueFormat): Observable<ValueBook> {
    return this.providerFor(format).bookFor(format)
  }
}
