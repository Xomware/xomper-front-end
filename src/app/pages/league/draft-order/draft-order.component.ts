import { Component, OnInit } from '@angular/core'
import { NgIf, NgFor, DecimalPipe } from '@angular/common'
import { LeagueService } from 'src/app/services/league.service'
import { StandingsService } from 'src/app/services/standings.service'
import { PlayerService } from 'src/app/services/player.service'
import { PlayerPointsService } from 'src/app/services/player-points.service'
import { DraftOrderProjectionService, DraftOrderProjection } from 'src/app/services/draft-order-projection.service'
import { LeagueModel } from 'src/app/models/league.model'
import { LoaderComponent } from '../../../components/loader/loader.component'
import { firstValueFrom } from 'rxjs'

@Component({
  selector: 'app-draft-order',
  templateUrl: './draft-order.component.html',
  styleUrls: ['./draft-order.component.scss'],
  standalone: true,
  imports: [LoaderComponent, NgIf, NgFor, DecimalPipe],
})
export class DraftOrderComponent implements OnInit {
  loading = false
  loadingWeek = 0
  totalWeeks = 0
  projection: DraftOrderProjection | null = null
  league: LeagueModel | null = null
  error: string | null = null

  constructor(
    private leagueService: LeagueService,
    private standingsService: StandingsService,
    private playerService: PlayerService,
    private playerPointsService: PlayerPointsService,
    private projectionService: DraftOrderProjectionService,
  ) {}

  ngOnInit(): void {
    this.league = this.leagueService.getMyLeague()
    if (!this.league) {
      this.error = 'League not loaded.'
      return
    }
    this.load()
  }

  async load(): Promise<void> {
    if (!this.league) return
    this.loading = true
    this.error = null

    try {
      const leagueId = this.league.getId()
      const settings = this.league.settings as Record<string, unknown>
      const regularSeasonLastWeek = DraftOrderProjectionService.getRegularSeasonLastWeek(settings)
      this.totalWeeks = regularSeasonLastWeek

      // Fetch player map for position lookup
      const playerMap = await firstValueFrom(this.playerService.getPlayerMap())
      const playerPositions: Record<string, string> = {}
      for (const [pid, player] of Object.entries(playerMap)) {
        playerPositions[pid] = player.position || player.fantasy_positions?.[0] || ''
      }

      // Fetch per-week roster points (multi-week — show progress)
      await this.playerPointsService.loadRegularSeason(leagueId, regularSeasonLastWeek)

      // Build standings (pre-sorted by wins desc, then PF desc)
      const rawStandings = this.league.getStandingsTeams()
      const standings = this.standingsService.buildStandings([...rawStandings])

      const playoffTeams = this.league.getPlayoffTeams()
      const rosterPositions = this.league.getRosterPositions()

      // Compute projection
      this.projection = this.projectionService.compute(
        standings,
        playoffTeams,
        rosterPositions,
        playerPositions,
        regularSeasonLastWeek,
      )
    } catch (err) {
      this.error = 'Failed to load draft order projection.'
      console.error('[DraftOrderComponent] load error:', err)
    } finally {
      this.loading = false
    }
  }

  get fetchProgress(): number {
    return this.playerPointsService.progress
  }

  get fetchProgressPct(): string {
    return Math.round(this.playerPointsService.progress * 100) + '%'
  }

  get isLoadingPoints(): boolean {
    return this.playerPointsService.isLoading
  }
}
