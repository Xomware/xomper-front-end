import { Component, OnInit, OnDestroy } from '@angular/core'
import { Router } from '@angular/router'
import { Subject, forkJoin } from 'rxjs'
import { takeUntil, filter, take, switchMap } from 'rxjs/operators'
import { SupabaseService } from 'src/app/services/supabase.service'
import { UserService } from 'src/app/services/user.service'
import { LeagueService } from 'src/app/services/league.service'
import { TeamService } from 'src/app/services/team.service'
import { StandingsService } from 'src/app/services/standings.service'
import { ToastService } from 'src/app/services/toast.service'
import { UserModel } from 'src/app/models/user.model'
import { RosterModel } from 'src/app/models/roster.model'
import { StandingsTeamModel } from 'src/app/models/standings.model'
import { LeagueModel } from 'src/app/models/league.model'
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss'],
    standalone: true,
    imports: [NgIf, FormsModule]
})
export class HomeComponent implements OnInit, OnDestroy {
  loading = false
  checkingAuth = true

  // Auth UI state
  authMode: 'options' | 'email' = 'options'
  emailMode: 'signin' | 'signup' = 'signin'
  email = ''
  password = ''
  confirmPassword = ''
  authError = ''

  private destroy$ = new Subject<void>()

  constructor(
    private supabaseService: SupabaseService,
    private userService: UserService,
    private leagueService: LeagueService,
    private teamService: TeamService,
    private standingsService: StandingsService,
    private router: Router,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.supabaseService.initialized$
      .pipe(
        filter(init => init),
        take(1),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        const user = this.supabaseService.getUser()
        this.checkingAuth = false

        if (user) {
          this.handleAuthenticatedUser()
        }
      })

