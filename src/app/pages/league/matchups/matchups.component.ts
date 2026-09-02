import { Component, OnDestroy, OnInit } from '@angular/core'
import { NgIf, NgFor } from '@angular/common'
import { Subject, take, switchMap, takeUntil } from 'rxjs'
import { LeagueService } from 'src/app/services/league.service'
import { SeasonService } from 'src/app/services/season.service'
import { LeagueHistoryService, MatchupHistoryRecord } from 'src/app/services/league-history.service'
import { ToastService } from 'src/app/services/toast.service'
import { LoaderComponent } from '../../../components/loader/loader.component'
import { MatchupModalComponent } from '../../../components/matchup-modal/matchup-modal.component'
import { MatchupDetailInput } from 'src/app/models/matchup-detail-input.interface'

@Component({
  selector: 'app-matchups',
  templateUrl: './matchups.component.html',
  styleUrls: ['./matchups.component.scss'],
  standalone: true,
  imports: [LoaderComponent, NgIf, NgFor, MatchupModalComponent],
})
export class MatchupsComponent implements OnInit, OnDestroy {
  loading = false
  allMatchups: MatchupHistoryRecord[] = []
  availableSeasons: string[] = []
  selectedSeason = ''
  weeklyMatchups: { week: number; matchups: MatchupHistoryRecord[] }[] = []
  selectedHistoryWeek: number | null = null
  matchupHistoryLoaded = false
  selectedMatchupDetail: MatchupDetailInput | null = null

  /** Which week the scoreboard is showing. */
  selectedWeek: number | null = null

  private leagueId = ''
  private destroy$ = new Subject<void>()

  constructor(
    private leagueService: LeagueService,
    private leagueHistoryService: LeagueHistoryService,
    private seasons: SeasonService,
    private toastService: ToastService,
  ) {}

  ngOnInit(): void {
    // getActiveLeagueId, not getMyLeague: the latter is whichever league
    // loaded first, so this read the wrong league's history after a switch.
    const leagueId = this.leagueService.getActiveLeagueId()
    if (!leagueId) return
    this.leagueId = leagueId

    // Season is picked in the sidebar now, so this follows it rather than
    // owning a selection of its own.
    this.seasons.selected$
      .pipe(takeUntil(this.destroy$))
      .subscribe((season) => {
        this.selectedSeason = season
        if (this.matchupHistoryLoaded) this.filterBySeason()
      })

    this.loadMatchupHistory()
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
  }

  loadMatchupHistory(): void {
    if (this.matchupHistoryLoaded) return
    this.loading = true

    this.leagueService.getLeagueChain(this.leagueId)
      .pipe(
        switchMap((chain) => this.leagueHistoryService.getMatchupHistoryFromChain(chain)),
        take(1),
      )
      .subscribe({
        next: (matchups) => {
          this.allMatchups = matchups
          this.availableSeasons = [...new Set(matchups.map((m) => m.season))].sort(
            (a, b) => parseInt(b) - parseInt(a),
          )
          // The sidebar cannot resolve a league's season chain itself, so the
          // page that did hands the list over.
          this.seasons.setAvailable(this.availableSeasons)
          this.selectedSeason = this.seasons.selected
          this.filterBySeason()
          this.matchupHistoryLoaded = true
          this.loading = false
        },
        error: () => {
          this.toastService.showNegativeToast('Error loading matchup history.')
          this.loading = false
        },
      })
  }

  filterBySeason(): void {
    const seasonMatchups = this.allMatchups.filter((m) => m.season === this.selectedSeason)
    this.groupByWeek(seasonMatchups)

    // Open on the most recent week that was actually played. A week of 0-0
    // scores is a scoreboard with nothing on it.
    const played = this.weeklyMatchups.filter((w) =>
      w.matchups.some((m) => m.team_a_points > 0 || m.team_b_points > 0),
    )
    this.selectedWeek = played.length ? played[0].week : this.weeklyMatchups[0]?.week ?? null
  }

  selectWeek(week: number): void {
    this.selectedWeek = week
  }

  get weeks(): number[] {
    return this.weeklyMatchups.map((w) => w.week)
  }

