import { KBD } from './keyboardMetrics'
import { type KeyboardPalette, keyboardHighlightAlpha } from './keyboardStyle'

// Shared with the landing hero (HeroArt + landing.css). The hero paints these
// stops through CSS variables; the play keyboard bakes the same stops into
// static canvases. Pressed keys reuse the same crown / front / lip split.

export const IVORY_MID_STOP = 0.28
export const SHEEN_HEIGHT = 0.46
export const SHEEN_ALPHA = 0.45
export const IVORY_CROWN = '#fffaf3'
export const WHITE_KEY_RADIUS = 4
export const BLACK_KEY_RADIUS = 3

const GH_IVORY = 0xf6ebda

export function heroIvoryGradient(): string {
  const mid = Math.round(IVORY_MID_STOP * 100)
  return `linear-gradient(${IVORY_CROWN}, var(--key-ivory) ${mid}%, var(--key-ivory-side))`
}

export function heroEbonyGradient(): string {
  return 'linear-gradient(var(--key-ebony), var(--key-ebony-side))'
}

export function heroSheenBackground(): string {
  return `linear-gradient(to bottom, color-mix(in srgb, var(--wood-light) ${Math.round(SHEEN_ALPHA * 100)}%, transparent), transparent)`
}

export function heroWhiteShadow(): string {
  return 'inset 0 -8px 8px color-mix(in srgb, var(--wood-dark) 8%, transparent)'
}

export function heroCaseShadow(): string {
  return '0 18px 36px color-mix(in srgb, var(--wood-dark) 28%, transparent), inset 0 2px 0 rgba(255, 236, 214, 0.18)'
}

export interface KeyPaint {
  x: number
  y: number
  w: number
  h: number
}

export function cssHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

export function mixHex(a: number, b: number, amount: number): string {
  return cssHex(mixColor(a, b, amount))
}

export function mixColor(a: number, b: number, amount: number): number {
  const ch = (shift: number) => {
    const from = (a >> shift) & 0xff
    const to = (b >> shift) & 0xff
    return Math.round(from + (to - from) * amount)
  }
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

function rgba(color: number, alpha: number): string {
  const r = (color >> 16) & 0xff
  const g = (color >> 8) & 0xff
  const b = color & 0xff
  return `rgba(${r},${g},${b},${alpha})`
}

export function ivoryCrown(ivory: number): number {
  if (ivory === GH_IVORY) return 0xfffaf3
  return mixColor(ivory, 0xffffff, 0.62)
}

export function keySpecularAlpha(palette: KeyboardPalette): number {
  if (palette.hairline || !palette.shade) return 0
  if (palette.id === 'synth') return 0.1
  if (palette.lacquer) return 0.42
  return 0.32
}

function traceCase(ctx: CanvasRenderingContext2D, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(0, r)
  ctx.arcTo(0, 0, r, 0, r)
  ctx.lineTo(w - r, 0)
  ctx.arcTo(w, 0, w, r, r)
  ctx.lineTo(w, h)
  ctx.lineTo(0, h)
  ctx.closePath()
}

function traceBottomRound(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + w, y)
  if (rad < 0.5) {
    ctx.lineTo(x + w, y + h)
    ctx.lineTo(x, y + h)
  } else {
    ctx.lineTo(x + w, y + h - rad)
    ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad)
    ctx.arcTo(x, y + h, x, y + h - rad, rad)
  }
  ctx.closePath()
}

