import { Injectable } from '@angular/core'
import { Observable, forkJoin, map } from 'rxjs'
import {
  LeagueFormat,
  MapValueBook,
  ValueBook,
} from '../../models/value-book.model'
import { ValuedPosition } from '../../models/projections.model'
import { parseYearPrefix } from '../../models/player-value.model'
import { startersByPosition } from '../../models/vor.model'
import { positionAdjustments } from '../../models/scoring-adjustment.model'
import { ProjectionsService } from '../projections.service'
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
 *   Dynasty  -> FantasyCalc, corrected. Single-season projections can't
 *               express long-term worth: a 32-year-old and a rookie projected
 *               for the same points are not the same asset. Dynasty also needs
 *               draft pick values, which projections don't carry at all.
 *
 * Keeper resolves as dynasty, and is already labelled an approximation by the
 * fingerprint service.
 *
 * The dynasty correction closes a real, measured gap. FantasyCalc is
 * parameterized only on dynasty/QBs/teams/PPR, so any other scoring rule is
 * invisible to it. In the CLT league (`bonus_rec_te: 0.5`) the top 24 tight
 * ends project 20% more points than the plain-PPR scoring FantasyCalc served —
 * so every tight end was priced ~20% light, and every trade involving one was
 * graded against that. Projections supply the per-position correction while
 * FantasyCalc still supplies the dynasty asset value.
 */
@Injectable({ providedIn: 'root' })
export class CompositeValueProvider implements ValueProvider {
  readonly id = 'composite'

  constructor(
    private fantasyCalc: FantasyCalcDirectProvider,
    private projections: ProjectionsValueProvider,
    private projectionsService: ProjectionsService,
  ) {}

  /** Which source will answer for this format. Exposed so the UI can say so. */
  providerFor(format: LeagueFormat): ValueProvider {
    return format.fingerprint.isDynasty ? this.fantasyCalc : this.projections
  }

  bookFor(format: LeagueFormat, season?: string | number): Observable<ValueBook> {
    if (!format.fingerprint.isDynasty) {
      return this.projections.bookFor(format, season)
    }

    // Keeper is not dynasty-lite; how far it sits between the two depends on
    // how many players actually carry over. See keeperBlend().
    if (format.isKeeper) {
      return this.keeperBlend(format, season)
    }

    const targetSeason = season ?? new Date().getFullYear()

    return forkJoin([
      this.fantasyCalc.bookFor(format),
      this.projectionsService.forSeason(targetSeason),
    ]).pipe(map(([book, players]) => this.corrected(format, book, players)))
  }

  /**
   * How much of a keeper league carries over, 0..1.
   *
   * A league keeping 1 of 10 starters is 90% a redraft league. Routing it to
   * dynasty values, as "keeper implies dynasty" did, is wrong twice over:
   * dynasty values weight youth that will not be kept, and the dynasty source
   * carries no kickers or defenses at all.
   *
   * Measured on a real 12-team keeper league with `max_keepers: 1` and K and
   * DEF starting slots: dynasty priced 165 of 199 rostered players (83%),
   * projections priced 194 (97%). Of the 34 the dynasty source missed, 31 had
   * projections and 15 were defenses — every one of them silently worth zero.
   */
  keeperWeight(format: LeagueFormat): number {
    const slots = format.startingSlots
    const keepers = format.maxKeepers
    if (!slots || keepers <= 0) return 0
    return Math.min(1, Math.max(0, keepers / slots))
  }

