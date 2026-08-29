import { Component, OnInit, DestroyRef, inject } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router } from '@angular/router'
import { AsyncPipe, DecimalPipe, NgIf, NgFor, NgClass, LowerCasePipe } from '@angular/common'
import { interval, timer, switchMap, of, forkJoin, BehaviorSubject, Observable } from 'rxjs'
import { map, take } from 'rxjs/operators'
import { LeagueService, TradedPick } from 'src/app/services/league.service'
import {
  AdpService,
  AdpFormat,
  AdpPlayer,
  adpByName,
  adpFormatFor,
  adpKey,
} from 'src/app/services/adp.service'
import { nextPickFor } from 'src/app/services/draft-order'
import { DraftService } from 'src/app/services/draft.service'
import { DraftModel } from 'src/app/models/draft.model'
import { DraftPick } from 'src/app/models/draft.interface'
import { User } from 'src/app/models/user.interface'
import { Roster } from 'src/app/models/roster.interface'
import { LoaderComponent } from '../../../components/loader/loader.component'
import { UserProfileService } from 'src/app/services/user-profile.service'
import { PlayerService } from 'src/app/services/player.service'
import { PlayerValuesService } from 'src/app/services/player-values.service'
import {
  BoardPrefs,
  DraftAssistantService,
  DraftCandidate,
  emptyPrefs,
  STRATEGY_LABELS,
  StrategyPreset,
} from 'src/app/services/draft-assistant.service'
import { ValueBook } from 'src/app/models/value-book.model'

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
 * Polling: 5s while drafting, 30s while pre_draft, stops on complete. The
 * delay is re-derived on every tick rather than fixed at subscribe time, so a
 * board opened before the draft speeds up on its own when picks start.
 */
