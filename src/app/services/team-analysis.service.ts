import { Injectable } from '@angular/core'
import { forkJoin, map, Observable, switchMap } from 'rxjs'
import { Roster } from '../models/roster.interface'
import { User } from '../models/user.interface'
import { HexAxis, HEX_AXIS_LABELS, TeamAnalysis, hexAxes } from '../models/team-analysis.model'
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
   * Load rosters + users for the home league, then build analyses.
   * Triggers a FantasyCalc values load if not yet cached.
   */
  buildForHomeLeague(): Observable<TeamAnalysis[]> {
    const leagueId = this.leagueService.getWhitelistedLeagueId()

    return forkJoin([
      this.leagueService.findLeagueRosters(leagueId),
      this.leagueService.findLeagueUsers(leagueId),
      this.valuesService.load(),
    ]).pipe(
      switchMap(([rosters, users, _values]) =>
        this.playerService
          .getPlayerMap()
          .pipe(map((playerMap) => this.build(rosters, users, playerMap))),
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

      for (const pid of allRostered) {
        const value = this.valuesService.value(pid)
        if (value <= 0) continue

        if (taxi.has(pid)) {
          taxiSum += value
          continue // taxi never counts toward starter buckets
        }

        // Position: player map first, FantasyCalc fallback (mirrors iOS)
        const rawPos =
          playerMap[pid]?.position ?? this.valuesService.position(pid) ?? '?'
        const pos = rawPos.toUpperCase()

        const onBench = !starters.has(pid) && !reserve.has(pid)

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
