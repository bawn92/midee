// How the playable window reads once the player lets go of it. The frosted
// glass stays up while the range is being dragged; these settings are what
// it crossfades to. Global, same store as scene and keyboard style.

export type RangeStyleId = 'dim' | 'outline' | 'strip' | 'lanes'
export type RangeLayerId = 'dim' | 'outline' | 'strip' | 'lanes'

export interface RangeOverlay {
  style: RangeStyleId
  addonStrip: boolean
  addonLanes: boolean
  blurWhileAdjusting: boolean
}

const KEY = 'midee.rangeOverlay'
const STYLES: readonly RangeStyleId[] = ['dim', 'outline', 'strip', 'lanes']
const LAYERS: readonly RangeLayerId[] = ['dim', 'outline', 'strip', 'lanes']
const EASE = [0.2, 0, 0, 1] as const
const SETTLE_MS = 1500

const DEFAULTS: RangeOverlay = {
  style: 'dim',
  addonStrip: false,
  addonLanes: false,
  blurWhileAdjusting: true,
}

interface Fade {
  from: number
  to: number
  at: number
  ms: number
  delay: number
}

const listeners = new Set<() => void>()
let current: RangeOverlay = readStored()
let holds = 0
let settleUntil = 0
let suppressSettle = false
const layerFades: Record<RangeLayerId, Fade> = {
  dim: fadeTo(layerWanted('dim', current) ? 1 : 0),
  outline: fadeTo(layerWanted('outline', current) ? 1 : 0),
  strip: fadeTo(layerWanted('strip', current) ? 1 : 0),
  lanes: fadeTo(layerWanted('lanes', current) ? 1 : 0),
}
let playFade: Fade = { from: 1, to: 1, at: 0, ms: 1, delay: 0 }

function fadeTo(value: number): Fade {
  return { from: value, to: value, at: 0, ms: 1, delay: 0 }
}

function isStyle(value: unknown): value is RangeStyleId {
  return typeof value === 'string' && (STYLES as readonly string[]).includes(value)
}