  /** The games on the board, for the week in view. */
  get boardGames(): MatchupHistoryRecord[] {
    return this.weeklyMatchups.find((w) => w.week === this.selectedWeek)?.matchups ?? []
  }

  /** A week with no scores yet is upcoming, not empty. */
  get weekIsUnplayed(): boolean {
    const games = this.boardGames
    return games.length > 0 && games.every((m) => m.team_a_points === 0 && m.team_b_points === 0)
  }

  isClose(matchup: MatchupHistoryRecord): boolean {
    if (this.weekIsUnplayed) return false
    return Math.abs(matchup.team_a_points - matchup.team_b_points) < 10
  }

  /** The week's highest single-team score, for the board header. */
  get topScore(): { team: string; points: number } | null {
    let best: { team: string; points: number } | null = null
    for (const m of this.boardGames) {
      for (const [team, points] of [
        [m.team_a_team_name || m.team_a_username, m.team_a_points],
        [m.team_b_team_name || m.team_b_username, m.team_b_points],
      ] as Array<[string, number]>) {
        if (!best || points > best.points) best = { team, points }
      }
    }
    return best && best.points > 0 ? best : null
  }

  private groupByWeek(matchups: MatchupHistoryRecord[]): void {
    const weekMap = new Map<number, MatchupHistoryRecord[]>()
    matchups.forEach((m) => {
      if (!weekMap.has(m.week)) weekMap.set(m.week, [])
      weekMap.get(m.week)!.push(m)
    })
    this.weeklyMatchups = Array.from(weekMap.entries())
      .map(([week, matchups]) => ({ week, matchups }))
      .sort((a, b) => b.week - a.week)
  }

  selectHistoryWeek(week: number): void {
    this.selectedHistoryWeek = this.selectedHistoryWeek === week ? null : week
  }

  getMatchupResult(matchup: MatchupHistoryRecord, rosterId: number): 'win' | 'loss' | 'tie' {
    if (matchup.winner_roster_id === rosterId) return 'win'
    if (matchup.winner_roster_id === null) return 'tie'
    return 'loss'
  }

  getPointsDiff(matchup: MatchupHistoryRecord): string {
    return Math.abs(matchup.team_a_points - matchup.team_b_points).toFixed(2)
  }

  openMatchupDetail(record: MatchupHistoryRecord, event: MouseEvent): void {

    this.leagueService.getLeagueMatchups(record.league_id, record.week)
      .pipe(take(1))
      .subscribe({
        next: (pairs) => {
          const pair = pairs.find(
            (p) => p.teamA.matchup_id === record.matchup_id || p.teamB.matchup_id === record.matchup_id,
          )
          if (!pair) {
            this.toastService.showNegativeToast('Could not load matchup detail')
            return
          }
          let rawA = pair.teamA
          let rawB = pair.teamB
          if (rawA.roster_id !== record.team_a_roster_id) {
            rawA = pair.teamB
            rawB = pair.teamA
          }
          this.selectedMatchupDetail = {
            teamA: {
              teamName: record.team_a_team_name || record.team_a_username,
              userName: record.team_a_username,
              avatar: 'assets/img/nfl.png',
              wins: 0,
              losses: 0,
              totalPoints: record.team_a_points,
              rosterId: record.team_a_roster_id,
              starters: rawA.starters || [],
              players: rawA.players || [],
              startersPoints: rawA.starters_points || [],
              playersPoints: rawA.players_points || {},
            },
            teamB: {
              teamName: record.team_b_team_name || record.team_b_username,
              userName: record.team_b_username,
              avatar: 'assets/img/nfl.png',
              wins: 0,
              losses: 0,
              totalPoints: record.team_b_points,
              rosterId: record.team_b_roster_id,
              starters: rawB.starters || [],
              players: rawB.players || [],
              startersPoints: rawB.starters_points || [],
              playersPoints: rawB.players_points || {},
            },
            week: record.week,
            season: record.season,
            leagueId: record.league_id,
            status: 'Complete',
          }
        },
        error: () => {
          this.toastService.showNegativeToast('Error loading matchup details')
        },
      })
  }

  closeMatchupModal(): void {
    this.selectedMatchupDetail = null
  }
}
