// The slice of the piano the player's instrument can actually reach.
// A 24-key controller (ROLI Piano M and similar) only covers two octaves,
// and its octave buttons move that window. The roll, the on-screen keys,
// and wait mode all read this so a song never stalls on a key they can't press.
//
// Persisted under `midee.keyboardRange`. The default is the full 88 keys, so
// nothing changes until the player narrows it.

import { MIDI_MAX, MIDI_MIN, pitchToNoteName } from './midi/types'
import { jsonPersisted } from './persistence'

// One octave is the smallest window that's still a keyboard; 88 is a piano.
export const KEYBOARD_SIZE_MIN = 12
export const KEYBOARD_SIZE_MAX = MIDI_MAX - MIDI_MIN + 1

// Common controller sizes. 24 is two octaves (C–B), 25 is C–C.
export const KEYBOARD_SIZE_PRESETS = [24, 25, 32, 37, 49, 61, 76, 88] as const

export const KEYBOARD_RANGE_STORAGE_KEY = 'midee.keyboardRange'

export interface KeyboardRange {
  // Lowest included MIDI pitch, inclusive.
  start: number
  // Number of consecutive keys. The highest pitch is `start + size - 1`.
  size: number
}

export interface KeyboardRangePrefs extends KeyboardRange {
  // When a MIDI note lands outside the window, slide the window to include it.
  followMidi: boolean
}

export const FULL_PIANO_RANGE: KeyboardRange = {
  start: MIDI_MIN,
  size: KEYBOARD_SIZE_MAX,
}

const FULL_PREFS: KeyboardRangePrefs = { ...FULL_PIANO_RANGE, followMidi: false }

export function rangeEnd(range: KeyboardRange): number {
  return range.start + range.size - 1
}

export function pitchInRange(pitch: number, range: KeyboardRange): boolean {
  return pitch >= range.start && pitch <= rangeEnd(range)
}

export function isFullPianoRange(range: KeyboardRange): boolean {
  return range.start === MIDI_MIN && range.size === KEYBOARD_SIZE_MAX
}

export function formatKeyboardRange(range: KeyboardRange): string {
  return `${pitchToNoteName(range.start)}\u2013${pitchToNoteName(rangeEnd(range))}`
}

// Keep the window on the 88-key piano. A controller can be shifted onto
// pitches the roll can't draw; those notes stay audible but aren't a target.
export function clampKeyboardRange(range: KeyboardRange): KeyboardRange {
  let size = Math.round(range.size)
  if (!Number.isFinite(size)) size = KEYBOARD_SIZE_MAX
  size = Math.max(KEYBOARD_SIZE_MIN, Math.min(KEYBOARD_SIZE_MAX, size))
  const maxStart = MIDI_MAX - size + 1
  let start = Math.round(range.start)
  if (!Number.isFinite(start)) start = MIDI_MIN
  if (start < MIDI_MIN) start = MIDI_MIN
  if (start > maxStart) start = maxStart
  return { start, size }
}

export function shiftKeyboardRange(range: KeyboardRange, semitones: number): KeyboardRange {
  if (!Number.isFinite(semitones)) return clampKeyboardRange(range)
  return clampKeyboardRange({ start: range.start + semitones, size: range.size })
}

// Changing the size keeps the current center pitch on screen, so shrinking
// from the full piano lands near the middle of the keyboard rather than on A0.
export function resizeKeyboardRange(range: KeyboardRange, size: number): KeyboardRange {
  const nextSize = clampKeyboardRange({ start: range.start, size }).size
  const center = range.start + (range.size - 1) / 2
  const start = Math.round(center - (nextSize - 1) / 2)
  return clampKeyboardRange({ start, size: nextSize })
}

// Key under a horizontal pointer. 0 is the left edge of A0, 1 the right edge of C8.
export function pitchAtRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return MIDI_MIN
  const t = Math.min(1, Math.max(0, ratio))
  const index = Math.min(KEYBOARD_SIZE_MAX - 1, Math.floor(t * KEYBOARD_SIZE_MAX))
  return MIDI_MIN + index
}

// Slide the same-sized window so `pitch` lands in the middle.
export function jumpRangeToPitch(range: KeyboardRange, pitch: number): KeyboardRange {
  const p = Math.min(MIDI_MAX, Math.max(MIDI_MIN, Math.round(pitch)))
  const start = Math.round(p - (range.size - 1) / 2)
  return clampKeyboardRange({ start, size: range.size })
}

