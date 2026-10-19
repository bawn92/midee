import type { Graphics } from 'pixi.js'
import type { MidiNote } from '../core/midi/types'
import { isBlackKey } from '../core/midi/types'
import type { paintPrefs } from '../ui/paint'
import { readCssColor } from './cssColor'
import { KBD } from './keyboardMetrics'
import {
  fittedDashes,
  inNextChord,
  type NoteBody,
  type NoteShapeId,
  outlineFillRatio,
  separateNoteBodies,
} from './noteShape'
import type { Theme } from './theme'
import type { Viewport } from './viewport'

type Hand = 'rh' | 'lh'
type Prefs = ReturnType<typeof paintPrefs>

export interface SceneNoteInput {
  pitch: number
  drawPitch: number
  time: number
  duration: number
  velocity: number
  shifted: boolean
  octaves: number
  dimmed: boolean
  color: number
  hand: 'left' | 'right'
  note: MidiNote
}

interface Ink {
  fill: number
  edge: number
  hand: Hand
}

export interface PlacedNote {
  drawPitch: number
  x: number
  y: number
  w: number
  h: number
  bottom: number
  color: number
  alpha: number
  shifted: boolean
  octaves: number
}

interface PaintArgs {
  g: Graphics
  landing: Graphics
  notes: readonly SceneNoteInput[]
  viewport: Viewport
  nowLineY: number
  currentTime: number
  theme: Theme
  bpm: number
  prefs: Prefs
  reduced: boolean
  onset: number | null
  dense: boolean
  pools: { used: number }
  onPlaced: (note: PlacedNote) => void
  onFinger: (args: {
    drawPitch: number
    note: MidiNote
    x: number
    y: number
    w: number
    h: number
    alpha: number
    hand: Hand
    edge: number
  }) => void
}

function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255
  const ag = (a >> 8) & 255
  const ab = a & 255
  const br = (b >> 16) & 255
  const bg = (b >> 8) & 255
  const bb = b & 255
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const bl = Math.round(ab + (bb - ab) * t)
  return (r << 16) | (g << 8) | bl
}

function sceneInk(
  classicColor: number,
  shape: NoteShapeId,
  theme: Theme,
  colorByHand: boolean,
  hand: 'left' | 'right',
): Ink {
  const lh = hand === 'left'
  const fillToken = readCssColor(lh ? '--note-lh' : '--note-rh', {
    color: (lh ? theme.trackColors[1] : theme.trackColors[0]) ?? classicColor,
    alpha: 1,
  })
  const edgeToken = readCssColor(lh ? '--note-lh-edge' : '--note-rh-edge', {
    color: lh ? 0xb8706f : 0xc98a32,
    alpha: 1,
  })
  const useScene = shape !== 'classic' || colorByHand
  return {
    fill: useScene ? fillToken.color : classicColor,
    edge: edgeToken.color,
    hand: lh ? 'lh' : 'rh',
  }
}

function paintShadow(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  rainy: boolean,
  alpha: number,
): void {
  const color = rainy ? 0x2c3a42 : 0x5e3b24
  g.roundRect(x - 0.5, y + 4, w + 1, h, radius)
  g.fill({ color, alpha: 0.06 * alpha })
  g.roundRect(x, y + 2, w, h, radius)
  g.fill({ color, alpha: 0.1 * alpha })
}

function paintDashed(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  color: number,
  alpha: number,
): void {
  const thick = 1.25
  const r = Math.min(radius, Math.max(0, w / 2 - 1), Math.max(0, h / 2 - 1))
  const inset = Math.max(r * 0.65, 1.5)
  const horizontal = Math.max(0, w - inset * 2)
  const vertical = Math.max(0, h - inset * 2)
  const run = (length: number, px: number, py: number, across: boolean) => {
    if (length < 2) return
    const { dash, gap, count } = fittedDashes(length)
    const period = dash + gap
    let cursor = 0
    for (let i = 0; i < count; i++) {
      const len = i === count - 1 ? Math.max(0, length - cursor) : dash
      if (len > 0.4) {
        if (across) g.rect(px + cursor, py, len, thick)
        else g.rect(px, py + cursor, thick, len)
      }
      cursor += i === count - 1 ? len : period
    }
  }
  run(horizontal, x + inset, y, true)
  run(horizontal, x + inset, y + h - thick, true)
  run(vertical, x, y + inset, false)
  run(vertical, x + w - thick, y + inset, false)
  g.fill({ color, alpha })
}

