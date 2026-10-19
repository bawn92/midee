// After Hours light show. Beams, an LED wall, and a beat strobe.
// Flashes are at least 340ms apart, so the rate stays under 3 per second.

export const STROBE_MIN_MS = 340
export const STROBE_PEAK = 0.16
export const STROBE_DECAY = 22
const STROBE_KEY = 'midee.strobe'
const PITCH = 14
const RH: readonly [number, number, number] = [34, 232, 255]
const LH: readonly [number, number, number] = [255, 63, 164]

export interface AfterHoursHit {
  /** 0–1 across the stage. */
  u: number
  hand: 'L' | 'R'
  v: number
}

export interface AfterHoursState {
  cols: number
  energy: Float32Array
  hue: Float32Array
  flash: number
  lastFlashMs: number
  kick: number
  time: number
  halfBar: number
}

const listeners = new Set<(on: boolean) => void>()
let strobeOn = readStrobe()

function readStrobe(): boolean {
  try {
    const raw = localStorage.getItem(STROBE_KEY)
    if (raw === 'off') return false
    if (raw === 'on') return true
  } catch {
    // Private mode keeps the default, which is on.
  }
  return true
}

function publishStrobe(): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.strobe = strobeOn ? 'on' : 'off'
}

publishStrobe()

export function strobeEnabled(): boolean {
  return strobeOn
}

export function setStrobeEnabled(on: boolean): void {
  if (strobeOn === on) return
  strobeOn = on
  try {
    localStorage.setItem(STROBE_KEY, on ? 'on' : 'off')
  } catch {
    // The in-memory switch still applies for this visit.
  }
  publishStrobe()
  for (const fn of listeners) fn(on)
}

