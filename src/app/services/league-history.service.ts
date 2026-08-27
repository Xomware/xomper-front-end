import { Injectable } from '@angular/core'
import { Observable, forkJoin, of } from 'rxjs'
import { map, switchMap, catchError } from 'rxjs/operators'
import { DraftService } from './draft.service'
import { LeagueService } from './league.service'
import { DraftModel } from '../models/draft.model'
import { DraftPick } from '../models/draft.interface'
import { LeagueModel } from '../models/league.model'
import { User } from '../models/user.interface'
import { Roster } from '../models/roster.interface'
import { Matchup } from '../models/matchup.interface'

type MatchupPair = { teamA: Matchup; teamB: Matchup }

export interface DraftHistoryRecord {
  league_id: string
  draft_id: string
  season: string
  round: number
  pick_no: number
  draft_slot: number
  player_id: string
  player_name: string
  player_position: string
  player_team: string
  picked_by_user_id: string
  picked_by_roster_id: number
  picked_by_username: string
  picked_by_team_name: string
  is_keeper: boolean
}

export interface MatchupHistoryRecord {
  league_id: string
  season: string
  week: number
  matchup_id: number
  team_a_roster_id: number
  team_a_user_id: string
  team_a_username: string
  team_a_team_name: string
  team_a_points: number
  team_b_roster_id: number
  team_b_user_id: string
  team_b_username: string
  team_b_team_name: string
  team_b_points: number
  winner_roster_id: number | null
  is_playoff: boolean
  is_championship: boolean
  team_a_division: number
  team_b_division: number
}

@Injectable({
  providedIn: 'root'
})
export class LeagueHistoryService {

  // Cache
  private draftHistoryCache: Map<string, DraftHistoryRecord[]> = new Map()
  private matchupHistoryCache: Map<string, MatchupHistoryRecord[]> = new Map()

  constructor(
    private draftService: DraftService,
    private leagueService: LeagueService
  ) {}

  // =========================================
  // DRAFT HISTORY
  // =========================================

  /**
   * Load draft history across an entire dynasty league chain, straight from
   * Sleeper. Results are memoised per chain for the session.
   */
  getDraftHistoryFromChain(chain: LeagueModel[]): Observable<DraftHistoryRecord[]> {
    const cacheKey = `draft_chain_${chain[0]?.league_id}`
    if (this.draftHistoryCache.has(cacheKey)) {
      return of(this.draftHistoryCache.get(cacheKey)!)
    }

    if (!chain || chain.length === 0) return of([])

    const leagueIds = chain.map(l => l.league_id)

    // Load drafts+picks AND user/roster context for each league in parallel
    return forkJoin({
      drafts: this.draftService.loadDraftsAndPicksForChain(leagueIds),
      contexts: forkJoin(
        chain.map(l => this.leagueService.loadLeagueContext(l))
      )
    }).pipe(
      map(({ drafts, contexts }) => {
        // Build a lookup: leagueId -> { users, rosters }
        const contextMap = new Map<string, { users: User[], rosters: Roster[] }>()
        contexts.forEach(ctx => {
          contextMap.set(ctx.league.league_id, {
            users: ctx.users,
            rosters: ctx.rosters
          })
        })

        const records: DraftHistoryRecord[] = []

        drafts.forEach(draft => {
          const ctx = contextMap.get(draft.league_id) || { users: [], rosters: [] }

          draft.picks?.forEach(pick => {
            // Resolve user from this season's roster data
            const roster = ctx.rosters.find(r => r.roster_id.toString() === pick.roster_id)
            const user = ctx.users.find(u => u.user_id === (pick.picked_by || roster?.owner_id))

            records.push({
              league_id: draft.league_id,
              draft_id: draft.draft_id,
              season: draft.season,
              round: pick.round,
              pick_no: pick.pick_no,
              draft_slot: pick.draft_slot,
              player_id: pick.player_id,
              player_name: `${pick.metadata?.first_name || ''} ${pick.metadata?.last_name || ''}`.trim(),
              player_position: pick.metadata?.position || '',
              player_team: pick.metadata?.team || '',
              picked_by_user_id: pick.picked_by || roster?.owner_id || '',
              picked_by_roster_id: parseInt(pick.roster_id) || 0,
              picked_by_username: user?.username || '',
              picked_by_team_name: (user?.metadata?.team_name as string) || '',
              is_keeper: pick.is_keeper || false
            })
          })
        })

        // Sort: newest season first, then by pick_no ascending
        records.sort((a, b) => {
          const seasonDiff = parseInt(b.season) - parseInt(a.season)
          if (seasonDiff !== 0) return seasonDiff
          return a.pick_no - b.pick_no
        })

        this.draftHistoryCache.set(cacheKey, records)
        return records
      })
    )
  }

