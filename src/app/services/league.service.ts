import { Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable, EMPTY, map, of, forkJoin, switchMap, throwError } from 'rxjs'
import { expand, reduce, tap, catchError } from 'rxjs/operators'
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
import { LeagueFollowsService } from './league-follows.service'
import { getCurrentSeason } from '../constants/season'

/** How many league members to ask about the new season before giving up. */
const SUCCESSOR_PROBE_USERS = 3
/** Hard cap on chain walking, so a malformed chain can never loop forever. */
const MAX_CHAIN_DEPTH = 8
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

  /** anchor league id -> current-season league id. Stable within a session. */
  private resolvedLeagueIds = new Map<string, string>()

  constructor(
    private http: HttpClient,
    private standingsService: StandingsService,
    private userService: UserService,
    private teamService: TeamService,
    private follows: LeagueFollowsService,
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

  /**
   * The league the app should act on when no explicit id is supplied.
   *
   * Replaces `getWhitelistedLeagueId()`, which returned a build-time constant
   * and made every surface single-league by construction. Resolution order:
   *
   *   1. a league explicitly opened this session (guest browsing, search)
   *   2. the league the signed-in user has selected in the switcher
   *   3. an already-loaded league
   *
   * The switcher sits above `getMyLeague()` deliberately: `myLeague` is
   * whatever was loaded first, so without this a user who switched leagues
   * would keep seeing the old one on any surface that asks for "the" league.
   *
   * Null when the user is in no leagues. There is deliberately no build-time
   * default: it could only ever fire for a user with nothing of their own,
   * and it handed them the Charlotte Dynasty League -- a stranger's league
   * presented as theirs. Every caller already handles null.
   */
  getActiveLeagueId(): string | null {
    return (
      this.getCurrentLeague()?.league_id ??
      this.follows.selectedLeagueId ??
      this.getMyLeague()?.league_id ??
      null
    )
  }

  /** Load the active league, or error if there isn't one. */
  loadActiveLeague(): Observable<LeagueModel> {
    const leagueId = this.getActiveLeagueId()
    if (!leagueId) {
      return throwError(() => new Error('No league selected'))
    }
    // Resolve forward first, so a configured id from a finished season does
    // not quietly serve last year's standings.
    return this.resolveCurrentLeagueId(leagueId).pipe(
      switchMap((resolved) => this.searchLeague(resolved)),
    )
  }

  // =========================================
  // SEASON ROLLOVER
  // =========================================

  /**
   * Resolve the current season's league id from a stable anchor.
   *
   * Sleeper mints a brand new `league_id` every season. It exposes
   * `previous_league_id` but **no forward pointer**, so you can walk a chain
   * backwards and never forwards. The practical consequence is that any
   * hardcoded id silently starts serving a completed season the moment the
   * new one is created — the app keeps working, it just shows last year.
   *
   * Since forward traversal is impossible, the successor is discovered
   * sideways: league members carry over in a dynasty league, so listing a
   * member's leagues for the current season surfaces the new one. The
   * candidate is then verified by walking ITS chain back to the anchor, so a
   * member's unrelated leagues can never be mistaken for this one.
   *
   * Never throws and never returns empty: any failure falls back to the anchor,
   * because a stale league is still far better than a broken app.
   */
  resolveCurrentLeagueId(anchorLeagueId: string): Observable<string> {
    const cached = this.resolvedLeagueIds.get(anchorLeagueId)
    if (cached) return of(cached)

    return this.getLeagueState().pipe(
      map((state) => state?.season || getCurrentSeason()),
      catchError(() => of(getCurrentSeason())),
      switchMap((season) =>
        this.searchLeague(anchorLeagueId).pipe(
          switchMap((anchor) =>
            anchor.season === season
              ? of(anchorLeagueId)
              : this.findSuccessor(anchorLeagueId, season),
          ),
        ),
      ),
      tap((resolved) => this.resolvedLeagueIds.set(anchorLeagueId, resolved)),
      catchError(() => of(anchorLeagueId)),
    )
  }

  /** Forget resolved ids. Used when a new season may have started mid-session. */
  clearResolvedLeagues(): void {
    this.resolvedLeagueIds.clear()
  }

  private findSuccessor(anchorId: string, season: string): Observable<string> {
    return this.findLeagueUsers(anchorId).pipe(
      switchMap((users) => {
        // A few members, not one: any single owner may have left the league.
        const userIds = users
          .map((u) => u.user_id)
          .filter((id): id is string => !!id)
          .slice(0, SUCCESSOR_PROBE_USERS)

        if (userIds.length === 0) return of(anchorId)

        return forkJoin<LeagueModel[][]>(
          userIds.map((id) =>
            this.findUserLeagues(season, id).pipe(
              catchError(() => of([] as LeagueModel[])),
            ),
          ),
        ).pipe(
          switchMap((lists) => {
            const candidates = new Map<string, LeagueModel>()
            for (const league of lists.flat()) {
              if (league?.league_id) candidates.set(league.league_id, league)
            }
            if (candidates.size === 0) return of(anchorId)

            // The overwhelmingly common case is a one-season gap, which needs
            // no extra requests at all.
            for (const league of candidates.values()) {
              if (league.previous_league_id === anchorId) return of(league.league_id)
            }

            // Otherwise verify each candidate by walking its chain back.
            return this.firstChainedTo(anchorId, [...candidates.values()])
          }),
        )
      }),
      catchError(() => of(anchorId)),
    )
  }

  /** First candidate whose `previous_league_id` chain reaches the anchor. */
  private firstChainedTo(
    anchorId: string,
    candidates: LeagueModel[],
  ): Observable<string> {
    if (candidates.length === 0) return of(anchorId)

    return forkJoin<Array<string | null>>(
      candidates.map((league) =>
        this.chainReaches(anchorId, league.previous_league_id, 0).pipe(
          map((reached) => (reached ? league.league_id : null)),
          catchError(() => of(null)),
        ),
      ),
    ).pipe(map((results) => results.find((id): id is string => !!id) ?? anchorId))
  }

  private chainReaches(
    anchorId: string,
    previousId: string | null,
    depth: number,
  ): Observable<boolean> {
    if (!previousId || depth >= MAX_CHAIN_DEPTH) return of(false)
    if (previousId === anchorId) return of(true)
    return this.searchLeague(previousId).pipe(
      switchMap((league) =>
        this.chainReaches(anchorId, league.previous_league_id, depth + 1),
      ),
      catchError(() => of(false)),
    )
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

  /**
   * Drop everything scoped to one league.
   *
   * Called when the user switches leagues. Every one of these is keyed to the
   * league that was loaded, so leaving any behind shows the previous league's
   * rosters, chain or standings under the new league's name.
   *
   * `resolvedLeagueIds` goes too: it maps an anchor id to the current
   * season's id, and the new league has its own anchor.
   */
  clearForLeagueSwitch(): void {
    this.reset()
    this.resolvedLeagueIds.clear()
    this.teamService.reset()
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

    return this.loadActiveLeague().pipe(
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

}
