import { KBD, type KeyFrame } from './keyboardMetrics'
import type { KeyboardPalette } from './keyboardStyle'

// The landing hero and the play piano share these stops. The hero paints
// them with CSS variables. The play piano bakes the same stops once.

export const IVORY_MID_STOP = 0.28
export const SHEEN_HEIGHT = 0.46
export const SHEEN_ALPHA = 0.45
export const IVORY_CROWN = '#fffaf3'
export const WHITE_KEY_RADIUS = KBD.whiteRadius
export const BLACK_KEY_RADIUS = KBD.blackRadius
export const HONEY = 0xdda95e
export const ROSE = 0xd9908f

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

export function heroHandGradient(hand: 'rh' | 'lh'): string {
  if (hand === 'rh') return 'linear-gradient(#f6d7a4, #e6a94f 28%, #dda95e)'
  return 'linear-gradient(#f3c6c4, #d9908f 28%, #c47b7a)'
}

export interface KeyPaint {
  x: number
  y: number
  w: number
  h: number
}

export interface HandStops {
  top: number
  mid: number
  toe: number
}

export function cssHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

export function mixColor(a: number, b: number, amount: number): number {
  const ch = (shift: number) => {
    const from = (a >> shift) & 0xff
    const to = (b >> shift) & 0xff
    return Math.round(from + (to - from) * amount)
  }
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

function mixHex(a: number, b: number, amount: number): string {
  return cssHex(mixColor(a, b, amount))
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

// One gradient for a pressed key. Golden Hour lands on the hero's honey and rose.
export function handStops(hand: number, left: boolean, themeId: string): HandStops {
  if (themeId === 'golden-hour' && !left) return { top: 0xf6d7a4, mid: 0xe6a94f, toe: HONEY }
  if (themeId === 'golden-hour' && left) return { top: 0xf3c6c4, mid: 0xd9908f, toe: 0xc47b7a }
  return {
    top: mixColor(hand, 0xffffff, 0.38),
    mid: hand,
    toe: mixColor(hand, 0x000000, 0.16),
  }
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

function roundBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, rad)
}

// Compact walnut case: smooth gradient, 1px top highlight, thin felt,
// rounded ends, and a soft shadow in the outer margin. No grain.
export function paintCase(
  canvas: HTMLCanvasElement,
  palette: KeyboardPalette,
  frame: KeyFrame,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)

  const outer = KBD.outer * frame.h
  const shadow = KBD.shadow * frame.v
  const caseX = outer
  const caseY = 0
  const caseW = Math.max(1, w - outer * 2)
  const caseH = Math.max(1, h - shadow)
  const radius = Math.min(frame.caseR, caseH / 2, caseW / 2)

  if (!palette.hairline) {
    for (let i = 5; i >= 1; i--) {
      const spread = i * 1.4 * frame.h
      const drop = shadow * (0.25 + (i / 5) * 0.55)
      ctx.globalAlpha = 0.05
      ctx.fillStyle = cssHex(palette.caseDark)
      roundBox(ctx, caseX - spread * 0.35, caseY + drop, caseW + spread * 0.7, caseH, radius)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  const wood = ctx.createLinearGradient(0, caseY, 0, caseY + caseH)
  if (palette.hairline) {
    wood.addColorStop(0, cssHex(palette.caseDark))
    wood.addColorStop(1, cssHex(palette.caseDark))
  } else if (palette.id === 'synth') {
    wood.addColorStop(0, cssHex(palette.caseLight))
    wood.addColorStop(1, cssHex(palette.caseDark))
  } else {
    wood.addColorStop(0, mixHex(palette.caseLight, palette.caseDark, 0.42))
    wood.addColorStop(1, cssHex(palette.caseDark))
  }
  ctx.fillStyle = wood
  roundBox(ctx, caseX, caseY, caseW, caseH, radius)
  ctx.fill()

  if (!palette.hairline) {
    ctx.save()
    roundBox(ctx, caseX, caseY, caseW, caseH, radius)
    ctx.clip()
    ctx.strokeStyle = rgba(palette.highlight, palette.id === 'synth' ? 0.28 : 0.7)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(caseX + radius, caseY + 1.5)
    ctx.lineTo(caseX + caseW - radius, caseY + 1.5)
    ctx.stroke()
    ctx.restore()
  }

  const feltX = frame.cheek
  const feltW = Math.max(0, w - frame.cheek * 2)
  const feltH = Math.max(palette.hairline ? 1 : 2, frame.feltH)
  ctx.fillStyle = cssHex(palette.led ? palette.strip : palette.felt)
  ctx.beginPath()
  ctx.roundRect(feltX, frame.feltY, feltW, feltH, Math.min(1.5, feltH / 2))
  ctx.fill()
}

export function paintWhiteKeys(
  ctx: CanvasRenderingContext2D,
  keys: readonly KeyPaint[],
  palette: KeyboardPalette,
  v: number,
): void {
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!
    paintWhiteKey(ctx, key.x, key.y, key.w, key.h, v, palette)
  }
}

export function paintBlackKeys(
  ctx: CanvasRenderingContext2D,
  keys: readonly KeyPaint[],
  palette: KeyboardPalette,
  v: number,
): void {
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!
    paintBlackKey(ctx, key.x, key.y, key.w, key.h, v, palette)
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
): void {
  const radius = palette.hairline
    ? 0
    : Math.min(KBD.whiteRadius * Math.max(v, 0.65), w / 2, h * 0.3)
  ctx.save()
  traceBottomRound(ctx, x, y, w, h, radius)
  ctx.clip()
  if (palette.hairline || !palette.shade) {
    ctx.fillStyle = cssHex(palette.ivory)
    ctx.fillRect(x, y, w, h)
    ctx.restore()
    return
  }
  const top = ctx.createLinearGradient(x, y, x, y + h)
  top.addColorStop(0, cssHex(ivoryCrown(palette.ivory)))
  top.addColorStop(IVORY_MID_STOP, cssHex(palette.ivory))
  top.addColorStop(1, cssHex(palette.ivorySide))
  ctx.fillStyle = top
  ctx.fillRect(x, y, w, h)
  const shade = ctx.createLinearGradient(x, y + h - 8 * v, x, y + h)
  shade.addColorStop(0, rgba(palette.caseDark, 0))
  shade.addColorStop(1, rgba(palette.caseDark, 0.08))
  ctx.fillStyle = shade
  ctx.fillRect(x, y + h - 8 * v, w, 8 * v)
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
): void {
  const radius = palette.hairline
    ? 0
    : Math.min(KBD.blackRadius * Math.max(v, 0.65), w / 2, h * 0.28)
  ctx.save()
  traceBottomRound(ctx, x, y, w, h, radius)
  ctx.clip()
  if (palette.hairline || !palette.shade) {
    ctx.fillStyle = cssHex(palette.ebony)
    ctx.fillRect(x, y, w, h)
    ctx.restore()
    return
  }
  const body = ctx.createLinearGradient(x, y, x, y + h)
  body.addColorStop(0, cssHex(palette.ebony))
  body.addColorStop(1, cssHex(palette.ebonySide))
  ctx.fillStyle = body
  ctx.fillRect(x, y, w, h)
  ctx.restore()
}
