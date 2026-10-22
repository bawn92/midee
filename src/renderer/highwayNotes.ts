import type { Graphics } from 'pixi.js'
import { isBlackKey } from '../core/midi/types'

// Synthesia-style highway. Depth 0 sits on the hit line. Depth 1 is the
// vanishing point at the top centre of the roll. The same mapping paints the
// floor grid and places each block, so a lane meets the key it belongs to.

export const HIGHWAY_HORIZON = 0.1

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

// 0 at the hit line, 1 at the horizon. An exponent below 1 keeps nearby notes
// moving and bunches the far ones, which is the perspective read.
export function highwayDepth(timeDelta: number, lookahead: number): number {
  if (!(lookahead > 0) || timeDelta <= 0) return 0
  const t = timeDelta / lookahead
  if (t >= 1) return 1
  return t ** 0.72
}

export function highwayPoint(
  keyX: number,
  depth: number,
  width: number,
  rollHeight: number,
): { x: number; y: number } {
  const d = depth < 0 ? 0 : depth > 1 ? 1 : depth
  const y = rollHeight * (1 - d * (1 - HIGHWAY_HORIZON))
  const x = keyX + (width * 0.5 - keyX) * d
  return { x, y }
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

// Short glossy blocks on a coloured lane. A repeated pitch is a chain of
// blocks because each note keeps a fixed height instead of stretching.
export function paintHighwayNotes(
  g: Graphics,
  notes: readonly HighwayNote[],
  width: number,
  rollHeight: number,
  lookahead: number,
  count = notes.length,
): void {
  g.clear()
  if (width < 2 || rollHeight < 2 || count <= 0) return
  const lanes = new Uint8Array(128)
  const laneX = new Float32Array(128)
  const laneW = new Float32Array(128)
  const n = Math.min(count, notes.length)
  for (let i = 0; i < n; i++) {
    const note = notes[i]!
    const pitch = note.pitch
    if (pitch < 0 || pitch >= 128 || lanes[pitch]) continue
    lanes[pitch] = 1
    laneX[pitch] = note.keyX
    laneW[pitch] = note.keyW
  }
  for (let pitch = 0; pitch < 128; pitch++) {
    if (!lanes[pitch]) continue
    const keyX = laneX[pitch]! + laneW[pitch]! / 2
    const far = highwayPoint(keyX, 0.9, width, rollHeight)
    const near = highwayPoint(keyX, 0, width, rollHeight)
    lane(g, far.x, far.y, near.x, near.y, 1.25, highwayLaneColor(pitch), 0.45)
  }
  for (let i = 0; i < n; i++) {
    const note = notes[i]!
    const sustaining = note.timeDelta <= 0 && note.timeDelta + note.duration > 0
    if (!sustaining && note.timeDelta < 0) continue
    const depth = sustaining ? 0 : highwayDepth(note.timeDelta, lookahead)
    const scale = 0.26 + (1 - depth) * 0.74
    const w = Math.max(5, note.keyW * (isBlackKey(note.pitch) ? 0.92 : 0.62) * scale)
    const h = Math.max(6, 15 * scale)
    const at = highwayPoint(note.keyX + note.keyW / 2, depth, width, rollHeight)
    const x = at.x - w / 2
    const y = at.y - h * 0.72
    const color = highwayLaneColor(note.pitch)
    const radius = Math.min(4, w / 2, h / 2)
    const alpha = note.alpha
    g.roundRect(x, y + 1.5, w, h, radius)
    g.fill({ color: 0x000000, alpha: 0.28 * alpha })
    g.roundRect(x, y, w, h, radius)
    g.fill({ color, alpha })
    const glossH = Math.max(2, h * 0.42)
    g.roundRect(x + 1, y + 1, Math.max(1, w - 2), glossH, Math.max(1, radius - 1))
    g.fill({ color: mix(color, 0xffffff, 0.78), alpha: 0.92 * alpha })
  }
}

// Floor grid, painted once per resize. Rows bunch toward the horizon.
export function paintHighwayBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rollHeight: number,
): void {
  ctx.fillStyle = '#12141a'
  ctx.fillRect(0, 0, width, height)
  const roll = Math.max(2, Math.min(rollHeight, height))
  ctx.strokeStyle = 'rgba(210, 214, 230, 0.16)'
  ctx.lineWidth = 1
  const rows = 16
  for (let i = 1; i <= rows; i++) {
    const t = i / rows
    const depth = 1 - (1 - t) ** 1.85
    const left = highwayPoint(0, depth, width, roll)
    const right = highwayPoint(width, depth, width, roll)
    const y = Math.round(left.y) + 0.5
    ctx.globalAlpha = 0.28 + (1 - depth) * 0.72
    ctx.beginPath()
    ctx.moveTo(left.x, y)
    ctx.lineTo(right.x, y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  const rays = 22
  for (let i = 0; i <= rays; i++) {
    const keyX = (width * i) / rays
    const far = highwayPoint(keyX, 0.96, width, roll)
    const near = highwayPoint(keyX, 0, width, roll)
    ctx.strokeStyle = 'rgba(210, 214, 230, 0.07)'
    ctx.beginPath()
    ctx.moveTo(far.x, far.y)
    ctx.lineTo(near.x, near.y)
    ctx.stroke()
  }
  const vignette = ctx.createRadialGradient(
    width * 0.5,
    roll * 0.2,
    roll * 0.05,
    width * 0.5,
    roll * 0.45,
    Math.max(width, roll) * 0.72,
  )
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.45)')
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

// Dark bed with a short top lip. White keys stay flat so the cyan hit read
// is a solid fill, not a second material.
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
