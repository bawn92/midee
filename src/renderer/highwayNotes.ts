import type { Graphics } from 'pixi.js'
import { isBlackKey } from '../core/midi/types'

// How far the highway narrows across the visible floor, as a fraction of the
// keyboard width. This is the only perspective control. 0 is a flat top-down
// roll. 1 puts the vanishing point on the top edge of the floor. 0.32 leaves
// the far end about 68% as wide as the keys, with the vanishing point well
// above the screen, so lanes stay nearly parallel and notes change size only
// a little from far to near.
export const HIGHWAY_DEPTH = 0.32

// A tail shorter than this is just the rounded head. Consecutive notes on a
// lane keep this much clear time between the tail and the next head.
export const HIGHWAY_TAIL_MIN = 0.14
export const HIGHWAY_TAIL_GAP = 0.07

// One vivid colour per pitch class: yellow, cyan, blue, indigo, purple,
// magenta, red, orange, and the steps between them.
export const HIGHWAY_LANES: readonly number[] = [
  0xffe14a, // C
  0xffb020, // Db
  0x3ee0ff, // D
  0x4aa8ff, // Eb
  0x4d6dff, // E
  0x7a4dff, // F
  0xb44dff, // Gb
  0xff3d9a, // G
  0xff4d6a, // Ab
  0xff6a3c, // A
  0xff9a2e, // Bb
  0xffd24a, // B
]

const CAPTIONS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const

export function highwayLaneColor(pitch: number): number {
  const pc = ((Math.round(pitch) % 12) + 12) % 12
  return HIGHWAY_LANES[pc] ?? 0xffe14a
}

export function highwayKeyCaption(pitch: number): string {
  const pc = ((Math.round(pitch) % 12) + 12) % 12
  return CAPTIONS[pc] ?? 'C'
}

// 0 at the hit line, 1 at the far edge of the floor. Linear, so a lower
// camera tilt spaces notes evenly instead of rushing them out of a point.
export function highwayDepth(timeDelta: number, lookahead: number): number {
  if (!(lookahead > 0) || timeDelta <= 0) return 0
  const t = timeDelta / lookahead
  return t >= 1 ? 1 : t
}

// Block size at a depth. 1 on the keys, 1 − HIGHWAY_DEPTH at the far edge.
export function highwayScale(depth: number): number {
  const d = depth < 0 ? 0 : depth > 1 ? 1 : depth
  return 1 - d * HIGHWAY_DEPTH
}

export interface HighwayFrame {
  vanishX: number
  nearLeft: number
  nearRight: number
  topInset: number
}

// The floor is framed on the visible keys. `topInset` is chrome above the
// roll, in pixels, so the grid starts under the controls.
export function highwayFrame(
  width: number,
  nearLeft = 0,
  nearRight = width,
  topInset = 0,
  rollHeight = 0,
): HighwayFrame {
  const left = Math.min(nearLeft, nearRight)
  const right = Math.max(nearLeft, nearRight)
  const cap = rollHeight > 0 ? rollHeight * 0.45 : topInset
  return {
    vanishX: (left + right) / 2,
    nearLeft: left,
    nearRight: right,
    topInset: Math.max(0, Math.min(topInset, cap)),
  }
}

// Pixels the icon row and transport occupy. The floor starts below them.
export function highwayChromeInset(): number {
  if (typeof document === 'undefined') return 0
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--highway-chrome')
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function highwayPoint(
  keyX: number,
  depth: number,
  rollHeight: number,
  vanishX: number,
  topInset = 0,
): { x: number; y: number } {
  const d = depth < 0 ? 0 : depth > 1 ? 1 : depth
  const span = Math.max(1, rollHeight - topInset)
  const y = topInset + span * (1 - d)
  const x = vanishX + (keyX - vanishX) * highwayScale(d)
  return { x, y }
}

// End time of a sustain tail, in the same timeDelta units as the head.
// Null when the note is short enough to stay a block, or when the gap before
// the next note on this lane eats the tail.
export function highwayTailEnd(
  timeDelta: number,
  duration: number,
  nextTimeDelta: number | null,
): number | null {
  const start = Math.max(timeDelta, 0)
  let end = timeDelta + duration
  if (nextTimeDelta !== null) end = Math.min(end, nextTimeDelta - HIGHWAY_TAIL_GAP)
  if (end - start <= HIGHWAY_TAIL_MIN) return null
  return end
}

export interface HighwayNote {
  pitch: number
  timeDelta: number
  duration: number
  keyX: number
  keyW: number
  alpha: number
}

function mix(color: number, toward: number, t: number): number {
  const ar = (color >> 16) & 255
  const ag = (color >> 8) & 255
  const ab = color & 255
  const br = (toward >> 16) & 255
  const bg = (toward >> 8) & 255
  const bb = toward & 255
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const b = Math.round(ab + (bb - ab) * t)
  return (r << 16) | (g << 8) | b
}

function lane(
  g: Graphics,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  color: number,
  alpha: number,
): void {
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy) || 1
  const nx = (-dy / len) * (width / 2)
  const ny = (dx / len) * (width / 2)
  g.poly([x0 + nx, y0 + ny, x0 - nx, y0 - ny, x1 - nx, y1 - ny, x1 + nx, y1 + ny])
  g.fill({ color, alpha })
}

