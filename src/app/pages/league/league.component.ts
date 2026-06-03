import { Component, Input, OnInit, OnDestroy } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { forkJoin, Subscription, switchMap, take } from 'rxjs'
import { LeagueService } from 'src/app/services/league.service'
import {
  LeagueHistoryService,
  MatchupHistoryRecord,
  WorldCupDivision,
} from 'src/app/services/league-history.service'
import { RulesService, RuleProposal } from 'src/app/services/rules.service'
import { EmailService } from 'src/app/services/email.service'
import { StandingsService } from 'src/app/services/standings.service'
import { ToastService } from 'src/app/services/toast.service'
import { TeamService } from 'src/app/services/team.service'
import { UserService } from 'src/app/services/user.service'
import { SupabaseService } from 'src/app/services/supabase.service'
import { UserModel } from 'src/app/models/user.model'
import { LeagueModel } from 'src/app/models/league.model'
import { RosterModel } from 'src/app/models/roster.model'
import { StandingsTeamModel } from 'src/app/models/standings.model'
import { MatchupDetailInput } from 'src/app/models/matchup-detail-input.interface'
import { PlayoffBracketMatch } from 'src/app/models/playoff-bracket.interface'
import { LoaderComponent } from '../../components/loader/loader.component';
import { NgClass, NgIf, NgFor, KeyValuePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatchupModalComponent } from '../../components/matchup-modal/matchup-modal.component';

@Component({
    selector: 'app-league',
    templateUrl: './league.component.html',
    styleUrls: ['./league.component.scss'],
    standalone: true,
    imports: [
        LoaderComponent,
        NgClass,
        NgIf,
        NgFor,
        FormsModule,
        MatchupModalComponent,
        KeyValuePipe,
    ],
})
export class LeagueComponent implements OnInit, OnDestroy {
  @Input() mode: 'my' | 'selected' = 'selected'
  viewMode: 'league' | 'division' = 'league' // default to full league
  private queryParamsSub?: Subscription
  league!: LeagueModel
  leaguePicture = ''
  leagueName = ''
  leagueId = ''
  leaguePlayoffTeams: number = 0
  leagueUsers: UserModel[] = []
  leagueRosters: RosterModel[] = []
  standings: StandingsTeamModel[] = []
  standingsByDivision: Record<string, StandingsTeamModel[]> = {}
  loading = false
  activeTab: 'standings' | 'matchups' | 'playoffs' | 'worldcup' | 'rules' =
    'standings'
  // Matchup History (scores)
  allMatchups: MatchupHistoryRecord[] = []
  availableSeasons: string[] = []
  selectedSeason = ''
  weeklyMatchups: { week: number; matchups: MatchupHistoryRecord[] }[] = []
  selectedHistoryWeek: number | null = null
  matchupHistoryLoaded = false

  selectedMatchupDetail: MatchupDetailInput | null = null
  modalStart!: {
    top: number
    left: number
    width: number
    height: number
  } | null

  leagueTaxiSquadIds: string[] = []

  // Playoffs bracket
  winnersBracket: PlayoffBracketMatch[] = []
  losersBracket: PlayoffBracketMatch[] = []
  bracketRounds: { round: number; matches: PlayoffBracketMatch[] }[] = []
  loserRounds: { round: number; matches: PlayoffBracketMatch[] }[] = []
  playoffsLoaded = false

  // World Cup
  worldCupDivisions: WorldCupDivision[] = []
  worldCupLoaded = false
  worldCupSeasons: string[] = []
  wcGridColumns = '40px 2fr 0.6fr 0.6fr 1fr 1fr'

  // Rules
  rulesLoaded = false
  scoringCategories: {
    name: string
    settings: { key: string; label: string; value: number }[]
  }[] = []
  rosterSlots: { position: string; count: number }[] = []
  proposals: RuleProposal[] = []
  proposalFilter: 'all' | 'open' | 'approved' | 'rejected' = 'all'
  showProposalForm = false
  proposalTitle = ''
  proposalDescription = ''
  submittingProposal = false
  expandedRuleSections: Set<number> = new Set()
  recentlyStamped: Set<string> = new Set()

  // Approval threshold: 2/3 vote of league size
  get approvalThreshold(): number {
    return Math.ceil(((this.league?.total_rosters || 12) * 2) / 3)
  }
  get denialThreshold(): number {
    return (this.league?.total_rosters || 12) - this.approvalThreshold + 1
  }

