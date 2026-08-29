import { Component, Input, OnInit } from '@angular/core'
import { NgFor, NgIf, DatePipe } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { take } from 'rxjs/operators'
import {
  Comment,
  CommentsService,
  CommentTarget,
} from 'src/app/services/comments.service'

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
  loading = true
  posting = false
  error = ''

  constructor(private comments$: CommentsService) {}

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
      .add(this.targetType, this.targetId, body)
      .pipe(take(1))
      .subscribe({
        next: (comments) => {
          this.comments = comments
          this.draft = ''
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
