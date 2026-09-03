import { Component } from '@angular/core'
import { Router } from '@angular/router'
import { of, take } from 'rxjs'
import { catchError, switchMap } from 'rxjs/operators'
import { ToastService } from 'src/app/services/toast.service'
import { LeagueService } from 'src/app/services/league.service'
import { UserService } from 'src/app/services/user.service'
import { PlayerService } from 'src/app/services/player.service'
import { PlayerModel } from 'src/app/models/player.model'
import { User } from 'src/app/models/user.interface'
import { League } from 'src/app/models/league.interface'
import { LoaderComponent } from '../../components/loader/loader.component'
import { FormsModule } from '@angular/forms'
import { NgIf, NgFor } from '@angular/common'
import { RouterLink } from '@angular/router'

type SearchMode = 'user' | 'league' | 'player'

interface ModeConfig {
  placeholder: string
  hint: string
  emptyNoun: string
  promptCopy: string
}

const MODE_CONFIG: Record<SearchMode, ModeConfig> = {
  user: {
    placeholder: 'Sleeper username — see their leagues',
    hint: 'Search by Sleeper username or user ID',
    emptyNoun: 'username',
    promptCopy: 'Search for Sleeper users',
  },
  league: {
    placeholder: 'Enter a Sleeper league ID...',
    hint: 'Paste a Sleeper league ID to view any league',
    emptyNoun: 'league ID',
    promptCopy: 'Search for Sleeper leagues',
  },
  player: {
    placeholder: 'Search players by name...',
    hint: 'Find any NFL player by name',
    emptyNoun: 'player name',
    promptCopy: 'Search for NFL players',
  },
}

@Component({
  selector: 'app-search',
  templateUrl: './search.component.html',
  styleUrls: ['./search.component.scss'],
  standalone: true,
  imports: [
    LoaderComponent,
    FormsModule,
    NgIf,
    NgFor, RouterLink],
})
export class SearchComponent {
  loading = false
  searchMode: SearchMode = 'user'

  /** The user behind a username search, and the leagues they are in. */
  foundUser: User | null = null
  leagueResults: League[] = []
  searchTerm = ''

  searched = false
  errorMessage = ''
  playerResults: PlayerModel[] = []


  readonly modeConfig = MODE_CONFIG

  constructor(
    private leagueService: LeagueService,
    private userService: UserService,
    private playerService: PlayerService,
    private router: Router,
    private toastService: ToastService,
  ) {}

  get config(): ModeConfig {
    return this.modeConfig[this.searchMode]
  }

  setMode(mode: SearchMode): void {
    this.searchMode = mode
    this.searchTerm = ''
    this.searched = false
    this.errorMessage = ''
    this.playerResults = []
    this.leagueResults = []
    this.foundUser = null
  }

  search(): void {
    const term = this.searchTerm.trim()
    if (!term) return

    if (this.searchMode === 'player' && term.length < 2) {
      this.toastService.showNegativeToast('Enter at least 2 characters to search players.')
      return
    }

    this.loading = true
    this.searched = false
    this.errorMessage = ''
    this.playerResults = []
    this.leagueResults = []
    this.foundUser = null

    if (this.searchMode === 'user') {
      // Show the user AND the leagues they are in. League search needs a
      // league id, which nobody knows -- finding a league you are not in
      // realistically means going through someone who is in it.
      this.userService.searchUser(term)
        .pipe(
          take(1),
          switchMap((user) => {
            if (!user || !user.user_id) throw new Error('No user found.')
            this.foundUser = user
            return this.userService.findUserLeagues(user.user_id).pipe(
              // A user with no leagues this season is a real answer, not a
              // failure -- still show who they are.
              catchError(() => of([])),
            )
          }),
        )
        .subscribe({
          next: (leagues) => {
            this.leagueResults = leagues
            this.loading = false
            this.searched = true
          },
          error: () => {
            this.loading = false
            this.errorMessage = 'No user found.'
            this.searched = true
          },
        })
    } else if (this.searchMode === 'league') {
      this.leagueService.searchLeague(term)
        .pipe(take(1))
        .subscribe({
          next: (league) => {
            this.loading = false
            if (!league) {
              this.errorMessage = 'No league found.'
              this.searched = true
              return
            }
            this.leagueService.setCurrentLeague(league)
            this.router.navigate(['/selected-league'], {
              queryParams: { leagueId: league.getId(), view: 'league' },
            })
          },
          error: () => {
            this.loading = false
            this.errorMessage = 'No league found.'
            this.searched = true
          },
        })
    } else {
      this.playerService.searchPlayers(term)
        .pipe(take(1))
        .subscribe({
          next: (players) => {
            this.loading = false
            this.playerResults = players
            this.searched = true
          },
          error: () => {
            this.loading = false
            this.errorMessage = 'Player search failed.'
            this.searched = true
          },
        })
    }
  }

  /** Open a league this user is in, even though the viewer is not. */
  openLeague(league: League): void {
    this.router.navigate(['/selected-league'], {
      queryParams: { leagueId: league.league_id, view: 'league' },
    })
  }

  openProfile(): void {
    if (!this.foundUser?.user_id) return
    this.router.navigate(['/selected-profile'], {
      queryParams: { userId: this.foundUser.user_id },
    })
  }

}
