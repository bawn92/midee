import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clampKeyboardRange,
  FULL_PIANO_RANGE,
  formatKeyboardRange,
  getKeyboardRange,
  KEYBOARD_RANGE_STORAGE_KEY,
  pitchInRange,
  reloadKeyboardRange,
  resizeKeyboardRange,
  setKeyboardRange,
  shiftKeyboardRange,
  shiftKeyboardRangeBy,
  shiftRangeToInclude,
  subscribeKeyboardRange,
} from './keyboardRange'
import { MIDI_MAX, MIDI_MIN } from './midi/types'

afterEach(() => {
  localStorage.removeItem(KEYBOARD_RANGE_STORAGE_KEY)
  reloadKeyboardRange()
})

describe('clampKeyboardRange', () => {
  it('keeps a 24-key window that sits on the piano', () => {
    expect(clampKeyboardRange({ start: 48, size: 24 })).toEqual({ start: 48, size: 24 })
  })

  it('pulls a window that would run past C8 back onto the piano', () => {
    expect(clampKeyboardRange({ start: 100, size: 24 })).toEqual({
      start: MIDI_MAX - 24 + 1,
      size: 24,
    })
  })

  it('rejects sizes outside 12..88 and non-finite input', () => {
    expect(clampKeyboardRange({ start: 40, size: 4 }).size).toBe(12)
    expect(clampKeyboardRange({ start: 40, size: 200 })).toEqual(FULL_PIANO_RANGE)
    expect(clampKeyboardRange({ start: Number.NaN, size: Number.NaN })).toEqual(FULL_PIANO_RANGE)
  })
})

describe('shiftKeyboardRange', () => {
  const range = { start: 48, size: 24 }

  it('moves by semitones and by octaves', () => {
    expect(shiftKeyboardRange(range, -1)).toEqual({ start: 47, size: 24 })
    expect(shiftKeyboardRange(range, 12)).toEqual({ start: 60, size: 24 })
  })

  it('does not move a full piano, or a window already against the edge', () => {
    expect(shiftKeyboardRange(FULL_PIANO_RANGE, -12)).toEqual(FULL_PIANO_RANGE)
    expect(shiftKeyboardRange({ start: MIDI_MIN, size: 24 }, -1).start).toBe(MIDI_MIN)
  })
})

describe('resizeKeyboardRange', () => {
  it('shrinks around the center instead of collapsing onto A0', () => {
    // Full piano center is E4 (64.5). A 24-key window around it starts at F3.
    const next = resizeKeyboardRange(FULL_PIANO_RANGE, 24)
    expect(next).toEqual({ start: 53, size: 24 })
    expect(pitchInRange(64, next)).toBe(true)
  })
})

describe('shiftRangeToInclude', () => {
  const range = { start: 48, size: 24 } // C3–B4

  it('slides down so a lower note becomes the lowest key', () => {
    expect(shiftRangeToInclude(range, 40)).toEqual({ start: 40, size: 24 })
  })

  it('slides up so a higher note becomes the highest key', () => {
    expect(shiftRangeToInclude(range, 80)).toEqual({ start: 57, size: 24 })
  })

  it('leaves the window alone when the note is already inside or off the piano', () => {
    expect(shiftRangeToInclude(range, 60)).toEqual(range)
    expect(shiftRangeToInclude(range, 10)).toEqual(range)
    expect(shiftRangeToInclude(range, 120)).toEqual(range)
  })
})

describe('formatKeyboardRange', () => {
  it('names both ends', () => {
    expect(formatKeyboardRange({ start: 48, size: 24 })).toBe('C3\u2013B4')
  })
})

describe('keyboard range store', () => {
  it('persists across a reload', () => {
    setKeyboardRange({ start: 48, size: 24, followMidi: true })
    expect(reloadKeyboardRange()).toEqual({ start: 48, size: 24, followMidi: true })
    expect(localStorage.getItem(KEYBOARD_RANGE_STORAGE_KEY)).toContain('"followMidi":true')
  })

  it('drops a corrupt payload back to the full piano', () => {
    localStorage.setItem(KEYBOARD_RANGE_STORAGE_KEY, '{"start":"nope"}')
    expect(reloadKeyboardRange()).toEqual({ ...FULL_PIANO_RANGE, followMidi: false })
  })

  it('recenters when only the size changes', () => {
    setKeyboardRange({ size: 24 })
    expect(getKeyboardRange()).toMatchObject({ start: 53, size: 24 })
  })

  it('notifies subscribers on change and not on a no-op', () => {
    const fn = vi.fn()
    const off = subscribeKeyboardRange(fn)
    shiftKeyboardRangeBy(-12)
    expect(fn).not.toHaveBeenCalled()
    setKeyboardRange({ size: 25 })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn.mock.calls[0]?.[0]).toMatchObject({ size: 25, followMidi: false })
    off()
    setKeyboardRange({ start: 36 })
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
