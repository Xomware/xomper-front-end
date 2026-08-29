import { Component, Input, OnInit } from '@angular/core'
import { forkJoin } from 'rxjs'
import { ToastService } from 'src/app/services/toast.service'
import { TeamService } from 'src/app/services/team.service'
import { RosterModel } from 'src/app/models/roster.model'
import { LeagueModel } from 'src/app/models/league.model'
import { PlayerModel } from 'src/app/models/player.model'
import { Player } from 'src/app/models/player.interface'
import { StandingsTeamModel } from 'src/app/models/standings.model'
import { TEAM_COLORS } from 'src/app/constants/team-colors'
import { Router, RouterLink } from '@angular/router'
import { UserService } from 'src/app/services/user.service'
import { LeagueService } from 'src/app/services/league.service'
import { PlayerService } from 'src/app/services/player.service'
import { NgStyle, NgClass, NgIf, NgFor, NgTemplateOutlet } from '@angular/common';
import { LoaderComponent } from '../../components/loader/loader.component';
import { PlayerModalComponent } from '../../components/player-modal/player-modal.component';

@Component({
    selector: 'app-team',
    templateUrl: './team.component.html',
    styleUrls: ['./team.component.scss'],
    standalone: true,
    imports: [
        NgStyle,
        LoaderComponent,
        NgClass,
        NgIf,
        NgFor,
        NgTemplateOutlet,
        PlayerModalComponent,
        RouterLink,
    ],
})
export class TeamComponent implements OnInit {
  @Input() mode: 'my' | 'selected' = 'selected'
  team!: StandingsTeamModel
  teamPicture = ''
  teamName = ''
  teamRoster!: RosterModel
  teamPlayers: PlayerModel[] = []
  starters: PlayerModel[] = []
  bench: PlayerModel[] = []
  taxi: PlayerModel[] = []
  teamLeague!: LeagueModel
  loading = false
  selectedPlayer: PlayerModel | null = null
  modalStart: {
    top: number
    left: number
    width: number
    height: number
  } | null = null
  POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

  constructor(
    private toastService: ToastService,
    private teamService: TeamService,
    private playerService: PlayerService,
    private userService: UserService,
    private leagueService: LeagueService,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (this.mode === 'my') {
      this.team = this.teamService.getMyTeam()!
    } else {
      this.team = this.teamService.getCurrentTeam()!
    }
    this.teamPicture = this.team.getProfilePicture()
    this.teamName = this.team.getTeamName()
    this.teamRoster = this.team.getRoster()
    this.teamLeague = this.team.getLeague()
    this.teamPlayers = this.team.getPlayers()
    this.loadRosters()
  }

  loadRosters(): void {
    this.loading = true
    const playerCalls = (this.teamRoster.players || []).map((playerId: string) =>
      this.playerService.getPlayerById(playerId)
    )
    forkJoin(playerCalls).subscribe({
      next: (players: Player[]) => {
        const playerModels = players.map((player) => new PlayerModel(player))
        this.team.setPlayers(playerModels)
        if (this.mode === 'my') {
          this.teamService.setMyTeam(this.team)
        } else {
          this.teamService.setCurrentTeam(this.team)
        }
        this.teamPlayers = this.team.getPlayers()
        this.sortPlayersIntoGroups()
        this.toastService.showPositiveToast('Successfully Loaded Team Players.')
      },
      error: () => {
        this.toastService.showNegativeToast('Failed to Load Team Players.')
        this.loading = false
      },
      complete: () => {
        this.loading = false
      },
    })
  }

  sortPlayersIntoGroups(): void {
    if (!this.teamPlayers || !this.teamRoster) return

    const startersSet = new Set(this.teamRoster.starters || [])
    const taxiSet = new Set(this.teamRoster.taxi || [])

    this.starters = []
    this.bench = []
    this.taxi = []

    this.teamPlayers.forEach((player) => {
      const id = player.player_id

      if (startersSet.has(id)) {
        this.starters.push(player)
      } else if (taxiSet.has(id)) {
        this.taxi.push(player)
      } else {
        this.bench.push(player)
      }
    })

    const sortByPosition = (a: PlayerModel, b: PlayerModel): number => {
      const aIndex =
        this.POSITION_ORDER.indexOf(a.position) >= 0
          ? this.POSITION_ORDER.indexOf(a.position)
          : 99
      const bIndex =
        this.POSITION_ORDER.indexOf(b.position) >= 0
          ? this.POSITION_ORDER.indexOf(b.position)
          : 99
      return aIndex - bIndex
    }
    this.starters.sort(sortByPosition)
    this.bench.sort(sortByPosition)
    this.taxi.sort(sortByPosition)
  }

  goToUserProfile(userId: string): void {
    if (!userId) return
    if (userId === this.userService.getMyUser()?.getUserId()) {
      this.router.navigate(['/my-profile'], {
        queryParams: { userId: userId },
      })
    } else {
      this.router.navigate(['/selected-profile'], {
        queryParams: { userId: userId },
      })
    }
  }

  goToStandings(leagueId: string, view: string): void {
    if (!leagueId) return
    if (leagueId === this.leagueService.getMyLeague()?.getId()) {
      this.router.navigate(['/my-league'], {
        queryParams: { leagueId: leagueId, view: view },
      })
    } else {
      this.router.navigate(['/selected-league'], {
        queryParams: { leagueId: leagueId, view: view },
      })
    }
  }

  openPlayerModal(player: PlayerModel, event: MouseEvent): void {
    const card = (event.currentTarget as HTMLElement).getBoundingClientRect()
    this.modalStart = {
      top: card.top,
      left: card.left,
      width: card.width,
      height: card.height,
    }
    this.selectedPlayer = player
  }

  closePlayerModal(): void {
    this.selectedPlayer = null
    this.modalStart = null
  }

  getTeamStyle(team: string | undefined): Record<string, string> {
    if (!team) {
      return {
        backgroundColor: '#2a2a2a',
        border: '2px solid #444',
      }
    }

    const key = team.toLowerCase()
    const colors = TEAM_COLORS[key]

    if (!colors) {
      return {
        backgroundColor: '#2a2a2a',
        border: '2px solid #444',
      }
    }

    return {
      background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
      color: '#fff',
    }
  }

  getTeamButtonStyle(team: string | undefined): Record<string, string> {
    if (!team) return { background: '#444', color: '#fff' }

    const key = team.toLowerCase()
    const colors = TEAM_COLORS[key]
    if (!colors) return { background: '#444', color: '#fff' }

    return {
      backgroundColor: colors.primary,
      color: '#fff',
      border: 'none',
      borderRadius: '20px',
      padding: '6px 14px',
      fontWeight: 'bold',
      cursor: 'pointer',
    }
  }
}
