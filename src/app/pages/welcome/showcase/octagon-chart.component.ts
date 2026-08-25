import { Component, Input, OnChanges } from '@angular/core'
import { NgFor, NgIf } from '@angular/common'

export interface RadarSeries {
  label: string
  /** One value per axis, in the same order as `axes`. */
  values: number[]
  /** CSS colour for stroke and fill. */
  colour: string
  /** Dashed outline — used for the league-average reference ring. */
  dashed?: boolean
}

interface Point {
  x: number
  y: number
}

interface RenderedSeries extends RadarSeries {
  points: string
  dots: Point[]
}

interface AxisLabel {
  text: string
  x: number
  y: number
  anchor: string
}

/**
 * Eight-axis radar.
 *
 * The in-app team analyzer draws six axes; this draws eight so a landing-page
 * reader sees the shape of the idea rather than a shrunken copy of the real
 * chart. Overlaying two teams plus the league average is the point — a single
 * polygon says nothing about whether a roster is actually good.
 *
 * Pure geometry, no dependency. The app ships every route in the initial
 * bundle, so a charting library here would cost more than the chart is worth.
 */
@Component({
  selector: 'app-octagon-chart',
  standalone: true,
  imports: [NgFor, NgIf],
  template: `
    <svg
      [attr.viewBox]="'0 0 ' + size + ' ' + size"
      class="radar"
      role="img"
      [attr.aria-label]="ariaLabel"
    >
      <!-- Grid rings -->
      <polygon
        *ngFor="let ring of rings"
        [attr.points]="ring"
        class="radar__ring"
      />

      <!-- Spokes -->
      <line
        *ngFor="let spoke of spokes"
        [attr.x1]="centre"
        [attr.y1]="centre"
        [attr.x2]="spoke.x"
        [attr.y2]="spoke.y"
        class="radar__spoke"
      />

      <!-- Series, drawn in order so the first sits underneath -->
      <g *ngFor="let s of rendered">
        <polygon
          [attr.points]="s.points"
          [attr.stroke]="s.colour"
          [attr.fill]="s.dashed ? 'none' : s.colour"
          [attr.fill-opacity]="s.dashed ? 0 : 0.14"
          [attr.stroke-dasharray]="s.dashed ? '4 4' : null"
          class="radar__shape"
        />
        <ng-container *ngIf="!s.dashed">
          <circle
            *ngFor="let d of s.dots"
            [attr.cx]="d.x"
            [attr.cy]="d.y"
            r="2.5"
            [attr.fill]="s.colour"
          />
        </ng-container>
      </g>

      <!-- Axis labels -->
      <text
        *ngFor="let label of axisLabels"
        [attr.x]="label.x"
        [attr.y]="label.y"
        [attr.text-anchor]="label.anchor"
        class="radar__label"
      >{{ label.text }}</text>
    </svg>
  `,
  styles: [`
    .radar {
      width: 100%;
      height: auto;
      display: block;
      overflow: visible;
    }
    .radar__ring {
      fill: none;
      stroke: rgba(255, 255, 255, 0.07);
      stroke-width: 1;
    }
    .radar__spoke {
      stroke: rgba(255, 255, 255, 0.06);
      stroke-width: 1;
    }
    .radar__shape {
      stroke-width: 2;
      stroke-linejoin: round;
    }
    .radar__label {
      font-size: 9px;
      letter-spacing: 0.06em;
      fill: rgba(143, 173, 160, 0.9);
      text-transform: uppercase;
    }
  `],
})
export class OctagonChartComponent implements OnChanges {
  @Input() axes: string[] = []
  @Input() series: RadarSeries[] = []
  /** Values are read as a fraction of this. */
  @Input() max = 100
  @Input() ariaLabel = 'Team strength by position'

  readonly size = 260
  readonly centre = 130
  private readonly radius = 88

  rings: string[] = []
  spokes: Point[] = []
  axisLabels: AxisLabel[] = []
  rendered: RenderedSeries[] = []

  ngOnChanges(): void {
    const n = this.axes.length
    if (n === 0) return

    // Start at 12 o'clock so the first axis reads as the top of the shape.
    const angleFor = (i: number) => (i / n) * Math.PI * 2 - Math.PI / 2

    const at = (i: number, r: number): Point => ({
      x: this.centre + Math.cos(angleFor(i)) * r,
      y: this.centre + Math.sin(angleFor(i)) * r,
    })

    this.rings = [0.25, 0.5, 0.75, 1].map((f) =>
      this.axes.map((_, i) => {
        const p = at(i, this.radius * f)
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
      }).join(' '),
    )

    this.spokes = this.axes.map((_, i) => at(i, this.radius))

    this.axisLabels = this.axes.map((text, i) => {
      const p = at(i, this.radius + 16)
      // Nudge the anchor so labels never overlap the shape they describe.
      const dx = p.x - this.centre
      const anchor = Math.abs(dx) < 8 ? 'middle' : dx > 0 ? 'start' : 'end'
      return { text, x: p.x, y: p.y + 3, anchor }
    })

    this.rendered = this.series.map((s) => {
      const dots = s.values.map((v, i) =>
        at(i, this.radius * Math.max(0, Math.min(1, v / this.max))),
      )
      return {
        ...s,
        dots,
        points: dots.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
      }
    })
  }
}
