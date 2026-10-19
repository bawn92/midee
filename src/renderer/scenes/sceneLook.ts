import { paintPrefs, setPaintPrefs } from '../../ui/paint'
import { type KeyboardStyleId, keyboardStyleId, setKeyboardStyle } from '../keyboardStyle'
import type { NoteShapeId } from '../noteShape'
import type { ParticleStyle } from '../particleStyles'
import { type RangeStyleId, rangeOverlay, setRangeOverlay } from '../rangeOverlay'

// The first visit to After Hours sets a club look. Later visits keep whatever
// the player chose while this scene was showing. Golden Hour and Rainy Study
// keep sharing the other look.

const KEY = 'midee.sceneLooks'
const AFTER = 'after-hours'

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

interface Store {
  shared?: SceneLook
  after?: SceneLook
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

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { shared?: unknown; after?: unknown }
    return {
      ...(parsed.shared ? { shared: parseLook(parsed.shared, captureLook()) } : {}),
      ...(parsed.after ? { after: parseLook(parsed.after, AFTER_HOURS_LOOK) } : {}),
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

function applyLook(look: SceneLook): void {
  setKeyboardStyle(look.keyboard)
  setPaintPrefs({ noteStyle: look.noteStyle })
  setRangeOverlay({
    style: look.rangeStyle,
    addonStrip: look.addonStrip,
    addonLanes: look.addonLanes,
  })
}

/** Look to apply when the scene changes, or null when the shared look stays. */
export function adoptSceneLook(fromId: string, toId: string): SceneLook | null {
  if (fromId === toId) return null
  const store = readStore()
  if (fromId === AFTER) store.after = captureLook()
  else if (toId === AFTER) store.shared = captureLook()

  let next: SceneLook | null = null
  if (toId === AFTER) {
    next = store.after ?? { ...AFTER_HOURS_LOOK }
    store.after = next
    applyLook(next)
  } else if (fromId === AFTER && store.shared) {
    next = store.shared
    applyLook(next)
  }
  writeStore(store)
  return next
}

/**
 * A reload that opens straight onto After Hours, before any visit was saved,
 * takes the club defaults once.
 */
export function primeAfterHours(themeId: string): SceneLook | null {
  if (themeId !== AFTER) return null
  const store = readStore()
  if (store.after) return null
  const look = { ...AFTER_HOURS_LOOK }
  store.after = look
  writeStore(store)
  applyLook(look)
  return look
}

/** Remember a particle the player picked while a scene was showing. */
export function rememberSceneParticle(themeId: string, particle: ParticleStyle): void {
  const store = readStore()
  if (themeId === AFTER) {
    store.after = { ...(store.after ?? captureLook()), particle }
  } else if (store.shared) {
    store.shared = { ...store.shared, particle }
  } else {
    return
  }
  writeStore(store)
}
