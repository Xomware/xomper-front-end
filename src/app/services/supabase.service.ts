import { Injectable } from '@angular/core'
import { createClient, SupabaseClient, User } from '@supabase/supabase-js'
import { BehaviorSubject, Observable, from, of } from 'rxjs'
import { map, catchError, tap } from 'rxjs/operators'
import { environment } from 'src/environments/environment'

export interface WhitelistedUser {
  id: string
  email: string
  sleeper_username: string
  display_name: string
  role: string
  is_active: boolean
}

export interface Profile {
  id: string
  email: string
  sleeper_user_id: string | null
  sleeper_username: string | null
  sleeper_avatar: string | null
  display_name: string | null
  created_at: string
  updated_at: string
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient
  private currentUser = new BehaviorSubject<User | null>(null)
  private currentProfile = new BehaviorSubject<Profile | null>(null)
  private initialized = new BehaviorSubject<boolean>(false)

  currentUser$ = this.currentUser.asObservable()
  profile$ = this.currentProfile.asObservable()
  initialized$ = this.initialized.asObservable()

  constructor() {
    this.supabase = createClient(
      environment.supabaseUrl,
      environment.supabaseAnonKey,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true
        }
      }
    )

    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.currentUser.next(session?.user ?? null)

      if (session?.user) {
        this.loadProfile(session.user.id)
        this.loadWhitelistedUser(session.user.email ?? null)
      } else {
        this.currentProfile.next(null)
        this._whitelistedUser.next(null)
      }

      if (!this.initialized.value) {
        this.initialized.next(true)
      }
    })

    this.initSession()
  }

  private async initSession(): Promise<void> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession()
      this.currentUser.next(session?.user ?? null)

      if (session?.user) {
        this.loadProfile(session.user.id)
        this.loadWhitelistedUser(session.user.email ?? null)
      }
    } catch {
      // Session init failed silently
    } finally {
      this.initialized.next(true)
    }
  }

  private loadProfile(userId: string): void {
    this.supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (data && !error) {
          this.currentProfile.next(data as Profile)
        }
      })
  }

  private loadWhitelistedUser(email: string | null): void {
    if (!email) return
    this.supabase
      .from('whitelisted_users')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('is_active', true)
      .maybeSingle()
      .then(({ data }) => {
        this._whitelistedUser.next(data ? (data as WhitelistedUser) : null)
      })
  }

  signInWithGoogle(): Observable<boolean> {
    return from(
      this.supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${environment.baseCallbackUrl}/home`
        }
      })
    ).pipe(
      map(({ error }) => !error),
      catchError(() => of(false))
    )
  }

  signUpWithEmail(email: string, password: string): Observable<{ success: boolean; message: string }> {
    return from(
      this.supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${environment.baseCallbackUrl}/home`
        }
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          return { success: false, message: error.message }
        }
        if (data.user && !data.session) {
          return { success: true, message: 'Check your email for a confirmation link.' }
        }
        return { success: true, message: 'Account created successfully.' }
      }),
      catchError(() => of({ success: false, message: 'Sign up failed. Please try again.' }))
    )
  }

  signInWithEmail(email: string, password: string): Observable<{ success: boolean; message: string }> {
    return from(
      this.supabase.auth.signInWithPassword({ email, password })
    ).pipe(
      map(({ error }) => {
        if (error) {
          return { success: false, message: error.message }
        }
        return { success: true, message: '' }
      }),
      catchError(() => of({ success: false, message: 'Sign in failed. Please try again.' }))
    )
  }

  signOut(): Observable<boolean> {
    return from(this.supabase.auth.signOut()).pipe(
      map(({ error }) => {
        if (!error) {
          this.currentUser.next(null)
          this.currentProfile.next(null)
        }
        return !error
      }),
      catchError(() => of(false))
    )
  }

  getWhitelistedUser(): Observable<WhitelistedUser | null> {
    const user = this.currentUser.value
    if (!user?.email) return of(null)

    return from(
      this.supabase
        .from('whitelisted_users')
        .select('*')
        .eq('email', user.email.toLowerCase())
        .eq('is_active', true)
        .maybeSingle()
    ).pipe(
      map(({ data, error }) => {
        if (error || !data) {
          return null
        }
        return data as WhitelistedUser
      }),
      catchError(() => of(null))
    )
  }


  linkSleeperAccount(sleeperUserId: string, sleeperUsername: string, sleeperAvatar?: string | null): Observable<boolean> {
    const user = this.currentUser.value
    if (!user) return of(false)

    return from(
      this.supabase
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email,
          sleeper_user_id: sleeperUserId,
          sleeper_username: sleeperUsername,
          sleeper_avatar: sleeperAvatar || null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' })
    ).pipe(
      tap(() => {
        const profile = this.currentProfile.value
        if (profile) {
          this.currentProfile.next({
            ...profile,
            sleeper_user_id: sleeperUserId,
            sleeper_username: sleeperUsername,
            sleeper_avatar: sleeperAvatar || null
          })
        }
      }),
      map(({ error }) => !error),
      catchError(() => of(false))
    )
  }

  updateDisplayName(displayName: string): Observable<boolean> {
    const user = this.currentUser.value
    if (!user) return of(false)

    return from(
      this.supabase
        .from('profiles')
        .update({ display_name: displayName, updated_at: new Date().toISOString() })
        .eq('id', user.id)
    ).pipe(
      tap(() => {
        const profile = this.currentProfile.value
        if (profile) {
          this.currentProfile.next({ ...profile, display_name: displayName })
        }
      }),
      map(({ error }) => !error),
      catchError(() => of(false))
    )
  }

  /**
   * Current session access token, or null when signed out.
   *
   * The API authorizer verifies these against Supabase's published JWKS, so
   * this is what has to reach API Gateway — not the static build-time token
   * the services used to send.
   */
  async getAccessToken(): Promise<string | null> {
    try {
      const { data } = await this.supabase.auth.getSession()
      return data.session?.access_token ?? null
    } catch {
      return null
    }
  }

  isAuthenticated(): boolean {
    return !!this.currentUser.value
  }

  /** True when the current whitelisted_users row has role = 'admin'. */
  get isAdmin(): boolean {
    const wu = this._whitelistedUser.value
    return wu?.role === 'admin'
  }

  /** Observable that emits true/false as the whitelist row resolves. */
  get isAdmin$() {
    return this._whitelistedUser$.pipe(map(wu => wu?.role === 'admin'))
  }

  private _whitelistedUser = new BehaviorSubject<WhitelistedUser | null>(null)
  private _whitelistedUser$ = this._whitelistedUser.asObservable()

  getUser(): User | null {
    return this.currentUser.value
  }

  /**
   * Whether this account has linked a Sleeper user yet.
   *
   * Everything downstream keys off `profiles.sleeper_user_id` — `getMyUser()`,
   * the My Profile tab, matching a signed-in account to a roster. Without it
   * the app renders as if nobody is signed in.
   *
   * Reads the table directly rather than the cached profile, because the
   * cached copy is populated asynchronously after auth and a guard can run
   * before it lands.
   */
  async hasLinkedSleeper(): Promise<boolean> {
    try {
      const { data } = await this.supabase.auth.getSession()
      const userId = data.session?.user?.id
      if (!userId) return false

      const { data: profile } = await this.supabase
        .from('profiles')
        .select('sleeper_user_id')
        .eq('id', userId)
        .maybeSingle()

      return !!profile?.sleeper_user_id
    } catch {
      // Never block sign-in on a failed lookup. Treating an error as "linked"
      // lets the user through to an app that may be sparse, which beats
      // trapping them in a redirect loop they cannot escape.
      return true
    }
  }

  getProfile(): Profile | null {
    return this.currentProfile.value
  }

  isInitialized(): boolean {
    return this.initialized.value
  }

  getClient(): SupabaseClient {
    return this.supabase
  }
}
