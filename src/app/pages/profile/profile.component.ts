import { Component, Input, OnInit } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { take } from 'rxjs'
import { UserService } from 'src/app/services/user.service'
import { getCurrentSeason } from 'src/app/constants/season'
import { ToastService } from 'src/app/services/toast.service'
import { LeagueService } from 'src/app/services/league.service'
import { UserModel } from 'src/app/models/user.model'
import { LeagueModel } from 'src/app/models/league.model'
import { ProfileStatsService, ProfileStats } from 'src/app/services/profile-stats.service'
import { PlayerService } from 'src/app/services/player.service'
import { DecimalPipe } from '@angular/common'
import { LoaderComponent } from '../../components/loader/loader.component';
import { NgFor, NgIf } from '@angular/common';
import { BackLinkComponent } from 'src/app/components/back-link/back-link.component'

@Component({
    selector: 'app-profile',
    templateUrl: './profile.component.html',
    styleUrls: ['./profile.component.scss'],
    standalone: true,
    imports: [BackLinkComponent, LoaderComponent, NgFor, NgIf, DecimalPipe],
})
export class ProfileComponent implements OnInit {
  @Input() mode: 'my' | 'selected' = 'selected'
  private user: UserModel | null = null
  profilePicture = ''
  userName = ''
  userLeagues: LeagueModel[] = []
  loading = false

  stats: ProfileStats | null = null
  statsLoading = false

  /** playerId -> display name, for the ownership list. */
  playerNames: Record<string, string> = {}

  /** Sleeper rolls the season over in spring, so this is not the calendar year. */
  readonly season = getCurrentSeason()

  constructor(
    private profileStats: ProfileStatsService,
    private playerService: PlayerService,
    private userService: UserService,
    private leagueService: LeagueService,
    private router: Router,
    private toastService: ToastService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    if (this.mode === 'my') {
      this.user = this.userService.getMyUser()
    } else {
      this.user = this.userService.getCurrentUser()
    }
    // Already resolved -- 'my' mode reads the signed-in user straight from
    // UserService, which AuthGuard populates on every protected navigation.
    // Falling through to the query-param lookup anyway is what rendered
    // "UNDEFINED": /profile carries no ?userId=, so this fetched
    // /user/undefined and named the page from the result.
    if (this.user) {
      this.setupUser()
      this.loading = false
      return
    }

    this.loading = true
    this.route.queryParams.pipe(take(1)).subscribe((params) => {
      const queryUserId = params['userId']

      if (!queryUserId) {
        this.toastService.showNegativeToast('No profile to show.')
        this.loading = false
        return
      }

      this.userService.searchUser(queryUserId)
        .pipe(take(1))
        .subscribe({
          next: (user) => {
            this.userService.setCurrentUser(user)
            this.toastService.showPositiveToast('User Loaded.')
            this.user = this.userService.getCurrentUser()
            this.setupUser()
          },
          error: () => {
            this.toastService.showNegativeToast('Error loading user.')
            this.loading = false
          },
          complete: () => {
            this.loading = false
          },
        })
    })
  }

  /**
   * Career and per-season numbers, once the league list is known.
   *
   * Separate from the page load: it walks every league's season chain, so
   * blocking the profile on it would leave a name and avatar waiting on a
   * dozen requests.
   */
  private loadStats(): void {
    const user = this.user
    if (!user || !this.userLeagues.length) return

    this.statsLoading = true
    this.profileStats
      .forUser(user.getUserId(), this.userLeagues)
      .pipe(take(1))
      .subscribe({
        next: (stats) => {
          this.stats = stats
          this.statsLoading = false
          this.resolveOwnedNames(stats)
        },
        error: () => {
          this.statsLoading = false
        },
      })
  }

  private resolveOwnedNames(stats: ProfileStats): void {
    if (!stats.mostOwned.length) return
    this.playerService
      .getPlayerMap()
      .pipe(take(1))
      .subscribe((map) => {
        for (const owned of stats.mostOwned) {
          const meta = map[owned.playerId] as { full_name?: string } | undefined
          this.playerNames[owned.playerId] = meta?.full_name ?? owned.playerId
        }
      })
  }

  /** Career win rate, or null before anyone has played a game. */
  get winRate(): number | null {
    const c = this.stats?.career
    if (!c) return null
    const games = c.wins + c.losses + c.ties
    return games ? c.wins / games : null
  }

  private setupUser(): void {
    if (!this.user) return
    this.profilePicture = this.user.getProfilePicture()
    this.userName = this.user.getUserName()
    this.userLeagues = this.user.getUserLeagues()

    if (Object.keys(this.userLeagues).length === 0) {
      this.loading = true
      this.getUserLeagues()
      return
    }
    this.loadStats()
  }

  getUserLeagues(): void {
    // `this.user`, not getCurrentUser(): in 'my' mode the user comes from
    // getMyUser() and getCurrentUser() is null, so this returned early and
    // the leagues list stayed empty under a correct heading.
    const user = this.user
    if (!user) return

    this.userService.findUserLeagues(user.getUserId())
      .pipe(take(1))
      .subscribe({
        next: (leagues) => {
          const leagueModels = leagues.map((league) => new LeagueModel(league))

          this.user!.setUserLeagues(leagueModels)
          if (this.mode === 'my') {
            this.userService.setMyUser(this.user!)
          } else {
            this.userService.setCurrentUser(this.user!)
          }
          this.userLeagues = this.user!.getUserLeagues()
          this.toastService.showPositiveToast('Leagues Found.')
          this.loadStats()
        },
        error: () => {
          this.toastService.showNegativeToast('Error Finding Leagues.')
          this.loading = false
        },
        complete: () => {
          this.loading = false
        },
      })
  }

  selectCurrentLeague(league: LeagueModel): void {
    const leagueId = league.getId()
    if (leagueId === this.leagueService.getMyLeague()?.getId()) {
      this.router.navigate(['/my-league'], {
        queryParams: {
          leagueId: leagueId,
          view: 'league',
        },
      })
    } else {
      this.router.navigate(['/selected-league'], {
        queryParams: {
          leagueId: leagueId,
          view: 'league',
        },
      })
    }
  }
}