// Rounded head at the attack, with a quieter tail behind it for the sustain.
// The tail narrows with the same perspective constant as the lanes. Lanes are
// drawn first so the blocks sit on top of them.
export function paintHighwayNotes(
  g: Graphics,
  notes: readonly HighwayNote[],
  rollHeight: number,
  lookahead: number,
  frame: HighwayFrame,
  count = notes.length,
): void {
  g.clear()
  if (rollHeight < 2 || count <= 0) return
  const n = Math.min(count, notes.length)
  const lanes = new Uint8Array(128)
  const laneX = new Float32Array(128)
  const laneW = new Float32Array(128)
  const nextAt = new Float64Array(128)
  nextAt.fill(Number.POSITIVE_INFINITY)
  for (let i = 0; i < n; i++) {
    const note = notes[i]!
    const pitch = note.pitch
    if (pitch < 0 || pitch >= 128) continue
    if (!lanes[pitch]) {
      lanes[pitch] = 1
      laneX[pitch] = note.keyX
      laneW[pitch] = note.keyW
    }
  }
  // Second pass finds the following onset on each pitch so tails leave a gap.
  const order = new Array<number>(n)
  for (let i = 0; i < n; i++) order[i] = i
  order.sort((a, b) => notes[b]!.timeDelta - notes[a]!.timeDelta)
  const follower = new Float64Array(n)
  follower.fill(Number.POSITIVE_INFINITY)
  for (const i of order) {
    const note = notes[i]!
    const pitch = note.pitch
    if (pitch < 0 || pitch >= 128) continue
    follower[i] = nextAt[pitch]!
    nextAt[pitch] = note.timeDelta
  }

  const { vanishX, topInset } = frame
  for (let pitch = 0; pitch < 128; pitch++) {
    if (!lanes[pitch]) continue
    const keyX = laneX[pitch]! + laneW[pitch]! / 2
    const far = highwayPoint(keyX, 1, rollHeight, vanishX, topInset)
    const near = highwayPoint(keyX, 0, rollHeight, vanishX, topInset)
    lane(g, far.x, far.y, near.x, near.y, 1.35, highwayLaneColor(pitch), 0.22)
  }

  for (let i = 0; i < n; i++) {
    const note = notes[i]!
    const sustaining = note.timeDelta <= 0 && note.timeDelta + note.duration > 0
    if (!sustaining && note.timeDelta < 0) continue
    const next = follower[i]!
    const tailEnd = highwayTailEnd(
      note.timeDelta,
      note.duration,
      Number.isFinite(next) ? next : null,
    )
    if (tailEnd === null) continue
    const headTime = sustaining ? 0 : note.timeDelta
    const headDepth = highwayDepth(headTime, lookahead)
    const farDepth = highwayDepth(tailEnd, lookahead)
    if (farDepth <= headDepth + 0.004) continue
    const center = note.keyX + note.keyW / 2
    const near = highwayPoint(center, headDepth, rollHeight, vanishX, topInset)
    const far = highwayPoint(center, farDepth, rollHeight, vanishX, topInset)
    const black = isBlackKey(note.pitch)
    const unit = Math.max(16, note.keyW * (black ? 0.72 : 0.46))
    const nearW = unit * highwayScale(headDepth) * 0.42
    const farW = unit * highwayScale(farDepth) * 0.42
    const color = highwayLaneColor(note.pitch)
    g.poly([
      near.x - nearW / 2,
      near.y,
      near.x + nearW / 2,
      near.y,
      far.x + farW / 2,
      far.y,
      far.x - farW / 2,
      far.y,
    ])
    g.fill({ color, alpha: 0.32 * note.alpha })
  }

  for (let i = 0; i < n; i++) {
    const note = notes[i]!
    const sustaining = note.timeDelta <= 0 && note.timeDelta + note.duration > 0
    if (!sustaining && note.timeDelta < 0) continue
    const depth = sustaining ? 0 : highwayDepth(note.timeDelta, lookahead)
    const scale = highwayScale(depth)
    const black = isBlackKey(note.pitch)
    const unit = Math.max(16, note.keyW * (black ? 0.92 : 0.78))
    const w = unit * scale
    const h = unit * 0.78 * scale
    const at = highwayPoint(note.keyX + note.keyW / 2, depth, rollHeight, vanishX, topInset)
    const x = at.x - w / 2
    const y = at.y - h * 0.82
    const color = highwayLaneColor(note.pitch)
    const radius = Math.min(w, h) * 0.32
    const alpha = note.alpha
    g.roundRect(x, y + 1, w, h, radius)
    g.fill({ color: 0x000000, alpha: 0.22 * alpha })
    g.roundRect(x, y, w, h, radius)
    g.fill({ color, alpha })
    const glossH = Math.max(2, h * 0.26)
    g.roundRect(x + 1, y + 1, Math.max(1, w - 2), glossH, Math.max(1, radius * 0.6))
    g.fill({ color: mix(color, 0xffffff, 0.28), alpha: 0.4 * alpha })
  }
}

