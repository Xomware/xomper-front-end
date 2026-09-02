import { Injectable } from '@angular/core'
import { Observable, forkJoin, of } from 'rxjs'
import { catchError, map, switchMap } from 'rxjs/operators'
import { LeagueService } from './league.service'
import { LeagueModel } from '../models/league.model'
import { Roster } from '../models/roster.interface'

/** One season of one league, from the owner's point of view. */
export interface SeasonRow {
  season: string
  leagueId: string
  leagueName: string
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
}

/** A player, and how much of this owner's portfolio they appear in. */
export interface OwnedPlayer {
  playerId: string
  leagues: number
  share: number
}

export interface CareerTotals {
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
  seasons: number
  leagues: number
}

export interface ProfileStats {
  career: CareerTotals
  seasons: SeasonRow[]
  mostOwned: OwnedPlayer[]
  currentLeagues: number
}

/** Sleeper stores points as whole + hundredths in two fields. */
function points(whole: unknown, decimal: unknown): number {
  return Number(whole ?? 0) + Number(decimal ?? 0) / 100
}

/**
 * A person's record across every league they play, season by season.
 *
 * Built from rosters rather than matchups: `settings` on a roster already
 * carries wins, losses, ties and points for and against, so a season costs
 * one request instead of seventeen. Matchup-level detail -- best week, worst
 * start-sit -- needs the weekly data and is not available until games are
 * actually played.
 */
@Injectable({ providedIn: 'root' })
export class ProfileStatsService {
  constructor(private leagues: LeagueService) {}

  /**
   * Walk every league this user is in, and every season those leagues ran.
   *
   * A Sleeper league gets a fresh id each season and only points backwards,
   * so the chain from a current league is the whole history of it.
   */
  forUser(sleeperUserId: string, leagues: LeagueModel[]): Observable<ProfileStats> {
    if (!leagues.length) return of(this.empty())

    const chains = leagues.map((league) =>
      this.leagues.getLeagueChain(league.getId()).pipe(
        // One unreadable league should not empty the whole profile.
        catchError(() => of([league])),
      ),
    )

    return forkJoin(chains).pipe(
      switchMap((allChains) => {
        const seasons = allChains.flat()
        if (!seasons.length) {
          return of([] as Array<{ season: LeagueModel; rosters: Roster[] }>)
        }

        const rosterCalls = seasons.map((season) =>
          this.leagues.findLeagueRosters(season.getId()).pipe(
            map((rosters) => ({ season, rosters })),
            catchError(() => of({ season, rosters: [] as Roster[] })),
          ),
        )
        return forkJoin(rosterCalls)
      }),
      map((entries) => this.assemble(sleeperUserId, entries, leagues.length)),
    )
  }

  private assemble(
    userId: string,
    entries: Array<{ season: LeagueModel; rosters: Roster[] }>,
    currentLeagues: number,
  ): ProfileStats {
    const rows: SeasonRow[] = []
    const leagueIds = new Set<string>()

    // Ownership is counted on the CURRENT season only. Counting every season
    // would let a player you rostered once in 2022 outrank one you hold in
    // four leagues today.
    const currentSeason = entries.reduce(
      (latest, e) => (e.season.season > latest ? e.season.season : latest),
      '',
    )
    const ownedIn = new Map<string, number>()
    let currentRosterCount = 0

    for (const { season, rosters } of entries) {
      const mine = rosters.find((r) => r.owner_id === userId)
      if (!mine) continue

      leagueIds.add(season.getId())
      const settings = (mine.settings ?? {}) as Record<string, unknown>

      rows.push({
        season: season.season,
        leagueId: season.getId(),
        leagueName: season.getDisplayName(),
        wins: Number(settings['wins'] ?? 0),
        losses: Number(settings['losses'] ?? 0),
        ties: Number(settings['ties'] ?? 0),
        pointsFor: points(settings['fpts'], settings['fpts_decimal']),
        pointsAgainst: points(settings['fpts_against'], settings['fpts_against_decimal']),
      })

      if (season.season === currentSeason) {
        currentRosterCount += 1
        for (const playerId of mine.players ?? []) {
          if (playerId) ownedIn.set(playerId, (ownedIn.get(playerId) ?? 0) + 1)
        }
      }
    }

    rows.sort((a, b) => b.season.localeCompare(a.season) || a.leagueName.localeCompare(b.leagueName))

    const career = rows.reduce<CareerTotals>(
      (total, row) => ({
        wins: total.wins + row.wins,
        losses: total.losses + row.losses,
        ties: total.ties + row.ties,
        pointsFor: total.pointsFor + row.pointsFor,
        pointsAgainst: total.pointsAgainst + row.pointsAgainst,
        seasons: total.seasons,
        leagues: total.leagues,
      }),
      { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, seasons: 0, leagues: 0 },
    )
    career.seasons = new Set(rows.map((r) => r.season)).size
    career.leagues = leagueIds.size

    const mostOwned: OwnedPlayer[] = [...ownedIn.entries()]
      // Someone on one roster is not a pattern, just a player.
      .filter(([, count]) => count > 1)
      .map(([playerId, count]) => ({
        playerId,
        leagues: count,
        share: currentRosterCount ? count / currentRosterCount : 0,
      }))
      .sort((a, b) => b.leagues - a.leagues || a.playerId.localeCompare(b.playerId))
      .slice(0, 12)

    return { career, seasons: rows, mostOwned, currentLeagues }
  }

  private empty(): ProfileStats {
    return {
      career: { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, seasons: 0, leagues: 0 },
      seasons: [],
      mostOwned: [],
      currentLeagues: 0,
    }
  }
}