  static readonly LEAGUE_RULES: { title: string; content: string }[] = [
    {
      title: '1. League Setup',
      content: `<strong>A. Divisions</strong><br>Three divisions of 4. Divisions are set for four years then reset based on standings in the fourth year regular season.<br><br><em>Division realignment by finish:</em><br>ACC: #1 (Winner), #6, #7, #12 (Last)<br>SEC: #2, #5, #8, #11<br>Big 10: #3, #4, #9, #10<br><br><strong>World Cup Tournament</strong><br>Every four years there is a season-long in-season tournament. Top 2 teams from each division over the first 3 years compete in a 6-team tournament during the 4th year. Only intra-divisional games count. Tiebreaker: overall record, then H2H, then total points.<br><br><em>Rounds:</em><br>Round 1: Total points weeks 3-6. Top 4 advance.<br>Round 2: #1 vs #4, #2 vs #3. Aggregate points weeks 7-10.<br>Round 3: Winners aggregate points weeks 11-14.<br><br><strong>B. Fantasy Host Site</strong> &mdash; Sleeper.app`,
    },
    {
      title: '2. Schedule & Season Format',
      content: `<strong>A. Regular Season</strong><br>Week 14 is the last week of the regular season.<br><br><strong>B. Playoffs</strong><br>Playoffs begin Week 15 and end Week 17 (1-week matchups). In a tie, the higher seed wins. 6 teams make the playoffs: top team from each division seeded 1-3, plus 3 wild card spots. Overall record determines standings; tiebreaker is total points for.<br><br>No consolation games or 3rd place match. Eliminated teams are ranked by seed at time of elimination.<br><br><strong>C. Offseason</strong><br>No free agency adds during offseason &mdash; only via Rookie/FA draft. Trading of players and picks is allowed. Roster cuts due by midnight the Sunday after NFL preseason concludes.`,
    },
    {
      title: '3. Roster Rules, Trading & Add/Drops',
      content: `<strong>A. Roster Sizes</strong> &mdash; 26 active + 4 taxi + 8 IR<br><br><strong>B. Starting Requirements</strong><br>1 QB, 2 RB, 2 WR, 1 TE, 2 FLEX (RB/WR/TE), 1 SUPERFLEX (QB/RB/WR/TE)<br><br>No purposely starting bye/injured/inactive players to tank. Active players must be used. $5 penalty for playing an inactive player while tanking (goes to winner's pot).<br><br><strong>C. Taxi Squad Steals</strong><br>Teams can steal another team's taxi player with draft pick compensation:<br><table class="rules-table"><tr><th>Round Taken</th><th>Minimum Cost</th></tr><tr><td>1st</td><td>1st + 2nd round pick</td></tr><tr><td>2nd</td><td>1st round pick</td></tr><tr><td>3rd</td><td>2nd round pick</td></tr><tr><td>4th</td><td>3rd round pick</td></tr><tr><td>5th</td><td>4th round pick</td></tr><tr><td>Undrafted</td><td>5th round pick</td></tr></table><br>Owner can promote the taxi player before Thursday 12pm EST to nullify the steal.<br><br><strong>D. Injured Reserve</strong> &mdash; 8 IR slots per team.<br><br><strong>E. Trading</strong><br>Trades can be uneven. Rosters must be adjusted to 26 active immediately. Vetoes require unanimous vote with evidence of collusion. Picks up to 2 years out can be traded.<br><br><strong>F. Trade Deadline</strong> &mdash; 2 weeks after NFL trade deadline (Tuesday after Week 10 at noon).<br><br><strong>G. Add/Drops</strong> &mdash; Deadline at conclusion of regular season. No adds once the first game of the week starts.<br><br><strong>H. Roster Cuts</strong> &mdash; By midnight Sunday after NFL preseason. Max: 26 active + 4 taxi + 8 IR = 38 total.<br><br><strong>I. Waivers</strong> &mdash; Dropped players clear waivers by Wednesday morning. Waiver order does not reset; claiming moves you to the back.`,
    },
    {
      title: '4. Scoring',
      content: `<strong>QB, RB, WR, TE Scoring:</strong><br><table class="rules-table"><tr><th>Event</th><th>Points</th></tr><tr><td>Passing TD</td><td>4 pts</td></tr><tr><td>Passing Yards</td><td>1 per 25 yds (0.04/yd)</td></tr><tr><td>Interception Thrown</td><td>-2 pts</td></tr><tr><td>Pass 2PT Conversion</td><td>2 pts</td></tr><tr><td>Rushing TD</td><td>6 pts</td></tr><tr><td>Rushing Yards</td><td>1 per 10 yds (0.1/yd)</td></tr><tr><td>Rush 2PT Conversion</td><td>2 pts</td></tr><tr><td>Receiving TD</td><td>6 pts</td></tr><tr><td>Receiving Yards</td><td>1 per 10 yds (0.1/yd)</td></tr><tr><td>Receptions (PPR)</td><td>1 pt (TE: 1.5 pts)</td></tr><tr><td>Rec 2PT Conversion</td><td>2 pts</td></tr><tr><td>Punt/Kick Return TD</td><td>6 pts</td></tr><tr><td>Fumble Lost</td><td>-2 pts</td></tr></table>`,
    },
    {
      title: '5. Draft Information',
      content: `<strong>A. Startup Draft</strong> &mdash; Snake draft, order randomized.<br><br><strong>B. Rookie Draft</strong><br>Not a snake draft. Last place gets 1.01, 2.01, 3.01, 4.01, 5.01. Picks are tradeable. Any free agents not added before the championship add/drop deadline are also eligible.<br><br><strong>C. Draft Order</strong><br>Non-playoff teams: determined by overall record.<br>Playoff teams: determined by playoff performance. Eliminated teams with worse seeds get better picks.`,
    },
    {
      title: '6. Dues & Payouts',
      content: `<strong>A. Dues</strong> &mdash; $100 per season.<br><br><strong>B. Payout Structure:</strong><br><table class="rules-table"><tr><th>Award</th><th>Payout</th></tr><tr><td>Champion</td><td>$600</td></tr><tr><td>2nd Place</td><td>$200</td></tr><tr><td>3rd Place</td><td>$80</td></tr><tr><td>4th Place</td><td>$80</td></tr><tr><td>Highest Weekly Score (x14)</td><td>$10 each</td></tr><tr><td>World Cup Winner (every 4 yrs)</td><td>$400</td></tr></table><br>MVP awards for positional leaders (player must have been started that week to count).`,
    },
    {
      title: '7. Rule Changes',
      content: `<strong>2/3 Vote Required</strong><br>Rule change voting occurs in the offseason. At least 8 owners (of 12) must vote in favor for a rule change to become permanent.<br><br>A <strong>100% unanimous vote</strong> can enact a rule effective immediately.`,
    },
  ]

