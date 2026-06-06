/**
 * DraftOrderProjectionService — web port of iOS DraftOrderProjection.compute.
 *
 * Builds the two-section draft order for the #57 Reverse-HPP rule:
 *
 *   Section 1 — Non-playoff teams, sorted ascending HPP (picks 1..N).
 *     Worst HPP picks first (reward lineup effort; punish tanking).
 *
 *   Section 2 — Playoff teams, parked at the back, ordered by worst finish first.
 *     Finish ordering: 1st (champion) last, runner-up second-to-last, then by
 *     playoff seed descending. Ties broken by leagueRank descending (worse record).
 *
 * Playoff identification: top `playoff_teams` rosters by season record (wins,
 * then PF) are considered playoff teams. When current season standings history
 * is available, `made_playoffs` overrides the derived flag.
 *
 * playoff_week_start: from `league.settings["playoff_week_start"]` (unknown key).
 * Falls back to 15 if missing.
 *
 * This service reads no proposal tables and writes nothing — projection only.
 */

import { Injectable } from '@angular/core'
import { StandingsTeamModel } from '../models/standings.model'
import { seasonHPP } from './highest-possible-calculator'
import { PlayerPointsService } from './player-points.service'

export interface DraftOrderEntry {
  draftPick: number           // overall pick number (1..12)
  rosterId: number
  teamName: string
  userName: string
  record: string              // "W-L"
  pointsFor: number
  hpp: number                 // season HPP (0 if data not available)
  isPlayoff: boolean
  /** Finish rank within the playoff bracket — lower is better. Null for non-playoff. */
  playoffFinish: number | null
  leagueRank: number
}

export interface DraftOrderProjection {
  nonPlayoffOrder: DraftOrderEntry[]  // ascending HPP (pick 1 first)
  playoffOrder: DraftOrderEntry[]     // worst finish first (picks at back of draft)
  regularSeasonLastWeek: number
  hppDataAvailable: boolean           // false if weeklyRosterPoints is empty
}

@Injectable({
  providedIn: 'root',
})
export class DraftOrderProjectionService {
  constructor(private playerPointsService: PlayerPointsService) {}

  /**
   * Compute the full draft order projection.
   *
   * @param standings  - current season standings (already ranked by StandingsService)
   * @param playoffTeams - number of teams that made playoffs (league.settings.playoff_teams)
   * @param rosterPositions - league slot config for HPP calc
   * @param playerPositions - playerId -> position string (from full Sleeper player map)
   * @param regularSeasonLastWeek - last week of the regular season
   * @param playoffFinishMap - optional: rosterId -> playoff finish rank (1=champion, 2=runner-up...)
   *                           If absent, seed-based ordering is used.
   */
  compute(
    standings: StandingsTeamModel[],
    playoffTeams: number,
    rosterPositions: string[],
    playerPositions: Record<string, string>,
    regularSeasonLastWeek: number,
    playoffFinishMap: Map<number, number> = new Map()
  ): DraftOrderProjection {
    const weeklyRosterPoints = this.playerPointsService.weeklyRosterPoints
    const hppDataAvailable = this.playerPointsService.hasData

    // Build entries
    const entries: DraftOrderEntry[] = standings.map((team, idx) => {
      const rosterId = team.roster.roster_id
      const isPlayoff = idx < playoffTeams  // standings are pre-sorted by record+PF

      const hpp = hppDataAvailable
        ? seasonHPP(
            rosterId,
            rosterPositions,
            weeklyRosterPoints,
            playerPositions,
            regularSeasonLastWeek
          )
        : 0

      const playoffFinish = isPlayoff
        ? (playoffFinishMap.get(rosterId) ?? this.seedToFinish(team.leagueRank, playoffTeams))
        : null

      return {
        draftPick: 0,  // assigned below after sort
        rosterId,
        teamName: team.teamName,
        userName: team.userName,
        record: team.getRecord(),
        pointsFor: team.getFpts(),
        hpp,
        isPlayoff,
        playoffFinish,
        leagueRank: team.leagueRank,
      }
    })

    const nonPlayoffEntries = entries.filter(e => !e.isPlayoff)
    const playoffEntries = entries.filter(e => e.isPlayoff)

    // Non-playoff: ascending HPP (lowest HPP picks first)
    nonPlayoffEntries.sort((a, b) => {
      if (a.hpp !== b.hpp) return a.hpp - b.hpp
      return b.leagueRank - a.leagueRank  // worse record earlier
    })

    // Playoff: worst finish first (higher finish number = earlier pick)
    playoffEntries.sort((a, b) => {
      const finishA = a.playoffFinish ?? 999
      const finishB = b.playoffFinish ?? 999
      if (finishA !== finishB) return finishB - finishA  // higher finish number = earlier
      return b.leagueRank - a.leagueRank  // worse record as tiebreak
    })

    // Assign draft picks sequentially
    let pick = 1
    for (const e of nonPlayoffEntries) e.draftPick = pick++
    for (const e of playoffEntries) e.draftPick = pick++

    return {
      nonPlayoffOrder: nonPlayoffEntries,
      playoffOrder: playoffEntries,
      regularSeasonLastWeek,
      hppDataAvailable,
    }
  }

  /**
   * Derive a finish rank from playoff seed when granular bracket data is
   * unavailable. Seed 1 → finish 1 (champion), etc. Accepted fidelity gap.
   */
  private seedToFinish(leagueRank: number, playoffTeams: number): number {
    // In the absence of bracket data, assume seed order = finish order.
    // The champion (seed 1) should finish last in draft pick order.
    return playoffTeams - leagueRank + 1
  }

  /**
   * Derive playoff_week_start from league settings.
   * Sleeper stores it as an unknown key — cast through index signature.
   */
  static getPlayoffWeekStart(leagueSettings: Record<string, unknown>): number {
    const val = leagueSettings['playoff_week_start']
    return typeof val === 'number' ? val : 15
  }

  static getRegularSeasonLastWeek(leagueSettings: Record<string, unknown>): number {
    return DraftOrderProjectionService.getPlayoffWeekStart(leagueSettings) - 1
  }
}
