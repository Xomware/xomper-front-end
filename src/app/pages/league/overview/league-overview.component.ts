import { Component, OnInit } from '@angular/core'
import { NgFor, NgIf, DecimalPipe } from '@angular/common'
import { Router } from '@angular/router'
import { forkJoin } from 'rxjs'
import { switchMap } from 'rxjs/operators'
import { LeagueService } from 'src/app/services/league.service'
import { PlayerService } from 'src/app/services/player.service'
import { PlayerValuesService } from 'src/app/services/player-values.service'
import { TeamAnalysisService } from 'src/app/services/team-analysis.service'
import { UserService } from 'src/app/services/user.service'
import { LoaderComponent } from 'src/app/components/loader/loader.component'
import { CommentThreadComponent } from 'src/app/components/comment-thread/comment-thread.component'
import { TeamAnalysis, totalValue } from 'src/app/models/team-analysis.model'

/** One row of the power ranking. */
export interface PowerRow {
  rank: number
  rosterId: number
  teamName: string
  total: number
  /** Share of the strongest roster, 0–1. Drives the bar width. */
  share: number
  /** Position group carrying this roster. */
  strength: string
  /** Weakest group — the thing to go trade for. */
  weakness: string
  isMine: boolean
}

/**
 * League-wide numbers.
 *
 * Everything here comes from the rosters, users and value book the power
 * rankings already fetch, so the extra depth costs no extra requests.
 */
interface LeagueSummary {
  teams: number
  totalValue: number
  averageValue: number
  /** Top roster over bottom roster. A league at 1.2 is close; at 3 it is not. */
  spread: number
  strongest: { team: string; position: string }
  deepest: { team: string; bench: number }
  positionShare: Array<{ position: string; share: number }>
}

interface DeeperLink {
  label: string
  hint: string
  route: string
}

/**
 * League overview — the snapshot you land on for a league.
 *
 * `/league` used to redirect straight to standings, which in the preseason is
 * twelve teams at 0-0. That says nothing about the league. Roster value does:
 * it is available before a single game is played, and it is the number every
 * other analysis surface here is already built on.
 *
 * Ranks by total roster value, priced by this league's own book — so a
 * dynasty league and a redraft league are ranked on different sources, and
 * the same manager can lead one and not the other.
 */
@Component({
  selector: 'app-league-overview',
  standalone: true,
  imports: [NgIf, NgFor, DecimalPipe, LoaderComponent, CommentThreadComponent],
  templateUrl: './league-overview.component.html',
  styleUrls: ['./league-overview.component.scss'],
})
export class LeagueOverviewComponent implements OnInit {
  loading = true
  error: string | null = null

  /** Held for the comment thread, which keys on the league. */
  leagueId = ''

  rows: PowerRow[] = []

  /** Which section of the overview is showing. */
  tab: 'league' | 'power' | 'chat' = 'league'

  /** League-wide numbers, from the same fetch the rankings use. */
  summary: LeagueSummary | null = null

  readonly deeper: DeeperLink[] = [
    { label: 'Standings', hint: 'Records and ranks', route: '/league/standings' },
    { label: 'Matchups', hint: 'Week by week', route: '/league/matchups' },
    { label: 'Playoffs', hint: 'The bracket', route: '/league/playoffs' },
    { label: 'Draft Order', hint: 'Who picks when', route: '/league/draft-order' },
    { label: 'Team Analyzer', hint: 'Your roster by position', route: '/team-analyzer' },
    { label: 'Trades', hint: 'Grade a deal', route: '/trades' },
  ]

  constructor(
    private leagueService: LeagueService,
    private playerService: PlayerService,
    private playerValuesService: PlayerValuesService,
    private teamAnalysisService: TeamAnalysisService,
    private userService: UserService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.load()
  }

