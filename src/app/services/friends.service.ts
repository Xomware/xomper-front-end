import { Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { BehaviorSubject, Observable, of } from 'rxjs'
import { catchError, map, tap } from 'rxjs/operators'
import { environment } from 'src/environments/environment'

/** Another person, as the API hands them over. */
export interface Person {
  userId: string
  /** The name Xomper owns. Never the unverified Sleeper handle. */
  displayName: string
  sleeperUsername: string
  sleeperAvatar: string
  since: string
}

export interface FriendGraph {
  friends: Person[]
  incoming: Person[]
  outgoing: Person[]
  /** Incoming requests awaiting an answer. What the bell shows. */
  pendingCount: number
}

const EMPTY: FriendGraph = { friends: [], incoming: [], outgoing: [], pendingCount: 0 }

/**
 * The caller's social graph.
 *
 * Every mutation returns the whole graph, so one call both changes and
 * re-syncs — the client never holds a list that disagrees with the server,
 * and there is no second GET to race against the first.
 */
@Injectable({ providedIn: 'root' })
export class FriendsService {
  private readonly graphSubject = new BehaviorSubject<FriendGraph>(EMPTY)
  readonly graph$ = this.graphSubject.asObservable()

  constructor(private http: HttpClient) {}

  private get baseUrl(): string {
    return `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev/me`
  }

  get graph(): FriendGraph {
    return this.graphSubject.value
  }

  get pendingCount(): number {
    return this.graphSubject.value.pendingCount
  }

  /**
   * Load the graph.
   *
   * Swallows failures: the bell and the friends list are secondary, and a
   * social outage must not block navigation into the rest of the app.
   */
  load(): Observable<FriendGraph> {
    return this.http.get<FriendGraph>(`${this.baseUrl}/friends`).pipe(
      tap((graph) => this.graphSubject.next(graph)),
      catchError(() => of(EMPTY)),
    )
  }

  request(userId: string): Observable<FriendGraph> {
    return this.mutate('friend-request', 'PUT', userId)
  }

  accept(userId: string): Observable<FriendGraph> {
    return this.mutate('friend-accept', 'PUT', userId)
  }

  /** Decline, cancel, or unfriend — one operation on the server. */
  remove(userId: string): Observable<FriendGraph> {
    return this.mutate('friend-remove', 'DELETE', userId)
  }

  clear(): void {
    this.graphSubject.next(EMPTY)
  }

  private mutate(
    path: string,
    method: 'PUT' | 'DELETE',
    userId: string,
  ): Observable<FriendGraph> {
    // Errors propagate here, unlike load(): the user asked for this and needs
    // to know it did not happen.
    return this.http
      .request<FriendGraph>(method, `${this.baseUrl}/${path}`, { body: { userId } })
      .pipe(
        map((graph) => graph ?? EMPTY),
        tap((graph) => this.graphSubject.next(graph)),
      )
  }
}
