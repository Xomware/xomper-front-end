import { Injectable } from '@angular/core'
import { HttpClient, HttpParams } from '@angular/common/http'
import { Observable, of } from 'rxjs'
import { catchError, map } from 'rxjs/operators'
import { environment } from 'src/environments/environment'

/** What a comment thread hangs off. */
export type CommentTarget = 'league' | 'player' | 'trade'

export interface CommentAuthor {
  userId: string
  /** The name Xomper owns. Never the unverified Sleeper handle. */
  displayName: string
  sleeperAvatar: string
}

export interface Comment {
  commentId: string
  body: string
  createdAt: string
  author: CommentAuthor
  mentions: string[]
  likeCount: number
  /** Server-computed, so the client draws one button without searching ids. */
  likedByMe: boolean
  /** Whether to offer a delete control. */
  mine: boolean
}

interface ThreadResponse {
  targetType: string
  targetId: string
  count: number
  comments: Comment[]
}

/**
 * Comment threads.
 *
 * Stateless by design, unlike the friends and follows services: a thread
 * belongs to whatever is on screen, so caching one would only risk showing a
 * league's comments under a player. The component holds what it fetched.
 */
@Injectable({ providedIn: 'root' })
export class CommentsService {
  constructor(private http: HttpClient) {}

  private get baseUrl(): string {
    return `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev/comments`
  }

  /**
   * Fetch a thread.
   *
   * Returns empty rather than erroring: comments sit alongside a page's real
   * content, and a comment outage must not take that page down with it.
   */
  list(targetType: CommentTarget, targetId: string): Observable<Comment[]> {
    const params = new HttpParams().set('targetType', targetType).set('targetId', targetId)
    return this.http.get<ThreadResponse>(`${this.baseUrl}/list`, { params }).pipe(
      map((response) => response?.comments ?? []),
      catchError(() => of([])),
    )
  }

  add(
    targetType: CommentTarget,
    targetId: string,
    body: string,
    mentions: string[] = [],
  ): Observable<Comment[]> {
    return this.mutate('add', 'PUT', { targetType, targetId, body, mentions })
  }

  remove(targetType: CommentTarget, targetId: string, commentId: string): Observable<Comment[]> {
    return this.mutate('delete', 'DELETE', { targetType, targetId, commentId })
  }

  react(
    targetType: CommentTarget,
    targetId: string,
    commentId: string,
    liked: boolean,
  ): Observable<Comment[]> {
    return this.mutate('react', 'PUT', { targetType, targetId, commentId, liked })
  }

  private mutate(
    path: string,
    method: 'PUT' | 'DELETE',
    body: Record<string, unknown>,
  ): Observable<Comment[]> {
    // Errors propagate, unlike list(): the user typed something and needs to
    // know whether it landed. Each response is the whole thread, so one call
    // both changes and re-syncs.
    return this.http
      .request<ThreadResponse>(method, `${this.baseUrl}/${path}`, { body })
      .pipe(map((response) => response?.comments ?? []))
  }
}
