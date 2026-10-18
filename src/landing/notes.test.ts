import { describe, expect, it } from 'vitest'
import { blackKeyAfter, DESKTOP_LAYOUT, frameAt, notesFor, PARKED_TIME_S } from './notes'

describe('landing notes', () => {
  it('keeps the loop inside the note budget', () => {
    expect(notesFor('desktop').length).toBe(14)
    expect(notesFor('phone').length).toBe(10)
    expect(DESKTOP_LAYOUT.speed).toBe(60)
  })

  it('parks a reduced-motion frame with notes in flight and keys lit', () => {
    const frame = frameAt(PARKED_TIME_S, 'desktop')
    const visible = frame.notes.filter((note) => note.visible)
    const lit = frame.lights.filter((light) => light.amount > 0.5)
    expect(visible.length).toBeGreaterThanOrEqual(4)
    expect(lit.length).toBeGreaterThanOrEqual(1)
    expect(frame.glow).toBeGreaterThan(0.5)
  })

  it('starts the highway mid-flight so it is never empty', () => {
    const frame = frameAt(3.6, 'desktop')
    expect(frame.notes.some((note) => note.visible)).toBe(true)
  })

  it('clips notes that have not reached the felt line off the keys', () => {
    const frame = frameAt(0.05, 'desktop')
    const falling = frame.notes.find((note) => note.visible && note.y + note.height < 496)
    expect(falling).toBeTruthy()
  })

  it('places black keys between the white keys, skipping E-F and B-C', () => {
    expect(blackKeyAfter(14)).toEqual([0, 1, 3, 4, 5, 7, 8, 10, 11, 12])
  })
})
