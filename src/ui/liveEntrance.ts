// Timing for the Live entrance and the return Home. Transform and opacity
// only: the keyboard's vertical offset, the lamp and shadow, the roll, and
// a per-key wash. Nothing here blocks the audio clock or the key lights.
//
// The whole entrance stays under 900ms. The ripple is 12ms per white-key
// column (a black key shares the white key it sits on) so 88 keys can sweep
// left to right without running past that budget.

import { isBlackKey, MIDI_MAX, MIDI_MIN } from '../core/midi/types'

export const LIVE_LIFT_PX = 12
export const LIVE_LIFT_MS = 260
export const LIVE_STAGGER_MS = 30
export const LIVE_RISE_MS = 520
export const LIVE_OVERSHOOT_PX = 6
export const LIVE_RISE_EASE = 'cubic-bezier(0.34, 1.3, 0.64, 1)'
export const LIVE_SHIMMER_STEP_MS = 12
export const LIVE_SHIMMER_AT = 160
export const LIVE_SHIMMER_KEY_MS = 80
export const LIVE_SHIMMER_PEAK = 0.16
export const LIVE_ROLL_AT = 520
export const LIVE_ROLL_MS = 200
export const LIVE_GLIDE_AT = 560
export const LIVE_GLIDE_MS = 240
export const LIVE_OUT_MS = 520
export const LIVE_OUT_ROLL_MS = 180
export const LIVE_BUDGET_MS = 900

const RISE_X1 = 0.34
const RISE_Y1 = 1.3
const RISE_X2 = 0.64
const RISE_Y2 = 1

const COLUMN_OF: number[] = []
{
  let column = -1
  for (let pitch = MIDI_MIN; pitch <= MIDI_MAX; pitch++) {
    if (!isBlackKey(pitch)) column += 1
    COLUMN_OF[pitch] = Math.max(0, column)
  }
}

export const WHITE_KEY_COLUMNS = (COLUMN_OF[MIDI_MAX] ?? 0) + 1

// Last key's wash ends as the entrance ends. Rise, roll, and range finish earlier.
export const LIVE_IN_END_MS =
  LIVE_SHIMMER_AT + (WHITE_KEY_COLUMNS - 1) * LIVE_SHIMMER_STEP_MS + LIVE_SHIMMER_KEY_MS

function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function sampleBezier(t: number, x1: number, y1: number, x2: number, y2: number): number {
  const clamped = clamp01(t)
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sampleX = (u: number) => ((ax * u + bx) * u + cx) * u
  const sampleY = (u: number) => ((ay * u + by) * u + cy) * u
  const slopeX = (u: number) => (3 * ax * u + 2 * bx) * u + cx
  let u = clamped
  for (let i = 0; i < 8; i++) {
    const dx = slopeX(u)
    if (Math.abs(dx) < 1e-6) break
    u = Math.min(1, Math.max(0, u - (sampleX(u) - clamped) / dx))
  }
  return sampleY(u)
}

function bezierPeak(y1: number, y2: number): number {
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sampleY = (u: number) => ((ay * u + by) * u + cy) * u
  let peak = 1
  for (let i = 0; i <= 1000; i++) peak = Math.max(peak, sampleY(i / 1000))
  return peak
}

const RISE_PEAK = bezierPeak(RISE_Y1, RISE_Y2)
const RISE_OVER = Math.max(0.0001, RISE_PEAK - 1)

function easeOutSoft(t: number): number {
  return sampleBezier(t, 0.2, 0, 0, 1)
}

// Distance below the resting keyboard. Negative is the capped overshoot.
export function riseOffset(elapsedMs: number, height: number): number {
  if (height <= 0) return 0
  const eased = sampleBezier(clamp01(elapsedMs / LIVE_RISE_MS), RISE_X1, RISE_Y1, RISE_X2, RISE_Y2)
  if (eased <= 1) return (1 - eased) * height
  const px = ((eased - 1) / RISE_OVER) * LIVE_OVERSHOOT_PX
  return -Math.min(LIVE_OVERSHOOT_PX, px)
}

export function whiteKeyColumn(pitch: number): number {
  return COLUMN_OF[pitch] ?? 0
}

// 0 outside this key's slot. Peaks at LIVE_SHIMMER_PEAK halfway through it.
export function shimmerStrength(elapsedMs: number, column: number): number {
  const local = elapsedMs - LIVE_SHIMMER_AT - column * LIVE_SHIMMER_STEP_MS
  if (local <= 0 || local >= LIVE_SHIMMER_KEY_MS) return 0
  return Math.sin((local / LIVE_SHIMMER_KEY_MS) * Math.PI) * LIVE_SHIMMER_PEAK
}

export function glideRange(
  t: number,
  targetStart: number,
  targetEnd: number,
): { start: number; end: number } {
  const eased = easeOutSoft(clamp01(t))
  return {
    start: Math.round(MIDI_MIN + (targetStart - MIDI_MIN) * eased),
    end: Math.round(MIDI_MAX + (targetEnd - MIDI_MAX) * eased),
  }
}

export interface LiveFrame {
  keyboardY: number
  light: number
  roll: number
  shimmerMs: number | null
  rangeT: number | null
  done: boolean
}

export function sampleLiveIn(elapsedMs: number, height: number): LiveFrame {
  const done = elapsedMs >= LIVE_IN_END_MS
  if (done) {
    return { keyboardY: 0, light: 1, roll: 1, shimmerMs: null, rangeT: 1, done: true }
  }
  const rollElapsed = elapsedMs - LIVE_ROLL_AT
  const glideElapsed = elapsedMs - LIVE_GLIDE_AT
  return {
    keyboardY: riseOffset(elapsedMs, height),
    light: clamp01(elapsedMs / (LIVE_RISE_MS * 0.85)),
    roll: rollElapsed <= 0 ? 0 : clamp01(rollElapsed / LIVE_ROLL_MS),
    shimmerMs: elapsedMs,
    // Full piano until the keyboard has landed, then the window closes in.
    rangeT: glideElapsed <= 0 ? 0 : clamp01(glideElapsed / LIVE_GLIDE_MS),
    done: false,
  }
}

export function sampleLiveOut(elapsedMs: number, fromY: number, height: number): LiveFrame {
  const done = elapsedMs >= LIVE_OUT_MS
  const span = Math.max(0, height - fromY)
  const t = clamp01(elapsedMs / LIVE_OUT_MS)
  const sunk = fromY + span * t * t * t
  if (done) {
    return { keyboardY: height, light: 0, roll: 0, shimmerMs: null, rangeT: null, done: true }
  }
  return {
    keyboardY: sunk,
    light: 1 - t,
    roll: 1 - clamp01(elapsedMs / LIVE_OUT_ROLL_MS),
    shimmerMs: null,
    rangeT: null,
    done: false,
  }
}

export class LiveMotionClock {
  kind: 'idle' | 'in' | 'out' = 'idle'
  private started = 0
  private height = 0
  private fromY = 0

  get active(): boolean {
    return this.kind !== 'idle'
  }

  beginIn(now: number, height: number): void {
    this.kind = 'in'
    this.started = now
    this.height = height
    this.fromY = height
  }

  beginOut(now: number, fromY: number, height: number): void {
    this.kind = 'out'
    this.started = now
    this.height = height
    this.fromY = fromY
  }

  stop(): void {
    this.kind = 'idle'
  }

  sample(now: number): LiveFrame {
    const elapsed = Math.max(0, now - this.started)
    if (this.kind === 'out') return sampleLiveOut(elapsed, this.fromY, this.height)
    return sampleLiveIn(elapsed, this.height)
  }
}
