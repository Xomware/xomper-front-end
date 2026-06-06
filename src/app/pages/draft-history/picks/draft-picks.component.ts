import { Component, OnInit } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { switchMap, take } from 'rxjs'
import { LeagueService } from 'src/app/services/league.service'
import { LeagueHistoryService, DraftHistoryRecord } from 'src/app/services/league-history.service'
import { ToastService } from 'src/app/services/toast.service'
import { TEAM_COLORS } from 'src/app/constants/team-colors'
import { LoaderComponent } from '../../../components/loader/loader.component'
import { NgIf, NgFor, NgStyle, NgClass } from '@angular/common'

interface DraftRound {
  round: number
  picks: DraftHistoryRecord[]
}

/**
 * Picks sub-tab — past season draft board rendered by round.
 * Lifts the existing grid rendering from the pre-s4 DraftHistoryComponent.
 */
@Component({
  selector: 'app-draft-picks',
  templateUrl: './draft-picks.component.html',
  styleUrls: ['./draft-picks.component.scss'],
  standalone: true,
  imports: [LoaderComponent, NgIf, NgFor, NgStyle, NgClass],
})
export class DraftPicksComponent implements OnInit {
  loading = false
  draftRounds: DraftRound[] = []
  year = ''

  constructor(
    private leagueService: LeagueService,
    private historyService: LeagueHistoryService,
    private toastService: ToastService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    const league = this.leagueService.getMyLeague()
    if (!league) {
      this.router.navigate(['/home'])
      return
    }

    // Year comes from parent route (/draft-history/:year/picks)
    this.year = this.route.parent?.snapshot.paramMap.get('year') ?? ''
    const leagueId = league.getId()

    this.loading = true
    this.leagueService.getLeagueChain(leagueId).pipe(
      switchMap(chain => this.historyService.getDraftHistoryFromChain(chain)),
      take(1),
    ).subscribe({
      next: (drafts) => {
        const seasonDrafts = drafts.filter(d => d.season === this.year)
        this.groupByRound(seasonDrafts)
        this.loading = false
      },
      error: () => {
        this.toastService.showNegativeToast('Error loading draft picks')
        this.loading = false
      },
    })
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
        picks: picks.sort((a, b) => a.pick_no - b.pick_no),
      }))
      .sort((a, b) => a.round - b.round)
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
      QB: 'pos-qb',
      RB: 'pos-rb',
      WR: 'pos-wr',
      TE: 'pos-te',
      K: 'pos-k',
      DEF: 'pos-def',
    }
    return posMap[position] || ''
  }
}
