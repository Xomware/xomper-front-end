import { Component, OnInit } from '@angular/core'
import { NgIf, NgFor } from '@angular/common'
import { take, switchMap } from 'rxjs'
import { LeagueService } from 'src/app/services/league.service'
import { LeagueHistoryService, WorldCupDivision } from 'src/app/services/league-history.service'
import { ToastService } from 'src/app/services/toast.service'
import { LoaderComponent } from '../../../components/loader/loader.component'

@Component({
  selector: 'app-world-cup',
  templateUrl: './world-cup.component.html',
  styleUrls: ['./world-cup.component.scss'],
  standalone: true,
  imports: [LoaderComponent, NgIf, NgFor],
})
export class WorldCupComponent implements OnInit {
  loading = false
  worldCupDivisions: WorldCupDivision[] = []
  worldCupLoaded = false
  worldCupSeasons: string[] = []
  wcGridColumns = '40px 2fr 0.6fr 0.6fr 1fr 1fr'
  private leagueId = ''

  constructor(
    private leagueService: LeagueService,
    private leagueHistoryService: LeagueHistoryService,
    private toastService: ToastService,
  ) {}

  ngOnInit(): void {
    const league = this.leagueService.getMyLeague()
    if (!league) return
    this.leagueId = league.getId()
    this.loadWorldCup()
  }

  loadWorldCup(): void {
    this.loading = true
    this.leagueService.getLeagueChain(this.leagueId)
      .pipe(
        switchMap((chain) =>
          this.leagueHistoryService.getMatchupHistoryFromChain(chain).pipe(
            take(1),
            switchMap((matchups) => {
              this.worldCupDivisions = this.leagueHistoryService.getWorldCupStandings(chain, matchups)
              this.worldCupSeasons = [...new Set(matchups.map((m) => m.season))].sort(
                (a, b) => parseInt(a) - parseInt(b),
              )
              return [this.worldCupDivisions]
            }),
          ),
        ),
        take(1),
      )
      .subscribe({
        next: () => {
          const seasonCols = this.worldCupSeasons.map(() => '0.8fr').join(' ')
          this.wcGridColumns = `40px 2fr 0.6fr 0.6fr 1fr 1fr ${seasonCols}`.trim()
          this.worldCupLoaded = true
          this.loading = false
        },
        error: () => {
          this.toastService.showNegativeToast('Error loading World Cup standings.')
          this.loading = false
        },
      })
  }

  getSeasonBreakdown(team: any, season: string): { wins: number; losses: number } {
    const sb = team.seasonBreakdown?.find((s: any) => s.season === season)
    return sb || { wins: 0, losses: 0 }
  }
}