export function subscribeStrobe(fn: (on: boolean) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Next flash time, or null when the gate holds the pulse. */
export function nextFlashMs(
  nowMs: number,
  lastMs: number,
  enabled: boolean,
  reduced: boolean,
): number | null {
  if (!enabled || reduced) return null
  if (nowMs - lastMs < STROBE_MIN_MS) return null
  return nowMs
}

export function halfBarIndex(timeSec: number, bpm: number): number {
  const half = (60 / Math.max(1, bpm)) * 2
  return Math.floor(Math.max(0, timeSec) / half)
}

export function createAfterHoursState(width: number): AfterHoursState {
  const cols = Math.max(8, Math.ceil(width / PITCH) + 1)
  return {
    cols,
    energy: new Float32Array(cols),
    hue: new Float32Array(cols * 3),
    flash: 0,
    lastFlashMs: Number.NEGATIVE_INFINITY,
    kick: 0,
    time: 0,
    halfBar: -1,
  }
}

export function exciteAfterHours(state: AfterHoursState, hits: readonly AfterHoursHit[]): void {
  for (const hit of hits) {
    const col = hit.hand === 'R' ? RH : LH
    const c0 = Math.round(hit.u * (state.cols - 1))
    const span = Math.max(2, Math.round(state.cols * 0.03))
    for (let d = -span * 2; d <= span * 2; d++) {
      const c = c0 + d
      if (c < 0 || c >= state.cols) continue
      const w = Math.exp(-(d * d) / (2 * span * span)) * hit.v
      const energy = state.energy
      const hue = state.hue
      if (!energy || !hue) continue
      energy[c] = Math.min(1.25, (energy[c] ?? 0) + w * 0.85)
      for (let j = 0; j < 3; j++) {
        const i = c * 3 + j
        hue[i] = (hue[i] ?? 0) * (1 - w * 0.7) + col[j]! * w * 0.7
      }
    }
  }
}

export function stepAfterHours(
  state: AfterHoursState,
  dt: number,
  nowMs: number,
  opts: { reduced: boolean; beat: boolean },
): void {
  const step = Math.max(0, Math.min(0.05, dt))
  state.time += step
  const decay = Math.exp(-step * (opts.reduced ? 1.2 : 2.6))
  const energy = state.energy
  if (energy) {
    for (let c = 0; c < state.cols; c++) energy[c] = (energy[c] ?? 0) * decay
  }
  state.kick *= Math.exp(-step * 7)
  state.flash *= Math.exp(-step * STROBE_DECAY)
  if (opts.beat) {
    state.kick = 1
    const at = nextFlashMs(nowMs, state.lastFlashMs, strobeOn, opts.reduced)
    if (at !== null) {
      state.lastFlashMs = at
      state.flash = 1
    }
  }
}

export function paintAfterHours(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: AfterHoursState,
  rollRatio: number,
  reduced: boolean,
): void {
  const w = Math.max(2, width)
  const h = Math.max(2, height)
  const roll = Math.max(1, Math.min(h, h * rollRatio))
  ctx.clearRect(0, 0, w, h)
  const wash = ctx.createLinearGradient(0, 0, 0, h)
  wash.addColorStop(0, '#0e0f17')
  wash.addColorStop(1, '#050509')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, w, h)

  const pitch = w / state.cols
  const rows = Math.max(4, Math.ceil(roll / pitch))
  const base = 0.07 + state.kick * 0.05 * (reduced ? 0 : 1)
  for (let c = 0; c < state.cols; c++) {
    const e = state.energy?.[c] ?? 0
    const lit = e * rows * 0.95
    const hr = state.hue?.[c * 3] || 40
    const hg = state.hue?.[c * 3 + 1] || 40
    const hb = state.hue?.[c * 3 + 2] || 70
    for (let r = 0; r < rows; r++) {
      const fromBottom = rows - 1 - r
      let alpha = base * (0.55 + 0.45 * Math.abs(Math.sin(c * 0.7 + r * 1.3)))
      let red = 150
      let green = 160
      let blue = 230
      if (fromBottom < lit) {
        const k = 1 - fromBottom / Math.max(lit, 1)
        alpha = (0.35 + 0.65 * Math.min(1, e * 1.2) * (0.55 + 0.45 * k)) * 0.9
        red = hr
        green = hg
        blue = hb
      }
      ctx.fillStyle = `rgba(${red | 0},${green | 0},${blue | 0},${alpha})`
      ctx.fillRect(c * pitch + pitch * 0.22, r * pitch + pitch * 0.22, pitch * 0.56, pitch * 0.56)
    }
  }

  const fade = ctx.createLinearGradient(0, 0, 0, roll)
  fade.addColorStop(0, 'rgba(5,5,9,0.55)')
  fade.addColorStop(0.35, 'rgba(5,5,9,0)')
  fade.addColorStop(1, 'rgba(5,5,9,0.72)')
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, w, roll)

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  const haze: Array<[string, number, number, number]> = reduced
    ? [
        ['#9d7bff', 0.3, 0.55, 0.5],
        ['#22e8ff', 0.7, 0.4, 0.4],
        ['#ff3fa4', 0.15, 0.7, 0.38],
      ]
    : [
        ['#9d7bff', 0.3 + 0.1 * Math.sin(state.time * 0.13), 0.55, 0.5],
        ['#22e8ff', 0.7 + 0.08 * Math.sin(state.time * 0.11 + 1), 0.4, 0.4],
        ['#ff3fa4', 0.15 + 0.1 * Math.cos(state.time * 0.09), 0.7, 0.38],
      ]
  for (const [color, x, y, radius] of haze) {
    const g = ctx.createRadialGradient(w * x, h * y, 0, w * x, h * y, Math.max(w, h) * radius)
    g.addColorStop(0, hexAlpha(color, 0.14))
    g.addColorStop(1, hexAlpha(color, 0))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }

  const beams = ['#22e8ff', '#ffffff', '#c6ff3d', '#ff3fa4']
  const xs = [0.14, 0.38, 0.62, 0.86]
  for (let i = 0; i < 4; i++) {
    const sweep = reduced ? 0 : Math.sin(state.time * 0.35 * (i % 2 ? 1 : -1) + i) * 0.44
    const ang = sweep + (i - 1.5) * 0.12
    const ox = w * xs[i]!
    const length = h * 1.2
    const spread = 0.07
    const pulse = reduced ? 0.55 : 0.45 + 0.55 * state.kick
    const color = beams[i]!
    const g = ctx.createLinearGradient(ox, 0, ox + Math.sin(ang) * length, Math.cos(ang) * length)
    g.addColorStop(0, hexAlpha(color, 0.55 * pulse))
    g.addColorStop(0.55, hexAlpha(color, 0.16 * pulse))
    g.addColorStop(1, hexAlpha(color, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(ox, 0)
    ctx.lineTo(ox + Math.sin(ang - spread) * length, Math.cos(ang - spread) * length)
    ctx.lineTo(ox + Math.sin(ang + spread) * length, Math.cos(ang + spread) * length)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()

  const vignette = ctx.createRadialGradient(
    w * 0.5,
    h * 0.42,
    Math.min(w, h) * 0.2,
    w * 0.5,
    h * 0.45,
    Math.max(w, h) * 0.72,
  )
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, w, h)

  if (!reduced && state.flash > 0.02) {
    ctx.fillStyle = `rgba(242,255,255,${STROBE_PEAK * state.flash})`
    ctx.fillRect(0, 0, w, roll)
  }
}

function hexAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${alpha})`
}
