import { describe, expect, it } from 'vitest'
import { isBlackKey } from '../core/midi/types'
import { KBD } from './keyboardMetrics'
import { BLACK_KEY_HEIGHT_RATIO, keyRect } from './keyGeometry'

describe('BLACK_KEY_HEIGHT_RATIO', () => {
  it('is the black key inside the hero case', () => {
    expect(BLACK_KEY_HEIGHT_RATIO).toBeCloseTo(KBD.blackH / KBD.caseH)
  })
})

describe('keyRect', () => {
  const KB_HEIGHT = KBD.caseH

  it('draws a white key under a 26px pitch with the hero gap and bottom radius', () => {
    expect(isBlackKey(60)).toBe(false)
    expect(keyRect(60, { x: 44, width: 26 }, KB_HEIGHT)).toEqual({
      x: 44,
      y: KBD.keysY,
      w: 23,
      h: KBD.keysH,
      radius: KBD.whiteRadius,
    })
  })

  it('draws a black key at 58% of the pitch and 60% of the white key', () => {
    expect(isBlackKey(61)).toBe(true)
    expect(KBD.blackW / KBD.pitch).toBeCloseTo(0.58, 2)
    expect(KBD.blackH / KBD.keysH).toBeCloseTo(0.6, 2)
    expect(keyRect(61, { x: 61.5, width: KBD.blackW }, KB_HEIGHT)).toEqual({
      x: 61.5,
      y: KBD.keysY,
      w: KBD.blackW,
      h: KBD.blackH,
      radius: KBD.blackRadius,
    })
  })

  it('scales both key heights with the case', () => {
    expect(keyRect(61, { x: 0, width: 16 }, KBD.caseH / 2).h).toBeCloseTo(KBD.blackH / 2)
    expect(keyRect(60, { x: 0, width: 26 }, KBD.caseH / 2).h).toBeCloseTo(KBD.keysH / 2)
  })

  const pitches = [21, 22, 24, 36, 59, 60, 61, 66, 70, 71, 72, 108]
  it.each(pitches)('pitch %i picks the shape matching isBlackKey', (pitch) => {
    const rect = keyRect(pitch, { x: 40, width: isBlackKey(pitch) ? KBD.blackW : 26 }, KB_HEIGHT)
    if (isBlackKey(pitch)) {
      expect(rect.y).toBe(KBD.keysY)
      expect(rect.h).toBe(KBD.blackH)
      expect(rect.w).toBe(KBD.blackW)
    } else {
      expect(rect.y).toBe(KBD.keysY)
      expect(rect.h).toBe(KBD.keysH)
      expect(rect.w).toBe(23)
    }
  })

  it('never lets a black key reach the bottom of the case', () => {
    for (const pitch of pitches) {
      if (!isBlackKey(pitch)) continue
      const rect = keyRect(pitch, { x: 0, width: KBD.blackW }, KB_HEIGHT)
      expect(rect.y + rect.h).toBeLessThan(KB_HEIGHT)
    }
  })
})
