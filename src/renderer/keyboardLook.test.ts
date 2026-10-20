import { describe, expect, it } from 'vitest'
import {
  HONEY,
  handStops,
  heroEbonyGradient,
  heroHandGradient,
  heroIvoryGradient,
  IVORY_CROWN,
  IVORY_MID_STOP,
  ivoryCrown,
  SHEEN_HEIGHT,
} from './keyboardLook'

describe('keyboard look', () => {
  it('keeps the hero gradient stops in one place', () => {
    expect(IVORY_MID_STOP).toBe(0.28)
    expect(SHEEN_HEIGHT).toBe(0.46)
    expect(heroIvoryGradient()).toBe(
      `linear-gradient(${IVORY_CROWN}, var(--key-ivory) 28%, var(--key-ivory-side))`,
    )
    expect(heroEbonyGradient()).toBe('linear-gradient(var(--key-ebony), var(--key-ebony-side))')
    expect(ivoryCrown(0xf6ebda)).toBe(0xfffaf3)
  })

  it('fills a pressed golden-hour key with one honey or rose gradient', () => {
    expect(heroHandGradient('rh')).toBe('linear-gradient(#f6d7a4, #e6a94f 28%, #dda95e)')
    expect(heroHandGradient('lh')).toBe('linear-gradient(#f3c6c4, #d9908f 28%, #c47b7a)')
    expect(handStops(0xe6a94f, false, 'golden-hour')).toEqual({
      top: 0xf6d7a4,
      mid: 0xe6a94f,
      toe: HONEY,
    })
    expect(handStops(0xd9908f, true, 'golden-hour').toe).toBe(0xc47b7a)
  })
})
