import { Component, OnInit, DestroyRef, inject } from '@angular/core'
import { NgIf, NgFor } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { take } from 'rxjs/operators'
import { PlayerService } from 'src/app/services/player.service'
import {
  ManualDraft,
  PlayerLookup,
  emptyManualDraft,
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
 * Deliberately not here: the suggestion board. It needs a value book, which is
 * derived from a Sleeper league — a manual draft may have no Sleeper league at
 * all. Wiring a value source for a non-Sleeper league is its own problem, so
 * this ships as accurate pick tracking rather than a half-wired assistant.
 */
@Component({
  selector: 'app-manual-draft',
  templateUrl: './manual-draft.component.html',
  styleUrls: ['./manual-draft.component.scss'],
  standalone: true,
  imports: [NgIf, NgFor, FormsModule],
})
export class ManualDraftComponent implements OnInit {
  private destroyRef = inject(DestroyRef)

  draft: ManualDraft = emptyManualDraft()
  players: PlayerLookup = {}
  loading = true

  query = ''
  results: string[] = []

  constructor(private playerService: PlayerService) {}

  ngOnInit(): void {
    this.draft = this.restore() ?? emptyManualDraft()

    this.playerService
      .getPlayerMap()
      .pipe(take(1))
      .subscribe({
        next: (map) => {
          this.players = map as unknown as PlayerLookup
          this.loading = false
          this.search()
        },
        error: () => {
          this.loading = false
        },
      })
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
    // Clearing the box is the whole ergonomic point: the next pick is seconds
    // away and nobody should have to select-all first.
    this.query = ''
    this.results = []
  }

  undo(): void {
    this.draft = undoLastPick(this.draft)
    this.persist()
    this.search()
  }

  reset(): void {
    this.draft = emptyManualDraft(this.draft.teams, this.draft.rounds, this.draft.mySlot)
    this.persist()
    this.search()
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
