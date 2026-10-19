// Canvas2D plant shadows, ported from the Golden Hour demo
// (site/index.html). Draws only the shadow buffer and the sun-spot glow.
// The app keeps its own backdrop, notes, and keyboard.

import {
  buildLeaves,
  fbm,
  hash,
  type LeafKind,
  leafPose,
  makeRng,
  noise,
  PLANT_PARKED_TIME,
  type PlantLeaf,
  type PlantShadowBudget,
  type PlantShadowId,
} from './plantShadows'

const LEAVES: readonly LeafKind[] = ['monstera', 'fern', 'fiddle', 'olive']
const BLUR = [0.8, 3.2, 7.5]
const LAYER_ALPHA = [1, 0.82, 0.62]
const DOWN = [1, 0.5, 0.25]

const SHADOW = [118, 62, 28] as const
const SHADOW_A = 0.4
const FRINGE = [255, 140, 60] as const
const FRINGE_A = 0.22
const LEAK = [255, 228, 170] as const

interface Spot {
  x: number
  y: number
  rad: number
  s: number
}

function rgba(rgb: readonly [number, number, number], a: number): string {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, w)
  canvas.height = Math.max(1, h)
  return canvas
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  return ctx
}

export class PlantShadowField {
  readonly shadow: HTMLCanvasElement
  readonly glow: HTMLCanvasElement

  private sprites: Partial<Record<LeafKind, HTMLImageElement>> = {}
  private spritesReady = false
  private readonly onReady: () => void
  private budget: PlantShadowBudget = { scale: 0.5, density: 1 }
  private plant: Exclude<PlantShadowId, 'off'> = 'fern'
  private reduced = false
  private cssW = 0
  private cssH = 0
  private leaves: PlantLeaf[] = []
  private spots: Spot[] = []
  private leavesDirty = true
  private layers: HTMLCanvasElement[] = []
  private small: HTMLCanvasElement[] = []
  private fringe: HTMLCanvasElement[] = []
  private gustAt = 6
  private gustSeed = 0
  private origin = -1

  constructor(onReady: () => void) {
    this.onReady = onReady
    this.shadow = makeCanvas(1, 1)
    this.glow = makeCanvas(1, 1)
    this.loadSprites()
  }

  get ready(): boolean {
    return this.spritesReady
  }

  setPlant(id: Exclude<PlantShadowId, 'off'>): void {
    if (this.plant === id) return
    this.plant = id
    this.leavesDirty = true
    this.gustAt = 6
    this.gustSeed = 0
  }

  setBudget(budget: PlantShadowBudget): void {
    if (budget.scale === this.budget.scale && budget.density === this.budget.density) return
    this.budget = budget
    this.leavesDirty = true
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced
  }

  // Returns true when the shadow buffer's pixel size changed (the texture
  // source has to be resized before the next upload).
  resize(cssW: number, cssH: number): boolean {
    const sw = Math.max(1, Math.round(cssW * this.budget.scale))
    const sh = Math.max(1, Math.round(cssH * this.budget.scale))
    const sizeChanged =
      this.cssW !== cssW ||
      this.cssH !== cssH ||
      this.shadow.width !== sw ||
      this.shadow.height !== sh
    this.cssW = cssW
    this.cssH = cssH
    if (sizeChanged) this.alloc(sw, sh)
    if (sizeChanged || this.leavesDirty) {
      this.rebuildLeaves()
      this.leavesDirty = false
    }
    return sizeChanged
  }

  // `frozen` holds the parked pose (export frames). Reduced motion does too.
  paint(timeMs: number, frozen = false): void {
    if (this.cssW < 2 || this.cssH < 2) return
    const hold = frozen || this.reduced
    const t = hold ? PLANT_PARKED_TIME : this.clock(timeMs)
    this.drawLeaves(t, hold)
    this.composeShadow(t, hold)
    this.drawGlow(t, hold)
  }

