import { afterEach, describe, expect, it } from 'vitest'
import { parsePaintPrefs, setPaintPrefs } from '../ui/paint'
import {
  badgeDiameter,
  earliestFutureOnset,
  fittedDashes,
  inNextChord,
  MIN_BADGE_PX,
  mergeNoteBodies,
  type NoteBody,
  outlineFillRatio,
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

describe('continuous notes and next chords', () => {
  it('joins notes separated by a tie and keeps a rest apart', () => {
    const merged = mergeNoteBodies([
      body({ drawPitch: 56, time: 30, end: 30.499 }),
      body({ drawPitch: 56, time: 30.5, end: 30.999 }),
      body({ drawPitch: 56, time: 31.5, end: 31.999 }),
    ])
    expect(merged.map((item) => [item.time, item.end])).toEqual([
      [30, 30.999],
      [31.5, 31.999],
    ])
  })

  it('does not join a different key', () => {
    const merged = mergeNoteBodies([
      body({ drawPitch: 60, time: 1, end: 1.5 }),
      body({ drawPitch: 62, time: 1.501, end: 2 }),
    ])
    expect(merged).toHaveLength(2)
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