  load(): void {
    this.loading = true
    this.error = null

    const leagueId = this.leagueService.getActiveLeagueId()
    this.leagueId = leagueId ?? ''
    if (!leagueId) {
      this.error = 'No league selected.'
      this.loading = false
      return
    }

    this.leagueService
      .searchLeague(leagueId)
      .pipe(
        switchMap((league) =>
          forkJoin([
            this.leagueService.findLeagueRosters(leagueId),
            this.leagueService.findLeagueUsers(leagueId),
            this.playerValuesService.bookFor(league),
            this.playerService.getPlayerMap(),
          ]),
        ),
      )
      .subscribe({
        next: ([rosters, users, book, playerMap]) => {
          const analyses = this.teamAnalysisService.build(rosters, users, playerMap, book)
          this.rows = this.rank(analyses)
          this.summary = this.summarise(analyses)
          this.loading = false
        },
        error: (err) => {
          this.error = err?.message ?? 'Failed to load the league.'
          this.loading = false
        },
      })
  }

  private rank(analyses: TeamAnalysis[]): PowerRow[] {
    const myUserId = this.userService.getMyUser()?.getUserId()
    const scored = analyses
      .map((a) => ({ a, total: totalValue(a) }))
      .sort((x, y) => y.total - x.total)

    const top = scored[0]?.total ?? 0

    return scored.map((entry, i) => ({
      rank: i + 1,
      rosterId: entry.a.rosterId,
      teamName: entry.a.teamName,
      total: entry.total,
      // Relative to the strongest roster, so the bars compare teams rather
      // than tracking an absolute scale that means nothing on its own.
      share: top > 0 ? entry.total / top : 0,
      strength: this.extreme(entry.a, 'max'),
      weakness: this.extreme(entry.a, 'min'),
      isMine: !!myUserId && entry.a.userId === myUserId,
    }))
  }

  /**
   * Strongest or weakest starting position group.
   *
   * Bench and taxi are excluded: depth is not a position you go and fix, and
   * a thin taxi squad is not a weakness worth telling someone about.
   */
  private extreme(a: TeamAnalysis, which: 'max' | 'min'): string {
    const groups: Array<[string, number]> = [
      ['QB', a.qbValue],
      ['RB', a.rbValue],
      ['WR', a.wrValue],
      ['TE', a.teValue],
    ]
    const sorted = groups.sort((x, y) => y[1] - x[1])
    return which === 'max' ? sorted[0][0] : sorted[sorted.length - 1][0]
  }

  private summarise(analyses: TeamAnalysis[]): LeagueSummary | null {
    if (!analyses.length) return null

    const totals = analyses.map((a) => totalValue(a)).sort((x, y) => y - x)
    const total = totals.reduce((sum, v) => sum + v, 0)
    const bottom = totals[totals.length - 1]

    const positions: Array<[string, (a: TeamAnalysis) => number]> = [
      ['QB', (a) => a.qbValue],
      ['RB', (a) => a.rbValue],
      ['WR', (a) => a.wrValue],
      ['TE', (a) => a.teValue],
    ]

    const starterTotal = positions.reduce(
      (sum, [, read]) => sum + analyses.reduce((s, a) => s + read(a), 0),
      0,
    )

    const best = analyses.reduce((top, a) => (totalValue(a) > totalValue(top) ? a : top))
    const deepest = analyses.reduce((top, a) =>
      (a.benchValue ?? 0) > (top.benchValue ?? 0) ? a : top,
    )

    return {
      teams: analyses.length,
      totalValue: total,
      averageValue: total / analyses.length,
      // Guarded: a league where the bottom roster prices at zero would
      // otherwise report an infinite spread.
      spread: bottom > 0 ? totals[0] / bottom : 0,
      strongest: { team: best.teamName, position: this.extreme(best, 'max') },
      deepest: { team: deepest.teamName, bench: deepest.benchValue ?? 0 },
      positionShare: positions.map(([position, read]) => ({
        position,
        share: starterTotal
          ? analyses.reduce((sum, a) => sum + read(a), 0) / starterTotal
          : 0,
      })),
    }
  }

  go(route: string): void {
    this.router.navigate([route])
  }
}
