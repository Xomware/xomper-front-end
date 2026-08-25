import { X_POINTS } from './x-points';

/**
 * Parallax starfield, rendered to a 2D canvas.
 *
 * Deliberately hand-written rather than pulled from a particle library: the
 * app ships every route in the initial bundle (no lazy loading), so a WebGL
 * or particle dependency would eat the whole remaining budget.
 *
 * There are no drawn lines anywhere in here. An earlier version connected
 * neighbouring stars and traced the mark with two strokes, which read as a
 * diagram rather than a sky. The constellation is made of stars alone — 460 of
 * them, sampled from the real logo artwork (see x-points.ts), so the brush
 * texture of the painted X is what actually forms.
 *
 * Angular-free on purpose — it owns a canvas and a rAF loop, nothing else.
 */

interface Star {
  /** Position in world space, 0..1. Wrapped on draw, so the field is endless. */
  x: number;
  y: number;
  size: number;
  alpha: number;
  layer: number;
  /** Phase offset so twinkling isn't synchronised across the field. */
  phase: number;
  /** Index into STAR_COLOURS. */
  tint: number;
  /** Bright enough to get a drawn halo. */
  luminous: boolean;
  /** Target in the mark, -1..1 about centre. Null for stars not in the X. */
  tx: number | null;
  ty: number | null;
}

/** A shooting star: a short-lived streak with a fading tail. */
interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  life: number;
  maxLife: number;
}

/** Somebody out there. Crosses the field now and then, and is gone. */
interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Counts up; the ship despawns once it has cleared the far edge. */
  life: number;
}

/** A tumbling rock. Drawn as an irregular polygon so no two look alike. */
interface Asteroid {
  x: number;
  y: number;
  radius: number;
  /** Per-vertex radius multipliers — the silhouette. */
  shape: number[];
  spin: number;
  angle: number;
  layer: number;
}

/** Parallax rate per layer. Nearer layers travel faster. */
const LAYER_SPEED = [0.25, 0.55, 1];
const LAYER_SHARE = [0.46, 0.33, 0.21];

const BASE_STAR_COUNT = 640;
/** Retina is worth it; beyond 2x is invisible and costs 4x the fill rate. */
const MAX_DPR = 2;

/**
 * Real starlight isn't white. Skewed towards blue-white and white, with a few
 * warmer ones — roughly what the eye picks out on a clear night.
 */
const STAR_COLOURS = [
  '255, 255, 255',
  '226, 238, 255',
  '198, 220, 255',
  '255, 244, 224',
  '255, 226, 190',
];
const COLOUR_WEIGHTS = [0.42, 0.24, 0.16, 0.12, 0.06];

const ASTEROID_COUNT = 7;
/** Seconds between rocket sightings, before jitter. Rare on purpose. */
const ROCKET_INTERVAL = 15;
/** Seconds between shooting stars, before jitter. */
const METEOR_INTERVAL = 2.4;
const MAX_METEORS = 3;

/** How the field is configured for a given surface. */
export interface StarfieldOptions {
  /** false freezes meteors and asteroid tumble, for reproducible screenshots. */
  animateScene?: boolean;
  starCount?: number;
  /** Shooting stars. */
  meteors?: boolean;
  /** Tumbling rocks. */
  asteroids?: boolean;
  /** Whether stars are reserved to assemble the Xomware mark. */
  mark?: boolean;
  /** Self-propelled drift per frame, for surfaces not driven by scroll. */
  drift?: number;
}

/** Half-extent of the assembled mark, as a fraction of the smaller viewport side. */
const X_SPAN = 0.42;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickColour(r: number): number {
  let acc = 0;
  for (let i = 0; i < COLOUR_WEIGHTS.length; i++) {
    acc += COLOUR_WEIGHTS[i];
    if (r <= acc) return i;
  }
  return 0;
}

export class Starfield {
  private ctx: CanvasRenderingContext2D | null;
  private stars: Star[] = [];
  /** Only the stars that belong to the mark, cached to avoid re-filtering. */
  private xStars: Star[] = [];
  /** One pre-rendered sprite per star colour, plus a spiked variant. */
  private starSprites: HTMLCanvasElement[] = [];
  private spikeSprites: HTMLCanvasElement[] = [];
  private frame = 0;
  private running = false;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private time = 0;

