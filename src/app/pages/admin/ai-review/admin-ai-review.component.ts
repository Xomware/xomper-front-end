import { Component, OnInit, OnDestroy } from '@angular/core'
import { CommonModule } from '@angular/common'
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms'
import { Router } from '@angular/router'
import { Subject } from 'rxjs'
import { takeUntil } from 'rxjs/operators'
import { AiReviewService } from '../../../services/ai-review.service'
import { AdminService } from '../../../services/admin.service'
import { UserProfileService } from '../../../services/user-profile.service'
import { AiReportType } from '../../../models/ai-report-type.enum'
import { AiReviewTriggerResponse, AiReviewPreview } from '../../../models/ai-review-trigger.model'
import { AdminNotificationLogEntry } from '../../../models/admin-notification-log.model'

interface TriggerCard {
  type: AiReportType
  label: string
  description: string
  supportsWeek: boolean
  supportsPreview: boolean
}

/**
 * AdminAiReviewComponent — trigger cards + activity feed.
 *
 * Preview state is in-memory per-session (mirrors iOS AdminStore.lastPreviewsByType).
 * Refreshing the browser loses preview state — this is intentional.
 *
 * 4 trigger cards:
 *  1. Post-Draft    — no week override
 *  2. Preseason     — no week override
 *  3. Weekly        — week override input
 *  4. Week Preview  — week override + seasons-back toggle
 */
@Component({
  selector: 'app-admin-ai-review',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-ai-review.component.html',
  styleUrls: ['./admin-ai-review.component.scss'],
})
export class AdminAiReviewComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>()

  readonly cards: TriggerCard[] = [
    {
      type: 'postDraft',
      label: 'Post-Draft',
      description: 'Trigger post-draft AI review report',
      supportsWeek: false,
      supportsPreview: true,
    },
    {
      type: 'preseason',
      label: 'Preseason',
      description: 'Trigger preseason AI review report',
      supportsWeek: false,
      supportsPreview: true,
    },
    {
      type: 'weekly',
      label: 'Weekly Recap',
      description: 'Trigger weekly recap report',
      supportsWeek: true,
      supportsPreview: true,
    },
    {
      type: 'weekPreview',
      label: 'Week Preview',
      description: 'Trigger week preview newsletter',
      supportsWeek: true,
      supportsPreview: true,
    },
  ]

  forms: Record<AiReportType, FormGroup> = {} as Record<AiReportType, FormGroup>
  loading: Record<AiReportType, boolean> = {} as Record<AiReportType, boolean>
  results: Record<AiReportType, AiReviewTriggerResponse | null> = {} as Record<AiReportType, AiReviewTriggerResponse | null>

  /** In-memory previews keyed by type. Mirrors iOS AdminStore.lastPreviewsByType. */
  previews: Record<AiReportType, AiReviewPreview[]> = {} as Record<AiReportType, AiReviewPreview[]>

  activityFeed: AdminNotificationLogEntry[] = []
  activityLoading = false
  activityError = false

  filterKind: 'all' | 'push' | 'email' = 'all'
  filterStatus: 'all' | 'success' | 'failure' = 'all'

  private sleeperUserId: string | null = null

  constructor(
    private fb: FormBuilder,
    private aiReviewService: AiReviewService,
    private adminService: AdminService,
    private profiles: UserProfileService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    // Initialize forms for each card
    for (const card of this.cards) {
      this.forms[card.type] = this.fb.group({
        dryRun: [true],
        force: [false],
        week: [null],
        seasonsBack: [0],
      })
      this.loading[card.type] = false
      this.results[card.type] = null
      this.previews[card.type] = []
    }

    // Load activity feed
    this.profiles.profile$
      .pipe(takeUntil(this.destroy$))
      .subscribe((profile) => {
        if (profile?.sleeperUserId) {
          this.sleeperUserId = profile.sleeperUserId
          this.loadActivity()
        }
      })
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
  }

  runTrigger(card: TriggerCard): void {
    if (this.loading[card.type]) return
    const form = this.forms[card.type]
    const val = form.value

    const opts = {
      dryRun: val.dryRun as boolean,
      force: val.force as boolean,
      ...(card.supportsWeek && val.week ? { week: Number(val.week) } : {}),
      ...(card.type === 'weekPreview' && val.seasonsBack > 0
        ? { seasonsBack: Number(val.seasonsBack) }
        : {}),
    }

    this.loading[card.type] = true
    this.aiReviewService
      .trigger(card.type, opts)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.results[card.type] = result
          this.previews[card.type] = result.previews
          this.loading[card.type] = false
          // Refresh activity after trigger
          if (this.sleeperUserId) this.loadActivity()
        },
        error: () => {
          this.loading[card.type] = false
        },
      })
  }

  getForm(type: AiReportType): FormGroup {
    return this.forms[type]
  }

  isLoading(type: AiReportType): boolean {
    return this.loading[type] ?? false
  }

  getResult(type: AiReportType): AiReviewTriggerResponse | null {
    return this.results[type] ?? null
  }

  getPreviews(type: AiReportType): AiReviewPreview[] {
    return this.previews[type] ?? []
  }

  viewPreviews(type: AiReportType): void {
    this.router.navigate(['/admin/ai-review/preview', type])
  }

  setFilterKind(kind: 'all' | 'push' | 'email'): void {
    this.filterKind = kind
    this.loadActivity()
  }

  setFilterStatus(status: 'all' | 'success' | 'failure'): void {
    this.filterStatus = status
    this.loadActivity()
  }

  get filteredFeed(): AdminNotificationLogEntry[] {
    return this.activityFeed.filter((entry) => {
      const kindMatch =
        this.filterKind === 'all' || entry.kind === this.filterKind
      const statusMatch =
        this.filterStatus === 'all' || entry.status === this.filterStatus
      return kindMatch && statusMatch
    })
  }

  entryDate(entry: AdminNotificationLogEntry): Date {
    return new Date(entry.epochMs)
  }

  private loadActivity(): void {
    if (!this.sleeperUserId) return
    this.activityLoading = true
    this.activityError = false
    this.adminService
      .listNotifications({ sleeperUserId: this.sleeperUserId, daysBack: 7 })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (entries) => {
          this.activityFeed = entries
          this.activityLoading = false
        },
        error: () => {
          this.activityError = true
          this.activityLoading = false
        },
      })
  }
}
