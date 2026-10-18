import { describe, expect, it } from 'vitest'
import { isBlackKey, type MidiNote } from '../core/midi/types'
import { KBD, keyFrame, whiteKeyCount } from './keyboardMetrics'
import { Viewport, type ViewportConfig, visibleNoteRange } from './viewport'

const note = (time: number, duration: number): MidiNote => ({
  pitch: 60,
  time,
  duration,
  velocity: 0.8,
})

describe('visibleNoteRange', () => {
  it('returns [0,0] for an empty array', () => {
    expect(visibleNoteRange([], 0, 10)).toEqual([0, 0])
  })

  it('returns the full array when all notes are in range', () => {
    const notes = [note(1, 0.5), note(2, 0.5), note(3, 0.5)]
    expect(visibleNoteRange(notes, 0, 10)).toEqual([0, 3])
  })

  it('excludes notes entirely before visStart', () => {
    // note ends at 1.0, visStart is 2.0 — should be excluded
    const notes = [note(0, 1), note(3, 0.5), note(5, 0.5)]
    const [lo, hi] = visibleNoteRange(notes, 2, 8)
    expect(notes.slice(lo, hi).map((n) => n.time)).toEqual([3, 5])
  })

  it('excludes notes starting after visEnd', () => {
    // note starts at 10.0, visEnd is 5.0 — should be excluded
    const notes = [note(1, 0.5), note(3, 0.5), note(10, 0.5)]
    const [lo, hi] = visibleNoteRange(notes, 0, 5)
    expect(notes.slice(lo, hi).map((n) => n.time)).toEqual([1, 3])
  })

  it('includes a note that started before visStart but extends into view (scan-back)', () => {
    // Long sustained note: starts at 0, lasts 10s. visStart=5, visEnd=8.
    const notes = [note(0, 10), note(6, 0.5)]
    const [lo, hi] = visibleNoteRange(notes, 5, 8)
    expect(notes.slice(lo, hi).map((n) => n.time)).toEqual([0, 6])
  })

  it('handles visStart === visEnd (active-note point query)', () => {
    // Only the note containing t=5 should be returned.
    const notes = [note(0, 3), note(3, 3), note(7, 2)]
    // note at t=3, dur=3 covers [3,6] — contains t=5
    const [lo, hi] = visibleNoteRange(notes, 5, 5)
    expect(notes.slice(lo, hi).map((n) => n.time)).toEqual([3])
  })

  it('includes a note starting exactly at visEnd', () => {
    const notes = [note(5, 1)]
    const [lo, hi] = visibleNoteRange(notes, 0, 5)
    expect(hi - lo).toBe(1)
  })

  it('excludes a note ending exactly at visStart (strict)', () => {
    // note ends at exactly visStart — not strictly inside the window
    const notes = [note(0, 2), note(3, 1)]
    // visStart=2: note(0,2) ends at 2.0, not > 2.0 → excluded
    const [lo, hi] = visibleNoteRange(notes, 2, 5)
    expect(notes.slice(lo, hi).map((n) => n.time)).toEqual([3])
  })

  it('handles a single note in range', () => {
    const notes = [note(4, 1)]
    expect(visibleNoteRange(notes, 3, 6)).toEqual([0, 1])
  })

  it('handles a single note out of range', () => {
    const notes = [note(10, 1)]
    expect(visibleNoteRange(notes, 0, 5)).toEqual([0, 0])
  })

  it('handles many notes with only the middle slice visible', () => {
    const notes = Array.from({ length: 100 }, (_, i) => note(i, 0.5))
    const [lo, hi] = visibleNoteRange(notes, 40, 60)
    // notes 40–60 start in [40, 60]; note 39 ends at 39.5 < 40, excluded
    expect(notes[lo]!.time).toBe(40)
    expect(notes[hi - 1]!.time).toBe(60)
  })

  it('multiple long notes all overlapping visStart are all included via scan-back', () => {
    // Three notes start before visStart=10 but extend past it; note at t=20 is after visEnd=15
    const notes = [note(0, 15), note(5, 12), note(8, 5), note(20, 1)]
    const [lo, hi] = visibleNoteRange(notes, 10, 15)
    expect(notes.slice(lo, hi).map((n) => n.time)).toEqual([0, 5, 8])
  })
})

