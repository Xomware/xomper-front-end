import { Component, Input, OnChanges } from '@angular/core'
import { CommonModule } from '@angular/common'
import { HexAxis } from '../../../models/team-analysis.model'

/**
 * SVG radar chart for the Team Analyzer Compare tab.
 * Hand-rolled — no charting dependency. Mirrors iOS `HexagonChartView.swift`.
 *
 * Geometry:
 * - 6 axes starting at 12 o'clock (top), rotating clockwise.
 * - angle[i] = i × π/3 − π/2 (same as iOS vertex(center:radius:index:)).
 * - Each vertex is normalized against axisMaxes[label] so the polygon
 *   is a fraction of "league max" per axis.
 * - 4 grid rings at 0.25 / 0.5 / 0.75 / 1.0.
 * - axis labels at radius × 1.18.
 * - Primary polygon: gold, solid, dots on vertices.
 * - Comparison polygon: cyan, solid, dots on vertices.
 * - League-average polygon: gray, dashed, no dots (baseline only).
 *
 * viewBox-based so it is fully responsive.
 */
@Component({
  selector: 'app-hexagon-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './hexagon-chart.component.html',
  styleUrls: ['./hexagon-chart.component.scss'],
})
export class HexagonChartComponent implements OnChanges {
  /** Primary team axes — always rendered (gold). */
  @Input() primary: HexAxis[] = []
  /** Optional comparison team axes (cyan). Null = no overlay. */
  @Input() comparison: HexAxis[] | null = null
  /** Optional league-average axes (dashed gray baseline). */
  @Input() leagueAverage: HexAxis[] | null = null
  /** League-wide max per axis label — used to normalize vertices. */
  @Input() axisMaxes: Record<string, number> = {}

  /** SVG viewBox size — square canvas, labels fit in 0..300. */
  readonly viewBoxSize = 300
  readonly center = 150
  /** Radius of the outer hex grid ring. Labels live outside this. */
  readonly radius = 105

  gridRingLevels = [0.25, 0.5, 0.75, 1.0]

  /** Pre-computed geometry. Rebuilt on input changes. */
  gridRingPaths: string[] = []
  axisLinePaths: string[] = []
  axisLabelPositions: Array<{ x: number; y: number; label: string }> = []

  primaryPolygon: string = ''
  primaryDots: Array<{ cx: number; cy: number }> = []

  comparisonPolygon: string | null = null
  comparisonDots: Array<{ cx: number; cy: number }> = []
  comparisonFillPath: string | null = null

  averagePolygon: string | null = null
  averageFillPath: string | null = null

  primaryFillPath: string = ''

  ngOnChanges(): void {
    this.buildGridRings()
    this.buildAxisLines()
    this.buildLabelPositions()
    this.buildPrimaryPolygon()
    this.buildComparisonPolygon()
    this.buildAveragePolygon()
  }

  // ---------------------------------------------------------------------------
  // Geometry helpers
  // ---------------------------------------------------------------------------

  /** Mirror of iOS vertex(center:radius:index:). */
  private vertex(r: number, index: number): { x: number; y: number } {
    const angle = (index * Math.PI) / 3 - Math.PI / 2
    return {
      x: this.center + r * Math.cos(angle),
      y: this.center + r * Math.sin(angle),
    }
  }

  /** SVG polygon points string from array of vertices. */
  private toPoints(vertices: Array<{ x: number; y: number }>): string {
    return vertices.map((v) => `${v.x.toFixed(2)},${v.y.toFixed(2)}`).join(' ')
  }

  /** SVG path string for a closed hexagon at radius × level. */
  private hexPath(level: number): string {
    const pts = Array.from({ length: 6 }, (_, i) => this.vertex(this.radius * level, i))
    return (
      'M ' +
      pts.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ') +
      ' Z'
    )
  }

  /** Normalize axis values into vertex positions. */
  private axisVertices(axes: HexAxis[]): Array<{ x: number; y: number }> {
    return axes.map((axis, i) => {
      const max = this.axisMaxes[axis.label] ?? axis.value
      const normalized = max > 0 ? axis.value / max : 0
      return this.vertex(this.radius * normalized, i)
    })
  }

  // ---------------------------------------------------------------------------
  // Builders — called on each ngOnChanges
  // ---------------------------------------------------------------------------

  private buildGridRings(): void {
    this.gridRingPaths = this.gridRingLevels.map((level) => this.hexPath(level))
  }

  private buildAxisLines(): void {
    this.axisLinePaths = Array.from({ length: 6 }, (_, i) => {
      const v = this.vertex(this.radius, i)
      return `M ${this.center} ${this.center} L ${v.x.toFixed(2)} ${v.y.toFixed(2)}`
    })
  }

  private buildLabelPositions(): void {
    const labelRadius = this.radius * 1.18
    this.axisLabelPositions = this.primary.map((axis, i) => {
      const v = this.vertex(labelRadius, i)
      return { x: v.x, y: v.y, label: axis.label }
    })
  }

  private buildPrimaryPolygon(): void {
    if (this.primary.length === 0) {
      this.primaryPolygon = ''
      this.primaryFillPath = ''
      this.primaryDots = []
      return
    }
    const verts = this.axisVertices(this.primary)
    this.primaryPolygon = this.toPoints(verts)
    this.primaryFillPath = this.primaryPolygon
    this.primaryDots = verts.map((v) => ({ cx: v.x, cy: v.y }))
  }

  private buildComparisonPolygon(): void {
    if (!this.comparison || this.comparison.length === 0) {
      this.comparisonPolygon = null
      this.comparisonFillPath = null
      this.comparisonDots = []
      return
    }
    const verts = this.axisVertices(this.comparison)
    this.comparisonPolygon = this.toPoints(verts)
    this.comparisonFillPath = this.comparisonPolygon
    this.comparisonDots = verts.map((v) => ({ cx: v.x, cy: v.y }))
  }

  private buildAveragePolygon(): void {
    if (!this.leagueAverage || this.leagueAverage.length === 0) {
      this.averagePolygon = null
      this.averageFillPath = null
      return
    }
    const verts = this.axisVertices(this.leagueAverage)
    this.averagePolygon = this.toPoints(verts)
    this.averageFillPath = this.averagePolygon
  }
}