function paintPool(
  g: Graphics,
  cx: number,
  y: number,
  w: number,
  color: number,
  alpha: number,
): void {
  const layers = [
    { dw: w * 1.35, dh: 18, a: 0.14 },
    { dw: w * 0.95, dh: 11, a: 0.2 },
    { dw: w * 0.55, dh: 6, a: 0.16 },
  ]
  for (const layer of layers) {
    g.roundRect(cx - layer.dw / 2, y - layer.dh / 2, layer.dw, layer.dh, layer.dh / 2)
    g.fill({ color, alpha: alpha * layer.a })
  }
}

function fingerNote(notes: readonly MidiNote[], now: number): MidiNote {
  for (const note of notes) {
    if (note.time <= now && note.time + note.duration > now) return note
  }
  for (const note of notes) {
    if (note.time > now) return note
  }
  return notes[notes.length - 1] ?? notes[0]!
}

function paintTicks(
  g: Graphics,
  body: NoteBody,
  x: number,
  y: number,
  w: number,
  radius: number,
  bottom: number,
  currentTime: number,
  viewport: Viewport,
  bpm: number,
  alpha: number,
): void {
  const beat = 60 / Math.max(1, bpm)
  if (body.end - body.time <= beat * 1.25) return
  let drawn = 0
  const first = Math.floor(body.time / beat) * beat + beat
  for (let t = first; t < body.end - beat * 0.12; t += beat) {
    if (t <= body.time + 0.04) continue
    const ty = viewport.timeOffsetToY(t - currentTime)
    if (ty <= y + radius + 1 || ty >= bottom - radius - 1 || ty >= bottom) continue
    g.rect(x + 4, ty, Math.max(1, w - 8), 1)
    drawn++
  }
  if (drawn > 0) g.fill({ color: 0xfff8ee, alpha: 0.22 * alpha })
}

export function paintSceneNotes(args: PaintArgs): void {
  const { g, viewport, nowLineY, currentTime, theme, prefs, reduced } = args
  const shape = prefs.noteStyle
  const rainy = theme.id === 'rainy-study'
  const soft = prefs.noteLook !== 'flat'
  const glowScale = rainy ? 0.8 : 1
  const bodies = separateNoteBodies(
    args.notes.map((note) => ({
      drawPitch: note.drawPitch,
      pitch: note.pitch,
      time: note.time,
      end: note.time + note.duration,
      velocity: note.velocity,
      shifted: note.shifted,
      octaves: note.octaves,
      dimmed: note.dimmed,
      color: note.color,
      hand: note.hand,
      notes: [note.note],
    })),
    viewport.config.pixelsPerSecond,
  )
  const bracket: { x: number; w: number; bottom: number }[] = []

  for (const body of bodies) {
    const timeDelta = body.time - currentTime
    const bottom = Math.min(viewport.timeOffsetToY(timeDelta), nowLineY)
    const top = viewport.timeOffsetToY(body.end - currentTime)
    if (top >= nowLineY) continue
    const h = Math.max(bottom - top, 3)
    const y = top
    const rawW = Math.max(viewport.pitchWidth(body.drawPitch), 2)
    const hScale = rawW / (isBlackKey(body.drawPitch) ? KBD.blackW : KBD.pitch)
    const inset = 4 * hScale
    const w = Math.max(2, rawW - inset)
    const x = viewport.pitchToX(body.drawPitch) + inset / 2
    const ink = sceneInk(
      body.color,
      shape,
      theme,
      prefs.colorBy === 'hand',
      body.hand ?? (body.pitch < 60 ? 'left' : 'right'),
    )
    const next = inNextChord(body.time, args.onset)
    const active = currentTime >= body.time && currentTime < body.end
    const alpha = body.dimmed ? 0.3 : 1
    const approach =
      !active && body.time > currentTime
        ? Math.min(1, Math.max(0, (0.3 - (body.time - currentTime)) / 0.3))
        : 0
    const radius = Math.min(7, w / 2, h / 2)
    let fill = ink.fill
    if (prefs.noteLandingBloom && (active || approach > 0)) {
      const t = active ? (reduced ? 0.1 : 0.16) : approach * 0.1
      fill = mix(ink.fill, 0xfff6e8, t)
    }

    if (soft && !body.dimmed) paintShadow(g, x, y, w, h, radius, rainy, alpha)
    paintBody(g, {
      shape,
      x,
      y,
      w,
      h,
      radius,
      fill,
      edge: ink.edge,
      hand: ink.hand,
      alpha,
      next,
      active,
      soft,
      reduced,
      rainy,
      dense: args.dense,
      currentTime,
      onset: body.time,
      bpm: args.bpm,
      bloom: prefs.noteLandingBloom,
      hands: prefs.noteHandShapes,
      shifted: body.shifted,
    })
    if (shape === 'classic') {
      paintTicks(g, body, x, y, w, radius, bottom, currentTime, viewport, args.bpm, alpha)
    }
    if (next) bracket.push({ x, w, bottom })
    args.onPlaced({
      drawPitch: body.drawPitch,
      x,
      y,
      w,
      h,
      bottom,
      color: fill,
      alpha,
      shifted: body.shifted,
      octaves: body.octaves,
    })
    if (prefs.noteFingerNumbers && alpha >= 0.2) {
      args.onFinger({
        drawPitch: body.drawPitch,
        note: fingerNote(body.notes, currentTime),
        x,
        y,
        w,
        h,
        alpha,
        hand: ink.hand,
        edge: ink.edge,
      })
    }
    paintLanding(args, {
      x,
      w,
      bottom,
      color: fill,
      alpha,
      active,
      end: body.end,
      hand: ink.hand,
      shape,
      glowScale,
      dimmed: body.dimmed,
    })
  }

  if (bracket.length >= 2) {
    const left = Math.min(...bracket.map((item) => item.x))
    const right = Math.max(...bracket.map((item) => item.x + item.w))
    const y = Math.max(...bracket.map((item) => item.bottom)) + 5
    if (y < nowLineY - 1 && right - left > 8) {
      const ink = readCssColor('--text-3', { color: rainy ? 0x8a969c : 0x7e604b, alpha: 1 })
      g.rect(left, y, right - left, 2)
      g.rect(left, y - 5, 2, 7)
      g.rect(right - 2, y - 5, 2, 7)
      g.fill({ color: ink.color, alpha: 0.45 })
    }
  }
}

