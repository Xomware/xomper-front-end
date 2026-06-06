import { Component, OnInit, DestroyRef, inject } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router } from '@angular/router'
import { AsyncPipe, NgIf, NgFor, NgClass, LowerCasePipe } from '@angular/common'
import { interval, switchMap, of, forkJoin, BehaviorSubject, Observable } from 'rxjs'
import { map, take } from 'rxjs/operators'
import { LeagueService, TradedPick } from 'src/app/services/league.service'
import { DraftService } from 'src/app/services/draft.service'
import { DraftModel } from 'src/app/models/draft.model'
import { DraftPick } from 'src/app/models/draft.interface'
import { User } from 'src/app/models/user.interface'
import { Roster } from 'src/app/models/roster.interface'
import { LoaderComponent } from '../../../components/loader/loader.component'
import { SupabaseService } from 'src/app/services/supabase.service'

type ViewMode = 'rounds' | 'board'
type PickFilter = 'all' | 'mine'

interface LiveCell {
  round: number
  slot: number
  /** Display name of the team that owns this pick in this round (traded_picks applied). */
  ownerName: string
  pick: DraftPick | null
  isMine: boolean
}

interface LiveRound {
  round: number
  cells: LiveCell[]
}

/**
 * Live sub-tab — ports iOS LiveDraftView.
 *
 * Renders a live draft board for the current season:
 *   - Controls bar: All/My Picks chip + Rounds/Board view toggle
 *   - Countdown header: ms-level countdown via RxJS interval(1000)
 *   - Rounds list: picks in round rows, filterable to My Picks
 *   - Board grid: slot columns × round rows, dimmed for non-mine cells (My filter)
 *
 * Traded picks: fetches /league/:id/traded_picks, builds per-round ownership
 * override map. Port of iOS liveTeamsBySlotByRound.
 *
 * Polling: 5s while drafting, 30s while pre_draft, stops on complete.
 * Uses interval + switchMap + takeUntilDestroyed.
 */
@Component({
  selector: 'app-draft-live',
  templateUrl: './draft-live.component.html',
  styleUrls: ['./draft-live.component.scss'],
  standalone: true,
  imports: [LoaderComponent, NgIf, NgFor, NgClass, AsyncPipe, LowerCasePipe],
})
export class DraftLiveComponent implements OnInit {
  private destroyRef = inject(DestroyRef)

  loading = true
  draft: DraftModel | null = null
  leagueId = ''
  year = ''

  // View state
  viewMode: ViewMode = 'rounds'
  pickFilter: PickFilter = 'all'

  // Derived display data
  rounds: LiveRound[] = []
  slots: number[] = []
  teamCount = 12

  // Countdown
  countdown = ''

  // My Sleeper user ID (for "My Picks" filter)
  private mySleeperUserId: string | null = null

  // Base slot → team name map (from draft_order + users)
  private baseSlotToName: Map<number, string> = new Map()
  // Per-round override: round → (slot → teamName)
  private slotByRound: Map<number, Map<number, string>> = new Map()

  constructor(
    private leagueService: LeagueService,
    private draftService: DraftService,
    private supabase: SupabaseService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    const league = this.leagueService.getMyLeague()
    if (!league) {
      this.router.navigate(['/home'])
      return
    }
    this.leagueId = league.getId()
    this.year = this.route.parent?.snapshot.paramMap.get('year') ?? ''

    // Resolve my sleeper user id from profile
    const profile = this.supabase.getProfile()
    this.mySleeperUserId = profile?.sleeper_user_id ?? null

    this.loadDraft()
  }

