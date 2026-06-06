import { Component, Input } from '@angular/core'
import { CommonModule } from '@angular/common'
import { HexAxis, TeamAnalysis, hexAxes } from '../../../models/team-analysis.model'

/**
 * Per-position breakdown grid for the Analyzer Compare tab.
 * Port of iOS `PositionBreakdownCard.swift`.
 *
 * For each hex axis:
 * - A progress bar filled to `myValue / leagueMax`.
 * - My value colored gold (above avg ≥1.05), red (below avg ≤0.85), or default.
 * - Opponent value (cyan) or league average (gray) in the right column.
 * - Total roster value row at the bottom.
 */
@Component({
  selector: 'app-position-breakdown-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './position-breakdown-card.component.html',
  styleUrls: ['./position-breakdown-card.component.scss'],
})
export class PositionBreakdownCardComponent {
  @Input() my!: TeamAnalysis
  @Input() opp: TeamAnalysis | null = null
  @Input() averages: HexAxis[] = []
  @Input() maxes: Record<string, number> = {}

  get myAxes(): HexAxis[] {
    return hexAxes(this.my)
  }

  get myTotal(): number {
    return this.myAxes.reduce((s, a) => s + a.value, 0)
  }

  get oppTotal(): number {
    if (!this.opp) return 0
    return hexAxes(this.opp).reduce((s, a) => s + a.value, 0)
  }

  oppValue(index: number): number | null {
    if (!this.opp) return null
    const axes = hexAxes(this.opp)
    return axes[index]?.value ?? null
  }

  avgValue(index: number): number {
    return this.averages[index]?.value ?? 0
  }

  leagueMax(label: string, fallback: number): number {
    return this.maxes[label] ?? fallback
  }

  fillFraction(myValue: number, leagueMax: number): number {
    return leagueMax > 0 ? Math.min(1, myValue / leagueMax) : 0
  }

  /** Gold ≥1.05 avg, red ≤0.85 avg, default otherwise. */
  deltaClass(myValue: number, avgValue: number): string {
    if (avgValue <= 0) return ''
    const ratio = myValue / avgValue
    if (ratio >= 1.05) return 'delta--gold'
    if (ratio <= 0.85) return 'delta--red'
    return ''
  }
}
