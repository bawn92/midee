import { afterEach, describe, expect, it } from 'vitest'
import { parsePaintPrefs, setPaintPrefs } from '../ui/paint'
import {
  badgeDiameter,
  earliestFutureOnset,
  fittedDashes,
  inNextChord,
  MIN_BADGE_PX,
  type NoteBody,
  outlineFillRatio,
  separateNoteBodies,
} from './noteShape'

function body(patch: Partial<NoteBody> & Pick<NoteBody, 'time' | 'end' | 'drawPitch'>): NoteBody {
  return {
    pitch: patch.pitch ?? patch.drawPitch,
    velocity: 1,
    shifted: false,
    octaves: 0,
    dimmed: false,
    color: 0xe6a94f,
    notes: [
      {
        pitch: patch.pitch ?? patch.drawPitch,
        time: patch.time,
        duration: patch.end - patch.time,
        velocity: 1,
      },
    ],
    ...patch,
  }
}

describe('note style defaults', () => {
  afterEach(() => {
    setPaintPrefs({
      noteStyle: 'classic',
      noteFingerNumbers: true,
      noteHandShapes: true,
      noteLandingBloom: true,
    })
    localStorage.removeItem('midee.paint')
  })

  it('defaults to classic when the save has no note style', () => {
    expect(parsePaintPrefs(null).noteStyle).toBe('classic')
    expect(parsePaintPrefs('{"colorBy":"hand"}').noteStyle).toBe('classic')
    expect(parsePaintPrefs('{"noteStyle":"neon"}').noteStyle).toBe('classic')
    expect(parsePaintPrefs('{"noteFingerNumbers":false}').noteFingerNumbers).toBe(false)
    expect(
      parsePaintPrefs('{"noteHandShapes":false,"noteLandingBloom":false}').noteHandShapes,
    ).toBe(false)
  })

  it('persists the chosen style', () => {
    setPaintPrefs({ noteStyle: 'glass' })
    const stored = localStorage.getItem('midee.paint')
    expect(stored).toBeTruthy()
    expect(parsePaintPrefs(stored).noteStyle).toBe('glass')
  })
})

describe('repeated notes on one key', () => {
  const pps = 100

  it('leaves one sustained note as a single body', () => {
    const bodies = separateNoteBodies([body({ drawPitch: 56, time: 1, end: 3 })], pps)
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({ time: 1, end: 3 })
    expect(bodies[0]?.notes).toHaveLength(1)
  })

  it('keeps a visible gap when the next press touches or overlaps', () => {
    const touching = separateNoteBodies(
      [body({ drawPitch: 56, time: 2, end: 2.5 }), body({ drawPitch: 56, time: 2.5, end: 3 })],
      pps,
    )
    expect(touching).toHaveLength(2)
    expect(touching[0]?.notes).toHaveLength(1)
    expect(touching[1]?.time).toBe(2.5)
    expect(touching[1]?.end).toBe(3)
    // 50px tall, so the gap is the 4px minimum.
    expect(touching[0]?.end).toBeCloseTo(2.5 - 4 / pps, 5)
    expect((touching[1]?.time ?? 0) - (touching[0]?.end ?? 0)).toBeGreaterThan(0)

    const overlapping = separateNoteBodies(
      [body({ drawPitch: 64, time: 0, end: 1 }), body({ drawPitch: 64, time: 0.5, end: 1.2 })],
      pps,
    )
    expect(overlapping).toHaveLength(2)
    expect(overlapping[1]?.time).toBe(0.5)
    expect(overlapping[1]?.end).toBe(1.2)
    // 100px tall, so the gap is 6% of that height and the first note ends
    // before the second onset.
    expect(overlapping[0]?.end).toBeCloseTo(0.5 - 0.06, 5)
    expect(overlapping[0]?.end).toBeLessThan(0.5)
  })

  it('does not shorten a note that already has a rest before the next press', () => {
    const bodies = separateNoteBodies(
      [body({ drawPitch: 56, time: 30, end: 30.5 }), body({ drawPitch: 56, time: 31.5, end: 32 })],
      pps,
    )
    expect(bodies.map((item) => [item.time, item.end])).toEqual([
      [30, 30.5],
      [31.5, 32],
    ])
  })

  it('does not borrow time from a different key', () => {
    const bodies = separateNoteBodies(
      [body({ drawPitch: 60, time: 1, end: 1.5 }), body({ drawPitch: 62, time: 1.5, end: 2 })],
      pps,
    )
    expect(bodies.map((item) => item.end)).toEqual([1.5, 2])
  })

  it('marks only the earliest future cluster as next', () => {
    const onset = earliestFutureOnset([1, 4, 4.02, 8], 3)
    expect(onset).toBe(4)
    expect(inNextChord(4.02, onset)).toBe(true)
    expect(inNextChord(8, onset)).toBe(false)
    expect(inNextChord(1, onset)).toBe(false)
  })
})

describe('dash and badge craft', () => {
  it('fits dashes to the span', () => {
    for (const span of [8, 24, 80]) {
      const { dash, gap, count } = fittedDashes(span)
      const used = count * dash + (count - 1) * gap
      expect(used).toBeCloseTo(span, 5)
      expect(dash).toBeGreaterThan(0)
      expect(gap).toBeLessThanOrEqual(dash)
    }
  })

  it('keeps finger badges at least 12px', () => {
    expect(badgeDiameter(4)).toBeGreaterThanOrEqual(12)
    expect(badgeDiameter(4)).toBe(MIN_BADGE_PX)
    expect(badgeDiameter(40)).toBeLessThanOrEqual(16)
  })

  it('steps outline fills in quarters when motion is reduced', () => {
    const beat = 0.5
    expect(outlineFillRatio(0, 1, beat, true)).toBe(0)
    expect(outlineFillRatio(1, 1, beat, true)).toBe(1)
    const mid = outlineFillRatio(0.4, 1, beat, true)
    expect(mid * 4).toBe(Math.round(mid * 4))
  })
})
