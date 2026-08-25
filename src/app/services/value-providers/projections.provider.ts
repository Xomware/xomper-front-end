import { Injectable } from '@angular/core'
import { Observable, map } from 'rxjs'
import {
  LeagueFormat,
  MapValueBook,
  ValueBook,
} from '../../models/value-book.model'
import {
  ProjectedPlayer,
  VALUED_POSITIONS,
  ValuedPosition,
  projectedPoints,
} from '../../models/projections.model'
import {
  ScoredPlayer,
  replacementLevels,
  startersByPosition,
  valuesFromVor,
} from '../../models/vor.model'
import { ProjectionsService } from '../projections.service'
import { ValueProvider } from './value-provider'

/**
 * Computes values from Sleeper projections and the league's own scoring.
 *
 * Unlike a borrowed values source, nothing here is approximated to somebody
 * else's format: TE premium, PPR variants, superflex scarcity and custom
 * scoring all come out of the league object. It also covers kickers and
 * defenses, which no free values source does.
 *
 * Its limit is the flip side of the same property — single-season projections
 * express THIS year's production, not long-term dynasty worth. A 32-year-old
 * and a rookie projected for identical points are not identical assets. So
 * dynasty leagues should prefer a dynasty source and use this for in-season
 * questions. See `CompositeValueProvider` for that routing.
 */
@Injectable({ providedIn: 'root' })
export class ProjectionsValueProvider implements ValueProvider {
  readonly id = 'sleeper-projections'

  constructor(private projections: ProjectionsService) {}

  bookFor(format: LeagueFormat, season?: string | number): Observable<ValueBook> {
    const targetSeason = season ?? new Date().getFullYear()
    return this.projections
      .forSeason(targetSeason)
      .pipe(map((players) => this.toBook(format, players)))
  }

  private toBook(format: LeagueFormat, players: ProjectedPlayer[]): ValueBook {
    const scoring = format.scoringSettings ?? {}
    const rosterPositions = format.rosterPositions ?? []
    const { ppr, numTeams } = format.fingerprint

    const scored: ScoredPlayer[] = []
    const positionsById = new Map<string, string>()
    const ignored = new Set<string>()

    for (const player of players) {
      const position = (player.position ?? '').toUpperCase()
      if (!VALUED_POSITIONS.includes(position as ValuedPosition)) continue

      const result = projectedPoints(player, scoring, ppr)
      result.ignoredKeys.forEach((k) => ignored.add(k))

      scored.push({
        player,
        position: position as ValuedPosition,
        points: result.points,
      })
      positionsById.set(player.playerId, position)
    }

    const starters = startersByPosition(rosterPositions, numTeams, scored)
    const levels = replacementLevels(scored, starters)
    const values = valuesFromVor(scored, levels)

    // Ignored scoring keys are a real limit, so state them rather than
    // quietly scoring the league as if they didn't exist.
    const enrichedFormat: LeagueFormat = ignored.size
      ? {
          ...format,
          approximations: [
            ...format.approximations,
            `${ignored.size} scoring rule(s) aren't in Sleeper's projections ` +
              `and were left out: ${[...ignored].sort().join(', ')}.`,
          ],
        }
      : format

    return new MapValueBook(
      enrichedFormat,
      values,
      positionsById,
      // Projections carry no draft-pick values — dynasty picks need a dynasty
      // source. Empty rather than fabricated.
      new Map(),
      new Map(),
      Date.now(),
    )
  }
}