  private asteroids: Asteroid[] = [];
  private meteors: Meteor[] = [];
  private rocket: Rocket | null = null;
  private nextMeteorAt = METEOR_INTERVAL;
  private nextRocketAt = ROCKET_INTERVAL;
  private rand: () => number = mulberry32(1);

  private progress = 0;
  private renderedProgress = 0;
  private formation = 0;
  private renderedFormation = 0;

  private readonly opts: Required<StarfieldOptions>;

  constructor(private canvas: HTMLCanvasElement, options: StarfieldOptions = {}) {
    this.opts = {
      animateScene: true,
      starCount: BASE_STAR_COUNT,
      meteors: true,
      asteroids: true,
      mark: true,
      drift: 0,
      ...options,
    };
    this.ctx = canvas.getContext('2d');
    this.seed(this.opts.starCount);
    this.buildSprites();
  }

  private get animateScene(): boolean {
    return this.opts.animateScene;
  }

  private seed(count: number): void {
    const rand = mulberry32(0x58_4f_4d_57); // "XOMW"
    this.stars = [];

    LAYER_SHARE.forEach((share, layer) => {
      const n = Math.round(count * share);
      for (let i = 0; i < n; i++) {
        this.stars.push({
          x: rand(),
          y: rand(),
          // Mostly sub-pixel dust with a handful of larger stars — an evenly
          // sized field is the thing that reads as "generated".
          size: 0.5 + layer * 0.35 + Math.pow(rand(), 2.2) * 1.5,
          alpha: 0.2 + Math.pow(rand(), 1.6) * 0.75,
          layer,
          phase: rand() * Math.PI * 2,
          tint: pickColour(rand()),
          luminous: rand() > 0.975,
          tx: null,
          ty: null,
        });
      }
    });

    if (this.opts.mark) this.assignMark(rand);
    if (this.opts.asteroids) this.seedAsteroids(rand);
    // Kept for meteor spawning, which needs randomness past construction.
    this.rand = rand;
  }

  private seedAsteroids(rand: () => number): void {
    this.asteroids = [];
    for (let i = 0; i < ASTEROID_COUNT; i++) {
      const vertices = 8 + Math.floor(rand() * 4);
      const shape: number[] = [];
      for (let v = 0; v < vertices; v++) {
        // Never below 0.62, or the polygon folds in on itself and reads as a
        // star rather than a rock.
        shape.push(0.62 + rand() * 0.55);
      }
      this.asteroids.push({
        x: rand(),
        y: 0.08 + rand() * 0.84,
        radius: 4 + rand() * 11,
        shape,
        spin: (rand() - 0.5) * 0.4,
        angle: rand() * Math.PI * 2,
        layer: rand() > 0.5 ? 1 : 2,
      });
    }
  }

  /**
   * Hand out the mark's sampled points to a random spread of stars.
   *
   * Drawn from the whole field rather than one layer, so the X assembles from
   * every depth at once instead of a single plane sliding into place.
   */
  private assignMark(rand: () => number): void {
    const pool = [...this.stars];
    this.xStars = [];

    const count = Math.min(X_POINTS.length, pool.length);
    for (let i = 0; i < count; i++) {
      const star = pool.splice(Math.floor(rand() * pool.length), 1)[0];
      const [tx, ty] = X_POINTS[i];
      star.tx = tx;
      star.ty = ty;
      this.xStars.push(star);
    }
  }

