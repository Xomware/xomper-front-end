import { Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable, EMPTY, map, of, forkJoin, switchMap } from 'rxjs'
import { expand, reduce, tap } from 'rxjs/operators'
import { Roster } from '../models/roster.interface'
import { League } from '../models/league.interface'
import { LeagueModel } from '../models/league.model'
import { RosterModel } from '../models/roster.model'
import { UserModel } from '../models/user.model'
import { StandingsTeamModel } from '../models/standings.model'
import { User } from '../models/user.interface'
import { LeagueConfig } from '../models/league-config.interface'
import { Matchup } from '../models/matchup.interface'
import { NflStateModel } from '../models/nfl-state.model'
import { NflState } from '../models/nfl-state.interface'
import { PlayoffBracketMatch } from '../models/playoff-bracket.interface'
import { environment } from 'src/environments/environment'
import { getCurrentSeason } from '../constants/season'
import { StandingsService } from './standings.service'
import { UserService } from './user.service'
import { TeamService } from './team.service'

export interface Transaction {
  type: string
  status: string
  transaction_id: string
  roster_ids: number[]
  adds: Record<string, number> | null
  drops: Record<string, number> | null
  created: number
  [key: string]: unknown
}

export interface TradedPick {
  season: string
  round: number
  roster_id: number
  previous_owner_id: number
  owner_id: number
  [key: string]: unknown
}

@Injectable({
  providedIn: 'root',
})
export class LeagueService {
  private myLeague: LeagueModel | null = null
  private currentLeague: LeagueModel | null = null
  private leagueState: NflStateModel | null = null
  private leagueChainCache: LeagueModel[] | null = null

  private baseUrl = 'https://api.sleeper.app/v1'

  // Whitelisted league from environment
  private whitelistedLeagueId = environment.myLeagueId
  private whitelistedLeagueName = environment.myLeagueName

  private leagueMap: Record<string, LeagueConfig> = {
    'clt-dynasty': {
      id: this.whitelistedLeagueId,
      display_name: this.whitelistedLeagueName,
      dynasty: true,
      divisions: 3,
      size: 12,
      taxi: true,
    },
  }

  constructor(
    private http: HttpClient,
    private standingsService: StandingsService,
    private userService: UserService,
    private teamService: TeamService,
  ) {}

  // =========================================
  // API CALLS
  // =========================================

  searchLeague(leagueId: string): Observable<LeagueModel> {
    return this.http
      .get<League>(`${this.baseUrl}/league/${leagueId}`)
      .pipe(map((l) => new LeagueModel(l)))
  }

  findLeagueUsers(leagueId: string): Observable<User[]> {
    return this.http.get<User[]>(`${this.baseUrl}/league/${leagueId}/users`)
  }

  findLeagueRosters(leagueId: string): Observable<Roster[]> {
    return this.http.get<Roster[]>(`${this.baseUrl}/league/${leagueId}/rosters`)
  }

  findUserLeagues(
    season?: string,
    userId?: string,
  ): Observable<LeagueModel[]> {
    if (!userId) throw new Error('User ID required to fetch leagues')
    const effectiveSeason = season || getCurrentSeason()
    return this.http
      .get<League[]>(`${this.baseUrl}/user/${userId}/leagues/nfl/${effectiveSeason}`)
      .pipe(map((leagues) => leagues.map((l) => new LeagueModel(l))))
  }

  getLeagueMatchups(
    leagueId: string,
    week: number,
  ): Observable<{ teamA: Matchup; teamB: Matchup }[]> {
    return this.http
      .get<Matchup[]>(`${this.baseUrl}/league/${leagueId}/matchups/${week}`)
      .pipe(
        map((matchups) => {
          const grouped: Record<number, Matchup[]> = {}
          matchups.forEach((m) => {
            if (!grouped[m.matchup_id]) {
              grouped[m.matchup_id] = []
            }
            grouped[m.matchup_id].push(m)
          })

          return Object.values(grouped).map((pair) => ({
            teamA: pair[0],
            teamB: pair[1],
          }))
        }),
      )
  }

