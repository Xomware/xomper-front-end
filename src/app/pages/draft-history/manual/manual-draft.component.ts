import { Component, OnInit, DestroyRef, inject } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgIf, NgFor, DecimalPipe } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { forkJoin, switchMap } from 'rxjs'
import { take } from 'rxjs/operators'
import { PlayerService } from 'src/app/services/player.service'
import { LeagueService } from 'src/app/services/league.service'
import { PlayerValuesService } from 'src/app/services/player-values.service'
import { ValueBook } from 'src/app/models/value-book.model'
import {
  DraftAssistantService,
  DraftCandidate,
  StrategyPreset,
  STRATEGY_LABELS,
  BoardPrefs,
  emptyPrefs,
} from 'src/app/services/draft-assistant.service'
import { pressureFrom } from 'src/app/services/draft-context.service'
import {
  ManualDraft,
  PlayerLookup,
  emptyManualDraft,
  ownerForSlot,
  isMyTurn,
  onTheClock,
  recordPick,
  searchAvailable,
  toDraftPicks,
  totalPicks,
  undoLastPick,
} from 'src/app/services/manual-draft.service'

/** Survives a refresh mid-draft. Losing 60 picks to a stray reload is unacceptable. */
const STORAGE_KEY = 'xomper.manualDraft'

/**
 * Mark-off mode — for drafts we cannot read.
 *
 * ESPN, Yahoo, CBS and a room with a whiteboard have no live pick feed. The
 * user taps players off as they go, and `manual-draft.service` turns that into
 * the same `DraftPick[]` the live board already consumes.
 *
 * Values come from the league already selected in Draft History, the same book
 * the live board uses. Marking players off is only half the job — the point is
 * being told who to take next.
 */
@Component({
  selector: 'app-manual-draft',
  templateUrl: './manual-draft.component.html',
  styleUrls: ['./manual-draft.component.scss'],
  standalone: true,
  imports: [NgIf, NgFor, FormsModule, DecimalPipe],
})
export class ManualDraftComponent implements OnInit {
  private destroyRef = inject(DestroyRef)

  draft: ManualDraft = emptyManualDraft()
  players: PlayerLookup = {}
  loading = true

  query = ''
  results: string[] = []

  // Suggestions, from the same value book the live board uses.
  board: DraftCandidate[] = []
  prefs: BoardPrefs = emptyPrefs()
  strategies: StrategyPreset[] = ['bpa', 'needs', 'rb-heavy', 'wr-heavy', 'qb-early']
  private book: ValueBook | null = null
  private leagueId = ''

  constructor(
    private playerService: PlayerService,
    private leagueService: LeagueService,
    private playerValuesService: PlayerValuesService,
    private assistant: DraftAssistantService,
  ) {}

  ngOnInit(): void {
    this.draft = this.restore() ?? emptyManualDraft()

    this.leagueId = this.leagueService.getMyLeague()?.getId() ?? ''

    forkJoin({
      league: this.leagueService.searchLeague(this.leagueId),
      playerMap: this.playerService.getPlayerMap(),
    })
      .pipe(
        switchMap(({ league, playerMap }) => {
          this.players = playerMap as unknown as PlayerLookup
          this.loading = false
          this.search()
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
        // Failure leaves the panel off. Mark-off still works without
        // suggestions, and an error banner over a usable board is worse.
        error: () => {
          this.book = null
          this.loading = false
        },
      })
  }

  /**
   * Re-rank against the picks marked off so far.
   *
   * `toDraftPicks` is what makes this possible: the assistant is handed the
   * same shape it gets from a live Sleeper draft, so nothing here is a second
   * ranking path.
   */
  private refreshBoard(): void {
    if (!this.book) return
    this.board = this.assistant.suggest(
      toDraftPicks(this.draft, this.players),
      this.players as never,
      this.book,
      this.prefs,
      ownerForSlot(this.draft.mySlot),
    )
  }

  setStrategy(preset: StrategyPreset): void {
    this.prefs = { ...this.prefs, preset }
    this.refreshBoard()
  }

  strategyLabel(preset: StrategyPreset): string {
    return STRATEGY_LABELS[preset]
  }

  /** What the teams picking before you still need. Counts, never a prediction. */
  get pressureLines(): string[] {
    const owners: string[] = []
    for (let pick = this.draft.picks.length + 1; pick <= totalPicks(this.draft); pick++) {
      const slot = onTheClock({ ...this.draft, picks: this.draft.picks.slice(0, pick - 1) })
      if (slot === this.draft.mySlot) break
      if (slot) owners.push(ownerForSlot(slot))
    }
    if (!owners.length) return []

    const pressure = pressureFrom(
      owners,
      toDraftPicks(this.draft, this.players),
      this.players,
      { teams: this.draft.teams, rounds: this.draft.rounds } as never,
    )
    return Object.entries(pressure.teamsNeeding)
      .filter(([position]) => ['QB', 'RB', 'WR', 'TE'].includes(position))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([position, teams]) => `${teams} need ${position}`)
  }

