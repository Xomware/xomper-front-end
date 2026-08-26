import { Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { BehaviorSubject, Observable, firstValueFrom, of } from 'rxjs'
import { catchError, map, tap } from 'rxjs/operators'
import { environment } from 'src/environments/environment'

/**
 * The caller's platform record, as returned by `/me/profile`.
 *
 * Camel-cased and flat, matching the API. This replaces the Supabase
 * `profiles` row, which was snake_cased because it was a Postgres table the
 * frontend queried directly.
 */
export interface UserProfile {
  userId: string
  email: string
  sleeperUserId: string
  sleeperUsername: string
  sleeperAvatar: string
  /** Computed server-side so the guard checks a boolean, not field presence. */
  hasLinkedSleeper: boolean
  createdAt: string
  updatedAt: string
}

interface ProfileResponse {
  user: UserProfile
}

/**
 * Everything about a user that is Xomper's rather than Cognito's.
 *
 * The `xomware-users` pool is shared across the estate, so Sleeper linkage
 * cannot live on it as a custom attribute — it belongs to this app alone.
 * `CognitoService` owns identity; this owns the record hanging off it.
 *
 * Reads go through the API rather than a database client in the browser.
 * That is the point of the migration: the old service held a Supabase
 * connection and queried `profiles` directly, which meant the table's access
 * rules were the only thing between a signed-in user and every other user's
 * row.
 */
@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private readonly profileSubject = new BehaviorSubject<UserProfile | null>(null)
  readonly profile$ = this.profileSubject.asObservable()

  constructor(private http: HttpClient) {}

  private get baseUrl(): string {
    return `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev/me`
  }

  getProfile(): UserProfile | null {
    return this.profileSubject.value
  }

  /**
   * Fetch the record and cache it.
   *
   * The endpoint creates the row on first call, so this doubles as
   * provisioning — a user who has just signed up for the first time gets a
   * record here rather than needing a Cognito trigger.
   */
  load(): Observable<UserProfile | null> {
    return this.http.get<ProfileResponse>(`${this.baseUrl}/profile`).pipe(
      map((response) => response.user),
      tap((profile) => this.profileSubject.next(profile)),
      catchError(() => of(null)),
    )
  }

  /** Drop the cached record. Call on sign-out so the next user starts clean. */
  clear(): void {
    this.profileSubject.next(null)
  }

  /**
   * Attach a Sleeper account.
   *
   * Only the username is sent: the API resolves it against Sleeper and
   * stores the numeric id, so an unusable handle is rejected before it is
   * saved rather than failing later during roster matching. Rejection
   * surfaces as an error rather than `false`, because the caller needs the
   * message to tell the user what was wrong with what they typed.
   */
  linkSleeper(sleeperUsername: string): Observable<UserProfile> {
    return this.http
      .put<ProfileResponse>(`${this.baseUrl}/sleeper-link`, { sleeperUsername })
      .pipe(
        map((response) => response.user),
        tap((profile) => this.profileSubject.next(profile)),
      )
  }

  unlinkSleeper(): Observable<UserProfile> {
    return this.http.delete<ProfileResponse>(`${this.baseUrl}/sleeper-unlink`).pipe(
      map((response) => response.user),
      tap((profile) => this.profileSubject.next(profile)),
    )
  }

  /**
   * Whether this account has linked a Sleeper user yet.
   *
   * Everything downstream keys off it — resolving the signed-in account to a
   * roster, the profile tab, `getMyUser()`. Without a link the app renders as
   * though nobody is signed in, which is why the guard sends unlinked users
   * to `/link-sleeper` rather than letting them reach an empty dashboard.
   *
   * Fetches rather than reading the cache: a guard can run before the cached
   * copy has landed.
   */
  async hasLinkedSleeper(): Promise<boolean> {
    try {
      const profile = await firstValueFrom(this.load())
      // A failed load returns null. Treat that as linked: letting the user
      // into an app that may be sparse beats trapping them in a redirect
      // loop to a page they have already completed.
      return profile ? profile.hasLinkedSleeper : true
    } catch {
      return true
    }
  }
}