  getLeagueState(): Observable<NflStateModel> {
    return this.http
      .get<NflState>(`${this.baseUrl}/state/nfl`)
      .pipe(map((state) => new NflStateModel(state)))
  }

  getLeagueTransactions(leagueId: string, week: number): Observable<Transaction[]> {
    return this.http.get<Transaction[]>(
      `${this.baseUrl}/league/${leagueId}/transactions/${week}`,
    )
  }

  getTradedPicks(leagueId: string): Observable<TradedPick[]> {
    return this.http.get<TradedPick[]>(
      `${this.baseUrl}/league/${leagueId}/traded_picks`,
    )
  }

  getWinnersBracket(leagueId: string): Observable<PlayoffBracketMatch[]> {
    return this.http.get<PlayoffBracketMatch[]>(
      `${this.baseUrl}/league/${leagueId}/winners_bracket`,
    )
  }

  getLosersBracket(leagueId: string): Observable<PlayoffBracketMatch[]> {
    return this.http.get<PlayoffBracketMatch[]>(
      `${this.baseUrl}/league/${leagueId}/losers_bracket`,
    )
  }

  // =========================================
  // WHITELISTED LEAGUE
  // =========================================

  getWhitelistedLeagueId(): string {
    return this.whitelistedLeagueId
  }

  getWhitelistedLeagueName(): string {
    return this.whitelistedLeagueName
  }

  isWhitelistedLeague(leagueId: string): boolean {
    return leagueId === this.whitelistedLeagueId
  }

  loadWhitelistedLeague(): Observable<LeagueModel> {
    return this.searchLeague(this.whitelistedLeagueId)
  }

  // =========================================
  // LEAGUE STATE
  // =========================================

  setMyLeague(league: LeagueModel): void {
    this.myLeague =
      league instanceof LeagueModel ? league : new LeagueModel(league)
  }

  getMyLeague(): LeagueModel | null {
    return this.myLeague
  }

  setCurrentLeague(league: LeagueModel): void {
    this.currentLeague =
      league instanceof LeagueModel ? league : new LeagueModel(league)
  }

  getCurrentLeague(): LeagueModel | null {
    return this.currentLeague
  }

  myLeagueSelected(): boolean {
    return !!this.myLeague
  }

  currentLeagueSelected(): boolean {
    return !!this.currentLeague
  }

  setNflState(state: NflStateModel): void {
    this.leagueState = state
  }

  getNflState(): NflStateModel | null {
    return this.leagueState
  }

  reset(): void {
    this.myLeague = null
    this.currentLeague = null
    this.leagueState = null
    this.leagueChainCache = null
  }

  // =========================================
  // HOME LEAGUE BOOTSTRAP
  // =========================================

  /**
   * Idempotent bootstrap of the home (whitelisted) league.
   * Returns immediately if myLeague is already fully loaded (has rosters).
   * Otherwise fetches league → users → rosters → builds standings, then
   * sets myLeague, myTeam. Single emission.
   */
  loadMyLeague(): Observable<LeagueModel> {
    if (this.myLeague && this.myLeague.getRosters().length > 0) {
      return of(this.myLeague)
    }

    return this.searchLeague(this.whitelistedLeagueId).pipe(
      switchMap((league) => {
        league.setDivisions()
        return forkJoin({
          users: this.findLeagueUsers(league.league_id),
          rosters: this.findLeagueRosters(league.league_id),
        }).pipe(
          map(({ users, rosters }) => {
            const userModels = users.map((u) => new UserModel(u))
            league.setUsers(userModels)

            const rosterModels = rosters.map((r) => new RosterModel(r))
            league.setRosters(rosterModels)

            const taxiIds = rosterModels.reduce(
              (acc: string[], r) => acc.concat(r.taxi || []),
              [],
            )
            league.setTaxiSquadIds(taxiIds)

            const standings = this.buildStandingsForLeague(rosterModels, userModels, league)
            const sortedStandings = this.standingsService.buildStandings(standings)
            league.setStandingsTeams(sortedStandings)

            this.setMyLeague(league)

            const myUserName = this.userService.getMyUser()?.getUserName()
            const myTeam = sortedStandings.find((t) => t.userName === myUserName)
            if (myTeam) this.teamService.setMyTeam(myTeam)

            return league
          }),
        )
      }),
    )
  }