  private loadDraft(): void {
    this.loading = true

    forkJoin({
      users: this.leagueService.findLeagueUsers(this.leagueId),
      rosters: this.leagueService.findLeagueRosters(this.leagueId),
      drafts: this.draftService.getDraftsForLeague(this.leagueId),
      tradedPicks: this.leagueService.getTradedPicks(this.leagueId),
    }).pipe(take(1)).subscribe({
      next: ({ users, rosters, drafts, tradedPicks }) => {
        // Find the draft for the current year
        const draft = drafts.find(d => d.season === this.year) ?? drafts[0] ?? null
        this.draft = draft

        if (!draft) {
          this.loading = false
          return
        }

        this.teamCount = draft.settings?.teams ?? 12
        this.slots = Array.from({ length: this.teamCount }, (_, i) => i + 1)

        // Build base slot → team name map
        this.baseSlotToName = this.buildBaseSlotMap(draft.draft_order, users, rosters)

        // Build per-round slot override from traded picks
        this.slotByRound = this.buildSlotByRound(
          tradedPicks,
          draft.settings?.rounds ?? 15,
          rosters,
          users,
        )

        // Start countdown timer
        this.startCountdown(draft)

        // Start polling
        this.startPolling(draft)

        this.loading = false
      },
      error: () => {
        this.loading = false
      },
    })
  }

  /**
   * Builds base slot → team display name map.
   * draft_order is userId → slot (Sleeper API), so we invert it.
   * Mirrors iOS liveTeamsBySlot.
   */
  private buildBaseSlotMap(
    draftOrder: Record<string, number> | null,
    users: User[],
    rosters: Roster[],
  ): Map<number, string> {
    const slotToName = new Map<number, string>()

    if (!draftOrder) {
      // Fallback: no draft order recorded yet
      return slotToName
    }

    // draftOrder: userId → slotNumber
    Object.entries(draftOrder).forEach(([userId, slot]) => {
      const user = users.find(u => u.user_id === userId)
      const name =
        (user?.metadata?.team_name as string) ||
        user?.display_name ||
        user?.username ||
        `Slot ${slot}`
      slotToName.set(slot, name)
    })

    return slotToName
  }

  /**
   * Builds per-round slot override map from traded picks.
   * Mirrors iOS liveTeamsBySlotByRound.
   *
   * Algorithm:
   *   1. Build rosterId → userId map from rosters.
   *   2. For each traded pick: the pick was originally owned by previous_owner_id (rosterId),
   *      and now belongs to owner_id (rosterId). Find the slot from base map for
   *      previous_owner_id's userId, then override that slot's name with owner_id's team name.
   *
   * Key: Sleeper traded_picks records use roster_id, not draft_slot.
   * We bridge through the draft_order: userId → slot → find which roster maps to that userId.
   */
  private buildSlotByRound(
    tradedPicks: TradedPick[],
    totalRounds: number,
    rosters: Roster[],
    users: User[],
  ): Map<number, Map<number, string>> {
    const slotByRound = new Map<number, Map<number, string>>()

    // Build rosterId → userId lookup
    const rosterToUser = new Map<number, string>()
    rosters.forEach(r => {
      if (r.owner_id) rosterToUser.set(r.roster_id, r.owner_id)
    })

    // Build userId → slot lookup (inverse of draft_order)
    const draft = this.draft
    const userToSlot = new Map<string, number>()
    if (draft?.draft_order) {
      Object.entries(draft.draft_order).forEach(([userId, slot]) => {
        userToSlot.set(userId, slot)
      })
    }

    tradedPicks.forEach(tp => {
      const round = tp.round

      // Get the original owner's userId and find their draft slot
      const originalUserId = rosterToUser.get(tp.previous_owner_id)
      if (!originalUserId) return

      const slot = userToSlot.get(originalUserId)
      if (slot == null) return

      // Get the current owner's team name
      const currentUserId = rosterToUser.get(tp.owner_id)
      if (!currentUserId) return

      const currentUser = users.find(u => u.user_id === currentUserId)
      const currentName =
        (currentUser?.metadata?.team_name as string) ||
        currentUser?.display_name ||
        currentUser?.username ||
        `Roster ${tp.owner_id}`

      // Set the override for this round/slot
      if (!slotByRound.has(round)) {
        slotByRound.set(round, new Map())
      }
      slotByRound.get(round)!.set(slot, currentName)
    })

    return slotByRound
  }