@Component({
  selector: 'app-draft-live',
  templateUrl: './draft-live.component.html',
  styleUrls: ['./draft-live.component.scss'],
  standalone: true,
  imports: [LoaderComponent, NgIf, NgFor, NgClass, AsyncPipe, DecimalPipe, LowerCasePipe],
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

  // Poll health
  lastPollAt = 0
  pollError: string | null = null

  // ADP context. Null format means no ADP set fits this league, which is a
  // real answer for TE-premium rather than a load failure.
  adpFormat: AdpFormat | null = null
  adpSampleEnd = ''
  private adp = new Map<string, AdpPlayer>()
  private myNextPickNo: number | null = null

  // Kept for the next-pick walk, which needs ownership after trades.
  private tradedPicks: TradedPick[] = []
  private rosters: Roster[] = []

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

  // ---- assistant ----
  /** Who to take next, ranked. Empty until the value book lands. */
  board: DraftCandidate[] = []
  prefs: BoardPrefs = emptyPrefs()
  showAssistant = true
  readonly strategies = Object.keys(STRATEGY_LABELS) as StrategyPreset[]

  strategyLabel(preset: StrategyPreset): string {
    return STRATEGY_LABELS[preset]
  }

  private book: ValueBook | null = null
  private playerMap: Record<string, { first_name?: string; last_name?: string; position?: string }> = {}
  private latestPicks: DraftPick[] = []

  constructor(
    private leagueService: LeagueService,
    private draftService: DraftService,
    private profiles: UserProfileService,
    private playerService: PlayerService,
    private playerValuesService: PlayerValuesService,
    private assistant: DraftAssistantService,
    private adpService: AdpService,
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
    const profile = this.profiles.getProfile()
    this.mySleeperUserId = profile?.sleeperUserId || null

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
        this.tradedPicks = tradedPicks
        this.rosters = rosters

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

        // The board renders without values; the assistant fills in when the
        // book arrives. Loading it inside the main forkJoin would hold the
        // whole page on a request the board does not need.
        this.loadAssistant()
      },
      error: () => {
        this.loading = false
      },
    })
  }

  /**
   * Load what the assistant needs: this league's value book and the player
   * map. Failure is silent — the draft board is still useful without
   * suggestions, and an error banner over a working board would be worse
   * than no panel.
   */
  private loadAssistant(): void {
    forkJoin({
      league: this.leagueService.searchLeague(this.leagueId),
      playerMap: this.playerService.getPlayerMap(),
    })
      .pipe(
        switchMap(({ league, playerMap }) => {
          this.playerMap = playerMap as never
          this.loadAdp(league)
          return this.playerValuesService.bookFor(league)
        }),
        take(1),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (book) => {
          this.book = book
          this.refreshBoard()
        },
        error: () => {
          this.book = null
        },
      })
  }

  /**
   * ADP for this league's format, if one fits.
   *
   * Failure and "no format fits" both leave the column off. The board is
   * useful without it, so neither is worth an error banner.
   */
  private loadAdp(league: unknown): void {
    const scoring = (league as { scoring_settings?: Record<string, number> })
      ?.scoring_settings
    this.adpFormat = adpFormatFor(this.draft?.settings ?? null, scoring)
    if (!this.adpFormat) return

    this.adpService
      .forFormat(this.adpFormat)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe((snapshot) => {
        this.adp = adpByName(snapshot)
        this.adpSampleEnd = snapshot?.sampleEnd ?? ''
        if (!snapshot) this.adpFormat = null
      })
  }

  /** Where the user picks next, used only to show the gap beside ADP. */
  private refreshNextPick(picks: DraftPick[]): void {
    const draft = this.draft
    if (!draft || !this.mySleeperUserId) {
      this.myNextPickNo = null
      return
    }
    const lastPick = picks.reduce((max, p) => Math.max(max, p.pick_no ?? 0), 0)
    const next = nextPickFor(this.mySleeperUserId, lastPick, {
      draftOrder: draft.draft_order,
      tradedPicks: this.tradedPicks,
      rosters: this.rosters,
      teams: draft.settings?.teams ?? 12,
      rounds: draft.settings?.rounds ?? 15,
      reversalRound: draft.settings?.reversal_round ?? 0,
    })
    this.myNextPickNo = next?.pickNo ?? null
  }

  /**
   * ADP context for one candidate: where he usually goes, where you pick next,
   * and the gap between. Deliberately three numbers and no probability - the
   * calibration spike found none worth stating.
   */
  adpContext(playerId: string, position: string): string | null {
    if (!this.adpFormat) return null
    const meta = this.playerMap[playerId] as { first_name?: string; last_name?: string }
    const name = `${meta?.first_name ?? ''} ${meta?.last_name ?? ''}`.trim()
    const entry = this.adp.get(adpKey(name, position))
    if (!entry) return null

    const adp = Math.round(entry.adp)
    if (this.myNextPickNo === null) return `ADP ${adp}`
    const gap = this.myNextPickNo - adp
    const sign = gap > 0 ? `+${gap}` : `${gap}`
    return `ADP ${adp} · next ${this.myNextPickNo} · ${sign}`
  }

  /** Re-rank against the picks seen so far. Cheap enough to run per poll. */
  private refreshBoard(): void {
    if (!this.book) return
    this.board = this.assistant.suggest(
      this.latestPicks,
      this.playerMap,
      this.book,
      this.prefs,
      this.mySleeperUserId,
    )
  }

  setStrategy(preset: StrategyPreset): void {
    this.prefs = { ...this.prefs, preset }
    this.refreshBoard()
  }

  toggleLike(playerId: string): void {
    const likes = new Set(this.prefs.likes)
    const dislikes = new Set(this.prefs.dislikes)
    if (likes.has(playerId)) likes.delete(playerId)
    else {
      likes.add(playerId)
      // Liking something you previously buried is a change of mind, not both.
      dislikes.delete(playerId)
    }
    this.prefs = { ...this.prefs, likes, dislikes }
    this.refreshBoard()
  }

  toggleDislike(playerId: string): void {
    const likes = new Set(this.prefs.likes)
    const dislikes = new Set(this.prefs.dislikes)
    if (dislikes.has(playerId)) dislikes.delete(playerId)
    else {
      dislikes.add(playerId)
      likes.delete(playerId)
    }
    this.prefs = { ...this.prefs, likes, dislikes }
    this.refreshBoard()
  }

  isDisliked(playerId: string): boolean {
    return this.prefs.dislikes.has(playerId)
  }

  toggleAssistant(): void {
    this.showAssistant = !this.showAssistant
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
    // Build initial rounds immediately from cached picks
    this.draftService.getDraftPicks(draft).pipe(take(1)).subscribe(picks => {
      this.lastPollAt = Date.now()
      this.buildRounds(draft, picks)
    })

    if (draft.status === 'complete') return
    this.scheduleNextPoll(draft)
  }

  /**
   * One poll, then reschedule. Recursive rather than interval() because the
   * delay depends on draft.status, which changes underneath us mid-session.
   */
  private scheduleNextPoll(draft: DraftModel): void {
    timer(this.pollDelayMs(draft))
      .pipe(
        switchMap(() => this.draftService.getDraftPicks(draft)),
        take(1),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (picks) => {
          this.lastPollAt = Date.now()
          this.pollError = null
          draft.addPicks(picks)
          this.buildRounds(draft, picks)
          if (draft.status === 'complete') {
            this.countdown = 'Draft complete'
            return
          }
          this.scheduleNextPoll(draft)
        },
        error: () => {
          // A failed poll must not end the loop. The board keeps the last good
          // picks and the banner says how old they are; the old code let one
          // error terminate the stream and freeze the board until a reload.
          this.pollError = 'Pick feed unreachable — retrying'
          this.scheduleNextPoll(draft)
        },
      })
  }

  /**
   * Re-derived per tick. Proximity to the user's next pick belongs here too,
   * but that needs nextPickFor (#150) and is not worth duplicating.
   */
  private pollDelayMs(draft: DraftModel): number {
    return draft.status === 'drafting' ? 5000 : 30000
  }

  /** Stale once roughly three polls have gone by without a fresh board. */
  get boardIsStale(): boolean {
    if (!this.draft || this.draft.status === 'complete' || !this.lastPollAt) return false
    return Date.now() - this.lastPollAt > this.pollDelayMs(this.draft) * 3
  }

  get lastUpdatedLabel(): string {
    if (!this.lastPollAt) return ''
    const secs = Math.floor((Date.now() - this.lastPollAt) / 1000)
    if (secs < 5) return 'just now'
    if (secs < 60) return `${secs}s ago`
    return `${Math.floor(secs / 60)}m ago`
  }

  private buildRounds(draft: DraftModel, picks: DraftPick[]): void {
    // Every path that refreshes the board comes through here, so this is the
    // one place the assistant needs to learn about new picks.
    this.latestPicks = picks
    this.refreshNextPick(picks)
    this.refreshBoard()

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