  private clock(timeMs: number): number {
    if (this.reduced) return PLANT_PARKED_TIME
    if (this.origin < 0) this.origin = timeMs
    const t = Math.max(0, (timeMs - this.origin) / 1000)
    if (t > this.gustAt + 7) this.gustAt = t + 6 + hash(++this.gustSeed) * 10
    return t
  }

  private loadSprites(): void {
    let left = LEAVES.length
    const done = (): void => {
      left -= 1
      if (left > 0) return
      this.spritesReady = true
      this.onReady()
    }
    for (const name of LEAVES) {
      const img = new Image()
      img.onload = () => {
        this.sprites[name] = img
        done()
      }
      img.onerror = () => done()
      img.src = `/scenes/leaves/${name}.png`
    }
  }

  private alloc(sw: number, sh: number): void {
    this.shadow.width = sw
    this.shadow.height = sh
    this.glow.width = sw
    this.glow.height = sh
    this.layers = DOWN.map(() => makeCanvas(sw, sh))
    this.small = DOWN.map((factor) =>
      makeCanvas(Math.max(1, Math.round(sw * factor)), Math.max(1, Math.round(sh * factor))),
    )
    this.fringe = DOWN.map((factor) =>
      makeCanvas(Math.max(1, Math.round(sw * factor)), Math.max(1, Math.round(sh * factor))),
    )
  }

  private rebuildLeaves(): void {
    this.leaves = buildLeaves({
      plant: this.plant,
      width: this.cssW,
      wall: this.cssH,
      density: this.budget.density,
    })
    const random = makeRng(11 + 9)
    const lerp = (a: number, b: number, u: number): number => a + (b - a) * u
    this.spots = []
    for (let i = 0; i < 14; i++) {
      this.spots.push({
        x: lerp(0.05, 0.62, random()),
        y: lerp(0.08, 0.85, random()),
        rad: lerp(14, 46, random()),
        s: random() * 50,
      })
    }
  }