  /** Resolve owner name for a given round/slot, applying traded_picks override. */
  ownerNameForCell(round: number, slot: number): string {
    return this.slotByRound.get(round)?.get(slot) ?? this.baseSlotToName.get(slot) ?? `Slot ${slot}`
  }

  private startCountdown(draft: DraftModel): void {
    interval(1000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.countdown = this.computeCountdown(draft)
    })
    this.countdown = this.computeCountdown(draft)
  }

  private computeCountdown(draft: DraftModel): string {
    if (draft.status === 'complete') return 'Draft complete'
    if (draft.status === 'pre_draft') {
      if (!draft.start_time) return 'Draft not yet scheduled'
      const msLeft = draft.start_time - Date.now()
      if (msLeft <= 0) return 'Starting soon...'
      return this.formatMs(msLeft)
    }
    if (draft.status === 'drafting') {
      return 'Draft in progress'
    }
    return ''
  }

  private formatMs(ms: number): string {
    const totalSecs = Math.floor(ms / 1000)
    const days = Math.floor(totalSecs / 86400)
    const hours = Math.floor((totalSecs % 86400) / 3600)
    const mins = Math.floor((totalSecs % 3600) / 60)
    const secs = totalSecs % 60

    if (days > 0) return `${days}d ${hours}h ${mins}m`
    if (hours > 0) return `${hours}h ${mins}m ${secs}s`
    return `${mins}m ${secs}s`
  }

  private startPolling(draft: DraftModel): void {
    if (draft.status === 'complete') return

    const pollInterval = draft.status === 'drafting' ? 5000 : 30000

    interval(pollInterval).pipe(
      switchMap(() => this.draftService.getDraftPicks(draft)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (picks) => {
        draft.addPicks(picks)
        this.buildRounds(draft, picks)
        // Stop polling once complete
        if (draft.status === 'complete') {
          this.countdown = 'Draft complete'
        }
      },
    })

    // Build initial rounds immediately from cached picks
    this.draftService.getDraftPicks(draft).pipe(take(1)).subscribe(picks => {
      this.buildRounds(draft, picks)
    })
  }

  private buildRounds(draft: DraftModel, picks: DraftPick[]): void {
    const pickMap = new Map<string, DraftPick>()
    picks.forEach(p => pickMap.set(`${p.round}.${p.draft_slot}`, p))

    const totalRounds = draft.settings?.rounds ?? 15
    this.rounds = []

    for (let r = 1; r <= totalRounds; r++) {
      const cells: LiveCell[] = []
      for (let s = 1; s <= this.teamCount; s++) {
        const pick = pickMap.get(`${r}.${s}`) ?? null
        const ownerName = this.ownerNameForCell(r, s)
        const isMine = pick ? pick.picked_by === this.mySleeperUserId : false
        cells.push({ round: r, slot: s, ownerName, pick, isMine })
      }
      this.rounds.push({ round: r, cells })
    }
  }

  // =========================================
  // View controls
  // =========================================

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode
  }

  setPickFilter(filter: PickFilter): void {
    this.pickFilter = filter
  }

  get filteredRounds(): LiveRound[] {
    if (this.pickFilter === 'all') return this.rounds
    // My Picks: only show rows that have at least one of my picks in rounds list
    return this.rounds.map(r => ({
      ...r,
      cells: r.cells.filter(c => c.isMine),
    })).filter(r => r.cells.length > 0)
  }

  isCellDimmed(cell: LiveCell): boolean {
    return this.pickFilter === 'mine' && !cell.isMine
  }

  get draftStatusLabel(): string {
    if (!this.draft) return ''
    const labels: Record<string, string> = {
      pre_draft: 'Pre-Draft',
      drafting: 'Live',
      complete: 'Complete',
      paused: 'Paused',
    }
    return labels[this.draft.status] ?? this.draft.status
  }
}
