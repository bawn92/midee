import { type Sprite, Texture } from 'pixi.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MATERIAL_CHOREOGRAPHY } from './materialParticles'
import { type ParticleStyle, ParticleSystem } from './ParticleSystem'
import { ALL_PARTICLE_STYLES } from './particleStyles'

// Exercise the actual particle lifecycle and motion without a GPU. Drawing
// and texture upload are covered by the browser theme/playback tests.
vi.mock('pixi.js', () => {
  class Point {
    x = 0
    y = 0
    set(x: number, y = x) {
      this.x = x
      this.y = y
    }
  }
  class MockSprite {
    anchor = new Point()
    position = new Point()
    scale = new Point()
    visible = false
    alpha = 1
    tint = 0xffffff
    rotation = 0
    constructor(public texture: unknown) {}
  }
  return {
    Container: class {
      children: MockSprite[] = []
      addChild(sprite: MockSprite) {
        this.children.push(sprite)
      }
      destroy() {
        this.children = []
      }
    },
    Sprite: MockSprite,
    Texture: { from: vi.fn(() => ({ destroy: vi.fn() })) },
  }
})

beforeEach(() => {
  vi.mocked(Texture.from).mockClear()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    bezierCurveTo() {},
    arc() {},
  } as unknown as ReturnType<HTMLCanvasElement['getContext']>)
})
afterEach(() => vi.restoreAllMocks())

function snapshot(system: ParticleSystem) {
  return (system.container.children as Sprite[])
    .filter((sprite) => sprite.visible)
    .map((sprite) => ({
      x: sprite.position.x,
      y: sprite.position.y,
      alpha: sprite.alpha,
      rotation: sprite.rotation,
      scaleX: sprite.scale.x,
      scaleY: sprite.scale.y,
      tint: sprite.tint,
    }))
    .sort((a, b) => a.x - b.x || a.y - b.y)
}

function glass() {
  const system = new ParticleSystem()
  system.setStyle('glass')
  return system
}

describe('glass glints', () => {
  it('samples the same motion at 30, 60 and 120 fps', () => {
    const samples = [30, 60, 120].map((fps) => {
      const system = glass()
      system.burst(200, 400, 0x91cddd)
      for (let i = 0; i < fps / 2; i++) system.update(1 / fps)
      const result = snapshot(system)
      system.destroy()
      return result
    })
    expect(samples[0]).toHaveLength(26)
    for (const other of samples.slice(1)) {
      for (let i = 0; i < other.length; i++) {
        for (const key of ['x', 'y', 'alpha', 'rotation', 'scaleX', 'scaleY', 'tint'] as const) {
          expect(other[i]![key]).toBeCloseTo(samples[0]![i]![key], 10)
        }
      }
    }
  })

  it('does not advance during zero-delta preview / static repaints', () => {
    const system = glass()
    system.burst(200, 400, 0x91cddd)
    system.update(0.2)
    const before = snapshot(system)
    for (let i = 0; i < 10; i++) system.update(0)
    expect(snapshot(system)).toEqual(before)
    system.destroy()
  })

  it('restarts the same glint sequence for a fresh export', () => {
    const system = glass()
    const take = () => {
      system.burst(200, 400, 0x91cddd)
      system.update(0.2)
      return snapshot(system)
    }
    const first = take()
    system.clear()
    expect(take()).toEqual(first)
    system.destroy()
  })

  it('bounds dense-chord debris and returns expired particles to the pool', () => {
    const system = glass()
    for (let i = 0; i < 100; i++) system.burst(i * 10, 400, 0x91cddd)
    expect(snapshot(system)).toHaveLength(448)
    system.update(2)
    expect(system.hasActive).toBe(false)
    expect(snapshot(system)).toHaveLength(0)
    system.burst(200, 400, 0x91cddd)
    expect(snapshot(system)).toHaveLength(26)
    system.destroy()
  })

  it('clears glass sprites when changing style and respects Off', () => {
    const system = glass()
    system.burst(200, 400, 0x91cddd)
    system.setStyle('sparks')
    expect(system.hasActive).toBe(false)
    system.burst(200, 400, 0x91cddd)
    expect(system.hitCount()).toBe(14)
    expect(snapshot(system)).toHaveLength(0)
    system.setStyle('none')
    system.burst(200, 400, 0x91cddd)
    expect(snapshot(system)).toHaveLength(0)
    system.destroy()
  })
})

