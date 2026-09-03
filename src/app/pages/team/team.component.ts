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
import { BackLinkComponent } from 'src/app/components/back-link/back-link.component'
import { FormsModule } from '@angular/forms'
import { PageSectionsComponent } from 'src/app/components/page-sections/page-sections.component'

@Component({
    selector: 'app-team',
    templateUrl: './team.component.html',
    styleUrls: ['./team.component.scss'],
    standalone: true,
    imports: [
        PageSectionsComponent,
        FormsModule,
        BackLinkComponent,
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
  POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

  /** Free-text filter across the whole roster. */
  filterText = ''

  /** Position filter, or empty for all. */
  filterPosition = ''

  /** Field or list. Remembered, because it is a reading preference. */
  view: 'field' | 'list' = 'field'

  /**
   * Starters laid out as a formation.
   *
   * Grouped by position rather than by the league's roster slots: Sleeper
   * gives slot order in `roster_positions`, but a FLEX holding a WR should
   * still stand among the receivers on a field. Position is what a reader is
   * actually looking for.
   */
  get formation(): Array<{ label: string; players: PlayerModel[] }> {
    const rows: Array<{ label: string; match: (p: PlayerModel) => boolean }> = [
      { label: 'Backfield', match: (p) => p.position === 'QB' || p.position === 'RB' },
      { label: 'Receivers', match: (p) => p.position === 'WR' || p.position === 'TE' },
      { label: 'Special', match: (p) => p.position === 'K' || p.position === 'DEF' },
    ]

    const starters = this.match(this.starters)
    const placed = new Set<string>()
    const out = rows.map((row) => {
      const players = starters.filter((p) => row.match(p))
      players.forEach((p) => placed.add(p.player_id))
      return { label: row.label, players }
    })

    // Anything the rows do not name still has to appear; an IDP league would
    // otherwise lose half its lineup off the field.
    const rest = starters.filter((p) => !placed.has(p.player_id))
    if (rest.length) out.push({ label: 'Other', players: rest })

    return out.filter((row) => row.players.length)
  }

  /** Positions actually on this roster, so the chips offer nothing empty. */
  get availablePositions(): string[] {
    const found = new Set<string>()
    for (const p of [...this.starters, ...this.bench, ...this.taxi]) {
      if (p.position) found.add(p.position)
    }
    return [...found].sort(
      (a, b) =>
        (this.POSITION_ORDER.indexOf(a) + 1 || 99) - (this.POSITION_ORDER.indexOf(b) + 1 || 99),
    )
  }

  get filtering(): boolean {
    return !!this.filterText.trim() || !!this.filterPosition
  }

  /**
   * Apply the filter to one group.
   *
   * Matches name or team, because "who do I have on the Bears" is as common a
   * question as looking up one player.
   */
  match(players: PlayerModel[]): PlayerModel[] {
    const text = this.filterText.trim().toLowerCase()
    return players.filter((p) => {
      if (this.filterPosition && p.position !== this.filterPosition) return false
      if (!text) return true
      return (
        (p.full_name ?? '').toLowerCase().includes(text) ||
        (p.team ?? '').toLowerCase().includes(text)
      )
    })
  }

  togglePosition(position: string): void {
    this.filterPosition = this.filterPosition === position ? '' : position
  }

  clearFilter(): void {
    this.filterText = ''
    this.filterPosition = ''
  }

  /** Nothing matched anywhere, as opposed to one group being empty. */
  get noMatches(): boolean {
    return (
      this.filtering &&
      !this.match(this.starters).length &&
      !this.match(this.bench).length &&
      !this.match(this.taxi).length
    )
  }

  setView(view: 'field' | 'list'): void {
    this.view = view
    try {
      localStorage.setItem('xomper.teamView', view)
    } catch {
      // Private browsing throws; a remembered preference is not worth failing
      // over.
    }
  }

  private restoreView(): void {
    let stored: string | null = null
    try {
      stored = localStorage.getItem('xomper.teamView')
    } catch {
      // See setView.
    }
    // Set both ways rather than only on a hit, so this states the default
    // instead of depending on the field initialiser having run.
    this.view = stored === 'list' ? 'list' : 'field'
  }

  constructor(
    private toastService: ToastService,
    private teamService: TeamService,
    private playerService: PlayerService,
    private userService: UserService,
    private leagueService: LeagueService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.restoreView()
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
    this.selectedPlayer = player
  }

  closePlayerModal(): void {
    this.selectedPlayer = null
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

  /**
   * "4th", "21st", "" for a rank that never resolved.
   *
   * The inline ternary this replaces special-cased exactly 1, 2 and 3, so 21
   * rendered "21th" and 11 would have rendered "11st". It also had no case
   * for the -1 the standings model defaults to when a division's standings
   * were never computed -- which is how the team page showed
   * "BIG10 Standings: -1th" in production.
   */
  ordinal(rank: number | undefined): string {
    if (!rank || rank < 1) return ''

    // 11th, 12th and 13th break the last-digit rule.
    const teens = rank % 100
    if (teens >= 11 && teens <= 13) return `${rank}th`

    const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[rank % 10] ?? 'th'
    return `${rank}${suffix}`
  }
}
