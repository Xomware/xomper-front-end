import { Component, EventEmitter, HostBinding, Input, OnChanges, Output } from '@angular/core'
import { forkJoin } from 'rxjs'
import { zoomModalAnimation } from 'src/app/animations/zoom-modal.animation'
import { MatchupDetailInput } from 'src/app/models/matchup-detail-input.interface'
import { Player } from 'src/app/models/player.interface'
import { PlayerModel } from 'src/app/models/player.model'
import { PlayerService } from 'src/app/services/player.service'
import { NgIf, NgFor } from '@angular/common';

@Component({
    selector: 'app-matchup-modal',
    templateUrl: './matchup-modal.component.html',
    styleUrls: ['./matchup-modal.component.scss'],
    animations: [zoomModalAnimation],
    standalone: true,
    imports: [NgIf, NgFor]
})
export class MatchupModalComponent implements OnChanges {
  @Input() matchupDetail!: MatchupDetailInput
  @Input() startPos!: { top: number; left: number; width: number; height: number }
  @Output() close = new EventEmitter<void>()

  @HostBinding('@zoomAnimation') get zoom() {
    return { value: '', params: this.startPos || { top: 0, left: 0, width: 0, height: 0 } }
  }

  teamAStarters: PlayerModel[] = []
  teamABench: PlayerModel[] = []
  teamBStarters: PlayerModel[] = []
  teamBBench: PlayerModel[] = []
  loading = false

  POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

  constructor(private playerService: PlayerService) {}

  ngOnChanges() {
    if (!this.matchupDetail) return
    this.loadPlayers()
  }

  private loadPlayers() {
    this.loading = true

    const allIds = [
      ...new Set([
        ...(this.matchupDetail.teamA.players || []),
        ...(this.matchupDetail.teamB.players || [])
      ])
    ].filter(id => id && id !== '0')

    if (allIds.length === 0) {
      this.loading = false
      return
    }

    forkJoin(allIds.map(id => this.playerService.getPlayerById(id))).subscribe({
      next: (players: Player[]) => {
        const playerMap = new Map<string, PlayerModel>()
        players.forEach(p => {
          if (p) playerMap.set(p.player_id, new PlayerModel(p))
        })

        const startersASet = new Set(this.matchupDetail.teamA.starters || [])
        const startersBSet = new Set(this.matchupDetail.teamB.starters || [])

        // Starters in lineup slot order (preserves alignment with startersPoints[])
        this.teamAStarters = (this.matchupDetail.teamA.starters || [])
          .map(id => playerMap.get(id))
          .filter((p): p is PlayerModel => !!p)

        this.teamABench = (this.matchupDetail.teamA.players || [])
          .filter(id => !startersASet.has(id) && id !== '0')
          .map(id => playerMap.get(id))
          .filter((p): p is PlayerModel => !!p)
          .sort(this.sortByPosition.bind(this))

        this.teamBStarters = (this.matchupDetail.teamB.starters || [])
          .map(id => playerMap.get(id))
          .filter((p): p is PlayerModel => !!p)

        this.teamBBench = (this.matchupDetail.teamB.players || [])
          .filter(id => !startersBSet.has(id) && id !== '0')
          .map(id => playerMap.get(id))
          .filter((p): p is PlayerModel => !!p)
          .sort(this.sortByPosition.bind(this))
      },
      error: () => {
        // Failed to load matchup players
      },
      complete: () => (this.loading = false)
    })
  }

  private sortByPosition(a: PlayerModel, b: PlayerModel): number {
    const aIdx = this.POSITION_ORDER.indexOf(a.position) >= 0 ? this.POSITION_ORDER.indexOf(a.position) : 99
    const bIdx = this.POSITION_ORDER.indexOf(b.position) >= 0 ? this.POSITION_ORDER.indexOf(b.position) : 99
    return aIdx - bIdx
  }

  getPlayerPoints(playerId: string, team: 'A' | 'B'): number {
    const pointsMap = team === 'A'
      ? this.matchupDetail.teamA.playersPoints
      : this.matchupDetail.teamB.playersPoints
    return pointsMap?.[playerId] ?? 0
  }

  isGameComplete(): boolean {
    return this.matchupDetail.status === 'Complete'
  }

  isWinner(team: 'A' | 'B'): boolean {
    const a = this.matchupDetail.teamA.totalPoints
    const b = this.matchupDetail.teamB.totalPoints
    return team === 'A' ? a > b : b > a
  }

  isLoser(team: 'A' | 'B'): boolean {
    const a = this.matchupDetail.teamA.totalPoints
    const b = this.matchupDetail.teamB.totalPoints
    return team === 'A' ? a < b : b < a
  }

  onClose() {
    this.close.emit()
  }
}
