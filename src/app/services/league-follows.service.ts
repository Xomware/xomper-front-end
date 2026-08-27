import { Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { BehaviorSubject, Observable, of } from 'rxjs'
import { catchError, map, tap } from 'rxjs/operators'
import { environment } from 'src/environments/environment'

/** One league the caller is in, as returned by `/me/leagues`. */
export interface FollowedLeague {
  leagueId: string
  name: string
  season: string
  status: string
  totalRosters: number
  avatar: string
  /** `settings.type === 2` server-side. Decides which value source prices it. */
  isDynasty: boolean
  isFollowed: boolean
}

interface LeaguesResponse {
  season: string
  count: number
  leagues: FollowedLeague[]
}

/** Survives a reload so a refresh does not silently switch leagues. */
const SELECTED_LEAGUE_KEY = 'xomper.selectedLeagueId'

/**
 * The leagues this user is in, and which one they are looking at.
 *
 * The list comes from the API, which reads Sleeper live — membership changes
 * without telling us. Which league is *selected* is a local choice and lives
 * in localStorage, because it is a per-device preference rather than
 * something worth a round trip on every navigation.
 *
 * This is what makes the app multi-league. `LeagueService` previously fell
 * back to a single build-time id, so every user saw the same league.
 */
@Injectable({ providedIn: 'root' })
export class LeagueFollowsService {
  private readonly leaguesSubject = new BehaviorSubject<FollowedLeague[]>([])
  readonly leagues$ = this.leaguesSubject.asObservable()

  private readonly selectedSubject = new BehaviorSubject<string | null>(
    this.readStoredSelection(),
  )
  readonly selectedLeagueId$ = this.selectedSubject.asObservable()

  constructor(private http: HttpClient) {}

  private get baseUrl(): string {
    return `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev/me`
  }

  get leagues(): FollowedLeague[] {
    return this.leaguesSubject.value
  }

  get followed(): FollowedLeague[] {
    return this.leagues.filter((l) => l.isFollowed)
  }

  get selectedLeagueId(): string | null {
    return this.selectedSubject.value
  }

  get selectedLeague(): FollowedLeague | null {
    const id = this.selectedLeagueId
    return this.leagues.find((l) => l.leagueId === id) ?? null
  }

  /**
   * Fetch the league list and settle on a selection.
   *
   * Returns an empty list rather than erroring: a user with no linked Sleeper
   * account legitimately has no leagues, and the auth guard already handles
   * that case. Failing here would block navigation on a list that is only
   * needed to populate a switcher.
   */
  load(): Observable<FollowedLeague[]> {
    return this.http.get<LeaguesResponse>(`${this.baseUrl}/leagues`).pipe(
      map((response) => response.leagues ?? []),
      tap((leagues) => {
        this.leaguesSubject.next(leagues)
        this.reconcileSelection(leagues)
      }),
      catchError(() => of([])),
    )
  }

  select(leagueId: string): void {
    this.selectedSubject.next(leagueId)
    this.writeStoredSelection(leagueId)
  }

  follow(league: FollowedLeague): Observable<FollowedLeague[]> {
    return this.mutate('follow', 'PUT', {
      leagueId: league.leagueId,
      name: league.name,
      season: league.season,
    })
  }

  unfollow(league: FollowedLeague): Observable<FollowedLeague[]> {
    return this.mutate('unfollow', 'DELETE', { leagueId: league.leagueId })
  }

  clear(): void {
    this.leaguesSubject.next([])
    this.selectedSubject.next(null)
    this.writeStoredSelection(null)
  }

  private mutate(
    path: string,
    method: 'PUT' | 'DELETE',
    body: Record<string, string>,
  ): Observable<FollowedLeague[]> {
    // Both endpoints return the full refreshed list, so one call both mutates
    // and re-syncs — no second GET, and no chance of the two disagreeing.
    return this.http
      .request<LeaguesResponse>(method, `${this.baseUrl}/${path}`, { body })
      .pipe(
        map((response) => response.leagues ?? []),
        tap((leagues) => {
          this.leaguesSubject.next(leagues)
          this.reconcileSelection(leagues)
        }),
      )
  }

  /**
   * Keep the selection pointing at something real.
   *
   * A stored id can outlive the league it names — unfollowed, left, or a new
   * season minting a new id. Falling back to the first followed league beats
   * leaving the app pointed at nothing.
   */
  private reconcileSelection(leagues: FollowedLeague[]): void {
    const followed = leagues.filter((l) => l.isFollowed)
    const current = this.selectedSubject.value

    if (current && followed.some((l) => l.leagueId === current)) return

    // The API already sorts followed and in-season first, so the head of the
    // list is the most sensible default without re-deriving that rule here.
    const next = followed[0]?.leagueId ?? null
    this.selectedSubject.next(next)
    this.writeStoredSelection(next)
  }

  private readStoredSelection(): string | null {
    try {
      return localStorage.getItem(SELECTED_LEAGUE_KEY)
    } catch {
      // Private browsing and blocked site data both throw here. A missing
      // preference is not worth failing over.
      return null
    }
  }

  private writeStoredSelection(leagueId: string | null): void {
    try {
      if (leagueId) localStorage.setItem(SELECTED_LEAGUE_KEY, leagueId)
      else localStorage.removeItem(SELECTED_LEAGUE_KEY)
    } catch {
      // Same as above — the selection still works for this session.
    }
  }
}