  constructor(
    private leagueService: LeagueService,
    private leagueHistoryService: LeagueHistoryService,
    private rulesService: RulesService,
    private emailService: EmailService,
    private router: Router,
    private toastService: ToastService,
    private standingsService: StandingsService,
    private teamService: TeamService,
    private userService: UserService,
    private supabaseService: SupabaseService,
    private route: ActivatedRoute,
  ) {}

  get currentUserId(): string | undefined {
    return this.supabaseService.getUser()?.id
  }

  ngOnInit(): void {
    this.loading = true

    // If mode is 'my', just use myLeague (already set at login)
    if (this.mode === 'my') {
      const myLeague = this.leagueService.getMyLeague()
      if (!myLeague) {
        this.loading = false
        return
      }
      this.league = myLeague
      this.setupLeague()
      // Watch for tab query param changes (e.g., from toolbar dropdown navigation)
      this.queryParamsSub = this.route.queryParams.subscribe((params) => {
        const tab = params['tab']
        if (
          tab &&
          ['standings', 'matchups', 'playoffs', 'worldcup', 'rules'].includes(
            tab,
          )
        ) {
          this.setTab(tab)
        }
      })
      this.loading = false
    } else {
      // Mode is 'other' / currentLeague
      this.route.queryParams.pipe(take(1)).subscribe((params) => {
        const queryLeagueId = params['leagueId']
        this.viewMode = params['view']


        const currentLeague = this.leagueService.getCurrentLeague()

        // Only fetch if we don't already have it or ID differs
        if (!currentLeague || currentLeague.league_id !== queryLeagueId) {
          this.leagueService.searchLeague(queryLeagueId)
            .pipe(take(1))
            .subscribe({
              next: (league) => {
                this.leagueService.setCurrentLeague(league)
                this.league = this.leagueService.getCurrentLeague()!
                this.toastService.showPositiveToast('League Loaded.')
                this.setupLeague()
              },
              error: () => {
                this.toastService.showNegativeToast('Error loading league.')
              },
              complete: () => {
                this.loading = false
              },
            })
        } else {
          // Already have the league, no need to fetch
          this.league = currentLeague
          this.setupLeague()
          this.loading = false
        }
      })
    }
  }

