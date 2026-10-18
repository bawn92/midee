// Canvas2D draw of a hit burst. Glow sprites are pre-rendered once per palette
// so a frame never builds a filter or a gradient per particle.

import { readCssColor } from './cssColor'
import {
  HIT_PARAMS,
  type HitFx,
  type HitPalette,
  type HitParticle,
  hitHash,
  hitLerp,
  hitNoise,
  type Rgb,
} from './hitParticles'

const TAU = Math.PI * 2
const WHITE: Rgb = { r: 255, g: 255, b: 255 }

export function hitComposite(
  scene: HitPalette['scene'],
  blend: 'lighter' | 'source-over' | 'screen',
): { operation: 'source-over' | 'lighter' | 'screen'; calm: number } {
  const warm = scene === 'golden'
  return {
    operation: warm && blend === 'lighter' ? 'source-over' : blend,
    calm: !warm && blend === 'lighter' ? 0.72 : 1,
  }
}

/** Pixi blend for the shared layer. Compositing against the scene lives here. */
export function hitLayerBlend(scene: HitPalette['scene'], fx: HitFx): 'normal' | 'add' | 'screen' {
  if (fx === 'off') return 'normal'
  const blend = HIT_PARAMS[fx].blend
  if (blend === 'screen') return 'screen'
  if (blend === 'lighter' && scene === 'rainy') return 'add'
  return 'normal'
}

export function opalIndex(rot: number, ph: number): number {
  const t = (Math.sin(rot * 0.5 + ph) + 1) / 2
  return Math.min(4, Math.floor(t * 5))
}

const GOLDEN: HitPalette = {
  scene: 'golden',
  rh: hex('e6a94f'),
  rhEdge: hex('c98a32'),
  lh: hex('d9908f'),
  lhEdge: hex('b8706f'),
  hot: hex('fff3d6'),
  glint: hex('ffd9a0'),
  rain: hex('e9f1f6'),
  mist: hex('fff8ee'),
  glassRim: hex('7a4e2c'),
  opal: [hex('f6c2da'), hex('d9c9f5'), hex('c4e3f7'), hex('c6eedd'), hex('fbd8be')],
}

const RAINY: HitPalette = {
  scene: 'rainy',
  rh: hex('7ba3b0'),
  rhEdge: hex('5d8490'),
  lh: hex('c4897a'),
  lhEdge: hex('a56d60'),
  hot: hex('eaf6ff'),
  glint: hex('ffd9a0'),
  rain: hex('ddeffa'),
  mist: hex('e4eef6'),
  glassRim: hex('ffffff'),
  opal: GOLDEN.opal,
}

export function readHitPalette(scene: HitPalette['scene']): HitPalette {
  const fallback = scene === 'rainy' ? RAINY : GOLDEN
  return {
    scene,
    rh: readRgb('--note-rh', fallback.rh),
    rhEdge: readRgb('--note-rh-edge', fallback.rhEdge),
    lh: readRgb('--note-lh', fallback.lh),
    lhEdge: readRgb('--note-lh-edge', fallback.lhEdge),
    hot: readRgb('--particle-hot', fallback.hot),
    glint: readRgb('--particle-glint', fallback.glint),
    rain: readRgb('--particle-rain', fallback.rain),
    mist: readRgb('--particle-mist', fallback.mist),
    glassRim: readRgb('--particle-glass-rim', fallback.glassRim),
    opal: [
      readRgb('--particle-opal-1', fallback.opal[0]),
      readRgb('--particle-opal-2', fallback.opal[1]),
      readRgb('--particle-opal-3', fallback.opal[2]),
      readRgb('--particle-opal-4', fallback.opal[3]),
      readRgb('--particle-opal-5', fallback.opal[4]),
    ],
  }
}

interface Glows {
  rh: HTMLCanvasElement
  lh: HTMLCanvasElement
  rhSoft: HTMLCanvasElement
  lhSoft: HTMLCanvasElement
  hot: HTMLCanvasElement
  mist: HTMLCanvasElement
  mistL: HTMLCanvasElement
  lamp: HTMLCanvasElement
}

let glowKey = ''
let glowSet: Glows | null = null

