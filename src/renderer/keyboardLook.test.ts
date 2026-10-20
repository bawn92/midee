import { describe, expect, it } from 'vitest'
import {
  heroEbonyGradient,
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
})