  private setupLeague(): void {
    this.leaguePicture = this.league.getProfilePicture()
    this.leagueName = this.league.getDisplayName()
    this.leagueId = this.league.getId()
    this.leagueUsers = this.league.getUsers()
    this.leaguePlayoffTeams = this.league.getPlayoffTeams()
    this.league.setDivisions()
    this.getLeagueUsers()
  }
  getLeagueUsers(): void {
    this.loading = true
    this.leagueService.findLeagueUsers(this.leagueId)
      .pipe(take(1))
      .subscribe({
        next: (users) => {
          const userModels = users.map((user) => new UserModel(user))
          this.league.setUsers(userModels)
          if (this.mode == 'my') {
            this.leagueService.setMyLeague(this.league)
          } else {
            this.leagueService.setCurrentLeague(this.league)
          }
          this.leagueUsers = this.league.getUsers()
          //this.toastService.showPositiveToast("Users Found.")
          this.getLeagueRosters()
        },
        error: (err) => {
          this.toastService.showNegativeToast('Error Finding League Users.')
          this.loading = false
        },
        complete: () => {
          this.loading = false
        },
      })
  }
  getLeagueRosters(): void {
    this.loading = true
    this.leagueService.findLeagueRosters(this.leagueId)
      .pipe(take(1))
      .subscribe({
        next: (rosters) => {
          const rosterModels = rosters.map((roster) => new RosterModel(roster))
          this.league.setRosters(rosterModels)
          if (this.mode == 'my') {
            this.leagueService.setMyLeague(this.league)
          } else {
            this.leagueService.setCurrentLeague(this.league)
          }
          this.leagueRosters = this.league.getRosters()

          this.leagueTaxiSquadIds = this.leagueRosters.reduce(
            (acc: string[], roster) => acc.concat(roster.taxi || []),
            [],
          )
          this.league.setTaxiSquadIds(this.leagueTaxiSquadIds)
          if (this.mode == 'my') {
            this.leagueService.setMyLeague(this.league)
          } else {
            this.leagueService.setCurrentLeague(this.league)
          }

          // Build standings view model
          this.standings = this.leagueRosters.map((roster) => {
            // Find the user object from leagueUsers
            const user = this.leagueUsers.find(
              (u) => u.user_id === roster.owner_id,
            )

            // Parse streak from metadata.streak (example: "1W" or "2L")
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
              roster.settings?.division != null
                ? `division_${roster.settings.division}`
                : null
            const divisionName = divisionIndex
              ? String(this.league.metadata?.[divisionIndex] ?? 'Unknown Division')
              : 'Unknown Division'
            const divisionAvatar = divisionIndex
              ? String(this.league.metadata?.[`${divisionIndex}_avatar`] ??
                'assets/img/nfl.png')
              : 'assets/img/nfl.png'

            // Build plain interface (StandingsTeam)
            const teamData = {
              roster, // if this is still a plain Roster, wrap with new RosterModel(roster)
              players: [],
              user: new UserModel(user!),
              league: this.league!, // wrap in LeagueModel if needed
              teamName:
                (user?.metadata?.team_name as string) || `${user?.display_name}'s Team`,
              userName: user?.display_name || 'Unknown User',
              avatar: user?.avatar
                ? this.userService.buildAvatar(user.avatar)
                : 'assets/img/nfl.png',
              wins: roster.settings?.wins ?? 0,
              losses: roster.settings?.losses ?? 0,
              fpts:
                (roster.settings?.fpts ?? 0) +
                (roster.settings?.fpts_decimal ?? 0) / 100,
              fptsAgainst:
                (roster.settings?.fpts_against ?? 0) +
                (roster.settings?.fpts_against_decimal ?? 0) / 100,
              streak: {
                type: streakType,
                total: streakTotal,
              },
              divisionName: divisionName,
              divisionAvatar: divisionAvatar,
              leagueRank: -1,
              divisionRank: -1,
            }

            // Convert to model
            return new StandingsTeamModel(teamData)
          })
        },
        error: (err) => {
          this.toastService.showNegativeToast('Error Finding League Rosters.')
          this.loading = false
        },
        complete: () => {
          // Sort league
          this.standings = this.standingsService.buildStandings(this.standings)
          this.league.setStandingsTeams(this.standings)

          if (this.mode == 'my') {
            // Get My Team
            const myUserName = this.userService.getMyUser()?.getUserName()
            const myTeam = this.standings.find(
              (team) => team.userName === myUserName,
            )
            this.leagueService.setMyLeague(this.league)
            if (myTeam) this.teamService.setMyTeam(myTeam)
          } else {
            this.leagueService.setCurrentLeague(this.league)
          }

          // dynamically build division -> teams map
          this.standingsByDivision =
            this.standingsService.buildDivisionStandings(this.standings)

          this.loading = false
        },
      })
  }
  selectCurrentTeam(team: StandingsTeamModel): void {
    if (team.getTeamName() == this.teamService.getMyTeam()?.getTeamName()) {
      this.router.navigate(['/my-team'], {
        queryParams: {
          user: this.teamService.getMyTeam()?.getUserName(),
          league: this.league.getId(),
        },
      })
    } else {
      this.teamService.setCurrentTeam(team)
      this.router.navigate(['/selected-team'], {
        queryParams: {
          user: this.teamService.getCurrentTeam()?.getUserName(),
          league: this.league.getId(),
        },
      })
    }
  }
  goToUserProfile(userId: string): void {
    if (!userId) return
    if (userId === this.userService.getMyUser()?.getUserId()) {
      this.router.navigate(['/my-profile'], {
        queryParams: { userId },
      })
    } else {
      this.router.navigate(['/selected-profile'], {
        queryParams: { userId },
      })
    }
  }
  // ---- MATCHUP HISTORY (SCORES) ----

