import { Component, Input } from '@angular/core'
import { CommonModule } from '@angular/common'
import { RecommendedTrade } from '../../../models/team-analysis.model'

/**
 * Card displaying a single `RecommendedTrade` suggestion.
 * Port of iOS `RecommendedTradeCard.swift`.
 *
 * Pure presentation — tap/click action is the caller's responsibility.
 */
@Component({
  selector: 'app-recommended-trade-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './recommended-trade-card.component.html',
  styleUrls: ['./recommended-trade-card.component.scss'],
})
export class RecommendedTradeCardComponent {
  @Input() rec!: RecommendedTrade

  get percentGapLabel(): string {
    return `${(this.rec.percentGap * 100).toFixed(0)}% gap`
  }
}
