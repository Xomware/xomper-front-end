import {
  Component,
  Input,
  Output,
  EventEmitter,
  HostBinding,
} from '@angular/core'
import { forkJoin, take } from 'rxjs'
import { TEAM_COLORS } from 'src/app/constants/team-colors'
import { zoomModalAnimation } from 'src/app/animations/zoom-modal.animation'
import { TaxiSquadPlayerModel } from 'src/app/models/taxi-squad-player.model'
import { EmailService } from 'src/app/services/email.service'
import { RulesService } from 'src/app/services/rules.service'
import { SupabaseService } from 'src/app/services/supabase.service'
import { TaxiSquadService } from 'src/app/services/taxi-squad.service'
import { ToastService } from 'src/app/services/toast.service'
import { environment } from 'src/environments/environment'
import { NgStyle, NgIf } from '@angular/common';

@Component({
    selector: 'app-taxi-squad-player-modal',
    templateUrl: './taxi-squad-player-modal.component.html',
    styleUrls: ['./taxi-squad-player-modal.component.scss'],
    animations: [zoomModalAnimation],
    standalone: true,
    imports: [NgStyle, NgIf],
})
export class TaxiSquadPlayerModalComponent {
  @Input() startPos!: {
    top: number
    left: number
    width: number
    height: number
  }
  @HostBinding('@zoomAnimation') get zoom() {
    return {
      value: '',
      params: this.startPos || { top: 0, left: 0, width: 0, height: 0 },
    }
  }
  @Input() player!: TaxiSquadPlayerModel
  @Input() leagueId = ''
  @Input() alreadyStolen = false
  @Input() isOwnPlayer = false
  @Output() close = new EventEmitter<void>()
  @Output() stealComplete = new EventEmitter<string>()

  showConfirmation = false
  stealRequested = false
  stealLoading = false

  constructor(
    private emailService: EmailService,
    private rulesService: RulesService,
    private supabaseService: SupabaseService,
    private taxiSquadService: TaxiSquadService,
    private toastService: ToastService,
  ) {}

  onClose() {
    this.close.emit()
  }

  getTeamStyle(team: string | undefined) {
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

  getHeightFeetInches(height: number): string {
    if (!height) return ''
    const feet = Math.floor(height / 12)
    const inches = height % 12
    return `${feet}'${inches}"`
  }

  onSteal(): void {
    this.showConfirmation = true
  }

  confirmSteal(): void {
    this.stealLoading = true
    const profile = this.supabaseService.getProfile()
    const stealerName = profile?.display_name || profile?.email?.split('@')[0] || 'Unknown'

    forkJoin({
      ownerInfo: this.rulesService.getOwnerEmailByUsername(this.player.ownerUsername),
      recipients: this.rulesService.getLeagueMemberEmails(),
    })
      .pipe(take(1))
      .subscribe({
        next: ({ ownerInfo, recipients }) => {
          const owner = {
            display_name: ownerInfo?.display_name || this.player.ownerDisplayName,
            email: ownerInfo?.email || '',
          }

          const team = this.player.team || ''
          const teamLower = team.toLowerCase()
          const playerId = this.player.player_id

          this.emailService.sendTaxiStealEmail(
            { display_name: stealerName },
            {
              first_name: this.player.first_name,
              last_name: this.player.last_name,
              position: this.player.position || '',
              team,
              player_image_url: `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`,
              team_logo_url: !team || team.toUpperCase() === 'FA'
                ? ''
                : `https://sleepercdn.com/images/team_logos/nfl/${teamLower}.png`,
              pick_cost: this.getStealPickText(this.player.draftRound),
            },
            owner,
            recipients,
            environment.myLeagueName,
          )

          // Persist steal request to Supabase
          this.taxiSquadService
            .createStealRequest(this.leagueId, this.player.player_id, stealerName)
            .pipe(take(1))
            .subscribe()

          this.stealRequested = true
          this.showConfirmation = false
          this.stealLoading = false
          this.stealComplete.emit(this.player.player_id)
          this.toastService.showPositiveToast(`Steal requested for ${this.player.getFullName()}!`)
          this.close.emit()
        },
        error: () => {
          this.stealLoading = false
          this.toastService.showNegativeToast('Failed to send steal request. Try again.')
        },
      })
  }

  cancelSteal(): void {
    this.showConfirmation = false
  }

  private getOrdinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return n + (s[(v - 20) % 10] || s[v] || s[0])
  }

  getStealPickText(draftRound: number | string | undefined): string {
    if (draftRound === undefined || draftRound === 'Undrafted') {
      return '5th Round'
    }

    const round = Number(draftRound)
    const stealRound = round - 1
    if (stealRound <= 0) {
      return '5th Round'
    }

    return this.getOrdinal(stealRound) + ' Round'
  }
}