  // =========================================
  // MATCHUP HISTORY (CHAIN - ALL SEASONS)
  // =========================================

  /**
   * Load matchup history across an entire dynasty league chain.
   * For each league: loads context (users/rosters) then fetches all weeks' matchups.
   * Skips pre_draft leagues. Completed leagues fetch all 17 weeks.
   */
  getMatchupHistoryFromChain(chain: LeagueModel[]): Observable<MatchupHistoryRecord[]> {
    const cacheKey = `matchup_chain_${chain[0]?.league_id}`
    if (this.matchupHistoryCache.has(cacheKey)) {
      return of(this.matchupHistoryCache.get(cacheKey)!)
    }

    // Filter out pre-draft leagues (no matchups yet)
    const leaguesWithMatchups = chain.filter(l => l.status !== 'pre_draft')
    if (leaguesWithMatchups.length === 0) return of([])

    // For each league: load context + all weeks
    const perLeague$ = leaguesWithMatchups.map(league =>
      this.leagueService.loadLeagueContext(league).pipe(
        switchMap(ctx => {
          const totalWeeks = 17
          const weekCalls: Observable<{ week: number; pairs: MatchupPair[] }>[] = []

          for (let week = 1; week <= totalWeeks; week++) {
            weekCalls.push(
              this.leagueService.getLeagueMatchups(league.league_id, week).pipe(
                map(pairs => ({ week, pairs })),
                catchError(() => of({ week, pairs: [] }))
              )
            )
          }

          return forkJoin(weekCalls).pipe(
            map(weekResults => this.convertMatchupResults(
              league.league_id, league.season, weekResults, ctx.users, ctx.rosters
            ))
          )
        })
      )
    )

    return forkJoin(perLeague$).pipe(
      map(results => {
        const allRecords = results.flat()
        // Sort: newest season first, then week ascending
        allRecords.sort((a, b) => {
          const seasonDiff = parseInt(b.season) - parseInt(a.season)
          if (seasonDiff !== 0) return seasonDiff
          return a.week - b.week
        })
        this.matchupHistoryCache.set(cacheKey, allRecords)
        return allRecords
      })
    )
  }

  private convertMatchupResults(
    leagueId: string,
    season: string,
    weekResults: { week: number; pairs: MatchupPair[] }[],
    users: User[],
    rosters: Roster[]
  ): MatchupHistoryRecord[] {
    const records: MatchupHistoryRecord[] = []

    weekResults.forEach(({ week, pairs }) => {
      pairs.forEach((pair, idx) => {
        // Guard against undefined teamB (bye week)
        if (!pair.teamA || !pair.teamB) return

        const rosterA = rosters.find(r => r.roster_id === pair.teamA.roster_id)
        const rosterB = rosters.find(r => r.roster_id === pair.teamB.roster_id)
        const userA = users.find(u => u.user_id === rosterA?.owner_id)
        const userB = users.find(u => u.user_id === rosterB?.owner_id)

        const pointsA = pair.teamA.points || 0
        const pointsB = pair.teamB.points || 0
        const winnerId = pointsA > pointsB
          ? pair.teamA.roster_id
          : pointsB > pointsA
            ? pair.teamB.roster_id
            : null

        records.push({
          league_id: leagueId,
          season,
          week,
          matchup_id: pair.teamA.matchup_id || idx + 1,
          team_a_roster_id: pair.teamA.roster_id,
          team_a_user_id: userA?.user_id || '',
          team_a_username: userA?.username || '',
          team_a_team_name: (userA?.metadata?.team_name as string) || userA?.display_name || '',
          team_a_points: pointsA,
          team_b_roster_id: pair.teamB.roster_id,
          team_b_user_id: userB?.user_id || '',
          team_b_username: userB?.username || '',
          team_b_team_name: (userB?.metadata?.team_name as string) || userB?.display_name || '',
          team_b_points: pointsB,
          winner_roster_id: winnerId,
          is_playoff: week > 14,
          is_championship: week === 16 || week === 17,
          team_a_division: rosterA?.settings?.division ?? 0,
          team_b_division: rosterB?.settings?.division ?? 0
        })
      })
    })

    return records
  }

  // =========================================
  // MATCHUP HISTORY (SINGLE LEAGUE)
  // =========================================

  /**
   * Get matchup history for a league/season
   */
  clearCache(): void {
    this.draftHistoryCache.clear()
    this.matchupHistoryCache.clear()
  }

  /**
   * Get available seasons for a league
   */
}
