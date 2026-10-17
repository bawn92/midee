import { describe, expect, it } from 'vitest'
import { MIDI_MAX, MIDI_MIN } from '../core/midi/types'
import { FOCUS_SPAN, focusPitchWindow } from './keyboardFocus'

describe('focusPitchWindow', () => {
  it('shows the whole piano when focus is off or the window is already full', () => {
    expect(focusPitchWindow({ start: 48, size: 37 }, false)).toEqual({
      min: MIDI_MIN,
      max: MIDI_MAX,
    })
    expect(focusPitchWindow({ start: MIDI_MIN, size: 88 }, true)).toEqual({
      min: MIDI_MIN,
      max: MIDI_MAX,
    })
  })

  it('centres a short window in about four octaves and lands on white keys', () => {
    const view = focusPitchWindow({ start: 60, size: 24 }, true)
    const span = view.max - view.min + 1
    expect(span).toBeGreaterThanOrEqual(FOCUS_SPAN)
    expect(span).toBeLessThan(60)
    expect(view.min).toBeLessThanOrEqual(60)
    expect(view.max).toBeGreaterThanOrEqual(83)
    expect([0, 2, 4, 5, 7, 9, 11]).toContain(view.min % 12)
    expect([0, 2, 4, 5, 7, 9, 11]).toContain(view.max % 12)
  })
})
