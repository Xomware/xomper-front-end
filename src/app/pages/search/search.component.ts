import { Component } from '@angular/core'
import { Router } from '@angular/router'
import { take } from 'rxjs'
import { ToastService } from 'src/app/services/toast.service'
import { LeagueService } from 'src/app/services/league.service'
import { UserService } from 'src/app/services/user.service'
import { PlayerService } from 'src/app/services/player.service'
import { PlayerModel } from 'src/app/models/player.model'
import { LoaderComponent } from '../../components/loader/loader.component'
import { PlayerModalComponent } from '../../components/player-modal/player-modal.component'
import { FormsModule } from '@angular/forms'
import { NgIf, NgFor } from '@angular/common'

type SearchMode = 'user' | 'league' | 'player'

interface ModeConfig {
  placeholder: string
  hint: string
  emptyNoun: string
  promptCopy: string
}

const MODE_CONFIG: Record<SearchMode, ModeConfig> = {
  user: {
    placeholder: 'Enter a Sleeper username...',
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
    PlayerModalComponent,
    FormsModule,
    NgIf,
    NgFor,
  ],
})
export class SearchComponent {
  loading = false
  searchMode: SearchMode = 'user'
  searchTerm = ''

  searched = false
  errorMessage = ''
  playerResults: PlayerModel[] = []

  selectedPlayer: PlayerModel | null = null

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
    this.selectedPlayer = null
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

    if (this.searchMode === 'user') {
      this.userService.searchUser(term)
        .pipe(take(1))
        .subscribe({
          next: (user) => {
            this.loading = false
            if (!user || !user.user_id) {
              this.errorMessage = 'No user found.'
              this.searched = true
              return
            }
            this.router.navigate(['/selected-profile'], {
              queryParams: { userId: user.user_id },
            })
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

  openPlayerModal(player: PlayerModel): void {
    this.selectedPlayer = player
  }

  closePlayerModal(): void {
    this.selectedPlayer = null
  }
}