function readStored(): RangeOverlay {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<RangeOverlay>
    return {
      style: isStyle(parsed.style) ? parsed.style : DEFAULTS.style,
      addonStrip: parsed.addonStrip === true,
      addonLanes: parsed.addonLanes === true,
      blurWhileAdjusting: parsed.blurWhileAdjusting !== false,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function emit(): void {
  for (const fn of listeners) fn()
}

// cubic-bezier(0.2, 0, 0, 1) — ease-out used by the range crossfade.
function easeOut(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  const [x1, y1, x2, y2] = EASE
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
  for (let i = 0; i < 6; i++) {
    const dx = slopeX(u)
    if (Math.abs(dx) < 1e-6) break
    u = Math.min(1, Math.max(0, u - (sampleX(u) - clamped) / dx))
  }
  return sampleY(u)
}

function sampleFade(fade: Fade, now: number): number {
  const elapsed = now - fade.at - fade.delay
  if (elapsed <= 0) return fade.from
  if (elapsed >= fade.ms) return fade.to
  const t = easeOut(elapsed / fade.ms)
  return fade.from + (fade.to - fade.from) * t
}

function layerWanted(id: RangeLayerId, overlay: RangeOverlay): boolean {
  if (id === 'dim') return overlay.style === 'dim'
  if (id === 'outline') return overlay.style === 'outline'
  if (id === 'strip') return overlay.style === 'strip' || overlay.addonStrip
  return overlay.style === 'lanes' || overlay.addonLanes
}

function retargetLayers(next: RangeOverlay): void {
  const now = performance.now()
  const ms = reducedMotion() ? 120 : 200
  for (const id of LAYERS) {
    const want = layerWanted(id, next) ? 1 : 0
    const shown = sampleFade(layerFades[id], now)
    layerFades[id] =
      Math.abs(shown - want) < 0.01
        ? { from: want, to: want, at: now, ms: 1, delay: 0 }
        : { from: shown, to: want, at: now, ms, delay: 0 }
  }
}

export function rangeOverlay(): RangeOverlay {
  return current
}

export function setRangeOverlay(patch: Partial<RangeOverlay>): RangeOverlay {
  const next: RangeOverlay = {
    style: patch.style && isStyle(patch.style) ? patch.style : current.style,
    addonStrip: patch.addonStrip ?? current.addonStrip,
    addonLanes: patch.addonLanes ?? current.addonLanes,
    blurWhileAdjusting: patch.blurWhileAdjusting ?? current.blurWhileAdjusting,
  }
  if (
    next.style === current.style &&
    next.addonStrip === current.addonStrip &&
    next.addonLanes === current.addonLanes &&
    next.blurWhileAdjusting === current.blurWhileAdjusting
  ) {
    return current
  }
  const layersChanged =
    next.style !== current.style ||
    next.addonStrip !== current.addonStrip ||
    next.addonLanes !== current.addonLanes
  current = next
  if (layersChanged) retargetLayers(next)
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // The in-memory choice still applies for this visit.
  }
  emit()
  return current
}

export function subscribeRangeOverlay(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function wantsStrip(overlay: RangeOverlay = current): boolean {
  return layerWanted('strip', overlay)
}

export function wantsLanes(overlay: RangeOverlay = current): boolean {
  return layerWanted('lanes', overlay)
}

export function wantsDim(overlay: RangeOverlay = current): boolean {
  return layerWanted('dim', overlay)
}

export function wantsOutline(overlay: RangeOverlay = current): boolean {
  return layerWanted('outline', overlay)
}

// Pointer is down on the window, a handle, the mini map, or the range card,
// or calibration is armed.
export function holdRangeAdjust(): void {
  holds += 1
  suppressSettle = false
  emit()
}

export function releaseRangeAdjust(): void {
  holds = Math.max(0, holds - 1)
  if (holds > 0) return
  settleUntil = suppressSettle ? 0 : performance.now() + SETTLE_MS
  suppressSettle = false
  emit()
}

// A discrete resize: arrow keys, steppers, or Fit to range.
export function pulseRangeAdjust(): void {
  if (holds > 0) return
  suppressSettle = false
  settleUntil = performance.now() + SETTLE_MS
  emit()
}

// Playback started, or a note-on arrived. Ends the settle immediately.
// A pointer that is still down keeps the frost until it lifts.
export function finishRangeAdjust(): void {
  if (holds > 0) {
    if (!suppressSettle) {
      suppressSettle = true
      emit()
    }
    return
  }
  if (settleUntil === 0) return
  settleUntil = 0
  emit()
}

export function rangeAdjusting(): boolean {
  return holds > 0 || performance.now() < settleUntil
}

export function rangeGlassOpen(): boolean {
  return current.blurWhileAdjusting && rangeAdjusting()
}

export function rangeSettleRemaining(): number {
  if (holds > 0) return 0
  return Math.max(0, settleUntil - performance.now())
}

export function setRangePhase(next: 'glass' | 'play'): void {
  const now = performance.now()
  const shown = sampleFade(playFade, now)
  const target = next === 'play' ? 1 : 0
  if (playFade.to === target) return
  const reduced = reducedMotion()
  playFade = {
    from: shown,
    to: target,
    at: now,
    ms: reduced ? 120 : next === 'play' ? 300 : 150,
    delay: reduced || next !== 'play' ? 0 : 60,
  }
  emit()
}

export function rangePhase(): 'glass' | 'play' {
  return playFade.to === 1 ? 'play' : 'glass'
}

// 1 while the playing style should be opaque. The fade starts 60ms after
// Adjusting ends, then eases over 300ms. The return to glass is 150ms.
export function rangePlayAlpha(): number {
  return sampleFade(playFade, performance.now())
}

// Primary style plus add-ons, with the phase crossfade already applied.
export function rangeLayerAlpha(id: RangeLayerId): number {
  return sampleFade(layerFades[id], performance.now()) * rangePlayAlpha()
}

export function rangePhaseAnimating(): boolean {
  const now = performance.now()
  if (now < playFade.at + playFade.delay + playFade.ms + 40 && playFade.from !== playFade.to) {
    return true
  }
  for (const id of LAYERS) {
    const fade = layerFades[id]
    if (now < fade.at + fade.ms + 40 && fade.from !== fade.to) return true
  }
  return false
}

export function resetRangeOverlayForTests(): void {
  holds = 0
  settleUntil = 0
  suppressSettle = false
  current = { ...DEFAULTS }
  layerFades.dim = fadeTo(1)
  layerFades.outline = fadeTo(0)
  layerFades.strip = fadeTo(0)
  layerFades.lanes = fadeTo(0)
  playFade = { from: 1, to: 1, at: 0, ms: 1, delay: 0 }
  try {
    localStorage.removeItem(KEY)
  } catch {
    // jsdom always has storage; ignore a locked one.
  }
}