function paintBody(
  g: Graphics,
  o: {
    shape: NoteShapeId
    x: number
    y: number
    w: number
    h: number
    radius: number
    fill: number
    edge: number
    hand: Hand
    alpha: number
    next: boolean
    active: boolean
    soft: boolean
    reduced: boolean
    rainy: boolean
    dense: boolean
    currentTime: number
    onset: number
    bpm: number
    bloom: boolean
    hands: boolean
    shifted: boolean
  },
): void {
  if (o.shape === 'glass') paintGlass(g, o)
  else if (o.shape === 'felt') paintFelt(g, o)
  else if (o.shape === 'beam') paintBeam(g, o)
  else if (o.shape === 'outline') paintOutline(g, o)
  else if (o.shape === 'petal') paintPetal(g, o)
  else paintClassic(g, o)
}

function paintClassic(g: Graphics, o: Parameters<typeof paintBody>[1]): void {
  const dashed = o.next || o.shifted
  const fillAlpha = o.next ? 0.78 * o.alpha : o.alpha
  g.roundRect(o.x, o.y, o.w, o.h, o.radius)
  g.fill({ color: o.fill, alpha: fillAlpha })
  if (dashed) {
    paintDashed(g, o.x, o.y, o.w, o.h, o.radius, o.edge, o.alpha)
  } else {
    g.roundRect(o.x + 0.5, o.y + 0.5, Math.max(1, o.w - 1), Math.max(1, o.h - 1), o.radius)
    g.stroke({ color: o.edge, width: 1, alpha: o.alpha })
  }
  if (o.soft && o.h > 8) {
    const sheen = Math.min(3, Math.max(1, o.h * 0.08))
    g.roundRect(o.x + 2, o.y + 1.5, Math.max(1, o.w - 4), sheen, 1)
    g.fill({ color: 0xfff8ee, alpha: 0.28 * o.alpha })
  }
}

