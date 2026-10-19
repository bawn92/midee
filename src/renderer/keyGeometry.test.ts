import { describe, expect, it } from 'vitest'
import { isBlackKey } from '../core/midi/types'
import { BLACK_KEY_HEIGHT_RATIO, keyRect } from './keyGeometry'
import { KBD } from './keyboardMetrics'

describe('BLACK_KEY_HEIGHT_RATIO', () => {
  it('is the 88px black key inside the 198px case', () => {
    expect(BLACK_KEY_HEIGHT_RATIO).toBeCloseTo(KBD.blackH / KBD.caseH)
  })
})

describe('keyRect', () => {
  const KB_HEIGHT = 198

  it('draws a white key 25px wide under a 26px pitch, with a 10px front', () => {
    expect(isBlackKey(60)).toBe(false)
    expect(keyRect(60, { x: 44, width: 26 }, KB_HEIGHT)).toEqual({
      x: 44,
      y: KBD.keysY,
      w: 25,
      h: KBD.keysH,
      radius: 0,
    })
  })

  it('draws a black key 16 by 88 at the key bed', () => {
    expect(isBlackKey(61)).toBe(true)
    expect(keyRect(61, { x: 61.5, width: 16 }, KB_HEIGHT)).toEqual({
      x: 61.5,
      y: KBD.keysY,
      w: 16,
      h: KBD.blackH,
      radius: 2,
    })
  })

  it('scales both key heights with the case', () => {
    expect(keyRect(61, { x: 0, width: 16 }, 99).h).toBeCloseTo(KBD.blackH / 2)
    expect(keyRect(60, { x: 0, width: 26 }, 99).h).toBeCloseTo(KBD.keysH / 2)
  })

  const pitches = [21, 22, 24, 36, 59, 60, 61, 66, 70, 71, 72, 108]
  it.each(pitches)('pitch %i picks the shape matching isBlackKey', (pitch) => {
    const rect = keyRect(pitch, { x: 40, width: isBlackKey(pitch) ? 16 : 26 }, KB_HEIGHT)
    if (isBlackKey(pitch)) {
      expect(rect.y).toBe(KBD.keysY)
      expect(rect.h).toBe(KBD.blackH)
      expect(rect.w).toBe(16)
    } else {
      expect(rect.y).toBe(KBD.keysY)
      expect(rect.h).toBe(KBD.keysH)
      expect(rect.w).toBe(25)
    }
  })

  it('never lets a black key reach the bottom of the case', () => {
    for (const pitch of pitches) {
      if (!isBlackKey(pitch)) continue
      const rect = keyRect(pitch, { x: 0, width: 16 }, KB_HEIGHT)
      expect(rect.y + rect.h).toBeLessThan(KB_HEIGHT)
    }
  })
})
