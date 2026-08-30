import { Component, Input } from '@angular/core'
import { NgIf, NgFor } from '@angular/common'
import { DraftCandidate } from 'src/app/services/draft-assistant.service'

/**
 * The second-screen panel.
 *
 * People draft on a phone with the draft app in the foreground, so this is what
 * they see in the seconds after switching apps. That budget is the whole design
 * constraint: one clear answer, two alternates, and how long they have — not a
 * board they would have to read.
 *
 * Presentational only. Everything is an input, so it renders identically over a
 * live Sleeper draft and over manual mark-off, and it can be tested without a
 * league, a value book or a pick feed.
 */
@Component({
  selector: 'app-now-panel',
  templateUrl: './now-panel.component.html',
  styleUrls: ['./now-panel.component.scss'],
  standalone: true,
  imports: [NgIf, NgFor],
})
export class NowPanelComponent {
  /** Ranked candidates. Only the first three are shown. */
  @Input() board: DraftCandidate[] = []

  /** Overall pick number the user picks next, if known. */
  @Input() nextPickNo: number | null = null

  /** Picks between now and then. Null when it cannot be worked out. */
  @Input() picksAway: number | null = null

  /** True when the user is the one on the clock. */
  @Input() myTurn = false

  /** Factual opponent need, e.g. "4 need RB". Never a prediction. */
  @Input() pressureLines: string[] = []

  /**
   * Players whose ADP sits past the user's next pick.
   *
   * Shown so the board can be read two picks deep — take the one who will not
   * come back, leave the one who probably will. This is ADP, not a probability:
   * replaying real drafts found no held-out skill in predicting survival
   * (SPIKE-adp-calibration.md), so the wording says "usually goes after" and
   * never states odds.
   */
  @Input() laterCandidates: Array<{ name: string; position: string; adp: number }> = []

  get top(): DraftCandidate | null {
    return this.board[0] ?? null
  }

  /** Two alternates. Three names is already more than a glance affords. */
  get alternates(): DraftCandidate[] {
    return this.board.slice(1, 3)
  }

  /**
   * The urgency line. Always carries the pick number when one is known —
   * "on the clock" alone leaves you counting rounds in your head.
   */
  get timing(): string {
    if (this.nextPickNo === null) return this.myTurn ? 'On the clock' : ''
    if (this.myTurn) return `On the clock · #${this.nextPickNo}`
    if (this.picksAway === null) return `Your pick #${this.nextPickNo}`
    if (this.picksAway === 1) return `You pick next · #${this.nextPickNo}`
    return `${this.picksAway} picks away · #${this.nextPickNo}`
  }
}
