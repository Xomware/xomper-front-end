import { Component, OnInit, OnDestroy } from '@angular/core'
import { NgIf } from '@angular/common'
import { Router } from '@angular/router'
import { Subscription, interval } from 'rxjs'
import { DraftService } from 'src/app/services/draft.service'
import { LeagueService } from 'src/app/services/league.service'
import { DraftModel } from 'src/app/models/draft.model'

/**
 * Landing countdown card — mirrors iOS UpcomingDraftCountdownCard.
 * Hides itself entirely when there is no upcoming/active draft.
 * Uses RxJS interval(1000) to drive the live countdown text.
 * Tapping navigates to /draft-history (Live sub-tab).
 */
@Component({
  selector: 'app-landing-draft-countdown-card',
  standalone: true,
  imports: [NgIf],
  templateUrl: './landing-draft-countdown-card.component.html',
  styleUrls: ['./landing-draft-countdown-card.component.scss'],
})
export class LandingDraftCountdownCardComponent implements OnInit, OnDestroy {
  upcomingDraft: DraftModel | null = null
  startDate: Date | null = null
  countdownText = ''

  private tickSub: Subscription | null = null

  constructor(
    private draftService: DraftService,
    private leagueService: LeagueService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    const leagueId = this.leagueService.getActiveLeagueId()
    if (!leagueId) return
    this.draftService.getDraftsForLeague(leagueId).subscribe({
      next: (drafts) => {
        // Find a pre_draft or drafting draft for the current/upcoming season
        const upcoming = drafts.find(
          (d) => d.status === 'pre_draft' || d.status === 'drafting',
        )
        if (!upcoming) return

        this.upcomingDraft = upcoming

        if (upcoming.start_time && upcoming.start_time > 0) {
          this.startDate = new Date(upcoming.start_time)
          this.tick()
          this.tickSub = interval(1000).subscribe(() => this.tick())
        }
      },
      error: () => {
        this.upcomingDraft = null
      },
    })
  }

  ngOnDestroy(): void {
    this.tickSub?.unsubscribe()
  }

  private tick(): void {
    if (!this.startDate) return
    const remaining = this.startDate.getTime() - Date.now()
    if (remaining <= 0) {
      this.countdownText = 'Drafting now'
      return
    }
    const totalSeconds = Math.floor(remaining / 1000)
    const days = Math.floor(totalSeconds / 86400)
    const hours = Math.floor((totalSeconds % 86400) / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const secs = totalSeconds % 60
    if (days > 0) {
      this.countdownText = `${days}d ${this.pad(hours)}h ${this.pad(minutes)}m ${this.pad(secs)}s`
    } else if (hours > 0) {
      this.countdownText = `${hours}h ${this.pad(minutes)}m ${this.pad(secs)}s`
    } else {
      this.countdownText = `${minutes}m ${this.pad(secs)}s`
    }
  }

  private pad(n: number): string {
    return n.toString().padStart(2, '0')
  }

  get formattedStartDate(): string {
    if (!this.startDate) return ''
    return this.startDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    })
  }

  get draftLabel(): string {
    return this.upcomingDraft ? `${this.upcomingDraft.season} Rookie Draft` : ''
  }

  get isDraftingNow(): boolean {
    return this.upcomingDraft?.status === 'drafting'
  }

  goToDraftHistory(): void {
    this.router.navigate(['/draft-history'])
  }
}