const materialCases = [
  { style: 'silk', onset: 33, sustain: 4, cap: 448 },
  { style: 'gold', onset: 24, sustain: 3, cap: 480 },
] as const

function material(style: ParticleStyle) {
  const system = new ParticleSystem()
  system.setStyle(style)
  return system
}

describe.each(materialCases)('$style material particles', ({ style, onset, sustain, cap }) => {
  it('samples the same choreography at 30, 60 and 120 fps', () => {
    const samples = [30, 60, 120].map((fps) => {
      const system = material(style)
      system.burst(200, 400, 0x91cddd)
      for (let frame = 0; frame < fps / 2; frame++) system.update(1 / fps)
      const result = snapshot(system)
      system.destroy()
      return result
    })
    expect(samples[0]).toHaveLength(onset)
    for (const other of samples.slice(1)) {
      expect(other).toHaveLength(onset)
      for (let i = 0; i < other.length; i++) {
        for (const key of ['x', 'y', 'alpha', 'rotation', 'scaleX', 'scaleY', 'tint'] as const) {
          expect(other[i]![key]).toBeCloseTo(samples[0]![i]![key], 10)
        }
      }
    }
  })

  it('has prompt first-frame light and reaches clearly beyond a key at midlife', () => {
    const system = material(style)
    system.burst(200, 400, 0x91cddd, 20)
    system.update(1 / 60)
    expect(Math.max(...snapshot(system).map((p) => p.alpha))).toBeGreaterThan(0.15)
    system.update(0.5 - 1 / 60)
    // The main forms rise several key widths, rather than hovering as tiny
    // nearly invisible debris at the strike line.
    expect(Math.min(...snapshot(system).map((p) => p.y))).toBeLessThan(360)
    system.destroy()
  })

  it('has no simulation changes on preview repaints and replays a seeded take', () => {
    const system = material(style)
    const take = () => {
      system.burst(200, 400, 0x91cddd)
      system.update(0.2)
      system.sustainBurst(200, 400, 0x91cddd)
      system.update(0.15)
      return snapshot(system)
    }
    const first = take()
    for (let i = 0; i < 10; i++) system.update(0)
    expect(snapshot(system)).toEqual(first)
    system.clear()
    expect(take()).toEqual(first)
    system.destroy()
  })

  it('keeps contact effects exclusive to onsets and recycles the bounded pool after dense chords', () => {
    const system = material(style)
    system.sustainBurst(200, 400, 0x91cddd)
    system.update(0.2)
    expect(snapshot(system)).toHaveLength(sustain)
    // Held notes shed fine material, without stacking broad impact lights.
    expect(MATERIAL_CHOREOGRAPHY[style].sustain).not.toContain('contact')
    for (let i = 0; i < 100; i++) system.burst(i * 10, 400, 0x91cddd)
    expect(snapshot(system)).toHaveLength(cap)
    system.update(3)
    expect(system.hasActive).toBe(false)
    expect(snapshot(system)).toHaveLength(0)
    system.burst(200, 400, 0x91cddd)
    expect(snapshot(system)).toHaveLength(onset)
    system.destroy()
    expect(system.hasActive).toBe(false)
  })

  it('switches cleanly to legacy particles and Off, including explicit count overrides', () => {
    const system = material(style)
    system.burst(200, 400, 0x91cddd)
    system.setStyle('sparks')
    expect(system.hasActive).toBe(false)
    system.burst(200, 400, 0x91cddd)
    expect(system.hitCount()).toBe(14)
    expect(snapshot(system)).toHaveLength(0)
    system.setStyle('none')
    system.burst(200, 400, 0x91cddd, 20, 5)
    system.sustainBurst(200, 400, 0x91cddd)
    expect(snapshot(system)).toHaveLength(0)
    system.destroy()
  })
})

