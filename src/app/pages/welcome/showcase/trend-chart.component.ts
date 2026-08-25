import { Component, Input, OnChanges } from '@angular/core'
import { NgFor, NgIf } from '@angular/common'

export interface TrendPoint {
  label: string
  value: number
}

/**
 * A player's value over time.
 *
 * Dynasty value is not a number, it is a direction — a 24-year-old drifting up
 * and a 30-year-old drifting down can price identically today and be entirely
 * different assets. A single figure hides that; a line does not.
 */
@Component({
  selector: 'app-trend-chart',
  standalone: true,
  imports: [NgFor, NgIf],
  template: `
    <svg
      [attr.viewBox]="'0 0 ' + width + ' ' + height"
      class="trend"
      role="img"
      [attr.aria-label]="ariaLabel"
    >
      <defs>
        <linearGradient [attr.id]="gradientId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" [attr.stop-color]="colour" stop-opacity="0.35" />
          <stop offset="100%" [attr.stop-color]="colour" stop-opacity="0" />
        </linearGradient>
      </defs>

      <line
        *ngFor="let y of gridLines"
        [attr.x1]="0" [attr.x2]="width"
        [attr.y1]="y" [attr.y2]="y"
        class="trend__grid"
      />

      <path [attr.d]="areaPath" [attr.fill]="'url(#' + gradientId + ')'" />
      <path [attr.d]="linePath" [attr.stroke]="colour" class="trend__line" />

      <circle
        *ngIf="lastPoint"
        [attr.cx]="lastPoint.x"
        [attr.cy]="lastPoint.y"
        r="3.5"
        [attr.fill]="colour"
      />
    </svg>
  `,
  styles: [`
    .trend { width: 100%; height: auto; display: block; }
    .trend__grid { stroke: rgba(255, 255, 255, 0.05); stroke-width: 1; }
    .trend__line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  `],
})
export class TrendChartComponent implements OnChanges {
  @Input() points: TrendPoint[] = []
  @Input() colour = '#00ffab'
  @Input() ariaLabel = 'Value over time'
  /** Unique per instance, or two charts on one page share a gradient. */
  @Input() gradientId = 'trendGradient'

  readonly width = 260
  readonly height = 72

  linePath = ''
  areaPath = ''
  lastPoint: { x: number; y: number } | null = null
  gridLines: number[] = [12, 36, 60]

  ngOnChanges(): void {
    const n = this.points.length
    if (n < 2) {
      this.linePath = ''
      this.areaPath = ''
      this.lastPoint = null
      return
    }

    const values = this.points.map((p) => p.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    // A flat series would divide by zero; give it a nominal band instead.
    const span = max - min || 1
    const pad = 8

    const coords = this.points.map((p, i) => ({
      x: (i / (n - 1)) * this.width,
      y:
        this.height -
        pad -
        ((p.value - min) / span) * (this.height - pad * 2),
    }))

    this.linePath = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(' ')

    this.areaPath =
      `M${coords[0].x.toFixed(1)},${this.height} ` +
      coords.map((c) => `L${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ') +
      ` L${coords[n - 1].x.toFixed(1)},${this.height} Z`

    this.lastPoint = coords[n - 1]
  }
}
