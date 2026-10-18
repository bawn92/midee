// How the playable window reads once the player lets go of it. The frosted
// glass stays up while the range is being dragged; these settings are what
// it crossfades to.

export type RangeStyleId = 'dim' | 'outline' | 'strip' | 'lanes'

export interface RangeOverlay {
  style: RangeStyleId
  addonStrip: boolean
  addonLanes: boolean
  blurWhileAdjusting: boolean
}

const KEY = 'midee.rangeOverlay'
const STYLES: readonly RangeStyleId[] = ['dim', 'outline', 'strip', 'lanes']
const FADE_MS = 320

const DEFAULTS: RangeOverlay = {
  style: 'dim',
  addonStrip: false,
  addonLanes: false,
  blurWhileAdjusting: true,
}

const listeners = new Set<() => void>()
let current: RangeOverlay = readStored()
let phase: 'glass' | 'play' = 'play'
let phaseAt = 0

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

function emit(): void {
  for (const fn of listeners) fn()
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
  current = next
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
  return overlay.style === 'strip' || overlay.addonStrip
}

export function wantsLanes(overlay: RangeOverlay = current): boolean {
  return overlay.style === 'lanes' || overlay.addonLanes
}

export function wantsDim(overlay: RangeOverlay = current): boolean {
  return overlay.style === 'dim'
}

// Glass covers the playing style. `play` means the chosen style is fully
// visible. The crossfade itself is FADE_MS; the 1.5s settle delay lives in
// the range band, which is what calls this.
export function setRangePhase(next: 'glass' | 'play'): void {
  if (phase === next) return
  phase = next
  phaseAt = performance.now()
  emit()
}

export function rangePhase(): 'glass' | 'play' {
  return phase
}

// 1 while the playing style should be opaque, 0 while the glass owns the look.
export function rangePlayAlpha(): number {
  const t = Math.min(1, (performance.now() - phaseAt) / FADE_MS)
  return phase === 'play' ? t : 1 - t
}

export function rangePhaseAnimating(): boolean {
  return performance.now() - phaseAt < FADE_MS + 40
}