  private drawLeaves(t: number, hold: boolean): void {
    const scale = this.budget.scale
    for (const layer of this.layers) {
      const ctx = context(layer)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, layer.width, layer.height)
    }
    if (!this.spritesReady) return
    const sway = hold ? 0 : 1
    for (const leaf of this.leaves) {
      const img = this.sprites[leaf.kind]
      const layer = this.layers[leaf.layer]
      if (!img || !layer) continue
      const ctx = context(layer)
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      const pose = leafPose(leaf, t, sway, this.gustAt, this.cssW)
      const x = leaf.px + pose.dx
      const y = leaf.py + pose.dy
      if (leaf.stem) {
        ctx.strokeStyle = '#000'
        ctx.lineWidth = 3 + (6 - 3) * leaf.z
        ctx.beginPath()
        ctx.moveTo(leaf.bx, leaf.by)
        ctx.quadraticCurveTo(
          leaf.bx + (x - leaf.bx) * 0.4 + pose.dx * 0.3,
          leaf.by + (y - leaf.by) * 0.75,
          x,
          y,
        )
        ctx.stroke()
      }
      const h = leaf.len
      const w = h * (img.width / img.height)
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(pose.ang + Math.PI / 2)
      ctx.scale(leaf.flip * pose.flutter, 1 / Math.sqrt(Math.max(0.2, pose.flutter)))
      ctx.drawImage(img, -w / 2, -h, w, h)
      ctx.restore()
    }
    const far = this.layers[2]
    if (!far) return
    const ctx = context(far)
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.fillStyle = 'rgba(0,0,0,.55)'
    ctx.save()
    ctx.translate(this.cssW * 0.7, 0)
    ctx.transform(1, 0, 0.18, 1, 0, 0)
    const mullions = [
      { x: 0.38, w: 0.012 },
      { x: 0, w: 0.02 },
    ]
    for (const mullion of mullions) {
      ctx.fillRect(mullion.x * this.cssW - this.cssW * 0.7, 0, mullion.w * this.cssW, this.cssH)
    }
    ctx.fillRect(-this.cssW * 0.7, this.cssH * 0.46, this.cssW * 0.62, this.cssH * 0.016)
    ctx.restore()
  }

  private composeShadow(t: number, hold: boolean): void {
    const scale = this.budget.scale
    const shadow = this.shadow
    const ctx = context(shadow)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.filter = 'none'
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, shadow.width, shadow.height)
    for (let i = 2; i >= 0; i--) {
      const layer = this.layers[i]
      const sm = this.small[i]
      const fr = this.fringe[i]
      if (!layer || !sm || !fr) continue
      const factor = DOWN[i] ?? 1
      const blur = (BLUR[i] ?? 1) * scale * 2 * factor
      const smc = context(sm)
      smc.setTransform(1, 0, 0, 1, 0, 0)
      smc.globalCompositeOperation = 'source-over'
      smc.globalAlpha = 1
      smc.clearRect(0, 0, sm.width, sm.height)
      smc.filter = `blur(${blur.toFixed(2)}px)`
      smc.drawImage(layer, 0, 0, sm.width, sm.height)
      smc.filter = 'none'
      ctx.globalCompositeOperation = 'multiply'
      if (i < 2) {
        const frc = context(fr)
        frc.setTransform(1, 0, 0, 1, 0, 0)
        frc.globalCompositeOperation = 'source-over'
        frc.clearRect(0, 0, fr.width, fr.height)
        frc.drawImage(sm, 0, 0)
        frc.globalCompositeOperation = 'source-in'
        frc.fillStyle = rgba(FRINGE, FRINGE_A * (LAYER_ALPHA[i] ?? 1))
        frc.fillRect(0, 0, fr.width, fr.height)
        const off = (1 + i) * scale * 2
        ctx.drawImage(fr, off, off * 0.6, shadow.width, shadow.height)
      }
      smc.globalCompositeOperation = 'source-in'
      smc.fillStyle = rgba(SHADOW, SHADOW_A * (LAYER_ALPHA[i] ?? 1))
      smc.fillRect(0, 0, sm.width, sm.height)
      ctx.drawImage(sm, 0, 0, shadow.width, shadow.height)
    }
    const drift = hold ? 0 : 1
    ctx.globalCompositeOperation = 'screen'
    for (const spot of this.spots) {
      const x = (spot.x + 0.012 * drift * fbm(t * 0.07 + spot.s)) * this.cssW * scale
      const y = (spot.y + 0.015 * drift * fbm(t * 0.06 + spot.s + 3)) * this.cssH * scale
      const rad = spot.rad * scale * (1 + 0.15 * drift * noise(t * 0.5 + spot.s))
      const alpha = 0.55 + 0.25 * drift * noise(t * 0.9 + spot.s)
      const wash = ctx.createRadialGradient(x, y, 0, x, y, rad)
      wash.addColorStop(0, rgba(LEAK, alpha))
      wash.addColorStop(1, rgba(LEAK, 0))
      ctx.fillStyle = wash
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2)
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    const fade = ctx.createLinearGradient(0, shadow.height * 0.86, 0, shadow.height)
    fade.addColorStop(0, 'rgba(255,255,255,0)')
    fade.addColorStop(1, 'rgba(255,255,255,1)')
    ctx.fillStyle = fade
    ctx.fillRect(0, 0, shadow.width, shadow.height)
  }

  private drawGlow(t: number, hold: boolean): void {
    const scale = this.budget.scale
    const ctx = context(this.glow)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, this.glow.width, this.glow.height)
    const drift = hold ? 0 : 1
    for (const spot of this.spots.slice(0, 6)) {
      const x = (spot.x + 0.012 * drift * fbm(t * 0.07 + spot.s)) * this.cssW * scale
      const y = (spot.y + 0.015 * drift * fbm(t * 0.06 + spot.s + 3)) * this.cssH * scale
      const rad = spot.rad * 2.2 * scale
      const wash = ctx.createRadialGradient(x, y, 0, x, y, rad)
      wash.addColorStop(0, 'rgba(255,236,190,.35)')
      wash.addColorStop(1, 'rgba(255,236,190,0)')
      ctx.fillStyle = wash
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2)
    }
  }
}