  loadMatchupHistory(): void {
    if (this.matchupHistoryLoaded) return
    this.loading = true

    this.leagueService.getLeagueChain(this.leagueId)
      .pipe(
        switchMap((chain) =>
          this.leagueHistoryService.getMatchupHistoryFromChain(chain),
        ),
        take(1),
      )
      .subscribe({
        next: (matchups) => {
          this.allMatchups = matchups
          this.availableSeasons = [
            ...new Set(matchups.map((m) => m.season)),
          ].sort((a, b) => parseInt(b) - parseInt(a))

          if (this.availableSeasons.length > 0) {
            this.selectedSeason = this.availableSeasons[0]
            this.filterBySeason()
          }

          this.matchupHistoryLoaded = true
          this.loading = false
        },
        error: (err) => {
          this.toastService.showNegativeToast('Error loading matchup history.')
          this.loading = false
        },
      })
  }

  filterBySeason(): void {
    const seasonMatchups = this.allMatchups.filter(
      (m) => m.season === this.selectedSeason,
    )
    this.groupByWeek(seasonMatchups)

    const weeksWithScores = this.weeklyMatchups.filter((w) =>
      w.matchups.some((m) => m.team_a_points > 0 || m.team_b_points > 0),
    )
    this.selectedHistoryWeek =
      weeksWithScores.length > 0 ? weeksWithScores[0].week : null
  }

  selectSeason(season: string): void {
    this.selectedSeason = season
    this.filterBySeason()
  }

  private groupByWeek(matchups: MatchupHistoryRecord[]): void {
    const weekMap = new Map<number, MatchupHistoryRecord[]>()
    matchups.forEach((m) => {
      if (!weekMap.has(m.week)) weekMap.set(m.week, [])
      weekMap.get(m.week)!.push(m)
    })
    this.weeklyMatchups = Array.from(weekMap.entries())
      .map(([week, matchups]) => ({ week, matchups }))
      .sort((a, b) => b.week - a.week)
  }

  selectHistoryWeek(week: number): void {
    this.selectedHistoryWeek = this.selectedHistoryWeek === week ? null : week
  }

  getMatchupResult(
    matchup: MatchupHistoryRecord,
    rosterId: number,
  ): 'win' | 'loss' | 'tie' {
    if (matchup.winner_roster_id === rosterId) return 'win'
    if (matchup.winner_roster_id === null) return 'tie'
    return 'loss'
  }

  getPointsDiff(matchup: MatchupHistoryRecord): string {
    const diff = Math.abs(matchup.team_a_points - matchup.team_b_points)
    return diff.toFixed(2)
  }

  openMatchupDetail(record: MatchupHistoryRecord, event: MouseEvent): void {
    const card = (event.currentTarget as HTMLElement).getBoundingClientRect()
    this.modalStart = {
      top: card.top,
      left: card.left,
      width: card.width,
      height: card.height,
    }

    this.leagueService.getLeagueMatchups(record.league_id, record.week)
      .pipe(take(1))
      .subscribe({
        next: (pairs) => {
          const pair = pairs.find(
            (p) =>
              p.teamA.matchup_id === record.matchup_id ||
              p.teamB.matchup_id === record.matchup_id,
          )
          if (!pair) {
            this.toastService.showNegativeToast('Could not load matchup detail')
            return
          }

          let rawA = pair.teamA
          let rawB = pair.teamB
          if (rawA.roster_id !== record.team_a_roster_id) {
            rawA = pair.teamB
            rawB = pair.teamA
          }

          this.selectedMatchupDetail = {
            teamA: {
              teamName: record.team_a_team_name || record.team_a_username,
              userName: record.team_a_username,
              avatar: 'assets/img/nfl.png',
              wins: 0,
              losses: 0,
              totalPoints: record.team_a_points,
              rosterId: record.team_a_roster_id,
              starters: rawA.starters || [],
              players: rawA.players || [],
              startersPoints: rawA.starters_points || [],
              playersPoints: rawA.players_points || {},
            },
            teamB: {
              teamName: record.team_b_team_name || record.team_b_username,
              userName: record.team_b_username,
              avatar: 'assets/img/nfl.png',
              wins: 0,
              losses: 0,
              totalPoints: record.team_b_points,
              rosterId: record.team_b_roster_id,
              starters: rawB.starters || [],
              players: rawB.players || [],
              startersPoints: rawB.starters_points || [],
              playersPoints: rawB.players_points || {},
            },
            week: record.week,
            season: record.season,
            leagueId: record.league_id,
            status: 'Complete',
          }
        },
        error: () => {
          this.toastService.showNegativeToast('Error loading matchup details')
        },
      })
  }

