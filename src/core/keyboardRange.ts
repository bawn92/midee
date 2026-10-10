// The slice of the piano the player's instrument covers. The on-screen
// keyboard always draws all 88 keys; this window is a highlight on that
// keyboard and the target a hardware controller is transposed onto, so its
// lowest key sounds as the window's lowest key. Wait mode only waits for
// notes inside the window.
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
  // Ignored once the controller's lowest key is known — those notes are
  // transposed into the window instead of moving it.
  followMidi: boolean
  // MIDI pitch the physical controller's lowest key sends. Null until a range
  // move anchors it or the player calibrates by pressing that key.
  controllerLow: number | null
  // True after "press your lowest key". An anchor from dragging the window
  // transposes relative to the previous window, but it is not a calibration.
  calibrated: boolean
}

export const FULL_PIANO_RANGE: KeyboardRange = {
  start: MIDI_MIN,
  size: KEYBOARD_SIZE_MAX,
}

const FULL_PREFS: KeyboardRangePrefs = {
  ...FULL_PIANO_RANGE,
  followMidi: false,
  controllerLow: null,
  calibrated: false,
}

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

// Pitch class a controller of this size is built to start on.
// 76-key pianos start on E. 88 keys are the piano itself (A0 only).
// 24, 25, 32, 37, 49, 61, and any other size start on C.
export function rangeAnchorPitchClass(size: number): number | null {
  if (size >= KEYBOARD_SIZE_MAX) return null
  if (size === 76) return 4
  return 0
}

// Nearest musically valid low key for `size`, preferring the lower key on a tie.
// 88-key windows are pinned to A0. Semitone nudges do not call this.
export function snapRangeStart(size: number, preferredStart: number): number {
  const clamped = clampKeyboardRange({ start: preferredStart, size })
  const pitchClass = rangeAnchorPitchClass(clamped.size)
  if (pitchClass === null) return MIDI_MIN
  const maxStart = MIDI_MAX - clamped.size + 1
  const baseClass = ((MIDI_MIN % 12) + 12) % 12
  let best = MIDI_MIN + ((pitchClass - baseClass + 12) % 12)
  if (best > maxStart) return clamped.start
  let bestDist = Math.abs(best - preferredStart)
  for (let start = best + 12; start <= maxStart; start += 12) {
    const dist = Math.abs(start - preferredStart)
    if (dist < bestDist) {
      bestDist = dist
      best = start
    }
  }
  return best
}

export function withSnappedStart(range: KeyboardRange): KeyboardRange {
  const clamped = clampKeyboardRange(range)
  return clampKeyboardRange({
    start: snapRangeStart(clamped.size, clamped.start),
    size: clamped.size,
  })
}

// Resize around the current center, then snap the low key to the layout for
// that size (C, E, or A0). The − / + buttons stay unsnapped so a player can
// fine-tune after a layout snap.
export function resizeKeyboardRangeSnapped(range: KeyboardRange, size: number): KeyboardRange {
  return withSnappedStart(resizeKeyboardRange(range, size))
}

function clampMidiPitch(pitch: number): number {
  if (!Number.isFinite(pitch)) return 0
  return Math.max(0, Math.min(127, Math.round(pitch)))
}

// How far to transpose a hardware note so the controller's lowest key lands
// on the window's lowest key. Uncalibrated and unanchored windows pass
// notes through.
export function controllerTranspose(prefs: KeyboardRangePrefs): number {
  if (prefs.controllerLow == null) return 0
  return prefs.start - prefs.controllerLow
}

export function mapControllerPitch(rawPitch: number, prefs: KeyboardRangePrefs): number {
  return clampMidiPitch(clampMidiPitch(rawPitch) + controllerTranspose(prefs))
}

// Smallest octave shift (a multiple of 12, or 0) that puts `rawPitch` back
// inside the calibrated span. A 24-key window is two octaves, so a note can
// fit more than one shift; the closest one wins. Ambiguous jumps of two
// octaves still need the calibrate button.
export function detectControllerOctaveShift(
  rawPitch: number,
  controllerLow: number,
  size: number,
): number {
  const raw = Math.round(rawPitch)
  const low = Math.round(controllerLow)
  const span = Math.max(1, Math.round(size))
  const high = low + span - 1
  if (raw >= low && raw <= high) return 0
  let best: number | null = null
  for (let octave = -8; octave <= 8; octave++) {
    if (octave === 0) continue
    const shift = octave * 12
    if (raw >= low + shift && raw <= high + shift) {
      if (best === null || Math.abs(shift) < Math.abs(best)) best = shift
    }
  }
  return best ?? 0
}

