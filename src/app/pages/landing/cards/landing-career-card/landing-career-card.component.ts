import { Component, OnDestroy, OnInit } from '@angular/core'
import { NgFor, NgIf, DecimalPipe } from '@angular/common'
import { RouterLink } from '@angular/router'
import { of } from 'rxjs'
import { catchError, map, switchMap, take } from 'rxjs/operators'
import { LeagueFollowsService } from 'src/app/services/league-follows.service'
import { PlayerService } from 'src/app/services/player.service'
import { ProfileStatsService, ProfileStats } from 'src/app/services/profile-stats.service'
import { UserService } from 'src/app/services/user.service'
import { LeagueModel } from 'src/app/models/league.model'

/**
 * Your record across every league, on the way in.
 *
 * The rest of the landing page is about one league and this week. This is the
 * part that is about you: what you have done across all of them, and the
 * players you keep ending up with.
 *
 * Reuses ProfileStatsService rather than recomputing, so the profile page and
 * this card can never disagree about your record.
 */
@Component({
  selector: 'app-landing-career-card',
  standalone: true,
  imports: [NgIf, NgFor, DecimalPipe, RouterLink],
  templateUrl: './landing-career-card.component.html',
  styleUrls: ['./landing-career-card.component.scss'],
})
export class LandingCareerCardComponent implements OnInit, OnDestroy {
  stats: ProfileStats | null = null
  loading = true

  /** Counter values, walked up from zero so the numbers arrive rather than appear. */
  shown = { wins: 0, losses: 0, seasons: 0, leagues: 0 }

  playerNames: Record<string, string> = {}

  private frame: number | null = null

  constructor(
    private follows: LeagueFollowsService,
    private players: PlayerService,
    private profileStats: ProfileStatsService,
    private users: UserService,
  ) {}

  ngOnInit(): void {
    const me = this.users.getMyUser()
    const leagues = this.follows.followed
    if (!me || !leagues.length) {
      this.loading = false
      return
    }

    // getUserLeagues() is only populated once the profile page has fetched
    // them, so on a cold landing it is empty and this card rendered nothing.
    // Fetch when it is.
    const cached = me.getUserLeagues()
    const leagues$ = cached.length
      ? of(cached)
      : this.users.findUserLeagues(me.getUserId()).pipe(
          map((rows) => rows.map((row) => new LeagueModel(row))),
          catchError(() => of([] as LeagueModel[])),
        )

    leagues$
      .pipe(
        take(1),
        switchMap((models) =>
          models.length ? this.profileStats.forUser(me.getUserId(), models) : of(null),
        ),
      )
      .pipe(take(1))
      .subscribe({
        next: (stats) => {
          this.loading = false
          if (!stats) return
          this.stats = stats
          this.countUp(stats)
          this.resolveNames(stats)
        },
        error: () => (this.loading = false),
      })
  }

  ngOnDestroy(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame)
  }

  get winRate(): number | null {
    const c = this.stats?.career
    if (!c) return null
    const games = c.wins + c.losses + c.ties
    return games ? c.wins / games : null
  }

  /**
   * Walk the counters up over about half a second.
   *
   * requestAnimationFrame rather than an interval: an interval keeps firing
   * in a background tab and lands the numbers wrong when you come back.
   */
  private countUp(stats: ProfileStats): void {
    const target = {
      wins: stats.career.wins,
      losses: stats.career.losses,
      seasons: stats.career.seasons,
      leagues: stats.career.leagues,
    }
    const start = performance.now()
    const duration = 550

    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      // Ease out, so it decelerates into the real number instead of stopping.
      const eased = 1 - Math.pow(1 - t, 3)
      this.shown = {
        wins: Math.round(target.wins * eased),
        losses: Math.round(target.losses * eased),
        seasons: Math.round(target.seasons * eased),
        leagues: Math.round(target.leagues * eased),
      }
      if (t < 1) this.frame = requestAnimationFrame(step)
      else this.frame = null
    }
    this.frame = requestAnimationFrame(step)
  }

  private resolveNames(stats: ProfileStats): void {
    if (!stats.mostOwned.length) return
    this.players
      .getPlayerMap()
      .pipe(take(1))
      .subscribe((map) => {
        for (const owned of stats.mostOwned.slice(0, 5)) {
          const meta = map[owned.playerId] as { full_name?: string } | undefined
          this.playerNames[owned.playerId] = meta?.full_name ?? owned.playerId
        }
      })
  }

  get topOwned() {
    return this.stats?.mostOwned.slice(0, 5) ?? []
  }
}