export function paintHitCanvas(
  ctx: CanvasRenderingContext2D,
  particles: readonly HitParticle[],
  palette: HitPalette,
  width: number,
  height: number,
  dpr: number,
  sizeMul: number,
  reduced: boolean,
): void {
  if (width <= 0 || height <= 0) return
  if (typeof ctx.ellipse !== 'function' || typeof ctx.drawImage !== 'function') return
  const glows = glowsFor(palette)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.save()
  for (const q of particles) {
    const spec = HIT_PARAMS[q.fx]
    const u = q.life <= 0 ? 1 : q.age / q.life
    const hc = q.hand === 'rh' ? palette.rh : palette.lh
    const he = q.hand === 'rh' ? palette.rhEdge : palette.lhEdge
    const fade = reduced ? (u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8) : 1 - u
    const warm = palette.scene === 'golden'
    const composite = hitComposite(palette.scene, spec.blend)
    ctx.globalCompositeOperation = composite.operation
    ctx.globalAlpha = 1
    const calm = composite.calm
    switch (q.fx) {
      case 'sparks':
        paintSpark(ctx, q, glows, palette, hc, he, u, fade, calm, warm)
        break
      case 'embers':
        paintEmber(ctx, q, glows, spec.alpha, he, u, fade, calm, warm, reduced)
        break
      case 'bloom':
        paintBloom(ctx, q, glows, hc, he, palette, spec.alpha, u, fade, sizeMul, reduced)
        break
      case 'sparkle':
        paintSparkle(ctx, q, glows, hc, palette, u, fade, calm, warm, reduced)
        break
      case 'opal':
        paintOpal(ctx, q, glows, palette, he, spec.alpha, fade, warm)
        break
      case 'glass':
        paintGlass(ctx, q, glows, palette, he, fade, warm)
        break
      case 'rain':
        paintRain(ctx, q, palette, he, spec.alpha, u, fade)
        break
      case 'mist':
        paintMist(ctx, q, glows, spec, u, fade, sizeMul, reduced)
        break
      default:
        break
    }
  }
  ctx.restore()
}

function paintSpark(
  ctx: CanvasRenderingContext2D,
  q: HitParticle,
  glows: Glows,
  palette: HitPalette,
  hc: Rgb,
  he: Rgb,
  u: number,
  fade: number,
  calm: number,
  warm: boolean,
): void {
  const spec = HIT_PARAMS.sparks
  const color = warm
    ? mix(mix(hc, palette.hot, 0.35), he, Math.min(1, u * 1.4))
    : mix(palette.hot, hc, Math.min(1, u * 1.6))
  const length = Math.max(3, Math.hypot(q.vx, q.vy) * 0.035) * q.size * 0.6
  const ang = Math.atan2(q.vy, q.vx)
  ctx.strokeStyle = rgba(color, spec.alpha * fade)
  ctx.lineWidth = q.size
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(q.x, q.y)
  ctx.lineTo(q.x - Math.cos(ang) * length, q.y - Math.sin(ang) * length)
  ctx.stroke()
  ctx.globalAlpha = 0.5 * calm * fade
  const gsz = q.size * 7
  ctx.drawImage(glows[q.hand], q.x - gsz / 2, q.y - gsz / 2, gsz, gsz)
}

function paintEmber(
  ctx: CanvasRenderingContext2D,
  q: HitParticle,
  glows: Glows,
  alpha: number,
  he: Rgb,
  u: number,
  fade: number,
  calm: number,
  warm: boolean,
  reduced: boolean,
): void {
  const flicker = reduced ? 1 : 0.6 + 0.4 * (0.5 + 0.5 * hitNoise(q.seed + q.age * 8))
  const fadeIn = u < 0.08 ? u / 0.08 : 1
  ctx.globalAlpha = alpha * calm * fade * flicker * fadeIn
  const gsz = q.size * (5 - 2 * u)
  ctx.drawImage(glows[q.hand], q.x - gsz, q.y - gsz, gsz * 2, gsz * 2)
  if (warm) {
    ctx.fillStyle = rgba(he, 0.9)
    ctx.beginPath()
    ctx.arc(q.x, q.y, q.size * 0.42, 0, TAU)
    ctx.fill()
  }
}