    setTimeout(() => {
      if (this.checkingAuth) {
        this.checkingAuth = false
      }
    }, 3000)
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
  }

  private handleAuthenticatedUser(): void {
    this.loading = true

    this.supabaseService.getWhitelistedUser()
      .pipe(take(1))
      .subscribe(whitelistedUser => {
        if (whitelistedUser && whitelistedUser.sleeper_username) {
          this.userService.searchUser(whitelistedUser.sleeper_username)
            .pipe(take(1))
            .subscribe({
              next: (sleeperUser) => {
                if (sleeperUser) {
                  this.userService.setMyUser(sleeperUser)
                  this.loadMyLeague(sleeperUser.user_id)
                } else {
                  this.toastService.showNegativeToast('Sleeper user not found')
                  this.supabaseService.signOut().subscribe()
                  this.loading = false
                }
              },
              error: () => {
                this.toastService.showNegativeToast('Error loading profile')
                this.supabaseService.signOut().subscribe()
                this.loading = false
              }
            })
        } else if (whitelistedUser && !whitelistedUser.sleeper_username) {
          this.toastService.showNegativeToast('Sleeper username not configured. Contact admin.')
          this.supabaseService.signOut().subscribe()
          this.loading = false
        } else {
          this.toastService.showNegativeToast('Your email is not authorized.')
          this.supabaseService.signOut().subscribe()
          this.loading = false
        }
      })
  }

  private loadMyLeague(userId: string): void {
    const whitelistedLeagueId = this.leagueService.getWhitelistedLeagueId()

    this.leagueService.loadWhitelistedLeague()
      .pipe(
        take(1),
        switchMap(league => {
          this.leagueService.setMyLeague(league)
          league.setDivisions()

          return forkJoin({
            users: this.leagueService.findLeagueUsers(whitelistedLeagueId),
            rosters: this.leagueService.findLeagueRosters(whitelistedLeagueId),
            nflState: this.leagueService.getLeagueState()
          })
        })
      )
      .subscribe({
        next: ({ users, rosters, nflState }) => {
          const league = this.leagueService.getMyLeague()!

          this.leagueService.setNflState(nflState)

          const userModels = users.map(user => new UserModel(user))
          league.setUsers(userModels)

          const rosterModels = rosters.map(roster => new RosterModel(roster))
          league.setRosters(rosterModels)

          const standings = this.buildStandings(league, userModels, rosterModels)
          league.setStandingsTeams(standings)

          const myUser = this.userService.getMyUser()
          const myTeam = standings.find(team => team.user?.user_id === myUser?.getUserId())

          if (myTeam) {
            this.teamService.setMyTeam(myTeam)
          }

          this.leagueService.setMyLeague(league)

          this.toastService.showPositiveToast('Welcome back!')
          this.loading = false

          this.router.navigate(['/my-profile'], {
            queryParams: { userId: userId }
          })
        },
        error: () => {
          this.toastService.showNegativeToast('Error loading league data')
          this.loading = false

          this.router.navigate(['/my-profile'], {
            queryParams: { userId: userId }
          })
        }
      })
  }

  private buildStandings(league: LeagueModel, users: UserModel[], rosters: RosterModel[]): StandingsTeamModel[] {
    const standings = rosters.map(roster => {
      const user = users.find(u => u.user_id === roster.owner_id)

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

      const divisionIndex = roster.settings?.division != null
        ? `division_${roster.settings.division}`
        : null
      const divisionName = divisionIndex
        ? (String(league.metadata?.[divisionIndex] ?? 'Unknown Division'))
        : 'Unknown Division'
      const divisionAvatar = divisionIndex
        ? (String(league.metadata?.[`${divisionIndex}_avatar`] ?? 'assets/img/nfl.png'))
        : 'assets/img/nfl.png'

      return new StandingsTeamModel({
        roster,
        players: [],
        user: user ? new UserModel(user) : null!,
        league: league,
        teamName: (user?.metadata?.team_name as string) || `${user?.display_name}'s Team`,
        userName: user?.display_name || 'Unknown User',
        avatar: user?.avatar
          ? this.userService.buildAvatar(user.avatar)
          : 'assets/img/nfl.png',
        wins: roster.settings?.wins ?? 0,
        losses: roster.settings?.losses ?? 0,
        fpts: (roster.settings?.fpts ?? 0) + (roster.settings?.fpts_decimal ?? 0) / 100,
        fptsAgainst: (roster.settings?.fpts_against ?? 0) + (roster.settings?.fpts_against_decimal ?? 0) / 100,
        streak: { type: streakType, total: streakTotal },
        divisionName,
        divisionAvatar,
        leagueRank: -1,
        divisionRank: -1,
      })
    })

    return this.standingsService.buildStandings(standings)
  }

  signInWithGoogle(): void {
    this.loading = true
    this.supabaseService.signInWithGoogle()
      .pipe(take(1))
      .subscribe(success => {
        if (!success) {
          this.loading = false
          this.toastService.showNegativeToast('Failed to start sign in')
        }
      })
  }

  showEmailForm(): void {
    this.authMode = 'email'
    this.emailMode = 'signin'
    this.authError = ''
    this.email = ''
    this.password = ''
    this.confirmPassword = ''
  }

  backToOptions(): void {
    this.authMode = 'options'
    this.authError = ''
  }

  toggleEmailMode(): void {
    this.emailMode = this.emailMode === 'signin' ? 'signup' : 'signin'
    this.authError = ''
    this.password = ''
    this.confirmPassword = ''
  }

  submitEmailAuth(): void {
    this.authError = ''

    if (!this.email.trim() || !this.password) {
      this.authError = 'Email and password are required.'
      return
    }

    if (this.emailMode === 'signup') {
      if (this.password.length < 6) {
        this.authError = 'Password must be at least 6 characters.'
        return
      }
      if (this.password !== this.confirmPassword) {
        this.authError = 'Passwords do not match.'
        return
      }

      this.loading = true
      this.supabaseService.signUpWithEmail(this.email.trim(), this.password)
        .pipe(take(1))
        .subscribe(result => {
          this.loading = false
          if (result.success) {
            this.toastService.showPositiveToast(result.message)
            if (result.message.includes('Check your email')) {
              this.emailMode = 'signin'
              this.password = ''
              this.confirmPassword = ''
            }
          } else {
            this.authError = result.message
          }
        })
    } else {
      this.loading = true
      this.supabaseService.signInWithEmail(this.email.trim(), this.password)
        .pipe(take(1))
        .subscribe(result => {
          if (result.success) {
            this.handleAuthenticatedUser()
          } else {
            this.loading = false
            this.authError = result.message
          }
        })
    }
  }

  onEmailKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.submitEmailAuth()
    }
  }

  goToGuestSearch(): void {
    this.router.navigate(['/search'])
  }
}
