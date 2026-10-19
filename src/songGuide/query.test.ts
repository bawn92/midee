import { describe, expect, it } from 'vitest'
import { FULL_PIANO_RANGE } from '../core/keyboardRange'
import { guideForMidi } from './index'
import { barAt, fingersAt, loopShouldWrap, snapshot } from './query'
import { untitledGSharpMinor as guide } from './untitledGSharpMinor'

const FULL = {
  ...FULL_PIANO_RANGE,
  followMidi: false,
  controllerLow: null,
  calibrated: false,
  fitToRange: true,
}

describe('untitled in G# minor guide', () => {
  it('counts bars at two seconds, so 0:20 is bar 11', () => {
    expect(barAt(0, guide.secondsPerBar)).toBe(1)
    expect(barAt(20, guide.secondsPerBar)).toBe(11)
    expect(barAt(22, guide.secondsPerBar)).toBe(12)
  })

  it('names the section, the chord, and where that chord sits in the loop', () => {
    const at = snapshot(guide, 20)
    expect(at.section?.name).toBe('Melody')
    expect(at.chord).toBe('E')
    expect(at.loop?.chords).toEqual(['G#m', 'C#m', 'E', 'G#m', 'C#m', 'F#', 'G#m'])
    expect(at.loop?.chords[at.loop.index]).toBe('E')
    expect(at.step?.order).toBe(1)
  })

  it('highlights the two G#m bars of the climax as different steps', () => {
    expect(snapshot(guide, 195).loop?.index).toBe(2)
    expect(snapshot(guide, 196).loop?.index).toBe(3)
    expect(snapshot(guide, 196).chord).toBe('G#m')
  })

  it('counts the rocking pattern and the melody statements', () => {
    expect(snapshot(guide, 131).pattern).toEqual({ label: 'Pattern', n: 3, total: 8 })
    expect(snapshot(guide, 30).statement).toEqual({ label: 'Melody', n: 2, total: 4 })
  })

  it('warns ahead of the jump and states the replay', () => {
    expect(snapshot(guide, 54).warning).toMatch(/jump/i)
    expect(snapshot(guide, 53).warning).toBeNull()
    expect(snapshot(guide, 80).fact).toMatch(/1–61/)
    expect(snapshot(guide, 122).endurance).toMatch(/wrist/i)
  })

  it('uses melody fingers, including the slide from A#4 to B4', () => {
    const cluster = [{ pitch: 71, time: 24, duration: 0.4 }]
    const plain = fingersAt(guide, cluster, 24, { transpose: 0, range: FULL, hand: 'both' })
    expect(plain).toEqual([expect.objectContaining({ sourcePitch: 71, finger: 1, hand: 'right' })])
    const slid = fingersAt(
      guide,
      [
        { pitch: 70, time: 23.2, duration: 0.4 },
        { pitch: 71, time: 24, duration: 0.4 },
      ],
      24,
      { transpose: 0, range: FULL, hand: 'both' },
    )
    expect(slid.find((m) => m.sourcePitch === 71)?.finger).toBe(2)
  })

  it('puts a folded note’s finger on the key inside the window and skips the other hand', () => {
    const notes = [{ pitch: 84, time: 0.2, duration: 1 }]
    const range = { ...FULL, start: 48, size: 24 }
    const folded = fingersAt(guide, notes, 0.2, {
      transpose: 0,
      range,
      hand: 'both',
      lookahead: 0,
    })
    // Bar 1 has no fingering rule, so nothing is numbered.
    expect(folded).toEqual([])
    const melody = [{ pitch: 80, time: 24, duration: 0.5 }]
    const window = { ...FULL, start: 60, size: 24, fitToRange: true }
    const marks = fingersAt(guide, melody, 24, { transpose: 0, range: window, hand: 'both' })
    expect(marks[0]?.drawPitch).toBe(80)
    expect(marks[0]?.finger).toBe(5)
    const leftOnly = fingersAt(guide, melody, 24, { transpose: 0, range: window, hand: 'left' })
    expect(leftOnly).toEqual([])
  })

  it('numbers a right-hand octave 1 and 5, and 4 when the top key is black', () => {
    const white = fingersAt(
      guide,
      [
        { pitch: 71, time: 90, duration: 0.5 },
        { pitch: 83, time: 90, duration: 0.5 },
      ],
      90,
      { transpose: 0, range: FULL, hand: 'both' },
    )
    expect(white.find((m) => m.sourcePitch === 71)?.finger).toBe(1)
    expect(white.find((m) => m.sourcePitch === 83)?.finger).toBe(5)
    const black = fingersAt(
      guide,
      [
        { pitch: 61, time: 90, duration: 0.5 },
        { pitch: 73, time: 90, duration: 0.5 },
      ],
      90,
      { transpose: 0, range: FULL, hand: 'both' },
    )
    expect(black.find((m) => m.sourcePitch === 73)?.finger).toBe(4)
  })

  it('wraps a playing loop and leaves a paused one alone', () => {
    const loop = { start: 20, end: 52 }
    expect(loopShouldWrap(52, loop, true)).toBe(true)
    expect(loopShouldWrap(40, loop, true)).toBe(false)
    expect(loopShouldWrap(52, loop, false)).toBe(false)
  })

  it('attaches only to this file', () => {
    const midi = {
      duration: 483.12,
      tracks: [{ notes: new Array(3445) }],
    }
    expect(guideForMidi(midi as never)?.id).toBe(guide.id)
    expect(guideForMidi({ duration: 30, tracks: [{ notes: [] }] } as never)).toBeNull()
  })
})