  setTab(tab: 'standings' | 'matchups' | 'playoffs' | 'worldcup' | 'rules') {
    this.activeTab = tab
    if (tab === 'matchups' && !this.matchupHistoryLoaded) {
      this.loadMatchupHistory()
    }
    if (tab === 'playoffs' && !this.playoffsLoaded) {
      this.loadPlayoffBracket()
    }
    if (tab === 'worldcup' && !this.worldCupLoaded) {
      this.loadWorldCup()
    }
    if (tab === 'rules' && !this.rulesLoaded) {
      this.loadRules()
    }
  }

  // ---- PLAYOFFS BRACKET ----

  loadPlayoffBracket(): void {
    this.loading = true
    forkJoin({
      winners: this.leagueService.getWinnersBracket(this.leagueId),
      losers: this.leagueService.getLosersBracket(this.leagueId),
    })
      .pipe(take(1))
      .subscribe({
        next: ({ winners, losers }) => {
          this.winnersBracket = winners as PlayoffBracketMatch[]
          this.losersBracket = losers as PlayoffBracketMatch[]
          this.bracketRounds = this.groupBracketByRound(this.winnersBracket)
          this.loserRounds = this.groupBracketByRound(this.losersBracket)
          this.playoffsLoaded = true
          this.loading = false
        },
        error: () => {
          this.toastService.showNegativeToast('Error loading playoff bracket.')
          this.loading = false
        },
      })
  }

  private groupBracketByRound(
    matches: PlayoffBracketMatch[],
  ): { round: number; matches: PlayoffBracketMatch[] }[] {
    const roundMap = new Map<number, PlayoffBracketMatch[]>()
    matches.forEach((m) => {
      if (!roundMap.has(m.r)) roundMap.set(m.r, [])
      roundMap.get(m.r)!.push(m)
    })
    return Array.from(roundMap.entries())
      .map(([round, matches]) => ({ round, matches }))
      .sort((a, b) => a.round - b.round)
  }

  getTeamName(rosterId: number | null): string {
    if (!rosterId) return 'TBD'
    const team = this.standings.find((s) => s.roster.roster_id === rosterId)
    return team?.teamName || `Roster ${rosterId}`
  }

  getTeamAvatar(rosterId: number | null): string {
    if (!rosterId) return 'assets/img/nfl.png'
    const team = this.standings.find((s) => s.roster.roster_id === rosterId)
    return team?.avatar || 'assets/img/nfl.png'
  }

  getBracketMatchLabel(match: PlayoffBracketMatch): string {
    if (match.p === 1) return 'Championship'
    if (match.p === 3) return '3rd Place'
    if (match.p === 5) return '5th Place'
    return ''
  }

  // ---- WORLD CUP ----

  loadWorldCup(): void {
    this.loading = true
    this.leagueService.getLeagueChain(this.leagueId)
      .pipe(
        switchMap((chain) =>
          this.leagueHistoryService.getMatchupHistoryFromChain(chain).pipe(
            take(1),
            switchMap((matchups) => {
              this.worldCupDivisions =
                this.leagueHistoryService.getWorldCupStandings(chain, matchups)
              // Gather unique seasons
              this.worldCupSeasons = [
                ...new Set(matchups.map((m) => m.season)),
              ].sort((a, b) => parseInt(a) - parseInt(b))
              return [this.worldCupDivisions]
            }),
          ),
        ),
        take(1),
      )
      .subscribe({
        next: () => {
          // Build dynamic grid columns: base + one column per season
          const seasonCols = this.worldCupSeasons.map(() => '0.8fr').join(' ')
          this.wcGridColumns =
            `40px 2fr 0.6fr 0.6fr 1fr 1fr ${seasonCols}`.trim()
          this.worldCupLoaded = true
          this.loading = false
        },
        error: () => {
          this.toastService.showNegativeToast(
            'Error loading World Cup standings.',
          )
          this.loading = false
        },
      })
  }

  getSeasonBreakdown(
    team: any,
    season: string,
  ): { wins: number; losses: number } {
    const sb = team.seasonBreakdown?.find((s: any) => s.season === season)
    return sb || { wins: 0, losses: 0 }
  }

  // ---- RULES ----