  /**
   * Pre-render one soft sprite per star colour, plus a spiked version.
   *
   * Stars used to be drawn with fillRect, which is exactly a square dot — at
   * these sizes that reads as confetti, not sky. A soft radial falloff gives
   * every star a core and a halo, and the four-point diffraction spikes on the
   * bright ones are the detail the eye actually reads as "star".
   *
   * Pre-rendering per colour means drawing is a drawImage rather than building
   * a gradient 640 times a frame.
   */
  private buildSprites(): void {
    this.starSprites = STAR_COLOURS.map((rgb) => {
      const size = 32;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const g = c.getContext('2d');
      if (!g) return c;

      const r = size / 2;
      const grad = g.createRadialGradient(r, r, 0, r, r, r);
      grad.addColorStop(0, `rgba(${rgb}, 1)`);
      grad.addColorStop(0.16, `rgba(${rgb}, 0.85)`);
      grad.addColorStop(0.42, `rgba(${rgb}, 0.22)`);
      grad.addColorStop(1, `rgba(${rgb}, 0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
      return c;
    });

    this.spikeSprites = STAR_COLOURS.map((rgb) => {
      const size = 96;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const g = c.getContext('2d');
      if (!g) return c;

      const r = size / 2;
      // Core bloom.
      const core = g.createRadialGradient(r, r, 0, r, r, r * 0.34);
      core.addColorStop(0, `rgba(${rgb}, 0.95)`);
      core.addColorStop(0.5, `rgba(${rgb}, 0.28)`);
      core.addColorStop(1, `rgba(${rgb}, 0)`);
      g.fillStyle = core;
      g.fillRect(0, 0, size, size);

      // Four spikes, drawn as tapered gradients out from the centre.
      const spike = (w: number, h: number) => {
        const grad = g.createLinearGradient(r - w / 2, r, r + w / 2, r);
        grad.addColorStop(0, `rgba(${rgb}, 0)`);
        grad.addColorStop(0.5, `rgba(${rgb}, 0.5)`);
        grad.addColorStop(1, `rgba(${rgb}, 0)`);
        g.fillStyle = grad;
        g.fillRect(r - w / 2, r - h / 2, w, h);
      };
      spike(size * 0.94, 1.1);
      g.save();
      g.translate(r, r);
      g.rotate(Math.PI / 2);
      g.translate(-r, -r);
      spike(size * 0.72, 1.1);
      g.restore();

      return c;
    });
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    this.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.ctx?.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.draw();
  }

  setProgress(p: number): void {
    this.progress = p;
  }

  /** 0 = scattered, 1 = assembled into the mark. Driven by the timeline. */
  setFormation(v: number): void {
    this.formation = Math.min(Math.max(v, 0), 1);
  }

  /** Paint one frame without starting the loop — used for reduced motion. */
  renderStatic(): void {
    this.renderedProgress = this.progress;
    this.renderedFormation = this.formation;
    this.draw();
  }

  start(): void {
    if (this.running || !this.ctx) return;
    this.running = true;
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  destroy(): void {
    this.stop();
    this.stars = [];
    this.xStars = [];
    this.asteroids = [];
    this.meteors = [];
    this.rocket = null;
    this.starSprites = [];
    this.spikeSprites = [];
    this.ctx = null;
  }

  private tick = (): void => {
    if (!this.running) return;
    // A backdrop has no scroll driving it, so it advances itself.
    if (this.opts.drift) this.progress += this.opts.drift;
    this.renderedProgress += (this.progress - this.renderedProgress) * 0.08;
    this.renderedFormation += (this.formation - this.renderedFormation) * 0.055;
    this.time += 0.016;
    this.update();
    this.draw();
    this.frame = requestAnimationFrame(this.tick);
  };

  /** Advance everything that has its own motion, independent of scroll. */
  private update(): void {
    if (!this.animateScene) return;

    for (const rock of this.asteroids) {
      rock.angle += rock.spin * 0.01;
    }

    if (this.opts.meteors && this.time >= this.nextMeteorAt && this.meteors.length < MAX_METEORS) {
      this.spawnMeteor();
      // Jittered so they never fall into a visible rhythm.
      this.nextMeteorAt = this.time + METEOR_INTERVAL + this.rand() * 3.4;
    }

    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.x += m.vx;
      m.y += m.vy;
      m.life += 1;
      if (m.life > m.maxLife) this.meteors.splice(i, 1);
    }

    if (!this.rocket && this.time >= this.nextRocketAt) {
      this.spawnRocket();
      this.nextRocketAt = this.time + ROCKET_INTERVAL + this.rand() * 14;
    }

    if (this.rocket) {
      this.rocket.x += this.rocket.vx;
      this.rocket.y += this.rocket.vy;
      this.rocket.life += 1;
      // Gone once it has cleared the far edge with room to spare.
      const margin = 140;
      if (this.rocket.x < -margin || this.rocket.x > this.width + margin) this.rocket = null;
    }
  }

  private spawnRocket(): void {
    const rand = this.rand;
    const leftToRight = rand() > 0.5;
    // Much slower than a meteor: this one is under power, not falling.
    const speed = 1.9 + rand() * 1.5;
    // Only a slight climb or dive, so it reads as a course rather than a dive.
    const climb = (rand() - 0.5) * 0.5;

    this.rocket = {
      x: leftToRight ? -120 : this.width + 120,
      y: this.height * (0.12 + rand() * 0.68),
      vx: (leftToRight ? 1 : -1) * speed,
      vy: climb,
      life: 0,
    };
  }

  private spawnMeteor(): void {
    const rand = this.rand;
    // Shallow diagonal, entering from either side of the top half.
    const leftToRight = rand() > 0.45;
    const angle = (18 + rand() * 22) * (Math.PI / 180);
    const speed = 9 + rand() * 7;

    this.meteors.push({
      x: leftToRight ? -80 : this.width + 80,
      y: this.height * (0.02 + rand() * 0.45),
      vx: (leftToRight ? 1 : -1) * Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      length: 90 + rand() * 150,
      life: 0,
      maxLife: 55 + rand() * 45,
    });
  }

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx || !this.width) return;

    ctx.clearRect(0, 0, this.width, this.height);

    const travel = this.renderedProgress * this.width * 6;
    const form = this.renderedFormation;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const scale = Math.min(this.width, this.height) * X_SPAN;

    this.drawAsteroids(ctx, travel, form);

    for (const star of this.stars) {
      let x = (star.x * this.width - travel * LAYER_SPEED[star.layer]) % this.width;
      if (x < 0) x += this.width;
      let y = star.y * this.height;

      // Stars belonging to the mark ease toward their sampled point.
      let assembled = 0;
      if (form > 0.001 && star.tx !== null && star.ty !== null) {
        assembled = form;
        x += (cx + star.tx * scale - x) * form;
        y += (cy + star.ty * scale - y) * form;
      }

      // Slow twinkle. Small amplitude — the sky should read as alive, not
      // as blinking.
      const twinkle = 0.78 + Math.sin(this.time * 1.3 + star.phase) * 0.22;

      // Contrast is what makes the mark readable without drawing a single
      // line: its stars brighten and swell while the rest of the sky falls
      // back. Brightening the mark alone wasn't enough — against a full field
      // the shape stayed lost in the noise.
      const isMark = star.tx !== null;
      const recede = isMark ? 1 : 1 - form * 0.62;
      // Deliberately restrained. The mark reads from the crisp edge of its
      // silhouette (62% of its points sit on the stroke boundary), not from
      // being bright — blown out it looked like a graphic pasted on the sky.
      const alpha = Math.min(0.92, star.alpha * twinkle * recede + assembled * 0.4);
      const sprite = this.starSprites[star.tint];
      if (!sprite) continue;

      // The sprite's visible core is a fraction of its box, so it is drawn
      // several times the nominal star size.
      const box = (star.size + assembled * 0.9) * 6.5;
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, x - box / 2, y - box / 2, box, box);

      if (star.luminous) {
        const spikes = this.spikeSprites[star.tint];
        if (spikes) {
          const sb = box * 3.4;
          ctx.globalAlpha = alpha * 0.8;
          ctx.drawImage(spikes, x - sb / 2, y - sb / 2, sb, sb);
        }
      }
    }

    this.drawMeteors(ctx);
    this.drawRocket(ctx, form);
    ctx.globalAlpha = 1;
  }

  /** The ship, drawn nose-first along its own heading. */
  private drawRocket(ctx: CanvasRenderingContext2D, form: number): void {
    const r = this.rocket;
    if (!r) return;

    // Recedes with the rest of the sky while the mark assembles.
    ctx.globalAlpha = 1 - form * 0.7;
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(Math.atan2(r.vy, r.vx));

    // Exhaust first, so the hull paints over its root. Length flickers.
    const flame = 13 + Math.sin(this.time * 22) * 4;
    const plume = ctx.createLinearGradient(-9, 0, -9 - flame, 0);
    plume.addColorStop(0, 'rgba(255, 214, 130, 0.95)');
    plume.addColorStop(0.45, 'rgba(255, 138, 46, 0.6)');
    plume.addColorStop(1, 'rgba(255, 108, 32, 0)');
    ctx.fillStyle = plume;
    ctx.beginPath();
    ctx.moveTo(-9, -3.4);
    ctx.lineTo(-9 - flame, 0);
    ctx.lineTo(-9, 3.4);
    ctx.closePath();
    ctx.fill();

    // Fins.
    ctx.fillStyle = 'rgba(196, 84, 74, 0.95)';
    ctx.beginPath();
    ctx.moveTo(-7, -3);
    ctx.lineTo(-13, -8.5);
    ctx.lineTo(-5, -3);
    ctx.closePath();
    ctx.moveTo(-7, 3);
    ctx.lineTo(-13, 8.5);
    ctx.lineTo(-5, 3);
    ctx.closePath();
    ctx.fill();

    // Hull: a nose cone tapering back to the engine.
    ctx.fillStyle = 'rgba(226, 232, 246, 0.96)';
    ctx.beginPath();
    ctx.moveTo(17, 0);
    ctx.quadraticCurveTo(6, -5.4, -9, -4.2);
    ctx.lineTo(-9, 4.2);
    ctx.quadraticCurveTo(6, 5.4, 17, 0);
    ctx.closePath();
    ctx.fill();

    // Porthole.
    ctx.fillStyle = 'rgba(0, 180, 216, 0.95)';
    ctx.beginPath();
    ctx.arc(4.5, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /** Tumbling rocks drifting through the field. */
  private drawAsteroids(ctx: CanvasRenderingContext2D, travel: number, form: number): void {
    // They are not part of the mark, so they fade back with the rest of the
    // sky while it assembles.
    const dim = 1 - form * 0.55;

    for (const rock of this.asteroids) {
      let x = (rock.x * this.width - travel * LAYER_SPEED[rock.layer] * 0.85) % this.width;
      if (x < 0) x += this.width;
      const y = rock.y * this.height;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rock.angle);

      ctx.beginPath();
      for (let i = 0; i < rock.shape.length; i++) {
        const a = (i / rock.shape.length) * Math.PI * 2;
        const r = rock.radius * rock.shape[i];
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      // Lit from the upper left, like the planets, so the scene agrees with
      // itself about where the light is.
      const shade = ctx.createLinearGradient(-rock.radius, -rock.radius, rock.radius, rock.radius);
      // Kept dark. Brighter than this and they stop reading as distant rock
      // and start competing with the stars for attention.
      shade.addColorStop(0, `rgba(96, 100, 122, ${0.6 * dim})`);
      shade.addColorStop(0.55, `rgba(44, 46, 62, ${0.62 * dim})`);
      shade.addColorStop(1, `rgba(18, 19, 30, ${0.7 * dim})`);
      ctx.fillStyle = shade;
      ctx.fill();

      ctx.strokeStyle = `rgba(150, 158, 186, ${0.18 * dim})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Shooting stars: a bright head trailing a fading streak. */
  private drawMeteors(ctx: CanvasRenderingContext2D): void {
    for (const m of this.meteors) {
      // Ease in and out so they never pop into or out of existence.
      const t = m.life / m.maxLife;
      const fade = Math.sin(Math.min(Math.max(t, 0), 1) * Math.PI);
      if (fade <= 0.01) continue;

      const speed = Math.hypot(m.vx, m.vy) || 1;
      const tailX = m.x - (m.vx / speed) * m.length;
      const tailY = m.y - (m.vy / speed) * m.length;

      const grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
      grad.addColorStop(0, `rgba(255, 255, 255, ${0.9 * fade})`);
      grad.addColorStop(0.25, `rgba(214, 236, 255, ${0.4 * fade})`);
      grad.addColorStop(1, 'rgba(214, 236, 255, 0)');

      ctx.globalAlpha = 1;
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();

      const head = this.starSprites[0];
      if (head) {
        const b = 14;
        ctx.globalAlpha = fade;
        ctx.drawImage(head, m.x - b / 2, m.y - b / 2, b, b);
      }
    }
  }
}