// Case, lid sheen, cheeks, grain, and felt. Keys are drawn on top, inset by
// the cheeks, so the rounded corners stay the wood.
export function paintCase(
  canvas: HTMLCanvasElement,
  palette: KeyboardPalette,
  frame: {
    v: number
    caseR: number
    cheek: number
    feltY: number
    feltH: number
  },
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  const r = Math.min(frame.caseR, h / 2, w / 2)
  traceCase(ctx, w, h, r)
  ctx.fillStyle = cssHex(palette.caseDark)
  ctx.fill()
  if (!palette.hairline) {
    ctx.save()
    traceCase(ctx, w, h, r)
    ctx.clip()
    const wood = ctx.createLinearGradient(0, 0, 0, h)
    wood.addColorStop(0, cssHex(palette.caseLight))
    wood.addColorStop(SHEEN_HEIGHT, mixHex(palette.caseLight, palette.caseDark, 0.45))
    wood.addColorStop(1, cssHex(palette.caseDark))
    ctx.fillStyle = wood
    ctx.fillRect(0, 0, w, h)

    const sheenH = h * SHEEN_HEIGHT
    const sheen = ctx.createLinearGradient(0, 0, 0, sheenH)
    sheen.addColorStop(0, rgba(palette.caseLight, SHEEN_ALPHA))
    sheen.addColorStop(1, rgba(palette.caseLight, 0))
    ctx.fillStyle = sheen
    ctx.fillRect(0, 0, w, sheenH)
    if (palette.lacquer) {
      const lacquer = ctx.createLinearGradient(0, 0, 0, 40 * frame.v)
      lacquer.addColorStop(0, 'rgba(255,255,255,0.22)')
      lacquer.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = lacquer
      ctx.fillRect(0, 0, w, 40 * frame.v)
    }
    if (palette.grain > 0) {
      ctx.save()
      ctx.globalAlpha = palette.grain
      ctx.translate(w / 2, h / 2)
      ctx.rotate((-2.3 * Math.PI) / 180)
      ctx.translate(-w / 2, -h / 2)
      const grain = ctx.createLinearGradient(0, 0, w, 0)
      for (let i = 0; i <= 24; i++) {
        const alpha = i % 3 === 0 ? 0.18 : i % 2 === 1 ? 0.04 : 0.1
        grain.addColorStop(i / 24, `rgba(0,0,0,${alpha})`)
      }
      ctx.fillStyle = grain
      ctx.fillRect(-h, -h, w + h * 2, h * 3)
      ctx.restore()
    }
    const cheek = Math.max(1, frame.cheek)
    const left = ctx.createLinearGradient(0, 0, cheek, 0)
    left.addColorStop(0, 'rgba(255,255,255,0.14)')
    left.addColorStop(0.7, 'rgba(255,255,255,0)')
    left.addColorStop(1, 'rgba(0,0,0,0.2)')
    ctx.fillStyle = left
    ctx.fillRect(0, 0, cheek, h)
    const right = ctx.createLinearGradient(w, 0, w - cheek, 0)
    right.addColorStop(0, 'rgba(255,255,255,0.1)')
    right.addColorStop(0.7, 'rgba(255,255,255,0)')
    right.addColorStop(1, 'rgba(0,0,0,0.24)')
    ctx.fillStyle = right
    ctx.fillRect(w - cheek, 0, cheek, h)
    ctx.restore()
  }
  if (!palette.hairline) {
    const hi = Math.max(1, frame.v)
    ctx.fillStyle = cssHex(palette.highlight)
    ctx.globalAlpha = keyboardHighlightAlpha(palette.id)
    ctx.fillRect(0, hi, w, hi * 2)
    ctx.globalAlpha = 1
  }
  const feltH = Math.max(palette.hairline ? 1 : frame.v, palette.feltPx * frame.v)
  const feltX = frame.cheek
  const feltW = Math.max(0, w - frame.cheek * 2)
  ctx.fillStyle = cssHex(palette.felt)
  ctx.beginPath()
  ctx.roundRect(feltX, frame.feltY, feltW, feltH, Math.min(2, feltH / 2))
  ctx.fill()
  if (!palette.hairline && feltH > 2) {
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    ctx.fillRect(feltX + 2, frame.feltY, feltW - 4, Math.max(1, frame.v * 0.45))
  }
  if (palette.led) {
    const stripH = Math.max(2, 6 * frame.v)
    const stripY = 18 * frame.v
    ctx.fillStyle = cssHex(palette.strip)
    ctx.beginPath()
    ctx.roundRect(frame.cheek, stripY, w - frame.cheek * 2, stripH, stripH / 2)
    ctx.fill()
  }
}

export function paintWhiteKeys(
  ctx: CanvasRenderingContext2D,
  keys: readonly KeyPaint[],
  palette: KeyboardPalette,
  v: number,
): void {
  const spec = keySpecularAlpha(palette)
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!
    paintWhiteKey(ctx, key.x, key.y, key.w, key.h, v, palette, spec)
  }
}

export function paintBlackKeys(
  ctx: CanvasRenderingContext2D,
  keys: readonly KeyPaint[],
  palette: KeyboardPalette,
  v: number,
): void {
  const spec = keySpecularAlpha(palette)
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!
    paintBlackKey(ctx, key.x, key.y, key.w, key.h, v, palette, spec)
  }
}

