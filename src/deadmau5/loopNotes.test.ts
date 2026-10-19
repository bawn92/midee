import { describe, expect, it } from 'vitest'
import { audibleDuration, type MidiNote } from '../core/midi/types'
import { noteInLoop, notesForLoop } from './loopNotes'

function note(time: number, duration: number, releaseAt?: number): MidiNote {
  return { pitch: 60, time, duration, velocity: 0.8, ...(releaseAt ? { releaseAt } : {}) }
}

describe('practice loop boundaries', () => {
  const start = 2
  const end = 4

  it('includes a note whose onset is exactly the loop start, once', () => {
    const onset = note(start, 0.5)
    expect(notesForLoop([onset], start, end)).toEqual([onset])
    expect(notesForLoop([onset, onset], start, end)).toHaveLength(2)
    expect(noteInLoop(onset, start, end)).toBe(true)
  })

  it('excludes a note whose onset is exactly the loop end', () => {
    const seam = note(end, 1)
    expect(notesForLoop([seam], start, end)).toEqual([])
    expect(notesForLoop([seam], end, end + 2)).toEqual([seam])
  })

  it('plays a boundary onset in exactly one of two adjacent passes', () => {
    const seam = note(end, 0.75)
    const first = notesForLoop([seam], start, end)
    const second = notesForLoop([seam], end, end + 2)
    expect(first).toEqual([])
    expect(second).toEqual([seam])
  })

  it('keeps the full duration of a note that crosses the loop end', () => {
    const crossing = note(3.5, 1.5)
    const [kept] = notesForLoop([crossing], start, end)
    expect(kept).toBe(crossing)
    expect(kept?.duration).toBe(1.5)
  })

  it('keeps a pedal tail that rings past the loop end', () => {
    const pedalled = note(3, 0.5, 6)
    const [kept] = notesForLoop([pedalled], start, end)
    expect(kept).toBe(pedalled)
    expect(audibleDuration(kept!)).toBe(3)
  })

  it('excludes a note that started before the loop, even if it sustains into it', () => {
    const held = note(1.5, 2)
    expect(notesForLoop([held], start, end)).toEqual([])
    expect(notesForLoop([held], 0, start)).toEqual([held])
  })

  it('excludes a zero-duration note and an empty or inverted region', () => {
    expect(notesForLoop([note(start, 0)], start, end)).toEqual([])
    expect(notesForLoop([note(start, 1)], end, start)).toEqual([])
    expect(notesForLoop([note(start, 1)], start, start)).toEqual([])
  })
})
