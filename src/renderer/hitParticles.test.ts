import { describe, expect, it, vi } from 'vitest'
import { hitComposite, opalIndex, paintHitCanvas } from './hitParticleCanvas'
import {
  HIT_CAP,
  HitField,
  type HitNote,
  type HitPalette,
  type HitParticle,
  particlesPerNote,
} from './hitParticles'
import { displayParticle, PARTICLE_STYLES, pickerStyles } from './particleStyles'

const note: HitNote = { x: 100, y: 480, keyWidth: 24, velocity: 1, hand: 'rh' }

describe('hit particle spawn', () => {
  it('scales one full-velocity spark to 14 and a triad to 8 each', () => {
    expect(particlesPerNote('sparks', 1, 1, 1, false)).toBe(14)
    expect(particlesPerNote('sparks', 1, 3, 1, false)).toBe(8)
    expect(particlesPerNote('sparks', 0, 1, 1, false)).toBe(5)
    const field = new HitField()
    field.spawn('sparks', [note, note, note])
    expect(field.particles).toHaveLength(24)
    expect(24 / 14).toBeCloseTo(1.71, 2)
  })

  it('drops the oldest particle once the field passes 700', () => {
    const field = new HitField()
    for (let i = 0; i < 60; i++) field.spawn('sparks', [note])
    const spawned = 60 * 14
    expect(field.particles).toHaveLength(HIT_CAP + 1)
    expect(field.particles[0]?.born).toBe(spawned - (HIT_CAP + 1))
    expect(field.particles.at(-1)?.born).toBe(spawned - 1)
  })

  it('keeps reduced motion still, short, and capped at 3', () => {
    const field = new HitField()
    field.reduced = true
    field.spawn('sparks', [note, note])
    expect(field.particles).toHaveLength(6)
    const first = field.particles[0]!
    const x = first.x
    expect(first.vx).toBe(0)
    expect(first.vy).toBe(0)
    expect(first.life).toBeLessThanOrEqual(0.4)
    field.step(0.05)
    expect(field.particles[0]?.x).toBe(x)
    expect(field.particles[0]?.y).toBe(first.y)
  })

  it('applies spark gravity and drag, and clamps a long frame to 50ms', () => {
    const field = new HitField()
    field.spawn('sparks', [note])
    const q = field.particles[0]!
    q.vx = 10
    q.vy = -100
    q.x = 50
    q.y = 80
    q.age = 0
    const dt = 0.016
    field.step(dt)
    const drag = Math.exp(-2.2 * dt)
    const vx = 10 * drag
    const vy = (-100 + 900 * dt) * drag
    expect(q.vx).toBeCloseTo(vx)
    expect(q.vy).toBeCloseTo(vy)
    expect(q.x).toBeCloseTo(50 + vx * dt)
    expect(q.y).toBeCloseTo(80 + vy * dt)
    q.age = 0
    field.step(1)
    expect(q.age).toBeCloseTo(0.05)
  })

  it('replays a fresh field and emits nothing for Off', () => {
    const take = () => {
      const field = new HitField()
      field.spawn('sparkle', [{ ...note, velocity: 0.8 }])
      field.step(0.05)
      return field.particles.map((particle) => [
        particle.x,
        particle.y,
        particle.life,
        particle.size,
      ])
    }
    expect(take()).toEqual(take())
    const off = new HitField()
    off.spawn('off', [note])
    expect(off.particles).toHaveLength(0)
  })

  it('shows Rain and Mist only in Rainy Study and remembers them as Sparkle elsewhere', () => {
    expect(displayParticle('rain', 'after-hours')).toBe('sparkle')
    expect(displayParticle('mist', 'after-hours')).toBe('sparkle')
    expect(displayParticle('rain', 'night')).toBe('sparkle')
    expect(displayParticle('mist', 'night')).toBe('sparkle')
    expect(displayParticle('rain', 'golden-hour')).toBe('sparkle')
    expect(displayParticle('mist', 'golden-hour')).toBe('sparkle')
    expect(displayParticle('rain', 'rainy-study')).toBe('rain')
    expect(displayParticle('sparkle', 'golden-hour')).toBe('sparkle')
    expect(pickerStyles('golden-hour').map((style) => style.id)).toEqual([
      'none',
      'sparks',
      'embers',
      'bloom',
      'sparkle',
      'pearl',
      'liquid',
    ])
    expect(pickerStyles('rainy-study').map((style) => style.id)).toContain('rain')
    expect(pickerStyles('rainy-study').map((style) => style.id)).toContain('mist')
    expect(PARTICLE_STYLES.map((style) => style.id)).toContain('sparkle')
  })
})

describe('hit particle drawing', () => {
  it('uses source-over on Golden Hour, lighter at 72% on Rainy, and screen for Mist', () => {
    expect(hitComposite('golden', 'lighter')).toEqual({ operation: 'source-over', calm: 1 })
    expect(hitComposite('rainy', 'lighter')).toEqual({ operation: 'lighter', calm: 0.72 })
    expect(hitComposite('rainy', 'screen')).toEqual({ operation: 'screen', calm: 1 })
    expect(hitComposite('golden', 'source-over')).toEqual({ operation: 'source-over', calm: 1 })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const ops: string[] = []
    const ctx = fakeCtx(ops)
    paintHitCanvas(ctx, [particle('sparks')], palette('golden'), 320, 240, 1, 1, false)
    expect(ops).toContain('source-over')
    expect(ops).not.toContain('lighter')
    ops.length = 0
    paintHitCanvas(ctx, [particle('sparks')], palette('rainy'), 320, 240, 1, 1, false)
    expect(ops).toContain('lighter')
    ops.length = 0
    paintHitCanvas(ctx, [particle('mist')], palette('rainy'), 320, 240, 1, 1, false)
    expect(ops).toContain('screen')
  })

  it('picks an opal token from the sine drift', () => {
    expect(opalIndex(0, Math.PI / 2)).toBeGreaterThanOrEqual(0)
    expect(opalIndex(0, Math.PI / 2)).toBeLessThanOrEqual(4)
    expect(opalIndex(0, -Math.PI / 2)).toBe(0)
  })
})

function palette(scene: 'golden' | 'rainy'): HitPalette {
  const rgb = { r: 10, g: 20, b: 30 }
  return {
    scene,
    rh: rgb,
    rhEdge: rgb,
    lh: rgb,
    lhEdge: rgb,
    hot: rgb,
    glint: rgb,
    rain: rgb,
    mist: rgb,
    glassRim: rgb,
    opal: [rgb, rgb, rgb, rgb, rgb],
  }
}

function particle(fx: HitParticle['fx']): HitParticle {
  return {
    fx,
    hand: 'rh',
    x: 40,
    y: 80,
    vx: 12,
    vy: -40,
    age: 0.1,
    life: 1,
    size: 4,
    rot: 0.4,
    spin: 1,
    ph: 0.2,
    seed: 3,
    petals: 6,
    vn: 1,
    ripple: true,
    originY: 200,
    born: 0,
  }
}

function fakeCtx(ops: string[]): CanvasRenderingContext2D {
  const ctx = {
    ellipse() {},
    drawImage() {},
    setTransform() {},
    clearRect() {},
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    stroke() {},
    fill() {},
    arc() {},
    translate() {},
    rotate() {},
    scale() {},
  }
  Object.defineProperty(ctx, 'globalCompositeOperation', {
    set(value: string) {
      ops.push(value)
    },
    get() {
      return 'source-over'
    },
  })
  return ctx as unknown as CanvasRenderingContext2D
}
