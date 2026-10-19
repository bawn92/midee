// Note-hit particles. The spawn and step math is the Appearance spec:
// velocity scaling, the chord divisor, a 700 cap, and reduced motion.

export type HitFx =
  | 'sparks'
  | 'embers'
  | 'bloom'
  | 'sparkle'
  | 'opal'
  | 'glass'
  | 'rain'
  | 'mist'
  | 'off'

export type HitHand = 'lh' | 'rh'

export interface HitParam {
  count: number
  life: [number, number]
  speed?: [number, number]
  spread?: number
  grav?: number
  drag?: number
  size: [number, number]
  blend: 'lighter' | 'source-over' | 'screen'
  alpha: number
}

export const HIT_PARAMS: Record<Exclude<HitFx, 'off'>, HitParam> = {
  sparks: {
    count: 14,
    life: [0.4, 0.7],
    speed: [320, 580],
    spread: 26,
    grav: 900,
    drag: 2.2,
    size: [2, 3.2],
    blend: 'lighter',
    alpha: 0.95,
  },
  embers: {
    count: 6,
    life: [1.8, 3],
    speed: [30, 70],
    spread: 22,
    grav: -8,
    drag: 0.4,
    size: [3, 6],
    blend: 'lighter',
    alpha: 0.85,
  },
  bloom: { count: 1, life: [0.8, 0.8], size: [24, 52], blend: 'source-over', alpha: 0.85 },
  sparkle: {
    count: 8,
    life: [0.6, 1.1],
    speed: [10, 24],
    spread: 60,
    grav: -4,
    drag: 0.5,
    size: [5, 10],
    blend: 'lighter',
    alpha: 1,
  },
  opal: {
    count: 14,
    life: [1.3, 2.2],
    speed: [60, 150],
    spread: 50,
    grav: -10,
    drag: 1.2,
    size: [4, 8],
    blend: 'source-over',
    alpha: 0.95,
  },
  glass: {
    count: 12,
    life: [1.4, 2.4],
    speed: [50, 120],
    spread: 40,
    grav: 25,
    drag: 0.8,
    size: [3, 6],
    blend: 'source-over',
    alpha: 1,
  },
  rain: {
    count: 9,
    life: [0.5, 0.7],
    speed: [150, 260],
    spread: 60,
    grav: 900,
    drag: 0.3,
    size: [2, 3.5],
    blend: 'source-over',
    alpha: 0.9,
  },
  mist: {
    count: 3,
    life: [1.6, 2.4],
    speed: [8, 16],
    spread: 30,
    grav: -4,
    drag: 0.3,
    size: [18, 80],
    blend: 'screen',
    alpha: 0.45,
  },
}

export const HIT_CAP = 700

export interface HitNote {
  x: number
  y: number
  keyWidth: number
  /** 0–1, the app's normalised MIDI velocity. */
  velocity: number
  hand: HitHand
}

export interface HitParticle {
  fx: Exclude<HitFx, 'off'>
  hand: HitHand
  x: number
  y: number
  vx: number
  vy: number
  age: number
  life: number
  size: number
  rot: number
  spin: number
  ph: number
  seed: number
  petals: number
  vn: number
  ripple: boolean
  /** Hit line at spawn. Rain ripples stay here while the drop falls. */
  originY: number
  born: number
}

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface HitPalette {
  scene: 'golden' | 'rainy' | 'after' | 'night'
  rh: Rgb
  rhEdge: Rgb
  lh: Rgb
  lhEdge: Rgb
  hot: Rgb
  glint: Rgb
  rain: Rgb
  mist: Rgb
  glassRim: Rgb
  opal: [Rgb, Rgb, Rgb, Rgb, Rgb]
}

const TAU = Math.PI * 2

