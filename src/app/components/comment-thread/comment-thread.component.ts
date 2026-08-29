import { Component, Input, OnInit } from '@angular/core'
import { NgFor, NgIf, DatePipe } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { take } from 'rxjs/operators'
import {
  Comment,
  CommentsService,
  CommentTarget,
} from 'src/app/services/comments.service'
import { FriendsService, Person } from 'src/app/services/friends.service'

/** Matches the API's cap, so the failure happens before a round trip. */
const BODY_MAX = 1000

/**
 * A comment thread on whatever page hosts it.
 *
 * Takes a target rather than knowing about leagues or players, so the same
 * component serves a league page, a player page and a trade without three
 * near-identical copies.
 */
@Component({
  selector: 'app-comment-thread',
  standalone: true,
  imports: [NgIf, NgFor, DatePipe, FormsModule],
  templateUrl: './comment-thread.component.html',
  styleUrls: ['./comment-thread.component.scss'],
})
export class CommentThreadComponent implements OnInit {
  @Input({ required: true }) targetType!: CommentTarget
  @Input({ required: true }) targetId!: string
  /** Shown above the thread. Defaults to something neutral. */
  @Input() heading = 'Comments'

  readonly maxLength = BODY_MAX

  comments: Comment[] = []
  draft = ''

  /**
   * People offered after an `@`.
   *
   * Friends only. Mentions are resolved to Cognito subs here rather than
   * parsed from the text server-side, because display names are not unique --
   * matching on them would eventually tag the wrong person. Offering only
   * people you already have a relationship with is also what keeps this from
   * being a directory of everyone.
   */
  suggestions: Person[] = []

  /** Subs picked from the menu, sent alongside the body. */
  private mentioned = new Map<string, string>()
  loading = true
  posting = false
  error = ''

  constructor(
    private comments$: CommentsService,
    private friends: FriendsService,
  ) {}

  ngOnInit(): void {
    if (!this.targetId) {
      this.loading = false
      return
    }
    this.comments$
      .list(this.targetType, this.targetId)
      .pipe(take(1))
      .subscribe((comments) => {
        this.comments = comments
        this.loading = false
      })
  }

  /**
   * Offer people when the caret sits in an `@word` at the end of the draft.
   *
   * Deliberately only the trailing token: matching mid-sentence would need
   * caret tracking for very little, and people type a mention as they reach
   * for it.
   */
  onDraftChange(): void {
    const match = /@([\w-]*)$/.exec(this.draft)
    if (!match) {
      this.suggestions = []
      return
    }
    const term = match[1].toLowerCase()
    this.suggestions = this.friends.graph.friends
      .filter((f) => f.displayName.toLowerCase().includes(term))
      .slice(0, 5)
  }

  choose(person: Person): void {
    // Replace the partial token, not the whole draft.
    this.draft = this.draft.replace(/@[\w-]*$/, `@${person.displayName} `)
    this.mentioned.set(person.displayName, person.userId)
    this.suggestions = []
  }

  /**
   * Subs for the names still present in the final text.
   *
   * Re-derived at post time rather than trusted from the picker: someone can
   * pick a name and then delete it, and tagging a person the comment no
   * longer names would be worse than missing one.
   */
  private mentionsInDraft(body: string): string[] {
    return [...this.mentioned.entries()]
      .filter(([name]) => body.includes(`@${name}`))
      .map(([, userId]) => userId)
  }

  post(): void {
    const body = this.draft.trim()
    this.error = ''
    if (!body) return
    if (body.length > BODY_MAX) {
      this.error = `Keep it to ${BODY_MAX} characters or fewer.`
      return
    }

    this.posting = true
    this.comments$
      .add(this.targetType, this.targetId, body, this.mentionsInDraft(body))
      .pipe(take(1))
      .subscribe({
        next: (comments) => {
          this.comments = comments
          this.draft = ''
          this.mentioned.clear()
          this.suggestions = []
          this.posting = false
        },
        error: (err) => {
          this.posting = false
          this.error = err?.error?.error?.message ?? 'That did not post.'
        },
      })
  }

  toggleLike(comment: Comment): void {
    this.comments$
      .react(this.targetType, this.targetId, comment.commentId, !comment.likedByMe)
      .pipe(take(1))
      .subscribe({
        next: (comments) => (this.comments = comments),
        error: () => (this.error = 'Could not save that.'),
      })
  }

  remove(comment: Comment): void {
    this.comments$
      .remove(this.targetType, this.targetId, comment.commentId)
      .pipe(take(1))
      .subscribe({
        next: (comments) => (this.comments = comments),
        error: () => (this.error = 'Could not delete that.'),
      })
  }

  initials(comment: Comment): string {
    return (comment.author?.displayName || '?').slice(0, 1).toUpperCase()
  }

  avatarUrl(comment: Comment): string | null {
    const avatar = comment.author?.sleeperAvatar
    return avatar ? `https://sleepercdn.com/avatars/${avatar}` : null
  }
}