// Apply a calibration press or, once calibrated, an octave-button shift.
// Returns the pitch downstream (wait mode, scoring, sound) should hear.
export function adoptControllerNote(
  rawPitch: number,
  prefs: KeyboardRangePrefs,
  calibrating: boolean,
): {
  controllerLow: number | null
  calibrated: boolean
  calibrating: boolean
  mapped: number
} {
  const raw = clampMidiPitch(rawPitch)
  let controllerLow = prefs.controllerLow
  let calibrated = prefs.calibrated
  let armed = calibrating
  if (armed) {
    controllerLow = raw
    calibrated = true
    armed = false
  } else if (calibrated && controllerLow != null) {
    const shift = detectControllerOctaveShift(raw, controllerLow, prefs.size)
    if (shift !== 0) controllerLow = clampMidiPitch(controllerLow + shift)
  }
  const mapped = mapControllerPitch(raw, { ...prefs, controllerLow, calibrated })
  return { controllerLow, calibrated, calibrating: armed, mapped }
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

function readControllerLow(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const pitch = Math.round(value)
  if (pitch < 0 || pitch > 127) return null
  return pitch
}

function migrateKeyboardRange(raw: unknown): KeyboardRangePrefs {
  if (!raw || typeof raw !== 'object') return { ...FULL_PREFS }
  const o = raw as Record<string, unknown>
  const clamped = clampKeyboardRange({
    start: typeof o.start === 'number' ? o.start : MIDI_MIN,
    size: typeof o.size === 'number' ? o.size : KEYBOARD_SIZE_MAX,
  })
  return {
    ...clamped,
    followMidi: o.followMidi === true,
    controllerLow: readControllerLow(o.controllerLow),
    calibrated: o.calibrated === true,
  }
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
    next.followMidi === current.followMidi &&
    next.controllerLow === current.controllerLow &&
    next.calibrated === current.calibrated
  ) {
    return current
  }
  current = next
  persisted.save(current)
  for (const fn of listeners) fn(current)
  return current
}

// Moving a window that is already narrower than the piano anchors the
// controller to the previous low key, so the move transposes MIDI by the
// same amount. Leaving the full piano does not: the first placement just
// shows where the controller is assumed to sit, until the player calibrates
// or moves the window again.
function anchorControllerLow(
  prev: KeyboardRangePrefs,
  next: KeyboardRangePrefs,
  controllerLowSpecified: boolean,
): number | null {
  if (controllerLowSpecified) return next.controllerLow
  if (prev.controllerLow != null) return prev.controllerLow
  if (next.start !== prev.start && !isFullPianoRange(prev)) return prev.start
  return null
}

// `size` without `start` recenters. Passing both pins the low key explicitly.
// Layout snapping is the caller's job (drag, presets); − / + stay exact.
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
  const controllerLowSpecified = partial.controllerLow !== undefined
  const drafted: KeyboardRangePrefs = {
    start,
    size,
    followMidi: partial.followMidi ?? current.followMidi,
    controllerLow:
      partial.controllerLow !== undefined ? partial.controllerLow : current.controllerLow,
    calibrated: partial.calibrated ?? current.calibrated,
  }
  drafted.controllerLow = anchorControllerLow(current, drafted, controllerLowSpecified)
  return commit(drafted)
}

export function shiftKeyboardRangeBy(semitones: number): KeyboardRangePrefs {
  const next = shiftKeyboardRange(current, semitones)
  const drafted: KeyboardRangePrefs = { ...current, start: next.start, size: next.size }
  drafted.controllerLow = anchorControllerLow(current, drafted, false)
  return commit(drafted)
}

// "Press your lowest key". Not persisted — it only arms the next MIDI note.
let calibrateArmed = false
const calibrateListeners = new Set<(armed: boolean) => void>()

export function isControllerCalibrateArmed(): boolean {
  return calibrateArmed
}

export function setControllerCalibrateArmed(armed: boolean): void {
  if (calibrateArmed === armed) return
  calibrateArmed = armed
  for (const fn of calibrateListeners) fn(armed)
}

export function subscribeControllerCalibrate(fn: (armed: boolean) => void): () => void {
  calibrateListeners.add(fn)
  return () => calibrateListeners.delete(fn)
}

// Tests re-read storage after planting a value, or drop back to the default
// after `localStorage.clear()`. Does not notify — callers assert `.value`.
export function reloadKeyboardRange(): KeyboardRangePrefs {
  current = persisted.load()
  return current
}
