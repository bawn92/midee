import { isBlackKey, MIDI_MAX, MIDI_MIN } from '../core/midi/types'

// About four octaves. Wide enough that a 37-key window has air on both
// sides, narrow enough that each key is a finger-width on a laptop.
export const FOCUS_SPAN = 49

const STORAGE_KEY = 'midee.keyboardFocus'

const listeners = new Set<(on: boolean) => void>()

// Default on: the logical piano stays 88 keys, the view centres on the
// controller window. `0` is the only off value so a missing key stays on.
export function keyboardFocusEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

export function setKeyboardFocusEnabled(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0')
  } catch {
    // Private mode can reject the write; the in-memory listeners still apply.
  }
  for (const fn of listeners) fn(on)
}

export function subscribeKeyboardFocus(fn: (on: boolean) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Pitch bounds for the roll. The controller window is centred inside a span
// of at least FOCUS_SPAN semitones. A full-size window, or focus turned off,
// shows every key. Edges land on white keys so the first and last columns
// are not a clipped black key.
export function focusPitchWindow(
  range: { start: number; size: number },
  enabled = true,
): { min: number; max: number } {
  const full = { min: MIDI_MIN, max: MIDI_MAX }
  if (!enabled) return full
  const span = Math.max(FOCUS_SPAN, range.size + 4)
  if (span >= MIDI_MAX - MIDI_MIN + 1) return full
  const center = range.start + (range.size - 1) / 2
  let min = Math.round(center - (span - 1) / 2)
  let max = min + span - 1
  if (min < MIDI_MIN) {
    min = MIDI_MIN
    max = min + span - 1
  }
  if (max > MIDI_MAX) {
    max = MIDI_MAX
    min = max - span + 1
  }
  if (isBlackKey(min) && min > MIDI_MIN) min -= 1
  if (isBlackKey(max) && max < MIDI_MAX) max += 1
  return { min, max }
}
