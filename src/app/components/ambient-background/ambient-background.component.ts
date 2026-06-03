import {
  Component,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild,
} from '@angular/core'
import { gsap } from 'gsap'

@Component({
    selector: 'app-ambient-background',
    templateUrl: './ambient-background.component.html',
    styleUrls: ['./ambient-background.component.scss'],
    standalone: true,
})
export class AmbientBackgroundComponent implements AfterViewInit, OnDestroy {
  @ViewChild('ambientSvg', { static: true }) svgRef!: ElementRef<SVGElement>

  private readonly NUM_BLOBS = 6
  private readonly SCALES = [80, 100, 120, 65, 90, 75]
  private readonly XOMPER_COLORS = [
    '#ff4757', // accent red (vibrant)
    '#00ffab', // champion gold / neon emerald
    '#ff6b7a', // red variant
    '#00e89d', // vivid emerald
  ]
  private readonly START_POS: [number, number][] = [
    [300, 200],
    [900, 400],
    [1500, 300],
    [600, 700],
    [1200, 600],
    [200, 900],
  ]

  private reducedMotion = false
  private lightningTimer: ReturnType<typeof setTimeout> | null = null

  ngAfterViewInit(): void {
    this.reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
    this.initBlobs()

    if (this.reducedMotion) {
      this.placeStatic()
    } else {
      this.startAmbient()
      this.scheduleLightning()
    }
  }

  ngOnDestroy(): void {
    this.killAll()
  }

  private get svg(): SVGElement {
    return this.svgRef.nativeElement
  }

  private qa(selector: string): Element[] {
    return Array.from(this.svg.querySelectorAll(selector))
  }

  private blob(i: number): Element | null {
    return this.svg.querySelector(`.blob-${i}`)
  }

  private initBlobs(): void {
    for (let i = 0; i < this.NUM_BLOBS; i++) {
      const el = this.blob(i)
      if (!el) continue
      const scale = this.SCALES[i]
      gsap.set(el, {
        x: this.START_POS[i][0],
        y: this.START_POS[i][1],
        scale: scale / 18,
      })
    }
  }

  private placeStatic(): void {
    for (let i = 0; i < this.NUM_BLOBS; i++) {
      const body = this.blob(i)?.querySelector('.b-body')
      if (!body) continue
      const color = this.XOMPER_COLORS[i % this.XOMPER_COLORS.length]
      gsap.set(body, { attr: { fill: color } })
    }
  }

  private startAmbient(): void {
    for (let i = 0; i < this.NUM_BLOBS; i++) {
      this.wanderBlob(i)
      this.breatheBlob(i)
      this.cycleColor(i)
    }
  }

  private wanderBlob(index: number): void {
    const el = this.blob(index)
    if (!el) return

    const x = 100 + Math.random() * 1720
    const y = 50 + Math.random() * 980
    const duration = 8 + Math.random() * 7

    gsap.to(el, {
      x,
      y,
      duration,
      ease: 'sine.inOut',
      onComplete: () => this.wanderBlob(index),
    })
  }

  private breatheBlob(index: number): void {
    const body = this.blob(index)?.querySelector('.b-body')
    if (!body) return

    gsap.to(body, {
      attr: { ry: 18 },
      duration: 3 + Math.random() * 2,
      ease: 'sine.inOut',
      repeat: -1,
      yoyo: true,
      delay: Math.random() * 2,
    })
  }

  private cycleColor(index: number): void {
    const body = this.blob(index)?.querySelector('.b-body')
    if (!body) return

    const startColorIndex = index % this.XOMPER_COLORS.length
    const colors = [
      ...this.XOMPER_COLORS.slice(startColorIndex),
      ...this.XOMPER_COLORS.slice(0, startColorIndex),
    ]

    const tl = gsap.timeline({ repeat: -1, delay: index * 5 })

    colors.forEach((color) => {
      tl.to(body, {
        attr: { fill: color },
        duration: 30 + Math.random() * 30,
        ease: 'sine.inOut',
      })
    })
  }

  // -- Lightning --

  private scheduleLightning(): void {
    const delay = 800 + Math.random() * 2200
    this.lightningTimer = setTimeout(() => {
      this.strikeLightning()
      this.scheduleLightning()
    }, delay)
  }

