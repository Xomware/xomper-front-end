import { Component, OnInit } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { switchMap, take } from 'rxjs'
import { LeagueService } from 'src/app/services/league.service'
import { LeagueHistoryService, DraftHistoryRecord } from 'src/app/services/league-history.service'
import { ToastService } from 'src/app/services/toast.service'
import { TEAM_COLORS } from 'src/app/constants/team-colors'
import { LoaderComponent } from '../../components/loader/loader.component';
import { NgIf, NgFor, NgStyle, NgClass } from '@angular/common';

interface DraftRound {
  round: number
  picks: DraftHistoryRecord[]
}

@Component({
    selector: 'app-draft-history',
    templateUrl: './draft-history.component.html',
    styleUrls: ['./draft-history.component.scss'],
    standalone: true,
    imports: [LoaderComponent, NgIf, NgFor, NgStyle, NgClass]
})
export class DraftHistoryComponent implements OnInit {
  loading = false
  leagueName = ''
  leagueId = ''
  
  // Data
  allDrafts: DraftHistoryRecord[] = []
  availableSeasons: string[] = []
  selectedSeason: string = ''
  draftRounds: DraftRound[] = []
  
  // View options
  viewMode: 'round' | 'team' | 'position' = 'round'
  
  constructor(
    private leagueService: LeagueService,
    private historyService: LeagueHistoryService,
    private toastService: ToastService,
    private router: Router,
    private route: ActivatedRoute
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
    this.loadDraftHistory()
  }

  loadDraftHistory(): void {
    this.loading = true

    this.leagueService.getLeagueChain(this.leagueId).pipe(
      switchMap(chain => this.historyService.getDraftHistoryFromChain(chain)),
      take(1)
    ).subscribe({
      next: (drafts) => {
        this.allDrafts = drafts

        // Get unique seasons
        this.availableSeasons = [...new Set(drafts.map(d => d.season))]
          .sort((a, b) => parseInt(b) - parseInt(a))

        // Default to most recent season
        if (this.availableSeasons.length > 0) {
          this.selectedSeason = this.availableSeasons[0]
          this.filterBySeason()
        }

        this.loading = false
      },
      error: () => {
        this.toastService.showNegativeToast('Error loading draft history')
        this.loading = false
      }
    })
  }

  filterBySeason(): void {
    const seasonDrafts = this.allDrafts.filter(d => d.season === this.selectedSeason)
    this.groupByRound(seasonDrafts)
  }

  groupByRound(drafts: DraftHistoryRecord[]): void {
    const roundMap = new Map<number, DraftHistoryRecord[]>()
    
    drafts.forEach(pick => {
      if (!roundMap.has(pick.round)) {
        roundMap.set(pick.round, [])
      }
      roundMap.get(pick.round)!.push(pick)
    })

    this.draftRounds = Array.from(roundMap.entries())
      .map(([round, picks]) => ({
        round,
        picks: picks.sort((a, b) => a.pick_no - b.pick_no)
      }))
      .sort((a, b) => a.round - b.round)
  }

  selectSeason(season: string): void {
    this.selectedSeason = season
    this.filterBySeason()
  }

  getTeamStyle(team: string | undefined) {
    if (!team) return { backgroundColor: '#2a2a2a' }
    const colors = TEAM_COLORS[team.toLowerCase()]
    return colors
      ? { background: `linear-gradient(135deg, ${colors.primary}40, ${colors.secondary}40)` }
      : { backgroundColor: '#2a2a2a' }
  }

  getPositionClass(position: string): string {
    const posMap: Record<string, string> = {
      'QB': 'pos-qb',
      'RB': 'pos-rb',
      'WR': 'pos-wr',
      'TE': 'pos-te',
      'K': 'pos-k',
      'DEF': 'pos-def'
    }
    return posMap[position] || ''
  }

  goBack(): void {
    this.router.navigate(['/my-league'], {
      queryParams: { leagueId: this.leagueId, view: 'league' }
    })
  }
}