function paintGlass(g: Graphics, o: Parameters<typeof paintBody>[1]): void {
  const radius = Math.min(o.w / 2, 12, o.h / 2)
  let alpha = 0.62
  if (o.active) {
    const k = o.reduced ? 1 : Math.min(1, (o.currentTime - o.onset) / 0.08)
    alpha = 0.62 + 0.26 * k
  }
  if (o.next) alpha *= 0.72
  g.roundRect(o.x, o.y, o.w, o.h, radius)
  g.fill({ color: o.fill, alpha: alpha * o.alpha })
  if (o.soft) {
    const cap = Math.max(2, Math.min(o.h * 0.34, 16))
    g.roundRect(o.x + 1.5, o.y + 1.5, Math.max(1, o.w - 3), cap, Math.max(1, radius - 2))
    g.fill({ color: 0xfff8ee, alpha: 0.2 * o.alpha })
  }
  if (o.next || o.shifted) paintDashed(g, o.x, o.y, o.w, o.h, radius, o.edge, 0.85 * o.alpha)
  else {
    g.roundRect(o.x + 0.5, o.y + 0.5, Math.max(1, o.w - 1), Math.max(1, o.h - 1), radius)
    g.stroke({ color: o.edge, width: 1, alpha: 0.9 * o.alpha })
  }
  if (o.hands && o.h > 16) {
    const tickH = Math.min(o.h * 0.4, 20)
    const tx = o.hand === 'rh' ? o.x + o.w - 4 : o.x + 2
    g.roundRect(tx, o.y + (o.h - tickH) / 2, 2, tickH, 1)
    g.fill({ color: 0xfff8ee, alpha: 0.7 * o.alpha })
  }
}

function paintFelt(g: Graphics, o: Parameters<typeof paintBody>[1]): void {
  const press = o.active && !o.reduced && o.bloom ? 1.5 : 0
  const y = o.y + press
  const radius = Math.min(5, o.w / 2, o.h / 2)
  const alpha = o.next ? 0.8 * o.alpha : o.alpha
  g.roundRect(o.x, y, o.w, o.h, radius)
  g.fill({ color: o.fill, alpha })
  g.rect(o.x, y, o.w, Math.min(4, o.h))
  g.fill({ color: o.edge, alpha: 0.85 * o.alpha })
  if (o.next || o.shifted) paintDashed(g, o.x, y, o.w, o.h, radius, o.edge, o.alpha)
  else {
    g.roundRect(o.x + 0.5, y + 0.5, Math.max(1, o.w - 1), Math.max(1, o.h - 1), radius)
    g.stroke({ color: o.edge, width: 1, alpha: o.alpha })
  }
  const hideStitch = o.dense && o.h < 24
  if (!hideStitch && o.h >= 24) {
    const side = o.hand === 'rh' ? o.x + 3 : o.x + o.w - 5
    for (let ty = y + 8; ty < y + o.h - 6; ty += 7) {
      g.rect(side, ty, 2, 2)
    }
    g.fill({ color: 0xfff8ee, alpha: 0.45 * o.alpha })
  }
  if (o.hands && o.h > 16) {
    const tickH = Math.min(18, o.h * 0.35)
    const tx = o.hand === 'rh' ? o.x + o.w - 5 : o.x + 3
    g.roundRect(tx, y + o.h - tickH - 4, 2, tickH, 1)
    g.fill({ color: 0xfff8ee, alpha: 0.8 * o.alpha })
  }
}

function paintBeam(g: Graphics, o: Parameters<typeof paintBody>[1]): void {
  const bodyW = Math.max(4, o.w * 0.42)
  const x = o.x + (o.w - bodyW) / 2
  const radius = bodyW / 2
  const alpha = (o.next ? 0.7 : 1) * o.alpha
  g.roundRect(x, o.y, bodyW, o.h, radius)
  g.fill({ color: o.fill, alpha })
  const hideCore = o.dense && o.h < 24
  if (!hideCore && o.h > 10) {
    const coreW = Math.max(1.5, bodyW * 0.34)
    g.roundRect(x + (bodyW - coreW) / 2, o.y + 2, coreW, Math.max(1, o.h - 4), coreW / 2)
    g.fill({ color: 0xfff8ee, alpha: (o.active ? 0.72 : 0.48) * o.alpha })
  }
  const flare = o.active && o.bloom && !o.reduced ? 1.18 : 1
  const head = Math.max(3.5, bodyW * 0.62) * flare
  const cx = o.x + o.w / 2
  const hy = o.y + o.h - head * 0.2
  if (o.hand === 'lh') {
    g.poly([cx, hy - head, cx + head * 0.72, hy, cx, hy + head * 0.72, cx - head * 0.72, hy])
  } else {
    g.circle(cx, hy, head * 0.72)
  }
  g.fill({ color: o.fill, alpha })
  if (o.next || o.shifted) paintDashed(g, o.x, o.y, o.w, o.h, o.radius, o.edge, 0.7 * o.alpha)
}