  private static readonly SCORING_KEY_LABELS: Record<string, string> = {
    pass_yd: 'Pass Yards',
    pass_td: 'Pass TD',
    pass_int: 'Interception',
    pass_2pt: 'Pass 2PT',
    pass_att: 'Pass Attempts',
    pass_cmp: 'Completions',
    pass_inc: 'Incompletions',
    rush_yd: 'Rush Yards',
    rush_td: 'Rush TD',
    rush_2pt: 'Rush 2PT',
    rush_att: 'Rush Attempts',
    rec: 'Receptions',
    rec_yd: 'Rec Yards',
    rec_td: 'Rec TD',
    rec_2pt: 'Rec 2PT',
    bonus_rec_te: 'TE Premium',
    bonus_rec_wr: 'WR Bonus',
    bonus_rec_rb: 'RB Rec Bonus',
    bonus_rush_yd_100: '100+ Rush Yds',
    bonus_rec_yd_100: '100+ Rec Yds',
    bonus_pass_yd_300: '300+ Pass Yds',
    pr_td: 'Punt Return TD',
    kr_td: 'Kick Return TD',
    fum: 'Fumble',
    fum_lost: 'Fumble Lost',
    fum_rec: 'Fumble Recovery',
    fum_rec_td: 'Fumble Rec TD',
    fg_0_19: 'FG 0-19',
    fg_20_29: 'FG 20-29',
    fg_30_39: 'FG 30-39',
    fg_40_49: 'FG 40-49',
    fg_50p: 'FG 50+',
    fg_miss: 'FG Miss',
    fg_miss_0_19: 'FG Miss 0-19',
    fg_miss_20_29: 'FG Miss 20-29',
    fg_miss_30_39: 'FG Miss 30-39',
    fg_miss_40_49: 'FG Miss 40-49',
    fg_miss_50p: 'FG Miss 50+',
    xpm: 'XP Made',
    xpmiss: 'XP Missed',
    sack: 'Sack',
    int: 'INT',
    ff: 'Forced Fumble',
    def_td: 'Defensive TD',
    safe: 'Safety',
    blk_kick: 'Blocked Kick',
    pts_allow_0: '0 Pts Allowed',
    pts_allow_1_6: '1-6 Pts Allowed',
    pts_allow_7_13: '7-13 Pts Allowed',
    pts_allow_14_20: '14-20 Pts Allowed',
    pts_allow_21_27: '21-27 Pts Allowed',
    pts_allow_28_34: '28-34 Pts Allowed',
    pts_allow_35p: '35+ Pts Allowed',
    st_td: 'ST TD',
    st_ff: 'ST Forced Fumble',
    st_fum_rec: 'ST Fumble Rec',
    def_st_td: 'Def/ST TD',
    def_st_ff: 'Def/ST FF',
    def_st_fum_rec: 'Def/ST Fum Rec',
  }

  private static readonly SCORING_CATEGORIES: {
    name: string
    prefixes: string[]
  }[] = [
    { name: 'Passing', prefixes: ['pass_'] },
    { name: 'Rushing', prefixes: ['rush_'] },
    { name: 'Receiving', prefixes: ['rec', 'bonus_rec'] },
    { name: 'Return TDs', prefixes: ['pr_', 'kr_'] },
    { name: 'Fumbles', prefixes: ['fum'] },
    { name: 'Kicking', prefixes: ['fg_', 'xp'] },
  ]

  loadRules(): void {
    if (!this.league) return

    // Parse scoring settings into categories
    const scoring = this.league.getScoringSettings()
    const usedKeys = new Set<string>()

    this.scoringCategories = LeagueComponent.SCORING_CATEGORIES.map((cat) => {
      const settings = Object.entries(scoring)
        .filter(
          ([key]) =>
            cat.prefixes.some((p) => key.startsWith(p)) && !usedKeys.has(key),
        )
        .map(([key, value]) => {
          usedKeys.add(key)
          return {
            key,
            label:
              LeagueComponent.SCORING_KEY_LABELS[key] ||
              this.formatScoringKey(key),
            value,
          }
        })
        .filter((s) => s.value !== 0)
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      return { name: cat.name, settings }
    }).filter((cat) => cat.settings.length > 0)

    // Parse roster positions
    const positions = this.league.getRosterPositions()
    const positionCounts = new Map<string, number>()
    positions.forEach((pos) => {
      if (pos === 'BN') return
      positionCounts.set(pos, (positionCounts.get(pos) || 0) + 1)
    })
    this.rosterSlots = Array.from(positionCounts.entries()).map(
      ([position, count]) => ({ position, count }),
    )
    const benchCount = positions.filter((p) => p === 'BN').length
    if (benchCount > 0) {
      this.rosterSlots.push({ position: 'BN', count: benchCount })
    }

    // Load proposals from Supabase
    this.loadProposals()

    this.rulesLoaded = true
  }