function paintWhiteKey(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  v: number,
  palette: KeyboardPalette,
  spec: number,
): void {
  const radius = palette.hairline
    ? 0
    : Math.min(WHITE_KEY_RADIUS * Math.max(v, 0.55), w / 2, h * 0.22)
  const front = Math.min(h * 0.2, Math.max(2, KBD.whiteFront * v))
  const topH = Math.max(1, h - front)
  ctx.save()
  traceBottomRound(ctx, x, y, w, h, radius)
  ctx.clip()
  if (palette.hairline || !palette.shade) {
    ctx.fillStyle = cssHex(palette.ivory)
    ctx.fillRect(x, y, w, h)
    ctx.restore()
    return
  }
  const top = ctx.createLinearGradient(x, y, x, y + topH)
  top.addColorStop(0, cssHex(ivoryCrown(palette.ivory)))
  top.addColorStop(IVORY_MID_STOP, cssHex(palette.ivory))
  top.addColorStop(1, mixHex(palette.ivory, palette.ivorySide, 0.72))
  ctx.fillStyle = top
  ctx.fillRect(x, y, w, topH)
  const face = ctx.createLinearGradient(x, y + topH, x, y + h)
  face.addColorStop(0, cssHex(palette.ivorySide))
  face.addColorStop(1, mixHex(palette.ivorySide, palette.caseDark, 0.32))
  ctx.fillStyle = face
  ctx.fillRect(x, y + topH, w, front)
  ctx.fillStyle = rgba(0xffffff, spec)
  ctx.fillRect(x + 1, y + topH, Math.max(0, w - 2), Math.max(1, v * 0.65))
  ctx.fillRect(x + radius, y + 0.5, Math.max(0, w - radius * 2), Math.max(1, v * 0.7))
  ctx.fillStyle = 'rgba(255,255,255,0.26)'
  ctx.fillRect(x, y, Math.max(1, v * 0.65), h - radius)
  ctx.fillStyle = rgba(palette.caseDark, 0.2)
  ctx.fillRect(x + w - Math.max(1, v * 0.75), y, Math.max(1, v * 0.75), h - radius)
  const shade = ctx.createLinearGradient(x, y + h - 9 * v, x, y + h)
  shade.addColorStop(0, rgba(palette.caseDark, 0))
  shade.addColorStop(1, rgba(palette.caseDark, 0.18))
  ctx.fillStyle = shade
  ctx.fillRect(x, y + h - 9 * v, w, 9 * v)
  ctx.restore()
}

function paintBlackKey(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  v: number,
  palette: KeyboardPalette,
  spec: number,
): void {
  const radius = palette.hairline
    ? 0
    : Math.min(BLACK_KEY_RADIUS * Math.max(v, 0.55), w / 2, h * 0.2)
  const front = Math.min(h * 0.16, Math.max(2, KBD.blackFront * v))
  const topH = Math.max(1, h - front)
  ctx.save()
  traceBottomRound(ctx, x, y, w, h, radius)
  ctx.clip()
  if (palette.hairline || !palette.shade) {
    ctx.fillStyle = cssHex(palette.ebony)
    ctx.fillRect(x, y, w, h)
    ctx.restore()
    return
  }
  const body = ctx.createLinearGradient(x, y, x, y + topH)
  body.addColorStop(
    0,
    mixHex(palette.ebony, palette.highlight, palette.id === 'synth' ? 0.08 : 0.18),
  )
  body.addColorStop(0.4, cssHex(palette.ebony))
  body.addColorStop(1, cssHex(palette.ebonySide))
  ctx.fillStyle = body
  ctx.fillRect(x, y, w, topH)
  ctx.fillStyle = mixHex(palette.ebonySide, 0x000000, 0.35)
  ctx.fillRect(x, y + topH, w, front)
  ctx.fillStyle = rgba(palette.highlight, spec)
  ctx.fillRect(x + 1, y, Math.max(0, w - 2), Math.max(1, v * 0.8))
  ctx.fillStyle = rgba(0xffffff, palette.id === 'synth' ? 0.08 : 0.16)
  ctx.fillRect(x + 1, y + topH, Math.max(0, w - 2), Math.max(1, v * 0.5))
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.fillRect(x, y + 1, Math.max(1, v * 0.55), topH)
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillRect(x + w - Math.max(1, v * 0.6), y + 1, Math.max(1, v * 0.6), topH)
  ctx.restore()
}