  // -------- board state --------

  get onTheClockSlot(): number | null {
    return onTheClock(this.draft)
  }

  get myTurn(): boolean {
    return isMyTurn(this.draft)
  }

  get pickNumber(): number {
    return Math.min(this.draft.picks.length + 1, totalPicks(this.draft))
  }

  get complete(): boolean {
    return this.draft.picks.length >= totalPicks(this.draft)
  }

  /** Most recent first — what you want to see is what just went. */
  get recentPicks(): Array<{ pickNo: number; slot: number; name: string }> {
    return toDraftPicks(this.draft, this.players)
      .slice(-8)
      .reverse()
      .map((pick) => ({
        pickNo: pick.pick_no,
        slot: pick.draft_slot,
        name:
          `${pick.metadata.first_name} ${pick.metadata.last_name}`.trim() || pick.player_id,
      }))
  }

  // -------- actions --------

  search(): void {
    this.results = searchAvailable(this.query, this.players, this.draftedIds)
  }

  take(playerId: string): void {
    this.draft = recordPick(this.draft, playerId)
    this.persist()
    this.refreshBoard()
    // Clearing the box is the whole ergonomic point: the next pick is seconds
    // away and nobody should have to select-all first.
    this.query = ''
    this.results = []
  }

  undo(): void {
    this.draft = undoLastPick(this.draft)
    this.persist()
    this.search()
    this.refreshBoard()
  }

  reset(): void {
    this.draft = emptyManualDraft(this.draft.teams, this.draft.rounds, this.draft.mySlot)
    this.persist()
    this.search()
    this.refreshBoard()
  }

  applySetup(): void {
    // Coerce, because an empty number input binds to null and would make every
    // downstream slot calculation NaN.
    this.draft = {
      ...this.draft,
      teams: Number(this.draft.teams) || 12,
      rounds: Number(this.draft.rounds) || 15,
      mySlot: Number(this.draft.mySlot) || 1,
    }
    this.persist()
    this.refreshBoard()
  }

  nameFor(playerId: string): string {
    const player = this.players[playerId]
    if (!player) return playerId
    return `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || playerId
  }

  positionFor(playerId: string): string {
    return this.players[playerId]?.position ?? ''
  }

  // -------- persistence --------

  private get draftedIds(): Set<string> {
    return new Set(this.draft.picks)
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.draft))
  }

  private restore(): ManualDraft | null {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      // Specific recovery, not a blanket catch: corrupt storage would otherwise
      // throw on every load and leave no way back into the page short of
      // clearing site data by hand.
      localStorage.removeItem(STORAGE_KEY)
      return null
    }

    // A shape that does not look like a draft is discarded rather than trusted;
    // a bad restore would put every later pick on the wrong team.
    const draft = parsed as Partial<ManualDraft>
    if (!draft || !Array.isArray(draft.picks) || !draft.teams) return null
    return draft as ManualDraft
  }
}
