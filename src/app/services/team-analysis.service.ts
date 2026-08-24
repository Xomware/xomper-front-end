import { Injectable } from '@angular/core'
import { forkJoin, map, Observable, switchMap } from 'rxjs'
import { Roster } from '../models/roster.interface'
import { User } from '../models/user.interface'
import { HexAxis, HEX_AXIS_LABELS, TeamAnalysis, hexAxes } from '../models/team-analysis.model'
import { ValueBook, ValueCoverage } from '../models/value-book.model'
import { LeagueService } from './league.service'
import { PlayerService } from './player.service'
import { PlayerValuesService } from './player-values.service'

/**
 * Builds per-team dynasty-value analyses for every roster in the home league.
 * Port of iOS `TeamAnalysisBuilder` enum (TeamAnalysis.swift).
 *
 * Position bucketing rules (match iOS exactly):
 * - Taxi players → taxiValue only; never counted in position axes.
 * - Reserve players → excluded from bench bucket (they are IR, not bench).
 * - Starters → bucketed by position (QB/RB/WR/TE); unknown/FLEX → bench.
 * - Bench = not in starters AND not in reserve AND not in taxi.
 * - Position resolved via PlayerService player map first, then
 *   PlayerValuesService fallback (mirrors iOS `playerStore` → `valuesStore`).
 */
@Injectable({ providedIn: 'root' })
export class TeamAnalysisService {
  constructor(
    private leagueService: LeagueService,
    private playerService: PlayerService,
    private valuesService: PlayerValuesService,
  ) {}

  /**
   * Load everything needed to analyze an arbitrary league, then build.
   *
   * Replaces `buildForHomeLeague()`, which resolved the league id from
   * `LeagueService.getWhitelistedLeagueId()` and could only ever analyze CLT.
   */
  buildForLeague(leagueId: string): Observable<TeamAnalysis[]> {
    return this.leagueService.searchLeague(leagueId).pipe(
      switchMap((league) =>
        forkJoin([
          this.leagueService.findLeagueRosters(leagueId),
          this.leagueService.findLeagueUsers(leagueId),
          this.valuesService.bookFor(league),
          this.playerService.getPlayerMap(),
        ]),
      ),
      map(([rosters, users, book, playerMap]) =>
        this.build(rosters, users, playerMap, book),
      ),
    )
  }

  /**
   * Pure build function — builds analyses from already-loaded data.
   * Port of iOS `TeamAnalysisBuilder.build(rosters:users:playerStore:valuesStore:)`.
   */
  build(
    rosters: Roster[],
    users: User[],
    playerMap: Record<string, { position?: string; first_name?: string; last_name?: string }>,
    book: ValueBook,
  ): TeamAnalysis[] {
    const userById = new Map<string, User>(
      users.filter((u) => !!u.user_id).map((u) => [u.user_id, u]),
    )

    return rosters.map((roster) => {
      const starters = new Set(roster.starters ?? [])
      const taxi = new Set(roster.taxi ?? [])
      const reserve = new Set(roster.reserve ?? [])
      const allRostered = roster.players ?? []

      let qb = 0,
        rb = 0,
        wr = 0,
        te = 0,
        bench = 0,
        taxiSum = 0

      const coverage: ValueCoverage = {
        rostered: allRostered.length,
        valued: 0,
        unvaluedIds: [],
        unvaluedStarterIds: [],
      }

      for (const pid of allRostered) {
        const lookup = book.value(pid)
        const value = lookup.value

        // An unknown player is NOT a worthless player. The old code did
        // `if (value <= 0) continue`, which silently dropped anyone the source
        // didn't carry — every K and DEF in a redraft league, for instance —
        // and produced a confident-looking chart built from a partial roster.
        // Record them instead, and let the UI say so.
        if (!lookup.known) {
          coverage.unvaluedIds.push(pid)
          if (starters.has(pid)) coverage.unvaluedStarterIds.push(pid)
        } else {
          coverage.valued++
        }

        if (taxi.has(pid)) {
          taxiSum += value
          continue // taxi never counts toward starter buckets
        }

        if (reserve.has(pid)) {
          continue // reserve (IR) players excluded from all buckets
        }

        // Position: player map first, FantasyCalc fallback (mirrors iOS)
        const rawPos =
          playerMap[pid]?.position ?? book.position(pid) ?? '?'
        const pos = rawPos.toUpperCase()

        const onBench = !starters.has(pid)

        switch (pos) {
          case 'QB':
            if (onBench) {
              bench += value
            } else {
              qb += value
            }
            break
          case 'RB':
            if (onBench) {
              bench += value
            } else {
              rb += value
            }
            break
          case 'WR':
            if (onBench) {
              bench += value
            } else {
              wr += value
            }
            break
          case 'TE':
            if (onBench) {
              bench += value
            } else {
              te += value
            }
            break
          default:
            // FLEX-eligible / unknown → bench regardless of starter status.
            // Mirrors iOS comment: "avoids polluting position axes."
            bench += value
        }
      }

      const owner = roster.owner_id ? userById.get(roster.owner_id) : undefined
      const teamName =
        owner?.metadata?.['team_name'] ??
        owner?.display_name ??
        `Roster #${roster.roster_id}`

      return {
        rosterId: roster.roster_id,
        teamName: teamName as string,
        userId: roster.owner_id ?? '',
        avatarId: owner?.avatar ?? null,
        qbValue: qb,
        rbValue: rb,
        wrValue: wr,
        teValue: te,
        benchValue: bench,
        taxiValue: taxiSum,
        coverage,
      } satisfies TeamAnalysis
    })
  }

  /**
   * League-wide max per axis. Normalizing against these maxes lets the
   * chart render each vertex as a fraction of "best in league."
   * Port of iOS `TeamAnalysisBuilder.axisMaxes(_:)`.
   */
  axisMaxes(teams: TeamAnalysis[]): Record<string, number> {
    const max: Record<string, number> = Object.fromEntries(
      HEX_AXIS_LABELS.map((l) => [l, 0]),
    )
    for (const team of teams) {
      for (const axis of hexAxes(team)) {
        if (axis.value > (max[axis.label] ?? 0)) {
          max[axis.label] = axis.value
        }
      }
    }
    return max
  }

  /**
   * League-wide average per axis, in canonical hex-axis order.
   * Drives the dashed league-average overlay polygon.
   * Port of iOS `TeamAnalysisBuilder.leagueAverageAxes(_:)`.
   */
  leagueAverageAxes(teams: TeamAnalysis[]): HexAxis[] {
    if (teams.length === 0) {
      return HEX_AXIS_LABELS.map((label) => ({ label, value: 0 }))
    }

    const sums: Record<string, number> = Object.fromEntries(
      HEX_AXIS_LABELS.map((l) => [l, 0]),
    )
    for (const team of teams) {
      for (const axis of hexAxes(team)) {
        sums[axis.label] = (sums[axis.label] ?? 0) + axis.value
      }
    }

    return HEX_AXIS_LABELS.map((label) => ({
      label,
      value: Math.round(sums[label] / teams.length),
    }))
  }
}
