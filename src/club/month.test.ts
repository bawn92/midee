import { describe, expect, it } from 'vitest'
import type { KeyboardRangePrefs } from '../core/keyboardRange'
import { MIDI_MIN, TOTAL_KEYS } from '../core/midi/types'
import { CLUB_MONTHS, currentMonth, gymnopedieOpening } from './month'
import { scoreTake } from './score'
import { notesForTake, soundingPitch } from './take'

const FULL: KeyboardRangePrefs = {
  start: MIDI_MIN,
  size: TOTAL_KEYS,
  followMidi: false,
  controllerLow: null,
  calibrated: false,
  fitToRange: true,
}

describe('October sample', () => {
  it('is eight bars of 3/4 at 72, twenty seconds, 48 notes', () => {
    const midi = gymnopedieOpening()
    expect(midi.bpm).toBe(72)
    expect(midi.timeSignature).toEqual([3, 4])
    expect(midi.duration).toBeCloseTo(20, 5)
    const count = midi.tracks.reduce((sum, track) => sum + track.notes.length, 0)
    expect(count).toBe(48)
    expect(midi.tracks.map((track) => track.hand)).toEqual(['left', 'right'])
  })

  it('scores a perfect take at 1000', () => {
    const month = CLUB_MONTHS[0]!
    const expected = notesForTake(month.midi, FULL)
    const played = expected.map((note) => ({
      pitch: note.pitch,
      time: note.time,
      velocity: note.velocity,
    }))
    const result = scoreTake(expected, played)
    expect(result.score).toBe(1000)
    expect(result.counts.perfect).toBe(48)
    expect(result.streak).toBe(48)
  })

  it('folds the bass into a 24-key window and still matches those pitches', () => {
    const month = CLUB_MONTHS[0]!
    const window: KeyboardRangePrefs = { ...FULL, start: 60, size: 24 }
    const expected = notesForTake(month.midi, window)
    expect(expected.every((note) => note.reachable)).toBe(true)
    expect(expected.every((note) => note.pitch >= 60 && note.pitch <= 83)).toBe(true)
    const opening = expected.find((note) => note.time === 0)
    expect(opening?.pitch).toBe(67)
    const played = expected.map((note) => ({
      pitch: note.pitch,
      time: note.time,
      velocity: note.velocity,
    }))
    expect(scoreTake(expected, played).score).toBe(1000)
  })

  it('marks notes the window cannot hold when fit is off', () => {
    const month = CLUB_MONTHS[0]!
    const window: KeyboardRangePrefs = { ...FULL, start: 60, size: 24, fitToRange: false }
    const expected = notesForTake(month.midi, window)
    const bass = expected.find((note) => note.time === 0)
    expect(bass).toMatchObject({ pitch: 43, reachable: false })
    const result = scoreTake(expected, [{ pitch: 43, time: 0, velocity: bass?.velocity ?? 0 }])
    expect(result.counts.perfect).toBe(0)
    expect(result.notes.find((note) => note.time === 0)?.judgement).toBe('miss')
  })

  it('maps an uncalibrated 24-key controller from middle C onto the window', () => {
    const window: KeyboardRangePrefs = { ...FULL, start: 48, size: 24 }
    expect(soundingPitch(60, window)).toBe(48)
    expect(soundingPitch(72, window)).toBe(60)
  })

  it('uses October 2026 in October and falls back to the sample in other months', () => {
    expect(currentMonth(new Date(2026, 9, 19)).id).toBe('2026-10')
    expect(currentMonth(new Date(2026, 0, 2)).id).toBe('2026-10')
  })
})
