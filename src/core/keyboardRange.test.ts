import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  adoptControllerNote,
  clampKeyboardRange,
  detectControllerOctaveShift,
  FULL_PIANO_RANGE,
  formatKeyboardRange,
  getKeyboardRange,
  jumpRangeToPitch,
  KEYBOARD_RANGE_STORAGE_KEY,
  mapControllerPitch,
  moveRangeByGrab,
  pitchAtRatio,
  pitchInRange,
  reloadKeyboardRange,
  resizeKeyboardRange,
  resizeKeyboardRangeSnapped,
  resizeRangeFromEdge,
  setControllerCalibrateArmed,
  setKeyboardRange,
  shiftKeyboardRange,
  shiftKeyboardRangeBy,
  shiftRangeToInclude,
  snapRangeStart,
  subscribeKeyboardRange,
} from './keyboardRange'
import { MIDI_MAX, MIDI_MIN } from './midi/types'

const FULL_PREFS = {
  ...FULL_PIANO_RANGE,
  followMidi: false,
  controllerLow: null,
  calibrated: false,
}

afterEach(() => {
  localStorage.removeItem(KEYBOARD_RANGE_STORAGE_KEY)
  reloadKeyboardRange()
  setControllerCalibrateArmed(false)
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

describe('range picker geometry', () => {
  const range = { start: 48, size: 24 }

  it('maps a pointer ratio onto a key', () => {
    expect(pitchAtRatio(0)).toBe(MIDI_MIN)
    expect(pitchAtRatio(1)).toBe(MIDI_MAX)
    expect(pitchAtRatio(0.5)).toBe(MIDI_MIN + 44)
    expect(pitchAtRatio(-2)).toBe(MIDI_MIN)
    expect(pitchAtRatio(Number.NaN)).toBe(MIDI_MIN)
  })

  it('centers the window on a clicked key', () => {
    expect(jumpRangeToPitch(range, 60)).toEqual({ start: 49, size: 24 })
    expect(jumpRangeToPitch(range, MIDI_MIN)).toEqual({ start: MIDI_MIN, size: 24 })
    expect(jumpRangeToPitch(range, MIDI_MAX).start).toBe(MIDI_MAX - 23)
  })

  it('slides by the grab offset and stays on the piano', () => {
    expect(moveRangeByGrab(range, 70, 10)).toEqual({ start: 60, size: 24 })
    expect(moveRangeByGrab(range, MIDI_MIN, 0)).toEqual({ start: MIDI_MIN, size: 24 })
  })

  it('resizes from either edge without dropping below the minimum', () => {
    expect(resizeRangeFromEdge(range, 'end', 80)).toEqual({ start: 48, size: 33 })
    expect(resizeRangeFromEdge(range, 'end', 48)).toEqual({ start: 48, size: 12 })
    expect(resizeRangeFromEdge(range, 'start', 40)).toEqual({ start: 40, size: 32 })
    expect(resizeRangeFromEdge(range, 'start', 80)).toEqual({ start: 60, size: 12 })
  })
})

describe('snapRangeStart', () => {
  it('snaps compact keyboards onto C, 76 onto E, and 88 onto A0', () => {
    // A 24-key window around the middle of the piano (F3) snaps down to C3.
    expect(snapRangeStart(24, 53)).toBe(48)
    expect(snapRangeStart(24, 57)).toBe(60)
    expect(snapRangeStart(25, 50) % 12).toBe(0)
    expect(snapRangeStart(37, 50) % 12).toBe(0)
    expect(snapRangeStart(49, 50) % 12).toBe(0)
    expect(snapRangeStart(61, 40) % 12).toBe(0)
    // E1–G7 is the only 76-key window that fits on the piano.
    expect(snapRangeStart(76, 40)).toBe(28)
    expect(snapRangeStart(88, 40)).toBe(MIDI_MIN)
  })

  it('resizes onto that layout instead of an arbitrary center', () => {
    expect(resizeKeyboardRangeSnapped(FULL_PIANO_RANGE, 24)).toEqual({ start: 48, size: 24 })
    expect(resizeKeyboardRangeSnapped(FULL_PIANO_RANGE, 76)).toEqual({ start: 28, size: 76 })
  })
})

describe('controller mapping', () => {
  const prefs = {
    start: 60,
    size: 24,
    followMidi: false,
    controllerLow: 48,
    calibrated: true,
  }

  it('maps the calibrated lowest key onto the range start', () => {
    expect(mapControllerPitch(48, prefs)).toBe(60)
    expect(mapControllerPitch(71, prefs)).toBe(83)
  })

  it('passes notes through until a low key is known', () => {
    expect(mapControllerPitch(48, { ...prefs, controllerLow: null })).toBe(48)
  })

  it('hears an octave shift as the same physical key', () => {
    expect(detectControllerOctaveShift(60, 48, 24)).toBe(0)
    expect(detectControllerOctaveShift(72, 48, 24)).toBe(12)
    expect(detectControllerOctaveShift(36, 48, 24)).toBe(-12)
    const adopted = adoptControllerNote(72, prefs, false)
    expect(adopted.controllerLow).toBe(60)
    expect(adopted.mapped).toBe(72)
    expect(adopted.calibrating).toBe(false)
  })

  it('takes the next key as the lowest key while calibrating', () => {
    const adopted = adoptControllerNote(
      36,
      { ...prefs, controllerLow: null, calibrated: false },
      true,
    )
    expect(adopted).toMatchObject({
      controllerLow: 36,
      calibrated: true,
      calibrating: false,
      mapped: 60,
    })
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
    expect(reloadKeyboardRange()).toEqual({
      start: 48,
      size: 24,
      followMidi: true,
      controllerLow: null,
      calibrated: false,
    })
    expect(localStorage.getItem(KEYBOARD_RANGE_STORAGE_KEY)).toContain('"followMidi":true')
  })

  it('drops a corrupt payload back to the full piano', () => {
    localStorage.setItem(KEYBOARD_RANGE_STORAGE_KEY, '{"start":"nope"}')
    expect(reloadKeyboardRange()).toEqual(FULL_PREFS)
  })

  it('recenters when only the size changes', () => {
    setKeyboardRange({ size: 24 })
    expect(getKeyboardRange()).toMatchObject({ start: 53, size: 24 })
  })

  it('anchors the controller when a partial window moves, so MIDI follows it', () => {
    setKeyboardRange({ start: 48, size: 24 })
    expect(getKeyboardRange().controllerLow).toBeNull()
    shiftKeyboardRangeBy(12)
    const prefs = getKeyboardRange()
    expect(prefs).toMatchObject({ start: 60, controllerLow: 48, calibrated: false })
    expect(mapControllerPitch(48, prefs)).toBe(60)
    // A later move keeps the same physical low key.
    shiftKeyboardRangeBy(-1)
    expect(mapControllerPitch(48, getKeyboardRange())).toBe(59)
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
