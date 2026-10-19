import { describe, expect, it } from 'vitest'
import { type FingeringNote, fingerKey, fingerLine, planFingering } from './fingering'
import type { KeyboardRangePrefs } from './keyboardRange'

const RANGE: KeyboardRangePrefs = {
  start: 48,
  size: 24,
  followMidi: false,
  controllerLow: null,
  calibrated: false,
  fitToRange: true,
}

function line(pitches: readonly number[], hand: 'left' | 'right', gap = 0.3): number[] {
  const notes: FingeringNote[] = pitches.map((pitch, index) => ({
    pitch,
    time: index * gap,
    duration: gap * 0.85,
  }))
  return fingerLine(notes, hand)
}

function chord(pitches: readonly number[], hand: 'left' | 'right'): number[] {
  return fingerLine(
    pitches.map((pitch) => ({ pitch, time: 1, duration: 0.6 })),
    hand,
  )
}

describe('fingering', () => {
  it('fingers an ascending right-hand C major scale 1-2-3-1-2-3-4-5', () => {
    expect(line([60, 62, 64, 65, 67, 69, 71, 72], 'right')).toEqual([1, 2, 3, 1, 2, 3, 4, 5])
  })

  it('mirrors that scale in the left hand, thumb on the way up', () => {
    expect(line([48, 50, 52, 53, 55, 57, 59, 60], 'left')).toEqual([5, 4, 3, 2, 1, 3, 2, 1])
  })

  it('never puts a lower right-hand finger on a higher chord tone', () => {
    const pitches = [60, 64, 67, 72]
    const fingers = chord(pitches, 'right')
    for (let i = 1; i < pitches.length; i++) {
      expect(fingers[i]).toBeGreaterThan(fingers[i - 1]!)
    }
  })

  it('puts the left-hand thumb on the highest note of a chord', () => {
    const pitches = [48, 52, 55]
    const fingers = chord(pitches, 'left')
    for (let i = 1; i < pitches.length; i++) {
      expect(fingers[i]).toBeLessThan(fingers[i - 1]!)
    }
    expect(fingers[2]).toBe(1)
  })

  it('plays a right-hand third inside one position', () => {
    const fingers = line([60, 64], 'right')
    expect(fingers[0]).toBeLessThan(fingers[1]!)
    expect(fingers).not.toEqual([3, 1])
  })

  it('plays a left-hand third with the thumb on top', () => {
    const fingers = line([48, 52], 'left')
    expect(fingers[0]).toBeGreaterThan(fingers[1]!)
    expect(fingers[1]).toBe(1)
  })

  it('numbers a folded C6 below the E5 it lands beside', () => {
    const plan = planFingering(
      [
        {
          notes: [
            { pitch: 84, time: 23, duration: 0.4 },
            { pitch: 76, time: 23, duration: 0.4 },
          ],
        },
      ],
      RANGE,
    )
    const lower = plan.get(fingerKey('right', { time: 23, pitch: 84 }))
    const upper = plan.get(fingerKey('right', { time: 23, pitch: 76 }))
    expect(lower).toBeDefined()
    expect(upper).toBeDefined()
    expect(lower!).toBeLessThan(upper!)
  })

  it('keeps the Strobe right-hand cluster at 0:23 in one position', () => {
    // The reported frame shows a 3 on a lower key than the thumb, with no
    // crossover between them. G4 and B4 sit under one hand.
    const fingers = fingerLine(
      [
        { pitch: 67, time: 23, duration: 0.5 },
        { pitch: 71, time: 23.01, duration: 0.42 },
      ],
      'right',
    )
    expect(fingers[0]).toBeLessThan(fingers[1]!)
    expect(fingers).not.toEqual([3, 1])
  })

  it('fingers the Strobe right-hand arpeggio upward', () => {
    const fingers = line([64, 67, 71], 'right', 0.25)
    expect(fingers[0]).toBeLessThan(fingers[1]!)
    expect(fingers[1]).toBeLessThan(fingers[2]!)
  })

  it('fingers the Strobe left-hand fifth with the thumb on top', () => {
    const fingers = chord([41, 48], 'left')
    expect(fingers[1]).toBe(1)
    expect(fingers[0]).toBeGreaterThan(1)
  })

  it('fingers a folded Strobe leap on the key the hand plays', () => {
    // E5 is outside C3–B4 and folds to E4, next to a C4 that is already
    // inside the window. The badge follows E4, so it stays above the thumb.
    const plan = planFingering(
      [
        {
          notes: [
            { pitch: 60, time: 23, duration: 0.35 },
            { pitch: 76, time: 23.3, duration: 0.35 },
          ],
        },
      ],
      RANGE,
    )
    const thumb = plan.get(fingerKey('right', { time: 23, pitch: 60 }))
    const leap = plan.get(fingerKey('right', { time: 23.3, pitch: 76 }))
    expect(thumb).toBeLessThan(leap!)
  })
})