function paintBloom(
  ctx: CanvasRenderingContext2D,
  q: HitParticle,
  glows: Glows,
  hc: Rgb,
  he: Rgb,
  palette: HitPalette,
  alpha: number,
  u: number,
  fade: number,
  sizeMul: number,
  reduced: boolean,
): void {
  const spec = HIT_PARAMS.bloom
  const grow = reduced ? 1 : easeOutBack(Math.min(1, u / 0.55))
  const radius = hitLerp(spec.size[0], spec.size[1], q.vn) * sizeMul * grow
  const a = alpha * fade
  ctx.globalAlpha = a * 0.6
  const soft = q.hand === 'rh' ? glows.rhSoft : glows.lhSoft
  ctx.drawImage(soft, q.x - radius * 1.8, q.y - radius * 1.8, radius * 3.6, radius * 3.6)
  ctx.fillStyle = rgba(hc, a * 0.7)
  for (let i = 0; i < q.petals; i++) {
    const an = -Math.PI / 2 + (i - (q.petals - 1) / 2) * (Math.PI / (q.petals - 1)) * 1.1
    ctx.save()
    ctx.translate(q.x, q.y)
    ctx.rotate(an + Math.PI / 2)
    ctx.beginPath()
    ctx.ellipse(
      0,
      -radius * 0.55,
      radius * (q.hand === 'rh' ? 0.28 : 0.2),
      radius * 0.55,
      0,
      0,
      TAU,
    )
    ctx.fill()
    ctx.strokeStyle = rgba(he, a * 0.55)
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
  }
  ctx.fillStyle = rgba(palette.hot, a * 0.9)
  ctx.beginPath()
  ctx.arc(q.x, q.y - 2, radius * 0.12, 0, TAU)
  ctx.fill()
}

function paintSparkle(
  ctx: CanvasRenderingContext2D,
  q: HitParticle,
  glows: Glows,
  hc: Rgb,
  palette: HitPalette,
  _u: number,
  fade: number,
  calm: number,
  warm: boolean,
  reduced: boolean,
): void {
  const twinkle = reduced
    ? 0.8
    : Math.abs(Math.sin(q.ph + q.age * hitLerp(2.5, 4, hitHash(q.seed)) * Math.PI))
  const radius = q.size * (0.4 + 0.6 * twinkle)
  ctx.globalAlpha = fade * (0.4 + 0.6 * twinkle) * calm
  const gsz = radius * 4.5
  ctx.drawImage(glows[q.hand], q.x - gsz / 2, q.y - gsz / 2, gsz, gsz)
  ctx.fillStyle = warm ? rgba(mix(hc, palette.hot, 0.2), 1) : 'rgba(255,250,240,1)'
  star(ctx, q.x, q.y, radius, q.rot * 0.1)
  if (warm) {
    ctx.fillStyle = rgba(palette.hot, 0.95)
    star(ctx, q.x, q.y, radius * 0.45, q.rot * 0.1)
  }
}

function paintOpal(
  ctx: CanvasRenderingContext2D,
  q: HitParticle,
  glows: Glows,
  palette: HitPalette,
  he: Rgb,
  alpha: number,
  fade: number,
  warm: boolean,
): void {
  const shimmer = Math.cos(q.rot)
  const flake = palette.opal[opalIndex(q.rot, q.ph)] ?? palette.opal[0]
  ctx.globalAlpha = alpha * fade
  ctx.save()
  ctx.translate(q.x, q.y)
  ctx.rotate(q.ph)
  ctx.scale(Math.max(0.15, Math.abs(shimmer)), 1)
  ctx.fillStyle = rgba(flake, 1)
  ctx.beginPath()
  ctx.moveTo(0, -q.size)
  ctx.lineTo(q.size * 0.7, 0)
  ctx.lineTo(0, q.size)
  ctx.lineTo(-q.size * 0.7, 0)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = warm ? rgba(he, 0.45) : `rgba(255,255,255,${0.5 + 0.5 * Math.abs(shimmer)})`
  ctx.lineWidth = 0.7
  ctx.stroke()
  ctx.restore()
  if (Math.abs(shimmer) > 0.92) {
    ctx.globalAlpha = fade * 0.8
    ctx.drawImage(glows.hot, q.x - q.size * 1.5, q.y - q.size * 1.5, q.size * 3, q.size * 3)
  }
}

function paintGlass(
  ctx: CanvasRenderingContext2D,
  q: HitParticle,
  glows: Glows,
  palette: HitPalette,
  he: Rgb,
  fade: number,
  warm: boolean,
): void {
  ctx.globalAlpha = fade
  ctx.fillStyle = warm ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.16)'
  ctx.strokeStyle = rgba(palette.glassRim, warm ? 0.5 : 0.75)
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.arc(q.x, q.y, q.size, 0, TAU)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = rgba(he, 0.35)
  ctx.beginPath()
  ctx.arc(q.x + q.size * 0.25, q.y + q.size * 0.3, q.size * 0.45, 0, TAU)
  ctx.fill()
  const glint = Math.max(0, Math.cos(q.rot - 0.6)) ** 10
  if (glint > 0.05) {
    ctx.globalAlpha = fade * glint
    const gsz = q.size * 6
    ctx.drawImage(glows.lamp, q.x - gsz / 2, q.y - gsz / 2, gsz, gsz)
    ctx.fillStyle = '#fff'
    star(ctx, q.x - q.size * 0.3, q.y - q.size * 0.3, q.size * 1.8 * glint, 0)
  }
}

