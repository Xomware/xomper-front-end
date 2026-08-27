import { Component, Input, OnInit, OnDestroy } from '@angular/core'
import { ActivatedRoute, Router, RouterOutlet, RouterLink } from '@angular/router'
import { Subscription, take } from 'rxjs'
import { LeagueService } from 'src/app/services/league.service'
import { ToastService } from 'src/app/services/toast.service'
import { TeamService } from 'src/app/services/team.service'
import { UserService } from 'src/app/services/user.service'
import { StandingsService } from 'src/app/services/standings.service'
import { CognitoService } from 'src/app/services/cognito.service'
import { UserModel } from 'src/app/models/user.model'
import { LeagueModel } from 'src/app/models/league.model'
import { RosterModel } from 'src/app/models/roster.model'
import { StandingsTeamModel } from 'src/app/models/standings.model'
import { LoaderComponent } from '../../components/loader/loader.component'
import { NgIf } from '@angular/common'

@Component({
    selector: 'app-league',
    templateUrl: './league.component.html',
    styleUrls: ['./league.component.scss'],
    standalone: true,
    imports: [RouterLink, 
        LoaderComponent,
        NgIf,
        RouterOutlet,
    ],
})
export class LeagueComponent implements OnInit, OnDestroy {
  @Input() mode: 'my' | 'selected' = 'selected'
  private queryParamsSub?: Subscription
  league!: LeagueModel
  leaguePicture = ''
  leagueName = ''
  /** League id to analyze. Drives the "Analyze teams" header link. */
  analyzerLeagueId: string | null = null
  leagueId = ''
  leagueUsers: UserModel[] = []
  leagueRosters: RosterModel[] = []
  loading = false

  constructor(
    private leagueService: LeagueService,
    private router: Router,
    private toastService: ToastService,
    private standingsService: StandingsService,
    private teamService: TeamService,
    private userService: UserService,
    private cognito: CognitoService,
    private route: ActivatedRoute,
  ) {}

  get currentUserId(): string | undefined {
    return this.cognito.currentUser?.userId
  }

  ngOnInit(): void {
    this.loading = true

    // The route decides which league this shows. An @Input() cannot: this
    // component is a routed component, so nothing is there to bind one, and
    // the 'selected' default silently sent /league/* down the query-param
    // path with no query param.
    this.mode = (this.route.snapshot.data['mode'] as 'my' | 'selected') ?? this.mode

    if (this.mode === 'my') {
      const myLeague = this.leagueService.getMyLeague()
      if (!myLeague) {
        this.loading = false
        this.toastService.showNegativeToast('No league loaded yet.')
        return
      }
      this.league = myLeague
      this.setupLeague()
      this.loading = false
    } else {
      this.route.queryParams.pipe(take(1)).subscribe((params) => {
        const queryLeagueId = params['leagueId']

        const currentLeague = this.leagueService.getCurrentLeague()

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
                // `complete` does not fire after `error`, so clearing the
                // flag only there left the page on "Loading..." forever.
                this.loading = false
              },
              complete: () => {
                this.loading = false
              },
            })
        } else {
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
    this.analyzerLeagueId = this.league.getId()
    this.leagueId = this.league.getId()
    this.leagueUsers = this.league.getUsers()
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
          if (this.mode === 'my') {
            this.leagueService.setMyLeague(this.league)
          } else {
            this.leagueService.setCurrentLeague(this.league)
          }
          this.leagueUsers = this.league.getUsers()
          this.getLeagueRosters()
        },
        error: () => {
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
          if (this.mode === 'my') {
            this.leagueService.setMyLeague(this.league)
          } else {
            this.leagueService.setCurrentLeague(this.league)
          }
          this.leagueRosters = this.league.getRosters()

          const leagueTaxiSquadIds = this.leagueRosters.reduce(
            (acc: string[], roster) => acc.concat(roster.taxi || []),
            [],
          )
          this.league.setTaxiSquadIds(leagueTaxiSquadIds)
          if (this.mode === 'my') {
            this.leagueService.setMyLeague(this.league)
          } else {
            this.leagueService.setCurrentLeague(this.league)
          }

          // Build standings view model
          const standings: StandingsTeamModel[] = this.leagueRosters.map((roster) => {
            const user = this.leagueUsers.find((u) => u.user_id === roster.owner_id)

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
              ? String(this.league.metadata?.[divisionIndex] ?? 'Unknown Division')
              : 'Unknown Division'
            const divisionAvatar = divisionIndex
              ? String(this.league.metadata?.[`${divisionIndex}_avatar`] ?? 'assets/img/nfl.png')
              : 'assets/img/nfl.png'

            const teamData = {
              roster,
              players: [],
              user: new UserModel(user!),
              league: this.league!,
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
            }

            return new StandingsTeamModel(teamData)
          })

          const sortedStandings = this.standingsService.buildStandings(standings)
          this.league.setStandingsTeams(sortedStandings)

          if (this.mode === 'my') {
            const myUserName = this.userService.getMyUser()?.getUserName()
            const myTeam = sortedStandings.find((team) => team.userName === myUserName)
            this.leagueService.setMyLeague(this.league)
            if (myTeam) this.teamService.setMyTeam(myTeam)
          } else {
            this.leagueService.setCurrentLeague(this.league)
          }
        },
        error: () => {
          this.toastService.showNegativeToast('Error Finding League Rosters.')
          this.loading = false
        },
        complete: () => {
          this.loading = false
        },
      })
  }

  ngOnDestroy(): void {
    this.queryParamsSub?.unsubscribe()
  }
}
