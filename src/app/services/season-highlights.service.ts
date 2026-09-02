import { Injectable } from '@angular/core'
import { Observable, forkJoin, of } from 'rxjs'
import { catchError, map, switchMap } from 'rxjs/operators'
import { LeagueService } from './league.service'
import { LeagueModel } from '../models/league.model'

/** The most a single player scored for you in one week. */
export interface PlayerWeek {
  playerId: string
  points: number
  week: number
  season: string
}

/** Your own scoring for one week. */
export interface TeamWeek {
  points: number
  week: number
  season: string
}

/**
 * A bench player who outscored someone you started, in the same week.
 *
 * `margin` is what the swap was worth, which is the only reason to look at
 * one of these.
 */
export interface StartSitMiss {
  benchedId: string
  benchedPoints: number
  startedId: string
  startedPoints: number
  margin: number
  week: number
  season: string
}

export interface SeasonHighlights {
  bestPlayerWeeks: PlayerWeek[]
  bestTeamWeeks: TeamWeek[]
  worstDecisions: StartSitMiss[]
  weeksRead: number
}

const REGULAR_WEEKS = 17

/**
 * What actually happened, from the weekly matchups.
 *
 * Sleeper returns `players_points` for every player on a roster and
 * `starters_points` for the lineup, for every past season. So a career's best
 * weeks and its worst start-sit calls are already on record -- they do not
 * need this season to have started.
 *
 * This is the expensive read in the app: seventeen weeks per season, per
 * league. Callers pass one league's chain rather than a whole portfolio.
 */
@Injectable({ providedIn: 'root' })
export class SeasonHighlightsService {
  constructor(private leagues: LeagueService) {}

  forLeagueChain(chain: LeagueModel[], sleeperUserId: string): Observable<SeasonHighlights> {
    if (!chain.length) return of(this.empty())

    const rosterCalls = chain.map((season) =>
      this.leagues.findLeagueRosters(season.getId()).pipe(
        map((rosters) => ({ season, rosters })),
        catchError(() => of({ season, rosters: [] as Array<{ owner_id: string | null; roster_id: number }> })),
      ),
    )

    return forkJoin(rosterCalls).pipe(
      switchMap((entries) => {
        // Only seasons this person actually played, and only their roster id.
        const mine = entries
          .map(({ season, rosters }) => ({
            season,
            rosterId: rosters.find((r) => r.owner_id === sleeperUserId)?.roster_id,
          }))
          .filter((e): e is { season: LeagueModel; rosterId: number } => e.rosterId !== undefined)

        // An empty read, not an empty result: the map below assembles, and
        // handing it a finished object made it iterate one.
        if (!mine.length) return of([] as WeekRead[])

        const weekCalls = mine.flatMap(({ season, rosterId }) =>
          Array.from({ length: REGULAR_WEEKS }, (_, i) => i + 1).map((week) =>
            this.leagues.getLeagueMatchups(season.getId(), week).pipe(
              map((rows) => ({ season: season.season, week, rosterId, rows })),
              // A week that never happened 404s or comes back empty; that is
              // not a failure worth losing the other sixteen over.
              catchError(() => of({ season: season.season, week, rosterId, rows: [] as never[] })),
            ),
          ),
        )
        return forkJoin(weekCalls)
      }),
      map((weeks) => this.assemble(weeks as WeekRead[])),
    )
  }

  private assemble(weeks: WeekRead[]): SeasonHighlights {
    const playerWeeks: PlayerWeek[] = []
    const teamWeeks: TeamWeek[] = []
    const misses: StartSitMiss[] = []
    let weeksRead = 0

    for (const { season, week, rosterId, rows } of weeks) {
      const mine = (rows ?? []).find((r) => r.roster_id === rosterId)
      if (!mine) continue

      const points = mine.players_points ?? {}
      const starters = (mine.starters ?? []).filter((id) => id && id !== '0')
      const all = (mine.players ?? []).filter((id) => id && id !== '0')

      // A week nobody scored in has not been played, so it is not a zero.
      const played = Object.values(points).some((p) => Number(p) > 0)
      if (!played) continue
      weeksRead += 1

      teamWeeks.push({ points: Number(mine.points ?? 0), week, season })

      for (const id of all) {
        const scored = Number(points[id] ?? 0)
        if (scored > 0) playerWeeks.push({ playerId: id, points: scored, week, season })
      }

      const worstStarter = starters
        .map((id) => ({ id, points: Number(points[id] ?? 0) }))
        .sort((a, b) => a.points - b.points)[0]
      if (!worstStarter) continue

      const bestBench = all
        .filter((id) => !starters.includes(id))
        .map((id) => ({ id, points: Number(points[id] ?? 0) }))
        .sort((a, b) => b.points - a.points)[0]
      if (!bestBench) continue

      if (bestBench.points > worstStarter.points) {
        misses.push({
          benchedId: bestBench.id,
          benchedPoints: bestBench.points,
          startedId: worstStarter.id,
          startedPoints: worstStarter.points,
          margin: bestBench.points - worstStarter.points,
          week,
          season,
        })
      }
    }

    return {
      bestPlayerWeeks: playerWeeks.sort((a, b) => b.points - a.points).slice(0, 5),
      bestTeamWeeks: teamWeeks.sort((a, b) => b.points - a.points).slice(0, 5),
      worstDecisions: misses.sort((a, b) => b.margin - a.margin).slice(0, 5),
      weeksRead,
    }
  }

  private empty(): SeasonHighlights {
    return { bestPlayerWeeks: [], bestTeamWeeks: [], worstDecisions: [], weeksRead: 0 }
  }
}

interface WeekRead {
  season: string
  week: number
  rosterId: number
  rows: Array<{
    roster_id: number
    points?: number
    players?: string[] | null
    starters?: string[] | null
    players_points?: Record<string, number> | null
  }>
}