function paintOutline(g: Graphics, o: Parameters<typeof paintBody>[1]): void {
  const beat = 60 / Math.max(1, o.bpm)
  let ratio = outlineFillRatio(o.currentTime, o.onset, beat, o.reduced)
  if (o.next) ratio = Math.min(ratio, 0.5)
  if (o.active) ratio = 1
  const fh = o.h * ratio
  if (fh > 0.8) {
    g.roundRect(o.x, o.y + o.h - fh, o.w, fh, Math.min(o.radius, fh / 2, o.w / 2))
    g.fill({ color: o.fill, alpha: 0.92 * o.alpha })
  }
  g.roundRect(o.x + 0.5, o.y + 0.5, Math.max(1, o.w - 1), Math.max(1, o.h - 1), o.radius)
  g.stroke({ color: o.next ? o.edge : o.fill, width: 1.5, alpha: o.alpha })
  if (o.next || o.shifted) paintDashed(g, o.x, o.y, o.w, o.h, o.radius, o.edge, 0.8 * o.alpha)
  if (o.hands && o.h > 14) {
    const tx = o.hand === 'rh' ? o.x + o.w - 3.5 : o.x + 1.5
    g.rect(tx, o.y + 3, 2, Math.max(1, o.h - 6))
    g.fill({ color: o.fill, alpha: o.alpha })
  }
}

function paintPetal(g: Graphics, o: Parameters<typeof paintBody>[1]): void {
  const alpha = (o.next ? 0.72 : 0.94) * o.alpha
  const cx = o.x + o.w / 2
  if (o.hand === 'lh') {
    g.poly([
      cx,
      o.y + 1,
      o.x + o.w * 0.12,
      o.y + o.h * 0.62,
      cx,
      o.y + o.h,
      o.x + o.w * 0.88,
      o.y + o.h * 0.62,
    ])
  } else {
    g.ellipse(cx, o.y + o.h / 2, o.w * 0.46, o.h / 2)
  }
  g.fill({ color: o.fill, alpha })
  if (o.soft && o.hand === 'rh' && o.h > 12) {
    g.ellipse(cx, o.y + o.h * 0.28, o.w * 0.16, Math.min(6, o.h * 0.12))
    g.fill({ color: 0xfff8ee, alpha: 0.28 * o.alpha })
  }
  if (o.next || o.shifted) paintDashed(g, o.x, o.y, o.w, o.h, o.radius, o.edge, 0.75 * o.alpha)
}

function paintLanding(
  args: PaintArgs,
  o: {
    x: number
    w: number
    bottom: number
    color: number
    alpha: number
    active: boolean
    end: number
    hand: Hand
    shape: NoteShapeId
    glowScale: number
    dimmed: boolean
  },
): void {
  if (!args.prefs.noteLandingBloom || o.dimmed || o.alpha < 0.4) return
  const since = args.currentTime - o.end
  const linger = args.reduced ? 0.15 : 0.22
  const alive = o.active || (since >= 0 && since < linger)
  if (!alive) return
  const max = args.dense ? 8 : 48
  if (args.pools.used >= max) return
  args.pools.used++
  const fade = o.active ? 1 : 1 - since / linger
  const breathe =
    args.reduced || !o.active ? 1 : 0.92 + 0.08 * Math.sin((args.currentTime / 1.2) * Math.PI * 2)
  const strength = fade * breathe * o.glowScale
  const cy = Math.min(o.bottom, args.nowLineY) - 6
  paintPool(args.landing, o.x + o.w / 2, cy, o.w, o.color, strength)
  if (o.shape !== 'petal') return
  const bloomFade = args.reduced ? (since > 0.15 ? 0 : o.active ? 0.35 : 0.35 * fade) : 0.34 * fade
  if (bloomFade <= 0.02) return
  const grown = args.reduced
    ? 1
    : Math.min(1, Math.max(0.35, (args.currentTime - (o.end - 0.2)) / 0.36))
  const spots = o.hand === 'rh' ? 5 : 4
  const cx = o.x + o.w / 2
  for (let i = 0; i < spots; i++) {
    const t = i / (spots - 1)
    const px = cx + (t - 0.5) * o.w * 1.3
    const py = cy - 4 - Math.sin(t * Math.PI) * 9 * grown
    const r = (o.hand === 'lh' ? 2.4 : 2.8) * grown
    if (o.hand === 'lh') {
      args.landing.poly([px, py - r * 1.4, px + r, py + r * 0.4, px, py + r, px - r, py + r * 0.4])
    } else {
      args.landing.circle(px, py, r)
    }
    args.landing.fill({ color: o.color, alpha: bloomFade * o.alpha })
  }
}
