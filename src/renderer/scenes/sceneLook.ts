import { paintPrefs, setPaintPrefs } from '../../ui/paint'
import { type KeyboardStyleId, keyboardStyleId, setKeyboardStyle } from '../keyboardStyle'
import type { NoteShapeId } from '../noteShape'
import type { ParticleStyle } from '../particleStyles'
import { type RangeStyleId, rangeOverlay, setRangeOverlay } from '../rangeOverlay'

// After Hours and Night each keep their own look. The first visit applies
// that scene's defaults. Later visits keep whatever the player chose there.
// Golden Hour and Rainy Study keep sharing the other look.

const KEY = 'midee.sceneLooks'
const AFTER = 'after-hours'
const NIGHT = 'night'

export interface SceneLook {
  keyboard: KeyboardStyleId
  noteStyle: NoteShapeId
  rangeStyle: RangeStyleId
  addonStrip: boolean
  addonLanes: boolean
  particle: ParticleStyle
}

export const AFTER_HOURS_LOOK: SceneLook = {
  keyboard: 'synth',
  noteStyle: 'beam',
  rangeStyle: 'dim',
  addonStrip: false,
  addonLanes: false,
  particle: 'sparks',
}

type Slot = 'shared' | 'after' | 'night'

interface Store {
  shared?: SceneLook
  after?: SceneLook
  night?: SceneLook
}

const KEYBOARDS: readonly KeyboardStyleId[] = ['walnut', 'grand', 'oak', 'vintage', 'synth', 'flat']
const RANGES: readonly RangeStyleId[] = ['dim', 'outline', 'strip', 'lanes']
const NOTES: readonly NoteShapeId[] = ['classic', 'glass', 'felt', 'beam', 'outline', 'petal']
const PARTICLES: readonly ParticleStyle[] = [
  'sparks',
  'embers',
  'bloom',
  'sparkle',
  'none',
  'pearl',
  'liquid',
  'mist',
  'rain',
]

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

function parseLook(value: unknown, fallback: SceneLook): SceneLook {
  if (!value || typeof value !== 'object') return { ...fallback }
  const raw = value as Partial<SceneLook>
  return {
    keyboard: oneOf(raw.keyboard, KEYBOARDS, fallback.keyboard),
    noteStyle: oneOf(raw.noteStyle, NOTES, fallback.noteStyle),
    rangeStyle: oneOf(raw.rangeStyle, RANGES, fallback.rangeStyle),
    addonStrip: raw.addonStrip === true,
    addonLanes: raw.addonLanes === true,
    particle: oneOf(raw.particle, PARTICLES, fallback.particle),
  }
}

function slotOf(themeId: string): Slot {
  if (themeId === AFTER) return 'after'
  if (themeId === NIGHT) return 'night'
  return 'shared'
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { shared?: unknown; after?: unknown; night?: unknown }
    return {
      ...(parsed.shared ? { shared: parseLook(parsed.shared, captureLook()) } : {}),
      ...(parsed.after ? { after: parseLook(parsed.after, AFTER_HOURS_LOOK) } : {}),
      ...(parsed.night ? { night: parseLook(parsed.night, nightDefaults(captureLook())) } : {}),
    }
  } catch {
    return {}
  }
}

function writeStore(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // The applied look still holds for this visit.
  }
}

function storedParticle(fallback: ParticleStyle): ParticleStyle {
  try {
    return oneOf(localStorage.getItem('midee.particle'), PARTICLES, fallback)
  } catch {
    return fallback
  }
}

export function captureLook(): SceneLook {
  const paint = paintPrefs()
  const range = rangeOverlay()
  return {
    keyboard: keyboardStyleId(),
    noteStyle: paint.noteStyle,
    rangeStyle: range.style,
    addonStrip: range.addonStrip,
    addonLanes: range.addonLanes,
    particle: storedParticle('sparkle'),
  }
}

// Walnut, Glass, particles off. Range stays whatever the player already had.
function nightDefaults(base: SceneLook): SceneLook {
  return { ...base, keyboard: 'walnut', noteStyle: 'glass', particle: 'none' }
}

function applyLook(look: SceneLook): void {
  setKeyboardStyle(look.keyboard)
  setPaintPrefs({ noteStyle: look.noteStyle })
  setRangeOverlay({
    style: look.rangeStyle,
    addonStrip: look.addonStrip,
    addonLanes: look.addonLanes,
  })
}

function defaultsFor(slot: Slot, base: SceneLook): SceneLook {
  if (slot === 'after') return { ...AFTER_HOURS_LOOK }
  return nightDefaults(base)
}

/** Look to apply when the scene changes, or null when the shared look stays. */
export function adoptSceneLook(fromId: string, toId: string): SceneLook | null {
  if (fromId === toId) return null
  const from = slotOf(fromId)
  const to = slotOf(toId)
  if (from === to) return null
  const store = readStore()
  const current = captureLook()
  store[from] = current

  let next: SceneLook | null = null
  if (to === 'after') {
    next = store.after ?? defaultsFor('after', current)
    store.after = next
    applyLook(next)
  } else if (to === 'night') {
    next = store.night ?? defaultsFor('night', current)
    store.night = next
    applyLook(next)
  } else if (store.shared) {
    next = store.shared
    applyLook(next)
  }
  writeStore(store)
  return next
}

/**
 * A reload that opens straight onto After Hours or Night, before that visit
 * was saved, takes that scene's defaults once.
 */
export function primeSceneLook(themeId: string): SceneLook | null {
  const slot = slotOf(themeId)
  if (slot === 'shared') return null
  const store = readStore()
  if (store[slot]) return null
  const current = captureLook()
  if (!store.shared) store.shared = current
  const look = defaultsFor(slot, current)
  store[slot] = look
  writeStore(store)
  applyLook(look)
  return look
}

export function primeAfterHours(themeId: string): SceneLook | null {
  return primeSceneLook(themeId)
}

/** Remember a particle the player picked while a scene was showing. */
export function rememberSceneParticle(themeId: string, particle: ParticleStyle): void {
  const store = readStore()
  const slot = slotOf(themeId)
  const current = store[slot]
  if (!current && slot === 'shared') return
  store[slot] = { ...(current ?? captureLook()), particle }
  writeStore(store)
}