// Floor grid, painted once per resize. Rows stay nearly parallel because
// they share HIGHWAY_DEPTH with the notes.
export function paintHighwayBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rollHeight: number,
  frame?: HighwayFrame,
): void {
  const view = frame ?? highwayFrame(width, 0, width, 0, rollHeight)
  ctx.fillStyle = '#12141a'
  ctx.fillRect(0, 0, width, height)
  const roll = Math.max(2, Math.min(rollHeight, height))
  ctx.strokeStyle = 'rgba(210, 214, 230, 0.28)'
  ctx.lineWidth = 1
  const rows = 10
  for (let i = 1; i <= rows; i++) {
    const depth = i / rows
    const left = highwayPoint(view.nearLeft, depth, roll, view.vanishX, view.topInset)
    const right = highwayPoint(view.nearRight, depth, roll, view.vanishX, view.topInset)
    const y = Math.round(left.y) + 0.5
    ctx.globalAlpha = 0.55 + (1 - depth) * 0.45
    ctx.beginPath()
    ctx.moveTo(left.x, y)
    ctx.lineTo(right.x, y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  const rays = 16
  const span = Math.max(1, view.nearRight - view.nearLeft)
  for (let i = 0; i <= rays; i++) {
    const keyX = view.nearLeft + (span * i) / rays
    const far = highwayPoint(keyX, 1, roll, view.vanishX, view.topInset)
    const near = highwayPoint(keyX, 0, roll, view.vanishX, view.topInset)
    ctx.strokeStyle = 'rgba(210, 214, 230, 0.14)'
    ctx.beginPath()
    ctx.moveTo(far.x, far.y)
    ctx.lineTo(near.x, near.y)
    ctx.stroke()
  }
  const vignette = ctx.createRadialGradient(
    view.vanishX,
    roll * 0.35,
    roll * 0.1,
    view.vanishX,
    roll * 0.55,
    Math.max(width, roll) * 0.72,
  )
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.35)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, width, height)
}

export interface HighwayKeyFace {
  x: number
  y: number
  w: number
  h: number
}

function traceKey(ctx: CanvasRenderingContext2D, key: HighwayKeyFace): void {
  const radius = Math.min(3, key.w / 2, key.h / 2)
  ctx.beginPath()
  ctx.roundRect(key.x, key.y, key.w, key.h, radius)
}

// Dark bed with a short top lip. White keys stay flat.
export function paintHighwayKeyBed(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  whites: readonly HighwayKeyFace[],
): void {
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#0c0d12'
  ctx.fillRect(0, 0, width, height)
  const lip = Math.max(6, Math.round(height * 0.07))
  const rim = ctx.createLinearGradient(0, 0, 0, lip)
  rim.addColorStop(0, '#2c313e')
  rim.addColorStop(1, '#101218')
  ctx.fillStyle = rim
  ctx.fillRect(0, 0, width, lip)
  ctx.fillStyle = 'rgba(255,255,255,0.14)'
  ctx.fillRect(0, lip, width, 1)
  ctx.fillStyle = '#f3f3f6'
  for (const key of whites) {
    traceKey(ctx, key)
    ctx.fill()
  }
  ctx.fillStyle = '#08090d'
  ctx.fillRect(0, height - Math.max(4, Math.round(height * 0.045)), width, height)
}

export function paintHighwayBlackKeys(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  blacks: readonly HighwayKeyFace[],
): void {
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#1a1c24'
  for (const key of blacks) {
    traceKey(ctx, key)
    ctx.fill()
    ctx.fillStyle = '#323746'
    ctx.fillRect(key.x + 1, key.y, Math.max(1, key.w - 2), 1)
    ctx.fillStyle = '#1a1c24'
  }
}