  private strikeLightning(): void {
    const layer = this.svg.querySelector('.lightning-layer')
    if (!layer) return

    const ns = 'http://www.w3.org/2000/svg'

    const startX = 100 + Math.random() * 1720
    const startY = Math.random() * 200
    const path = this.generateBoltPath(
      startX,
      startY,
      600 + Math.random() * 900
    )

    // Weighted toward red (#ff4757), with emerald flashes
    const color =
      Math.random() > 0.3
        ? this.XOMPER_COLORS[0] // red most of the time
        : this.XOMPER_COLORS[
            Math.floor(Math.random() * this.XOMPER_COLORS.length)
          ]

    const bolt = document.createElementNS(ns, 'path')
    bolt.setAttribute('d', path)
    bolt.setAttribute('fill', 'none')
    bolt.setAttribute('stroke', color)
    bolt.setAttribute('stroke-width', '4.5')
    bolt.setAttribute('stroke-linecap', 'round')
    bolt.setAttribute('filter', 'url(#lightningGlow)')
    bolt.setAttribute('opacity', '0')
    layer.appendChild(bolt)

    let branch: SVGPathElement | null = null
    if (Math.random() > 0.5) {
      const segments = path.split(' L')
      if (segments.length > 3) {
        const branchStart =
          Math.floor(segments.length * 0.3) +
          Math.floor(Math.random() * (segments.length * 0.4))
        const branchCoords = segments[branchStart]
          ?.replace('M', '')
          .trim()
          .split(',')
        if (branchCoords && branchCoords.length === 2) {
          const bx = parseFloat(branchCoords[0])
          const by = parseFloat(branchCoords[1])
          const branchPath = this.generateBoltPath(
            bx,
            by,
            80 + Math.random() * 150
          )
          branch = document.createElementNS(ns, 'path')
          branch.setAttribute('d', branchPath)
          branch.setAttribute('fill', 'none')
          branch.setAttribute('stroke', color)
          branch.setAttribute('stroke-width', '3')
          branch.setAttribute('stroke-linecap', 'round')
          branch.setAttribute('filter', 'url(#lightningGlow)')
          branch.setAttribute('opacity', '0')
          layer.appendChild(branch)
        }
      }
    }

    const elements = branch ? [bolt, branch] : [bolt]
    const tl = gsap.timeline({
      onComplete: () => {
        elements.forEach((el) => el.remove())
      },
    })

    tl.to(elements, {
      attr: { opacity: 0.7 + Math.random() * 0.3 },
      duration: 0.05,
      ease: 'power4.in',
    })
      .to(elements, {
        attr: { opacity: 0 },
        duration: 0.08,
      })
      .to(elements, {
        attr: { opacity: 0.4 + Math.random() * 0.4 },
        duration: 0.03,
        delay: 0.05 + Math.random() * 0.1,
      })
      .to(elements, {
        attr: { opacity: 0 },
        duration: 0.15 + Math.random() * 0.2,
        ease: 'power2.out',
      })
  }

  private generateBoltPath(
    startX: number,
    startY: number,
    length: number
  ): string {
    let x = startX
    let y = startY
    const segments: string[] = [`M${x},${y}`]
    const numSegments = 6 + Math.floor(Math.random() * 8)
    const segLength = length / numSegments

    for (let i = 0; i < numSegments; i++) {
      x += (Math.random() - 0.5) * segLength * 1.5
      y += segLength * (0.6 + Math.random() * 0.6)
      x = Math.max(50, Math.min(1870, x))
      y = Math.min(1050, y)
      segments.push(`L${Math.round(x)},${Math.round(y)}`)
    }

    return segments.join(' ')
  }

  // -- Cleanup --

  private killAll(): void {
    if (this.lightningTimer) {
      clearTimeout(this.lightningTimer)
      this.lightningTimer = null
    }

    const layer = this.svg.querySelector('.lightning-layer')
    if (layer) {
      layer.innerHTML = ''
    }

    const allEls = this.qa('*')
    gsap.killTweensOf(allEls)

    for (let i = 0; i < this.NUM_BLOBS; i++) {
      const el = this.blob(i)
      if (el) gsap.killTweensOf(el)
    }
  }
}