  private buildStandingsForLeague(
    rosters: RosterModel[],
    users: UserModel[],
    league: LeagueModel,
  ): StandingsTeamModel[] {
    return rosters.map((roster) => {
      const user = users.find((u) => u.user_id === roster.owner_id)

      let streakTotal = 0
      let streakType: '' | 'win' | 'loss' = ''
      const streakStr = roster.metadata?.streak as string | undefined
      if (streakStr) {
        const match = streakStr.match(/(\d+)([WL])/)
        if (match) {
          streakTotal = parseInt(match[1], 10)
          streakType = match[2] === 'W' ? 'win' : 'loss'
        }
      }

      const divisionIndex =
        roster.settings?.division != null ? `division_${roster.settings.division}` : null
      const divisionName = divisionIndex
        ? String(league.metadata?.[divisionIndex] ?? 'Unknown Division')
        : 'Unknown Division'
      const divisionAvatar = divisionIndex
        ? String(league.metadata?.[`${divisionIndex}_avatar`] ?? 'assets/img/nfl.png')
        : 'assets/img/nfl.png'

      return new StandingsTeamModel({
        roster,
        players: [],
        user: new UserModel(user!),
        league,
        teamName: (user?.metadata?.team_name as string) || `${user?.display_name}'s Team`,
        userName: user?.display_name || 'Unknown User',
        avatar: user?.avatar ? this.userService.buildAvatar(user.avatar) : 'assets/img/nfl.png',
        wins: roster.settings?.wins ?? 0,
        losses: roster.settings?.losses ?? 0,
        fpts: (roster.settings?.fpts ?? 0) + (roster.settings?.fpts_decimal ?? 0) / 100,
        fptsAgainst:
          (roster.settings?.fpts_against ?? 0) +
          (roster.settings?.fpts_against_decimal ?? 0) / 100,
        streak: { type: streakType, total: streakTotal },
        divisionName,
        divisionAvatar,
        leagueRank: -1,
        divisionRank: -1,
      })
    })
  }

  // =========================================
  // LEAGUE CHAIN (DYNASTY HISTORY)
  // =========================================

  getLeagueChain(leagueId: string): Observable<LeagueModel[]> {
    if (this.leagueChainCache) {
      return of(this.leagueChainCache)
    }

    return this.searchLeague(leagueId).pipe(
      expand(league =>
        league.previous_league_id
          ? this.searchLeague(league.previous_league_id)
          : EMPTY
      ),
      reduce((acc: LeagueModel[], league: LeagueModel) => {
        acc.push(league)
        return acc
      }, []),
      tap(chain => this.leagueChainCache = chain)
    )
  }

  loadLeagueContext(league: LeagueModel): Observable<{
    league: LeagueModel
    users: User[]
    rosters: Roster[]
  }> {
    return forkJoin({
      users: this.findLeagueUsers(league.league_id),
      rosters: this.findLeagueRosters(league.league_id)
    }).pipe(
      map(({ users, rosters }) => ({ league, users, rosters }))
    )
  }

  // =========================================
  // LEAGUE MAP
  // =========================================

  getAllowedLeagueId(leagueName: string): string | null {
    return this.leagueMap[leagueName]?.id ?? null
  }

  getAllowedLeagues(): string[] {
    return Object.keys(this.leagueMap)
  }

  getLeagueMap(): Record<string, LeagueConfig> {
    return this.leagueMap
  }

  getLeagueConfig(leagueId: string): LeagueConfig | null {
    return (
      Object.values(this.leagueMap).find((config) => config.id === leagueId) ||
      null
    )
  }
}