  /**
   * Blend redraft and dynasty values by how much of the roster carries over.
   *
   * Coverage takes the union: a player either source can price gets a value,
   * rather than being zeroed because the dynasty source has never heard of
   * kickers. Where only one source knows a player, that source's value is
   * used outright rather than blended toward a number that does not exist.
   */
  private keeperBlend(
    format: LeagueFormat,
    season?: string | number,
  ): Observable<ValueBook> {
    const weight = this.keeperWeight(format)

    return forkJoin([
      this.fantasyCalc.bookFor(format),
      this.projections.bookFor(format, season),
    ]).pipe(
      map(([dynastyBook, redraftBook]) => {
        const values = new Map<string, number>()
        const positions = new Map<string, string>()

        const ids = new Set([...dynastyBook.playerIds, ...redraftBook.playerIds])
        for (const id of ids) {
          const dynasty = dynastyBook.value(id)
          const redraft = redraftBook.value(id)

          let value: number
          if (dynasty.known && redraft.known) {
            value = redraft.value * (1 - weight) + dynasty.value * weight
          } else if (dynasty.known) {
            value = dynasty.value
          } else {
            value = redraft.value
          }

          values.set(id, Math.round(value))
          const position = dynastyBook.position(id) ?? redraftBook.position(id)
          if (position) positions.set(id, position)
        }

        // Picks only exist in the dynasty source, and only matter to the
        // degree the league is a dynasty league.
        const pickValues = new Map<string, number>()
        const pickYears = new Map<string, number>()
        for (const name of dynastyBook.allPickNames) {
          const lookup = dynastyBook.pickValue(name)
          if (!lookup.known) continue
          pickValues.set(name, Math.round(lookup.value * weight))
          const year = parseYearPrefix(name)
          if (year !== null) pickYears.set(name, year)
        }

        const pct = Math.round(weight * 100)
        return new MapValueBook(
          {
            ...format,
            approximations: [
              ...format.approximations,
              `Keeper league: values are ${100 - pct}% redraft and ${pct}% ` +
                `dynasty, based on keeping ${format.maxKeepers} of ` +
                `${format.startingSlots} starters. This is an estimate — no ` +
                'source publishes keeper values.',
            ],
          },
          values,
          positions,
          pickValues,
          pickYears,
          Date.now(),
        )
      }),
    )
  }

  /**
   * Scale a dynasty book by what its source could not model.
   *
   * Only scoring is corrected — age and long-term worth stay exactly as the
   * dynasty source priced them, which is the whole reason that source is used
   * for dynasty in the first place.
   */
  private corrected(
    format: LeagueFormat,
    book: ValueBook,
    players: Parameters<typeof positionAdjustments>[0],
  ): ValueBook {
    const scoring = format.scoringSettings ?? {}
    const { ppr, numTeams } = format.fingerprint

    // No bespoke scoring means nothing to correct. Skip the work entirely
    // rather than multiplying every value by 1.0.
    if (!Object.keys(scoring).some((k) => k.startsWith('bonus_'))) return book

    const scored = players.map((p) => ({
      player: p,
      position: (p.position ?? '').toUpperCase() as ValuedPosition,
      points: 0,
    }))
    const starters = startersByPosition(
      format.rosterPositions ?? [],
      numTeams,
      scored,
    )

    const { multipliers, notes } = positionAdjustments(
      players,
      scoring,
      ppr,
      starters,
    )
    if (notes.length === 0) return book

    const values = new Map<string, number>()
    const positions = new Map<string, string>()
    for (const id of book.playerIds) {
      const position = book.position(id)
      const lookup = book.value(id)
      if (!lookup.known) continue
      const multiplier =
        (position && multipliers[position.toUpperCase() as ValuedPosition]) || 1
      values.set(id, Math.round(lookup.value * multiplier))
      if (position) positions.set(id, position)
    }

    // Picks are deliberately NOT scaled. A draft pick has no position, so no
    // positional correction applies to it.
    const pickValues = new Map<string, number>()
    const pickYears = new Map<string, number>()
    for (const name of book.allPickNames) {
      const lookup = book.pickValue(name)
      if (!lookup.known) continue
      pickValues.set(name, lookup.value)
      // Years must be carried across too, or pickNames(forYears) silently
      // returns nothing and the pick picker renders empty.
      const year = parseYearPrefix(name)
      if (year !== null) pickYears.set(name, year)
    }

    return new MapValueBook(
      { ...format, approximations: [...format.approximations, ...notes] },
      values,
      positions,
      pickValues,
      pickYears,
      book.loadedAt,
    )
  }
}