const makeViewport = (overrides: Partial<ViewportConfig> = {}): Viewport =>
  new Viewport({
    canvasWidth: 1000,
    canvasHeight: 600,
    keyboardHeight: 100,
    pixelsPerSecond: 200,
    ...overrides,
  })

describe('Viewport.pitchAtPoint', () => {
  it('returns null for points outside the keyboard band', () => {
    const vp = makeViewport()
    // keyboardTop = 600 - 100 = 500
    expect(vp.pitchAtPoint(50, 100)).toBeNull() // above the keyboard
    expect(vp.pitchAtPoint(50, 700)).toBeNull() // below the canvas
  })

  it('resolves a point in the upper (black-key zone) over an overlapping region to the BLACK key', () => {
    // Narrow to a single octave so keys are wide and easy to address.
    // C4=60 (white) .. B4=71. C#4=61 is a black key that visually overlaps the
    // right edge of C4 and the left edge of D4.
    const vp = makeViewport({ pitchMin: 60, pitchMax: 71 })
    const cSharp = vp.getAllKeyPositions().get(61)!
    expect(isBlackKey(61)).toBe(true)

    const frame = keyFrame(1000, whiteKeyCount(60, 71), 100)
    const xMid = cSharp.x + cSharp.width / 2
    const keyboardTop = 500
    expect(vp.pitchAtPoint(xMid, keyboardTop + frame.keysY + 4)).toBe(61)
  })

  it('falls through to the WHITE key when the point is below the black-key zone', () => {
    const vp = makeViewport({ pitchMin: 60, pitchMax: 71 })
    const cSharp = vp.getAllKeyPositions().get(61)!
    const xMid = cSharp.x + cSharp.width / 2
    const frame = keyFrame(1000, whiteKeyCount(60, 71), 100)
    const pitch = vp.pitchAtPoint(xMid, 500 + frame.keysY + frame.blackH + 2)
    expect(pitch).not.toBeNull()
    expect(isBlackKey(pitch!)).toBe(false)
  })

  it('places the black/white zone boundary at the 88px black key', () => {
    const vp = makeViewport({ pitchMin: 60, pitchMax: 71 })
    const cSharp = vp.getAllKeyPositions().get(61)!
    const xMid = cSharp.x + cSharp.width / 2
    const frame = keyFrame(1000, whiteKeyCount(60, 71), 100)
    const boundary = 500 + frame.keysY + frame.blackH
    expect(vp.pitchAtPoint(xMid, boundary)).toBe(61)
    expect(vp.pitchAtPoint(xMid, boundary + 1)).not.toBe(61)
  })

  it('resolves a clearly-white region to its white key in both zones', () => {
    const vp = makeViewport({ pitchMin: 60, pitchMax: 71 })
    const c4 = vp.getAllKeyPositions().get(60)!
    const frame = keyFrame(1000, whiteKeyCount(60, 71), 100)
    const xLeft = c4.x + 1
    expect(vp.pitchAtPoint(xLeft, 500 + frame.keysY + 4)).toBe(60)
    expect(vp.pitchAtPoint(xLeft, 500 + frame.keysY + frame.blackH + 2)).toBe(60)
  })
})

