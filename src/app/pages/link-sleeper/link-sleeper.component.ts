import { Component, OnInit, OnDestroy } from '@angular/core'
import { Router } from '@angular/router'
import { Subject, take } from 'rxjs'
import { CognitoService } from 'src/app/services/cognito.service'
import { UserProfileService } from 'src/app/services/user-profile.service'
import { UserService } from 'src/app/services/user.service'
import { ToastService } from 'src/app/services/toast.service'
import { UserModel } from 'src/app/models/user.model'
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-link-sleeper',
    templateUrl: './link-sleeper.component.html',
    styleUrls: ['./link-sleeper.component.scss'],
    standalone: true,
    imports: [NgIf, FormsModule]
})
export class LinkSleeperComponent implements OnInit, OnDestroy {
  sleeperUsername = ''
  loading = false
  foundUser: UserModel | null = null
  error = ''

  private destroy$ = new Subject<void>()

  constructor(
    private cognito: CognitoService,
    private profiles: UserProfileService,
    private userService: UserService,
    private router: Router,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    if (!this.cognito.isAuthenticated()) {
      this.router.navigate(['/'])
      return
    }

    // Fetch rather than read the cache: arriving here straight from sign-up
    // means nothing has loaded the record yet, and this call also creates it.
    this.profiles.load().pipe(take(1)).subscribe((profile) => {
      if (profile?.sleeperUserId) {
        this.completeLogin(profile.sleeperUserId)
      }
    })
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
  }

  searchSleeperUser(): void {
    if (!this.sleeperUsername.trim()) {
      this.error = 'Please enter a username'
      return
    }

    this.loading = true
    this.error = ''
    this.foundUser = null

    this.userService.searchUser(this.sleeperUsername.trim())
      .pipe(take(1))
      .subscribe({
        next: (user) => {
          if (user) {
            this.foundUser = new UserModel(user)
            this.toastService.showPositiveToast('User found!')
          } else {
            this.error = 'User not found. Check the username and try again.'
          }
          this.loading = false
        },
        error: () => {
          this.error = 'User not found. Check the username and try again.'
          this.loading = false
        }
      })
  }

  confirmLink(): void {
    if (!this.foundUser) return

    this.loading = true

    // Only the username goes up. The API re-resolves it against Sleeper and
    // stores the numeric id itself, so the id this page found cannot drift
    // from the one that gets saved.
    this.profiles.linkSleeper(this.foundUser.getUserName())
      .pipe(take(1))
      .subscribe({
        next: (profile) => {
          this.toastService.showPositiveToast('Sleeper account linked!')
          this.completeLogin(profile.sleeperUserId)
        },
        error: (err) => {
          this.error =
            err?.error?.error?.message ??
            'Failed to link account. Please try again.'
          this.loading = false
        }
      })
  }

  private completeLogin(sleeperUserId: string): void {
    this.userService.searchUser(sleeperUserId)
      .pipe(take(1))
      .subscribe({
        next: (user) => {
          this.userService.setMyUser(user)

          // Home, not the profile page. Landing on a single team's profile
          // after linking gives no sense of what the app does -- the overview
          // is the front door.
          this.router.navigate(['/home'])
        },
        error: () => {
          this.toastService.showNegativeToast('Error loading user data')
          this.loading = false
        }
      })
  }

  cancelLink(): void {
    this.foundUser = null
    this.sleeperUsername = ''
  }

  signOut(): void {
    this.cognito.signOut()
      .pipe(take(1))
      .subscribe(() => {
        this.profiles.clear()
        this.router.navigate(['/'])
      })
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.searchSleeperUser()
    }
  }
}
