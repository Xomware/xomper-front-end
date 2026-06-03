import { Component } from '@angular/core'
import { Router } from '@angular/router'
import { take } from 'rxjs'
import { ToastService } from 'src/app/services/toast.service'
import { LeagueService } from 'src/app/services/league.service'
import { UserService } from 'src/app/services/user.service'
import { LoaderComponent } from '../../components/loader/loader.component';
import { FormsModule } from '@angular/forms';
import { NgIf } from '@angular/common';

@Component({
    selector: 'app-search',
    templateUrl: './search.component.html',
    styleUrls: ['./search.component.scss'],
    standalone: true,
    imports: [
        LoaderComponent,
        FormsModule,
        NgIf,
    ],
})
export class SearchComponent {
  loading = false
  searchMode: 'user' | 'league' = 'user'
  searchTerm = ''

  constructor(
    private leagueService: LeagueService,
    private userService: UserService,
    private router: Router,
    private toastService: ToastService,
  ) {}

  search(): void {
    const term = this.searchTerm.trim()
    if (!term) return

    this.loading = true

    if (this.searchMode === 'user') {
      this.userService.searchUser(term)
        .pipe(take(1))
        .subscribe({
          next: (user) => {
            if (!user || !user.user_id) {
              this.toastService.showNegativeToast('No user found.')
              this.loading = false
              return
            }
            this.loading = false
            this.router.navigate(['/selected-profile'], {
              queryParams: { userId: user.user_id },
            })
          },
          error: () => {
            this.toastService.showNegativeToast('No user found.')
            this.loading = false
          },
        })
    } else {
      this.leagueService.searchLeague(term)
        .pipe(take(1))
        .subscribe({
          next: (league) => {
            if (!league) {
              this.toastService.showNegativeToast('No league found.')
              this.loading = false
              return
            }
            this.leagueService.setCurrentLeague(league)
            this.loading = false
            this.router.navigate(['/selected-league'], {
              queryParams: { leagueId: league.getId(), view: 'league' },
            })
          },
          error: () => {
            this.toastService.showNegativeToast('No league found.')
            this.loading = false
          },
        })
    }
  }
}