describe('Viewport.buildKeyLayout with narrowed pitch range (fit-to-piece)', () => {
  it('lays out only the keys within [pitchMin, pitchMax]', () => {
    // C3=48 .. C5=72 inclusive.
    const vp = makeViewport({ pitchMin: 48, pitchMax: 72 })
    const positions = vp.getAllKeyPositions()
    // No key below C3 or above C5 should exist.
    expect(positions.has(47)).toBe(false)
    expect(positions.has(73)).toBe(false)
    expect(positions.has(48)).toBe(true)
    expect(positions.has(72)).toBe(true)
  })

  it('widens white keys to fill the canvas across the narrowed range', () => {
    const vp = makeViewport({ canvasWidth: 1000, pitchMin: 48, pitchMax: 72 })

    // White keys in C3..C5: C3 D3 E3 F3 G3 A3 B3 (7) + C4..B4 (7) + C5 (1) = 15.
    expect(whiteKeyCount(48, 72)).toBe(15)
    const frame = keyFrame(1000, 15, 100)

    // Cheeks take 44/26 of a white key on each side. C3 starts after the left cheek.
    expect(vp.pitchToX(48)).toBeCloseTo(frame.cheek)
    expect(vp.pitchWidth(48)).toBeCloseTo(frame.pitch)
    expect(frame.pitch).toBeCloseTo(KBD.pitch * (1000 / (15 * KBD.pitch + KBD.cheek * 2)))

    expect(vp.pitchToX(50)).toBeCloseTo(frame.cheek + frame.pitch)
    expect(vp.pitchToX(72)).toBeCloseTo(frame.cheek + 14 * frame.pitch)
  })

  it('keeps a leading black key when the range starts on one', () => {
    // C#3=49. The white key to its left (C3) is outside the window. The black
    // key still sits 17.5px (scaled) past that missing white key.
    const vp = makeViewport({ canvasWidth: 700, pitchMin: 49, pitchMax: 60 })
    const frame = keyFrame(700, whiteKeyCount(49, 60), 100)
    expect(vp.hasKey(49)).toBe(true)
    const blackX = frame.cheek - frame.pitch + (KBD.blackOff / KBD.pitch) * frame.pitch
    expect(vp.pitchToX(49)).toBeCloseTo(Math.max(0, blackX))
    expect(vp.pitchWidth(49)).toBeCloseTo((KBD.blackW / KBD.pitch) * frame.pitch)
    const onBlack = 500 + frame.keysY + 4
    expect(vp.pitchAtPoint(vp.pitchToX(49) + 2, onBlack)).toBe(49)
    // The leading black key covers the first ~0.29 of D. Past that, the white key answers.
    expect(vp.pitchAtPoint(frame.cheek + frame.pitch * 0.55, onBlack)).toBe(50)
    const onWhiteFront = 500 + frame.keysY + frame.blackH + 2
    const onD = vp.pitchToX(49) + vp.pitchWidth(49) - 1
    expect(vp.pitchAtPoint(onD, onWhiteFront)).toBe(50)
  })

  it('positions black keys 16px wide at +17.5 from the white key below', () => {
    const vp = makeViewport({ canvasWidth: 1000, pitchMin: 48, pitchMax: 72 })
    const frame = keyFrame(1000, 15, 100)
    expect(isBlackKey(49)).toBe(true)
    expect(vp.pitchToX(48)).toBeCloseTo(frame.cheek)
    expect(vp.pitchWidth(49)).toBeCloseTo((KBD.blackW / KBD.pitch) * frame.pitch, 2)
    expect(vp.pitchToX(49)).toBeCloseTo(frame.cheek + (KBD.blackOff / KBD.pitch) * frame.pitch, 2)
  })

  // Draw sites gate on hasKey because pitchToX/pitchWidth fall back to 0 for
  // an unmapped pitch — a degenerate bar at x = 0 instead of nothing.
  it('hasKey reports which pitches the current layout can draw', () => {
    const vp = makeViewport({ canvasWidth: 1000 })
    expect(vp.hasKey(21)).toBe(true)
    expect(vp.hasKey(108)).toBe(true)
    expect(vp.hasKey(20)).toBe(false)
    expect(vp.hasKey(109)).toBe(false)

    vp.update({ pitchMin: 48, pitchMax: 72 })
    expect(vp.hasKey(60)).toBe(true)
    expect(vp.hasKey(47)).toBe(false)
  })

  it('narrowing the range via update() rebuilds the layout wider', () => {
    const vp = makeViewport({ canvasWidth: 1000 })
    const fullWhiteW = vp.pitchWidth(60) // full piano: many white keys → narrow
    vp.update({ pitchMin: 48, pitchMax: 72 })
    const narrowedWhiteW = vp.pitchWidth(60)
    // Fewer keys across the same canvas ⇒ each key is wider.
    expect(narrowedWhiteW).toBeGreaterThan(fullWhiteW)
  })
})
