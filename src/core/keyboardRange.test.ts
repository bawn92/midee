import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  adoptControllerNote,
  clampKeyboardRange,
  detectControllerOctaveShift,
  FULL_PIANO_RANGE,
  foldPitchIntoRange,
  formatKeyboardRange,
  getKeyboardRange,
  jumpRangeToPitch,
  KEYBOARD_RANGE_STORAGE_KEY,
  mapControllerPitch,
  moveRangeByGrab,
  pitchAtRatio,
  pitchInRange,
  placedPitch,
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
  fitToRange: true,
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
    fitToRange: true,
  }

  it('maps the calibrated lowest key onto the range start', () => {
    expect(mapControllerPitch(48, prefs)).toBe(60)
    expect(mapControllerPitch(71, prefs)).toBe(83)
  })

  it('passes notes through on a full piano and on an uncalibrated longer controller', () => {
    expect(mapControllerPitch(60, FULL_PREFS)).toBe(60)
    expect(
      mapControllerPitch(48, {
        ...prefs,
        start: 36,
        size: 49,
        controllerLow: null,
        calibrated: false,
      }),
    ).toBe(48)
  })

  it('maps a Piano M default low key onto the window before calibration', () => {
    // MIDI 60 is middle C. ROLI calls it C3; this app calls it C4.
    // Window C4–B5: the lowest key plays C4, not the C5 an old C3 anchor produced.
    const c4 = { ...prefs, start: 60, size: 24, controllerLow: null, calibrated: false }
    expect(mapControllerPitch(60, c4)).toBe(60)
    expect(mapControllerPitch(83, c4)).toBe(83)
    // Window C3–B4, the 24-key snap: the same physical key plays C3.
    const c3 = { ...prefs, start: 48, size: 24, controllerLow: null, calibrated: false }
    expect(mapControllerPitch(60, c3)).toBe(48)
    expect(mapControllerPitch(83, c3)).toBe(71)
    // A 25-key C-to-C controller uses the same factory low key.
    expect(mapControllerPitch(60, { ...c4, size: 25 })).toBe(60)
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
      fitToRange: true,
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

  it('keeps the factory low key when an uncalibrated window moves', () => {
    setKeyboardRange({ start: 48, size: 24 })
    expect(getKeyboardRange().controllerLow).toBeNull()
    expect(mapControllerPitch(60, getKeyboardRange())).toBe(48)
    shiftKeyboardRangeBy(12)
    const prefs = getKeyboardRange()
    expect(prefs).toMatchObject({ start: 60, controllerLow: null, calibrated: false })
    // Sliding to C4–B5 must not add another octave on top of middle C.
    expect(mapControllerPitch(60, prefs)).toBe(60)
    shiftKeyboardRangeBy(-1)
    expect(mapControllerPitch(60, getKeyboardRange())).toBe(59)
  })

  it('keeps a real calibration when the window moves', () => {
    setKeyboardRange({ start: 60, size: 24, controllerLow: 48, calibrated: true })
    shiftKeyboardRangeBy(12)
    const prefs = getKeyboardRange()
    expect(prefs).toMatchObject({ start: 72, controllerLow: 48, calibrated: true })
    expect(mapControllerPitch(48, prefs)).toBe(72)
  })

  it('drops an uncalibrated anchor saved by an older build', () => {
    localStorage.setItem(
      KEYBOARD_RANGE_STORAGE_KEY,
      JSON.stringify({
        start: 60,
        size: 24,
        followMidi: false,
        controllerLow: 48,
        calibrated: false,
        fitToRange: true,
      }),
    )
    const prefs = reloadKeyboardRange()
    expect(prefs.controllerLow).toBeNull()
    expect(prefs.calibrated).toBe(false)
    expect(mapControllerPitch(60, prefs)).toBe(60)
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

  it('fits notes into the range unless a save turned that off', () => {
    localStorage.setItem(
      KEYBOARD_RANGE_STORAGE_KEY,
      JSON.stringify({
        start: 48,
        size: 24,
        followMidi: false,
        controllerLow: null,
        calibrated: false,
      }),
    )
    expect(reloadKeyboardRange().fitToRange).toBe(true)
    localStorage.setItem(
      KEYBOARD_RANGE_STORAGE_KEY,
      JSON.stringify({
        start: 48,
        size: 24,
        followMidi: false,
        controllerLow: null,
        calibrated: false,
        fitToRange: false,
      }),
    )
    expect(reloadKeyboardRange().fitToRange).toBe(false)
  })
})

describe('foldPitchIntoRange', () => {
  const range = { start: 48, size: 24 }

  it('leaves a note that is already inside', () => {
    expect(foldPitchIntoRange(60, range)).toEqual({ pitch: 60, octaves: 0 })
  })

  it('moves by the smallest whole octave', () => {
    expect(foldPitchIntoRange(36, range)).toEqual({ pitch: 48, octaves: 1 })
    // C6 is two octaves above C4; C5 sits one key past this window.
    expect(foldPitchIntoRange(84, range)).toEqual({ pitch: 60, octaves: -2 })
  })

  it('returns null when the window cannot hold that pitch class', () => {
    // 48–58 is C through A#. B (59) has nowhere to land.
    expect(foldPitchIntoRange(59, { start: 48, size: 11 })).toBeNull()
  })

  it('placedPitch keeps the original note when fit is off', () => {
    const prefs = { ...FULL_PREFS, start: 48, size: 24, fitToRange: false }
    expect(placedPitch(36, prefs)).toBeNull()
    expect(placedPitch(60, prefs)).toEqual({ pitch: 60, octaves: 0 })
    expect(placedPitch(36, { ...prefs, fitToRange: true })).toEqual({ pitch: 48, octaves: 1 })
  })
})