describe('material particle resources and composition', () => {
  it('appends new choices without changing saved legacy indices', () => {
    expect(ALL_PARTICLE_STYLES.map(({ id }) => id)).toEqual([
      'sparks',
      'embers',
      'bloom',
      'sparkle',
      'none',
      'glass',
      'silk',
      'gold',
      'pearl',
      'liquid',
      'mist',
      'rain',
    ])
  })

  it('builds only selected styles, reuses one hit layer and disposes every cached source', () => {
    const system = new ParticleSystem()
    expect(Texture.from).toHaveBeenCalledTimes(1)
    system.setStyle('embers')
    // Radial texture plus one shared hit canvas. No per-effect Pixi textures.
    expect(Texture.from).toHaveBeenCalledTimes(2)
    for (const style of [
      'pearl',
      'liquid',
      'mist',
      'rain',
      'sparkle',
      'bloom',
      'sparks',
    ] as const) {
      system.setStyle(style)
      system.burst(200, 400, 0x91cddd)
      system.update(0.1)
    }
    expect(Texture.from).toHaveBeenCalledTimes(2)
    system.setStyle('silk')
    expect(Texture.from).toHaveBeenCalledTimes(5)
    system.setStyle('gold')
    expect(Texture.from).toHaveBeenCalledTimes(8)
    system.setStyle('glass')
    expect(Texture.from).toHaveBeenCalledTimes(13)
    system.setStyle('none')
    const textures = vi.mocked(Texture.from).mock.results.map(({ value }) => value as Texture)
    system.destroy()
    for (const texture of textures) {
      expect(texture.destroy).toHaveBeenCalledExactlyOnceWith(true)
    }
  })

  it('never creates textures in sustained frame updates or repeated bursts', () => {
    const system = material('silk')
    expect(Texture.from).toHaveBeenCalledTimes(4)
    for (let frame = 0; frame < 240; frame++) {
      if (frame % 20 === 0) system.burst(200, 400, 0x91cddd)
      if (frame % 7 === 0) system.sustainBurst(200, 400, 0x91cddd)
      system.update(1 / 60)
    }
    system.clear()
    system.burst(200, 400, 0x91cddd)
    expect(Texture.from).toHaveBeenCalledTimes(4)
    system.destroy()
  })

  it('uses fine silk shapes instead of beads, halos, or broad ribbons', () => {
    const recipe = MATERIAL_CHOREOGRAPHY.silk
    expect(recipe.onset.length).toBeGreaterThanOrEqual(30)
    expect(recipe.onset.filter((kind) => kind === 'contact')).toHaveLength(1)
    for (const kind of [...recipe.onset, ...recipe.sustain]) {
      expect(['contact', 'fiber', 'pollen']).toContain(kind)
    }
  })

  it('groups a same-frame chord under the square-root divisor and pauses while hidden', () => {
    const system = new ParticleSystem()
    system.setStyle('sparks')
    const note = { x: 120, y: 400, keyWidth: 22, velocity: 1, hand: 'rh' as const }
    system.queueHits([note, note, note])
    expect(system.hitCount()).toBe(0)
    system.update(1 / 60)
    expect(system.hitCount()).toBe(24)
    system.clear()
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    try {
      system.queueHits([note])
      system.update(1 / 60)
      expect(system.hitCount()).toBe(0)
    } finally {
      Reflect.deleteProperty(document, 'hidden')
    }
    system.update(1 / 60)
    expect(system.hitCount()).toBe(14)
    for (let frame = 0; frame < 20; frame++) system.update(0.05)
    expect(system.hitCount()).toBe(0)
    system.destroy()
  })

  it('keeps lacquer particles warm gold even when the struck note is red', () => {
    const system = material('gold')
    system.burst(200, 400, 0x9d4256)
    for (const { tint } of snapshot(system)) {
      expect((tint >> 16) & 255).toBeGreaterThan((tint >> 8) & 255)
      expect((tint >> 8) & 255).toBeGreaterThan(tint & 255)
    }
    system.destroy()
  })
})
