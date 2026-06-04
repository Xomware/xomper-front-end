import { Component, OnInit } from '@angular/core'
import { NgFor, NgIf } from '@angular/common'
import { LeagueService } from 'src/app/services/league.service'
import { LeagueModel } from 'src/app/models/league.model'

@Component({
  selector: 'app-league-settings',
  templateUrl: './league-settings.component.html',
  styleUrls: ['./league-settings.component.scss'],
  standalone: true,
  imports: [NgFor, NgIf],
})
export class LeagueSettingsComponent implements OnInit {
  rosterSlots: { position: string; count: number }[] = []
  league: LeagueModel | null = null

  constructor(private leagueService: LeagueService) {}

  ngOnInit(): void {
    this.league = this.leagueService.getMyLeague()
    if (!this.league) return

    const positions = this.league.getRosterPositions()
    const positionCounts = new Map<string, number>()
    positions.forEach((pos) => {
      if (pos === 'BN') return
      positionCounts.set(pos, (positionCounts.get(pos) || 0) + 1)
    })
    this.rosterSlots = Array.from(positionCounts.entries()).map(([position, count]) => ({
      position,
      count,
    }))
    const benchCount = positions.filter((p) => p === 'BN').length
    if (benchCount > 0) {
      this.rosterSlots.push({ position: 'BN', count: benchCount })
    }
  }
}
