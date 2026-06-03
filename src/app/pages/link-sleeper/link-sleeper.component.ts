import { Component, OnInit, OnDestroy } from '@angular/core'
import { Router } from '@angular/router'
import { Subject, take } from 'rxjs'
import { SupabaseService } from 'src/app/services/supabase.service'
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
    private supabaseService: SupabaseService,
    private userService: UserService,
    private router: Router,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    if (!this.supabaseService.isAuthenticated()) {
      this.router.navigate(['/'])
    }

    const profile = this.supabaseService.getProfile()
    if (profile?.sleeper_user_id) {
      this.completeLogin(profile.sleeper_user_id)
    }
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

    this.supabaseService.linkSleeperAccount(
      this.foundUser.getUserId(),
      this.foundUser.getUserName(),
      this.foundUser.avatar
    ).pipe(take(1)).subscribe({
      next: (success) => {
        if (success) {
          this.toastService.showPositiveToast('Sleeper account linked!')
          this.completeLogin(this.foundUser!.getUserId())
        } else {
          this.error = 'Failed to link account. Please try again.'
          this.loading = false
        }
      },
      error: () => {
        this.error = 'Failed to link account. Please try again.'
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

          this.router.navigate(['/my-profile'], {
            queryParams: { userId: sleeperUserId }
          })
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
    this.supabaseService.signOut()
      .pipe(take(1))
      .subscribe(() => {
        this.router.navigate(['/'])
      })
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.searchSleeperUser()
    }
  }
}