// `grab` is how many keys the pointer sat past the low key when the drag began.
export function moveRangeByGrab(range: KeyboardRange, pitch: number, grab: number): KeyboardRange {
  if (!Number.isFinite(pitch) || !Number.isFinite(grab)) return clampKeyboardRange(range)
  return clampKeyboardRange({ start: Math.round(pitch - grab), size: range.size })
}

// Dragging an edge keeps the other edge put and snaps to a key. The window
// never shrinks below KEYBOARD_SIZE_MIN.
export function resizeRangeFromEdge(
  range: KeyboardRange,
  edge: 'start' | 'end',
  pitch: number,
): KeyboardRange {
  const p = Math.min(MIDI_MAX, Math.max(MIDI_MIN, Math.round(pitch)))
  if (edge === 'start') {
    const end = rangeEnd(range)
    const start = Math.min(p, end - KEYBOARD_SIZE_MIN + 1)
    return clampKeyboardRange({ start, size: end - start + 1 })
  }
  const start = range.start
  const end = Math.max(p, start + KEYBOARD_SIZE_MIN - 1)
  return clampKeyboardRange({ start, size: end - start + 1 })
}

// Slide `range` (same size) by the smallest amount that puts `pitch` inside.
// Pitches off the 88 keys are ignored — there's no key to show them on.
export function shiftRangeToInclude(range: KeyboardRange, pitch: number): KeyboardRange {
  if (!Number.isFinite(pitch)) return range
  const p = Math.round(pitch)
  if (p < MIDI_MIN || p > MIDI_MAX) return range
  if (pitchInRange(p, range)) return range
  if (p < range.start) return clampKeyboardRange({ start: p, size: range.size })
  return clampKeyboardRange({ start: p - range.size + 1, size: range.size })
}

function migrateKeyboardRange(raw: unknown): KeyboardRangePrefs {
  if (!raw || typeof raw !== 'object') return { ...FULL_PREFS }
  const o = raw as Record<string, unknown>
  const clamped = clampKeyboardRange({
    start: typeof o.start === 'number' ? o.start : MIDI_MIN,
    size: typeof o.size === 'number' ? o.size : KEYBOARD_SIZE_MAX,
  })
  return { ...clamped, followMidi: o.followMidi === true }
}

const persisted = jsonPersisted<KeyboardRangePrefs>(
  KEYBOARD_RANGE_STORAGE_KEY,
  { ...FULL_PREFS },
  migrateKeyboardRange,
)

type RangeListener = (prefs: KeyboardRangePrefs) => void

let current: KeyboardRangePrefs = persisted.load()
const listeners = new Set<RangeListener>()

export function getKeyboardRange(): KeyboardRangePrefs {
  return current
}

export function subscribeKeyboardRange(fn: RangeListener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function commit(next: KeyboardRangePrefs): KeyboardRangePrefs {
  if (
    next.start === current.start &&
    next.size === current.size &&
    next.followMidi === current.followMidi
  ) {
    return current
  }
  current = next
  persisted.save(current)
  for (const fn of listeners) fn(current)
  return current
}

// `size` without `start` recenters. Passing both pins the low key explicitly.
export function setKeyboardRange(partial: Partial<KeyboardRangePrefs>): KeyboardRangePrefs {
  const sizeChanged = partial.size !== undefined && partial.size !== current.size
  const startProvided = partial.start !== undefined
  let start = partial.start ?? current.start
  let size = partial.size ?? current.size
  if (sizeChanged && !startProvided) {
    const resized = resizeKeyboardRange(current, partial.size as number)
    start = resized.start
    size = resized.size
  } else {
    const clamped = clampKeyboardRange({ start, size })
    start = clamped.start
    size = clamped.size
  }
  return commit({
    start,
    size,
    followMidi: partial.followMidi ?? current.followMidi,
  })
}

export function shiftKeyboardRangeBy(semitones: number): KeyboardRangePrefs {
  const next = shiftKeyboardRange(current, semitones)
  return commit({ ...current, start: next.start, size: next.size })
}

// Tests re-read storage after planting a value, or drop back to the default
// after `localStorage.clear()`. Does not notify — callers assert `.value`.
export function reloadKeyboardRange(): KeyboardRangePrefs {
  current = persisted.load()
  return current
}
