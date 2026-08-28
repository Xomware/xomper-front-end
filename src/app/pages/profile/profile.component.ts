import { Component, Input, OnInit } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { take } from 'rxjs'
import { UserService } from 'src/app/services/user.service'
import { getCurrentSeason } from 'src/app/constants/season'
import { ToastService } from 'src/app/services/toast.service'
import { LeagueService } from 'src/app/services/league.service'
import { UserModel } from 'src/app/models/user.model'
import { LeagueModel } from 'src/app/models/league.model'
import { LoaderComponent } from '../../components/loader/loader.component';
import { NgFor } from '@angular/common';

@Component({
    selector: 'app-profile',
    templateUrl: './profile.component.html',
    styleUrls: ['./profile.component.scss'],
    standalone: true,
    imports: [LoaderComponent, NgFor],
})
export class ProfileComponent implements OnInit {
  @Input() mode: 'my' | 'selected' = 'selected'
  private user: UserModel | null = null
  profilePicture = ''
  userName = ''
  userLeagues: LeagueModel[] = []
  loading = false

  /** Sleeper rolls the season over in spring, so this is not the calendar year. */
  readonly season = getCurrentSeason()

  constructor(
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

  private setupUser(): void {
    if (!this.user) return
    this.profilePicture = this.user.getProfilePicture()
    this.userName = this.user.getUserName()
    this.userLeagues = this.user.getUserLeagues()

    if (Object.keys(this.userLeagues).length === 0) {
      this.loading = true
      this.getUserLeagues()
    }
  }

  getUserLeagues(): void {
    const currentUser = this.userService.getCurrentUser()
    if (!currentUser) return

    this.userService.findUserLeagues(currentUser.getUserId())
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