  private formatScoringKey(key: string): string {
    return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  loadProposals(): void {
    this.rulesService.getProposals(this.leagueId)
      .pipe(take(1))
      .subscribe({
        next: (proposals) => {
          this.proposals = proposals
          this.checkThresholds()
        },
      })
  }

  submitProposal(): void {
    if (!this.proposalTitle.trim()) return
    this.submittingProposal = true
    const title = this.proposalTitle.trim()
    const description = this.proposalDescription.trim()
    this.rulesService.createProposal(this.leagueId, title, description)
      .pipe(take(1))
      .subscribe({
        next: (success) => {
          if (success) {
            this.proposalTitle = ''
            this.proposalDescription = ''
            this.showProposalForm = false
            this.toastService.showPositiveToast('Proposal submitted!')
            this.loadProposals()

            // Fire-and-forget email notification
            const profile = this.supabaseService.getProfile()
            const proposerName =
              profile?.display_name ||
              profile?.sleeper_username ||
              profile?.email?.split('@')[0] ||
              'A league member'
            this.rulesService.getLeagueMemberEmails()
              .pipe(take(1))
              .subscribe((recipients) => {
                if (recipients.length > 0) {
                  this.emailService.sendRuleProposalEmail(
                    {
                      title,
                      description,
                      proposed_by_username: proposerName,
                    } as RuleProposal,
                    recipients,
                    this.leagueName,
                  )
                }
              })
          } else {
            this.toastService.showNegativeToast('Failed to submit proposal.')
          }
          this.submittingProposal = false
        },
        error: () => {
          this.toastService.showNegativeToast('Failed to submit proposal.')
          this.submittingProposal = false
        },
      })
  }

  castVote(proposalId: string, vote: 'yes' | 'no'): void {
    this.rulesService.castVote(proposalId, vote)
      .pipe(take(1))
      .subscribe({
        next: (success) => {
          if (success) {
            this.loadProposals()
          } else {
            this.toastService.showNegativeToast('Failed to cast vote.')
          }
        },
      })
  }

  toggleRuleSection(index: number): void {
    if (this.expandedRuleSections.has(index)) {
      this.expandedRuleSections.delete(index)
    } else {
      this.expandedRuleSections.add(index)
    }
  }

  get filteredProposals(): RuleProposal[] {
    if (this.proposalFilter === 'all') return this.proposals
    return this.proposals.filter((p) => p.status === this.proposalFilter)
  }

  get leagueRules() {
    return LeagueComponent.LEAGUE_RULES
  }

  private checkThresholds(): void {
    this.proposals.forEach((p) => {
      if (p.status !== 'open') return
      if (p.yes_count >= this.approvalThreshold) {
        this.recentlyStamped.add(p.id)
        this.rulesService.updateProposalStatus(p.id, 'approved')
          .pipe(take(1))
          .subscribe({
            next: (success) => {
              if (success) {
                p.status = 'approved'
                this.toastService.showPositiveToast(
                  `"${p.title}" has been APPROVED!`,
                )
                this.sendRuleStatusEmail(p, 'approved')
              }
            },
          })
      } else if (p.no_count >= this.denialThreshold) {
        this.recentlyStamped.add(p.id)
        this.rulesService.updateProposalStatus(p.id, 'rejected')
          .pipe(take(1))
          .subscribe({
            next: (success) => {
              if (success) {
                p.status = 'rejected'
                this.toastService.showNegativeToast(
                  `"${p.title}" has been DENIED.`,
                )
                this.sendRuleStatusEmail(p, 'rejected')
              }
            },
          })
      }
    })
  }

  private sendRuleStatusEmail(
    proposal: RuleProposal,
    status: 'approved' | 'rejected',
  ): void {
    forkJoin({
      voters: this.rulesService.getVoterNames(proposal.id),
      recipients: this.rulesService.getLeagueMemberEmails(),
    })
      .pipe(take(1))
      .subscribe(({ voters, recipients }) => {
        if (recipients.length === 0) return
        if (status === 'approved') {
          this.emailService.sendRuleAcceptedEmail(
            proposal,
            voters.approved_by,
            voters.rejected_by,
            recipients,
            this.leagueName,
          )
        } else {
          this.emailService.sendRuleDeniedEmail(
            proposal,
            voters.approved_by,
            voters.rejected_by,
            recipients,
            this.leagueName,
          )
        }
      })
  }

  deleteProposal(proposalId: string): void {
    this.rulesService.deleteProposal(proposalId)
      .pipe(take(1))
      .subscribe({
        next: (success) => {
          if (success) {
            this.toastService.showPositiveToast('Proposal deleted.')
            this.loadProposals()
          } else {
            this.toastService.showNegativeToast('Failed to delete proposal.')
          }
        },
      })
  }

  getProposalDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  closeMatchupModal() {
    this.selectedMatchupDetail = null
    this.modalStart = null
  }

  ngOnDestroy(): void {
    this.queryParamsSub?.unsubscribe()
  }
}
