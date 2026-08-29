import { Component, OnInit } from '@angular/core'
import { NgFor, NgIf, DecimalPipe } from '@angular/common'
import { ActivatedRoute, Router } from '@angular/router'
import { forkJoin, of } from 'rxjs'
import { catchError, switchMap } from 'rxjs/operators'
import { LeagueService } from 'src/app/services/league.service'
import { PlayerService } from 'src/app/services/player.service'
import { PlayerValuesService } from 'src/app/services/player-values.service'
import { LoaderComponent } from 'src/app/components/loader/loader.component'
import { CommentThreadComponent } from 'src/app/components/comment-thread/comment-thread.component'
import { Player } from 'src/app/models/player.interface'
import { Roster } from 'src/app/models/roster.interface'
import { User } from 'src/app/models/user.interface'
import { ValueBook } from 'src/app/models/value-book.model'

interface Fact {
  label: string
  value: string
}

/**
 * A player's page: who they are, what they are worth here, and who has them.
 *
 * Deliberately not a stat page. `xomper-stats-current` is empty — the
 * warehouse writes season stats to Parquet, not to a table this app can
 * read — so anything resembling production numbers would be invented. What
 * is real is the player's identity, their value under *this* league's
 * settings, where that ranks at their position, and which roster holds them.
 */
@Component({
  selector: 'app-player-profile',
  standalone: true,
  imports: [NgIf, NgFor, DecimalPipe, LoaderComponent, CommentThreadComponent],
  templateUrl: './player-profile.component.html',
  styleUrls: ['./player-profile.component.scss'],
})
export class PlayerProfileComponent implements OnInit {
  loading = true
  error: string | null = null

  playerId = ''
  name = ''
  position = ''
  team = ''
  injuryStatus = ''
  facts: Fact[] = []

  /** Null when this league's value source does not cover the player. */
  value: number | null = null
  positionRank: number | null = null
  positionCount = 0

  ownerTeam: string | null = null
  leagueName = ''

  imageFailed = false

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private playerService: PlayerService,
    private playerValuesService: PlayerValuesService,
    private leagueService: LeagueService,
  ) {}

  get imageUrl(): string {
    return `https://sleepercdn.com/content/nfl/players/${this.playerId}.jpg`
  }

  get initials(): string {
    return this.name
      .split(' ')
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase()
  }

  ngOnInit(): void {
    this.playerId = this.route.snapshot.paramMap.get('playerId') ?? ''
    if (!this.playerId) {
      this.error = 'No player specified.'
      this.loading = false
      return
    }
    this.load()
  }

  load(): void {
    this.loading = true
    this.error = null

    const leagueId = this.leagueService.getActiveLeagueId()

    this.playerService
      .getPlayerMap()
      .pipe(
        switchMap((players) => {
          const meta = players[this.playerId]
          if (!meta) throw new Error('Player not found.')
          this.applyIdentity(meta)

          // Without a league there is still a player to show — just no value
          // and no owner, because both are league-scoped.
          if (!leagueId) return of(null)

          return this.leagueService.searchLeague(leagueId).pipe(
            switchMap((league) => {
              this.leagueName = league.getDisplayName()
              return forkJoin({
                book: this.playerValuesService.bookFor(league),
                rosters: this.leagueService.findLeagueRosters(leagueId),
                users: this.leagueService.findLeagueUsers(leagueId),
                players: of(players),
              })
            }),
            catchError(() => of(null)),
          )
        }),
      )
      .subscribe({
        next: (loaded) => {
          if (loaded) this.applyLeagueContext(loaded)
          this.loading = false
        },
        error: (err) => {
          this.error = err?.message ?? 'Failed to load this player.'
          this.loading = false
        },
      })
  }

  private applyIdentity(player: Player): void {
    const meta = player as unknown as Record<string, unknown>
    const first = (meta['first_name'] as string) ?? ''
    const last = (meta['last_name'] as string) ?? ''
    this.name = (meta['full_name'] as string) || [first, last].filter(Boolean).join(' ') || this.playerId
    this.position = (meta['position'] as string) ?? ''
    this.team = (meta['team'] as string) ?? 'FA'
    this.injuryStatus = (meta['injury_status'] as string) ?? ''

    // Only facts that are actually present. A row reading "College —" is
    // worse than no row.
    const candidates: Array<[string, unknown]> = [
      ['Age', meta['age']],
      ['Experience', meta['years_exp'] != null ? `${meta['years_exp']} yrs` : null],
      ['Height', this.formatHeight(meta['height'])],
      ['Weight', meta['weight'] ? `${meta['weight']} lb` : null],
      ['College', meta['college']],
      ['Number', meta['number'] != null ? `#${meta['number']}` : null],
    ]
    this.facts = candidates
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([label, v]) => ({ label, value: String(v) }))
  }

  /** Sleeper stores height as total inches for most players. */
  private formatHeight(raw: unknown): string | null {
    if (raw === null || raw === undefined || raw === '') return null
    const inches = Number(raw)
    if (!Number.isFinite(inches) || inches <= 0) return String(raw)
    return `${Math.floor(inches / 12)}'${inches % 12}"`
  }

  private applyLeagueContext(loaded: {
    book: ValueBook
    rosters: Roster[]
    users: User[]
  }): void {
    const lookup = loaded.book.value(this.playerId)
    this.value = lookup.known ? lookup.value : null

    if (lookup.known) {
      const samePosition = loaded.book.playerIds
        .filter((id) => loaded.book.position(id) === this.position)
        .map((id) => loaded.book.value(id))
        .filter((v) => v.known)
        .sort((a, b) => b.value - a.value)

      this.positionCount = samePosition.length
      this.positionRank = samePosition.findIndex((v) => v.value === lookup.value) + 1
    }

    const roster = loaded.rosters.find((r) => (r.players ?? []).includes(this.playerId))
    if (!roster) {
      this.ownerTeam = null
      return
    }
    const owner = loaded.users.find((u) => u.user_id === roster.owner_id)
    this.ownerTeam =
      (owner?.metadata?.['team_name'] as string) ||
      owner?.display_name ||
      `Roster ${roster.roster_id}`
  }

  back(): void {
    this.router.navigate(['/league/overview'])
  }
}