function paintRain(
  ctx: CanvasRenderingContext2D,
  q: HitParticle,
  palette: HitPalette,
  he: Rgb,
  alpha: number,
  u: number,
  fade: number,
): void {
  const color = mix(palette.rain, he, 0.25)
  if (q.ripple) {
    const rr = hitLerp(6, 42, Math.sqrt(u)) * q.size * 0.4
    ctx.strokeStyle = rgba(color, 0.6 * (1 - u))
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.ellipse(q.x, q.originY, rr, rr * 0.28, 0, 0, TAU)
    ctx.stroke()
  }
  const ang = Math.atan2(q.vy, q.vx)
  const length = q.size * 2.2
  ctx.fillStyle = rgba(color, alpha * fade)
  ctx.save()
  ctx.translate(q.x, q.y)
  ctx.rotate(ang)
  ctx.beginPath()
  ctx.ellipse(0, 0, length, q.size * 0.6, 0, 0, TAU)
  ctx.fill()
  ctx.restore()
}

function paintMist(
  ctx: CanvasRenderingContext2D,
  q: HitParticle,
  glows: Glows,
  spec: { alpha: number; size: [number, number] },
  u: number,
  fade: number,
  sizeMul: number,
  reduced: boolean,
): void {
  const radius = hitLerp(spec.size[0], spec.size[1], 1 - (1 - u) ** 2.2) * sizeMul
  const fadeIn = u < 0.1 ? u / 0.1 : 1
  ctx.globalAlpha = spec.alpha * fade * fadeIn * (reduced ? 0.8 : 1)
  const puff = q.hand === 'rh' ? glows.mist : glows.mistL
  ctx.drawImage(puff, q.x - radius, q.y - radius * 0.7, radius * 2, radius * 1.4)
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(a)
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 ? r * 0.22 : r
    const an = i * (Math.PI / 4)
    ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr)
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function easeOutBack(x: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
}

function glowsFor(palette: HitPalette): Glows {
  const key = [
    palette.scene,
    rgbKey(palette.rh),
    rgbKey(palette.lh),
    rgbKey(palette.hot),
    rgbKey(palette.mist),
    rgbKey(palette.glint),
  ].join('|')
  if (glowSet && glowKey === key) return glowSet
  glowKey = key
  glowSet = {
    rh: glowSprite(palette.rh, palette.hot),
    lh: glowSprite(palette.lh, palette.hot),
    rhSoft: softSprite(palette.rh),
    lhSoft: softSprite(palette.lh),
    hot: glowSprite(palette.hot, WHITE),
    mist: softSprite(mix(palette.rh, palette.mist, 0.75)),
    mistL: softSprite(mix(palette.lh, palette.mist, 0.75)),
    lamp: glowSprite(palette.glint, WHITE),
  }
  return glowSet
}

function glowSprite(color: Rgb, core: Rgb): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, rgba(core, 1))
  gradient.addColorStop(0.18, rgba(color, 0.85))
  gradient.addColorStop(0.5, rgba(color, 0.25))
  gradient.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 64)
  return canvas
}

function softSprite(color: Rgb): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  gradient.addColorStop(0, rgba(color, 0.9))
  gradient.addColorStop(0.6, rgba(color, 0.35))
  gradient.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)
  return canvas
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t }
}

function rgba(color: Rgb, alpha: number): string {
  return `rgba(${color.r | 0},${color.g | 0},${color.b | 0},${alpha})`
}

function rgbKey(color: Rgb): string {
  return `${color.r},${color.g},${color.b}`
}

function hex(value: string): Rgb {
  const packed = Number.parseInt(value, 16)
  return { r: (packed >> 16) & 255, g: (packed >> 8) & 255, b: packed & 255 }
}

function readRgb(name: string, fallback: Rgb): Rgb {
  const packed = (fallback.r << 16) | (fallback.g << 8) | fallback.b
  const color = readCssColor(name, { color: packed, alpha: 1 }).color
  return { r: (color >> 16) & 255, g: (color >> 8) & 255, b: color & 255 }
}
