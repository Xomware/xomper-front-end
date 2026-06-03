import { Component, OnInit } from '@angular/core'
import { Router } from '@angular/router'
import { switchMap, take } from 'rxjs'
import { MatchupDetailInput } from 'src/app/models/matchup-detail-input.interface'
import { LeagueService } from 'src/app/services/league.service'
import { LeagueHistoryService, MatchupHistoryRecord } from 'src/app/services/league-history.service'
import { ToastService } from 'src/app/services/toast.service'
import { LoaderComponent } from '../../components/loader/loader.component';
import { NgIf, NgFor } from '@angular/common';
import { MatchupModalComponent } from '../../components/matchup-modal/matchup-modal.component';

interface WeekMatchups {
  week: number
  matchups: MatchupHistoryRecord[]
}

@Component({
    selector: 'app-matchup-history',
    templateUrl: './matchup-history.component.html',
    styleUrls: ['./matchup-history.component.scss'],
    standalone: true,
    imports: [LoaderComponent, NgIf, NgFor, MatchupModalComponent]
})
export class MatchupHistoryComponent implements OnInit {
  loading = false
  leagueName = ''
  leagueId = ''

  // Multi-season
  allMatchups: MatchupHistoryRecord[] = []
  availableSeasons: string[] = []
  selectedSeason = ''

  // Data grouped by week for the selected season
  weeklyMatchups: WeekMatchups[] = []
  selectedWeek: number | null = null

  // Matchup detail modal
  selectedMatchupDetail: MatchupDetailInput | null = null
  modalStart: { top: number; left: number; width: number; height: number } | null = null

  constructor(
    private leagueService: LeagueService,
    private historyService: LeagueHistoryService,
    private toastService: ToastService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const league = this.leagueService.getMyLeague()
    if (!league) {
      this.toastService.showNegativeToast('No league loaded')
      this.router.navigate(['/home'])
      return
    }

    this.leagueName = league.getDisplayName()
    this.leagueId = league.getId()
    this.loadMatchupHistory()
  }

  loadMatchupHistory(): void {
    this.loading = true

    this.leagueService.getLeagueChain(this.leagueId).pipe(
      switchMap(chain => this.historyService.getMatchupHistoryFromChain(chain)),
      take(1)
    ).subscribe({
      next: (matchups) => {
        this.allMatchups = matchups

        // Get unique seasons, newest first
        this.availableSeasons = [...new Set(matchups.map(m => m.season))]
          .sort((a, b) => parseInt(b) - parseInt(a))

        // Default to most recent season
        if (this.availableSeasons.length > 0) {
          this.selectedSeason = this.availableSeasons[0]
          this.filterBySeason()
        }

        this.loading = false
      },
      error: () => {
        this.toastService.showNegativeToast('Error loading matchup history')
        this.loading = false
      }
    })
  }

  filterBySeason(): void {
    const seasonMatchups = this.allMatchups.filter(m => m.season === this.selectedSeason)
    this.groupByWeek(seasonMatchups)

    // Auto-expand the most recent week that has scores
    const weeksWithScores = this.weeklyMatchups.filter(
      w => w.matchups.some(m => m.team_a_points > 0 || m.team_b_points > 0)
    )
    this.selectedWeek = weeksWithScores.length > 0 ? weeksWithScores[0].week : null
  }

  selectSeason(season: string): void {
    this.selectedSeason = season
    this.filterBySeason()
  }

  private groupByWeek(matchups: MatchupHistoryRecord[]): void {
    const weekMap = new Map<number, MatchupHistoryRecord[]>()

    matchups.forEach(m => {
      if (!weekMap.has(m.week)) {
        weekMap.set(m.week, [])
      }
      weekMap.get(m.week)!.push(m)
    })

    this.weeklyMatchups = Array.from(weekMap.entries())
      .map(([week, matchups]) => ({ week, matchups }))
      .sort((a, b) => b.week - a.week) // Most recent week first
  }

  selectWeek(week: number): void {
    this.selectedWeek = this.selectedWeek === week ? null : week
  }

  getMatchupResult(matchup: MatchupHistoryRecord, rosterId: number): 'win' | 'loss' | 'tie' {
    if (matchup.winner_roster_id === rosterId) return 'win'
    if (matchup.winner_roster_id === null) return 'tie'
    return 'loss'
  }

  getPointsDiff(matchup: MatchupHistoryRecord): string {
    const diff = Math.abs(matchup.team_a_points - matchup.team_b_points)
    return diff.toFixed(2)
  }

  openMatchupDetail(record: MatchupHistoryRecord, event: MouseEvent): void {
    const card = (event.currentTarget as HTMLElement).getBoundingClientRect()
    this.modalStart = {
      top: card.top,
      left: card.left,
      width: card.width,
      height: card.height,
    }

    // Fetch raw matchup data for this week to get player lineups + points
    this.leagueService.getLeagueMatchups(record.league_id, record.week)
      .pipe(take(1))
      .subscribe({
        next: (pairs) => {
          const pair = pairs.find(p =>
            p.teamA.matchup_id === record.matchup_id ||
            p.teamB.matchup_id === record.matchup_id
          )

          if (!pair) {
            this.toastService.showNegativeToast('Could not load matchup detail')
            return
          }

          // Match raw teams to record teams by roster_id
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
        }
      })
  }

  closeMatchupDetail(): void {
    this.selectedMatchupDetail = null
    this.modalStart = null
  }

  goBack(): void {
    this.router.navigate(['/my-league'], {
      queryParams: { leagueId: this.leagueId, view: 'league' }
    })
  }
}