export function makeRng(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hitHash(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

export function hitNoise(x: number): number {
  const i = Math.floor(x)
  const f = x - i
  const u = f * f * (3 - 2 * f)
  return (hitHash(i) * (1 - u) + hitHash(i + 1) * u) * 2 - 1
}

export function hitLerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function hitClamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}

/** Particles born for one note before the chord divisor, at full velocity. */
export function particlesPerNote(
  fx: Exclude<HitFx, 'off'>,
  velocity: number,
  notesInChord: number,
  amount: number,
  reduced: boolean,
): number {
  const count = HIT_PARAMS[fx].count
  if (reduced) return Math.min(3, count)
  const vn = hitClamp(velocity, 0, 1)
  const scaled = count * (0.35 + 0.65 * vn ** 1.2) * amount
  const per = Math.round(scaled / Math.sqrt(Math.max(1, notesInChord)))
  return Math.max(1, per)
}

export class HitField {
  particles: HitParticle[] = []
  amount = 1
  size = 1
  life = 1
  /** Playing-dynamics multiplier. Velocity is already 0–1. */
  dynamics = 1
  reduced = false
  private rand = makeRng(3)
  private serial = 0

  clear(): void {
    this.particles = []
    this.rand = makeRng(3)
    this.serial = 0
  }

  spawn(fx: HitFx, notes: readonly HitNote[]): void {
    if (fx === 'off' || notes.length === 0) return
    const spec = HIT_PARAMS[fx]
    const n = notes.length
    for (const note of notes) {
      const vn = hitClamp(note.velocity * this.dynamics, 0, 1)
      const per = particlesPerNote(fx, vn, n, this.amount, this.reduced)
      const emit = fx === 'bloom' ? 1 : per
      const sz = hitLerp(0.75, 1.25, vn) * this.size
      const sp = hitLerp(0.7, 1.15, vn)
      for (let i = 0; i < emit; i++) {
        if (this.particles.length > HIT_CAP) this.particles.shift()
        const spread = spec.spread ?? 0
        const angle = ((-90 + (this.rand() * 2 - 1) * spread) * Math.PI) / 180
        const speed = spec.speed ? hitLerp(spec.speed[0], spec.speed[1], this.rand()) * sp : 0
        const lifeRoll = hitLerp(spec.life[0], spec.life[1], this.rand()) * this.life
        const life = this.reduced ? Math.min(lifeRoll * 0.5, 0.4) : lifeRoll
        const particle: HitParticle = {
          fx,
          hand: note.hand,
          x: note.x + (this.rand() - 0.5) * note.keyWidth * 0.5,
          y: note.y,
          vx: this.reduced ? 0 : Math.cos(angle) * speed,
          vy: this.reduced ? 0 : Math.sin(angle) * speed,
          age: 0,
          life,
          size: hitLerp(spec.size[0], spec.size[1], this.rand()) * sz,
          rot: this.rand() * TAU,
          spin: (this.rand() * 2 - 1) * hitLerp(2, 6, this.rand()),
          ph: this.rand() * TAU,
          seed: this.rand() * 100,
          petals: note.hand === 'rh' ? 6 : 5,
          vn,
          ripple: fx === 'rain' && i === 0,
          originY: note.y,
          born: this.serial++,
        }
        if (fx === 'sparkle') {
          particle.x = note.x + (this.rand() - 0.5) * note.keyWidth * 2.2
          particle.y = note.y - hitLerp(8, 70, this.rand()) * sz
        }
        if (fx === 'rain') {
          const rainAngle = (hitLerp(-160, -20, this.rand()) * Math.PI) / 180
          particle.vx = this.reduced ? 0 : Math.cos(rainAngle) * speed
          particle.vy = this.reduced ? 0 : Math.sin(rainAngle) * speed
        }
        this.particles.push(particle)
      }
    }
  }

  step(dt: number): void {
    if (dt <= 0) return
    const stepDt = Math.min(dt, 0.05)
    const reduced = this.reduced
    for (const q of this.particles) {
      q.age += stepDt
      if (reduced || q.age >= q.life) continue
      const spec = HIT_PARAMS[q.fx]
      q.vy += (spec.grav ?? 0) * stepDt
      const drag = Math.exp(-(spec.drag ?? 0) * stepDt)
      q.vx *= drag
      q.vy *= drag
      if (q.fx === 'embers') q.vx += hitNoise(q.seed + q.age * 0.8) * 30 * stepDt
      if (q.fx === 'mist') q.vx += hitNoise(q.seed + q.age * 0.5) * 8 * stepDt
      q.x += q.vx * stepDt
      q.y += q.vy * stepDt
      q.rot += q.spin * stepDt
    }
    if (this.particles.some((q) => q.age >= q.life)) {
      this.particles = this.particles.filter((q) => q.age < q.life)
    }
  }
}
