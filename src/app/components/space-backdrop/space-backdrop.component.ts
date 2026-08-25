import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
} from '@angular/core'
import { Starfield } from './starfield'

/**
 * The page-level sky.
 *
 * Replaces `AmbientBackgroundComponent`, which drifted six coloured blobs and
 * fired lightning bolts behind every page. Xomware moved its own surfaces to
 * space; this brings Xomper into the same sky rather than leaving it as the
 * one app still in a thunderstorm.
 *
 * `starfield.ts` and `x-points.ts` are copied verbatim from
 * `xomware-frontend/src/app/components/space-journey/` so the two stay
 * trivially syncable. The engine is Angular-free — it owns a canvas and a rAF
 * loop and nothing else.
 */

/** Calm enough to sit behind text on every route, not just the landing page. */
const BACKDROP_STARS = 380

/** Self-propelled drift. Slow enough to read as distance, not as movement. */
const DRIFT = 0.000018

@Component({
  selector: 'app-space-backdrop',
  standalone: true,
  templateUrl: './space-backdrop.component.html',
  styleUrls: ['./space-backdrop.component.scss'],
})
export class SpaceBackdropComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>

  private field?: Starfield
  private resizeObserver?: ResizeObserver

  constructor(private zone: NgZone) {}

  ngAfterViewInit(): void {
    // Runs on rAF for the life of the page. Outside the zone, so it never
    // triggers change detection.
    this.zone.runOutsideAngular(() => {
      const reducedMotion =
        !!window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches

      const field = new Starfield(this.canvasRef.nativeElement, {
        animateScene: !reducedMotion,
        starCount: BACKDROP_STARS,
        meteors: !reducedMotion,
        asteroids: !reducedMotion,
        // The assembled mark is Xomware's X. Xomper is not Xomware, and a
        // second brand forming in the sky behind the page would be noise.
        mark: false,
        drift: reducedMotion ? 0 : DRIFT,
      })

      this.field = field
      field.resize()

      this.resizeObserver = new ResizeObserver(() => field.resize())
      this.resizeObserver.observe(this.canvasRef.nativeElement)

      if (reducedMotion) {
        field.renderStatic()
      } else {
        field.start()
      }
    })
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect()
    this.field?.destroy()
  }
}
