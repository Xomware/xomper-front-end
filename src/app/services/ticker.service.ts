import { Injectable } from '@angular/core'
import { Observable, forkJoin, of } from 'rxjs'
import { catchError, map, switchMap } from 'rxjs/operators'
import { LeagueFollowsService, FollowedLeague } from './league-follows.service'
import { LeagueService } from './league.service'
import { PlayerValuesService } from './player-values.service'
import { PlayerService } from './player.service'

/** One rotating line. `tone` drives the accent colour only. */
export interface TickerItem {
  label: string
  text: string
  tone: 'neutral' | 'live' | 'alert'
}

/**
 * Content for the rotating bar at the top of every page.
 *
 * Deliberately built from data the app has already loaded — followed leagues,
 * the active league's value book, the player map — rather than a new feed.
 * A ticker that needs its own backend is a ticker that is empty whenever that
 * backend is down, and this one is decoration with a job: it should never be
 * the reason a page is slow or broken.
 *
 * Content varies by page because a ticker that says the same thing everywhere
 * stops being read after the first screen.
 */
@Injectable({ providedIn: 'root' })
export class TickerService {
  constructor(
    private follows: LeagueFollowsService,
    private leagueService: LeagueService,
    private playerValuesService: PlayerValuesService,
    private playerService: PlayerService,
  ) {}

  /**
   * Items for a route.
   *
   * Never errors: every source is wrapped, and an empty list simply hides the
   * bar. A broken ticker must not take a page with it.
   */
  itemsFor(url: string): Observable<TickerItem[]> {
    const leagues = this.follows.followed
    const base = this.leagueItems(leagues)

    if (url.startsWith('/trades') || url.startsWith('/team-analyzer')) {
      return this.withTopValues(base, 'Most valuable')
    }
    if (url.startsWith('/live-draft') || url.startsWith('/draft-history')) {
      return this.withTopValues(base, 'Top of the board')
    }
    return of(base)
  }

  /** League status lines — always available, no network. */
  private leagueItems(leagues: FollowedLeague[]): TickerItem[] {
    const items: TickerItem[] = []

    const drafting = leagues.filter((l) => l.status === 'drafting')
    for (const league of drafting) {
      items.push({ label: 'Drafting now', text: league.name, tone: 'live' })
    }

    const preDraft = leagues.filter((l) => l.status === 'pre_draft')
    if (preDraft.length) {
      items.push({
        label: 'Awaiting draft',
        text: preDraft.map((l) => l.name).join(' · '),
        tone: 'alert',
      })
    }

    const inSeason = leagues.filter((l) => l.status === 'in_season')
    for (const league of inSeason) {
      items.push({
        label: 'In season',
        text: `${league.name} · ${league.totalRosters} teams · ${
          league.isDynasty ? 'Dynasty' : 'Redraft'
        }`,
        tone: 'neutral',
      })
    }

    if (leagues.length > 1) {
      items.push({
        label: 'Following',
        text: `${leagues.length} leagues`,
        tone: 'neutral',
      })
    }

    return items
  }

  /**
   * Append the active league's highest-valued players.
   *
   * Priced by that league's own book, so the same player can lead one ticker
   * and not another — which is the point of the value work and worth showing.
   */
  private withTopValues(base: TickerItem[], label: string): Observable<TickerItem[]> {
    const leagueId = this.leagueService.getActiveLeagueId()
    if (!leagueId) return of(base)

    return this.leagueService.searchLeague(leagueId).pipe(
      switchMap((league) =>
        forkJoin({
          book: this.playerValuesService.bookFor(league),
          players: this.playerService.getPlayerMap(),
        }),
      ),
      map((loaded) => [...base, ...this.topValueItems(loaded, label)]),
      // Any failure drops the extras, never the bar.
      catchError(() => of(base)),
    )
  }

  private topValueItems(
    loaded: { book: { playerIds: string[]; value(id: string): { value: number; known: boolean } }; players: Record<string, { first_name?: string; last_name?: string; position?: string }> },
    label: string,
  ): TickerItem[] {
    const ranked = loaded.book.playerIds
      .map((id) => ({ id, v: loaded.book.value(id) }))
      .filter((entry) => entry.v.known)
      .sort((a, b) => b.v.value - a.v.value)
      .slice(0, 5)

    return ranked.map((entry) => {
      const meta = loaded.players[entry.id] ?? {}
      const name = [meta.first_name, meta.last_name].filter(Boolean).join(' ') || entry.id
      return {
        label,
        text: `${name} · ${meta.position ?? ''} · ${Math.round(entry.v.value).toLocaleString()}`,
        tone: 'neutral' as const,
      }
    })
  }
}
