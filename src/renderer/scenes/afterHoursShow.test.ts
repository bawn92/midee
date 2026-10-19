import { beforeEach, describe, expect, it } from 'vitest'
import {
  createAfterHoursState,
  halfBarIndex,
  nextFlashMs,
  STROBE_MIN_MS,
  STROBE_PEAK,
  setStrobeEnabled,
  stepAfterHours,
  strobeEnabled,
} from './afterHoursShow'

describe('After Hours strobe', () => {
  beforeEach(() => {
    localStorage.clear()
    setStrobeEnabled(true)
  })

  it('defaults on and remembers the switch', () => {
    expect(strobeEnabled()).toBe(true)
    expect(document.documentElement.dataset.strobe).toBe('on')
    setStrobeEnabled(false)
    expect(localStorage.getItem('midee.strobe')).toBe('off')
    expect(strobeEnabled()).toBe(false)
  })

  it('keeps flashes at least 340ms apart and under 3 per second', () => {
    let last = Number.NEGATIVE_INFINITY
    const flashes: number[] = []
    for (let t = 0; t <= 2000; t += 100) {
      const next = nextFlashMs(t, last, true, false)
      if (next !== null) {
        flashes.push(next)
        last = next
      }
    }
    expect(flashes.length).toBeGreaterThan(0)
    for (let i = 1; i < flashes.length; i++) {
      expect(flashes[i]! - flashes[i - 1]!).toBeGreaterThanOrEqual(STROBE_MIN_MS)
    }
    for (const at of flashes) {
      const inWindow = flashes.filter((t) => t <= at && at - t < 1000)
      expect(inWindow.length).toBeLessThanOrEqual(3)
    }
  })

  it('stays dark under reduced motion and when the switch is off', () => {
    expect(nextFlashMs(1000, 0, true, true)).toBeNull()
    expect(nextFlashMs(1000, 0, false, false)).toBeNull()
    const state = createAfterHoursState(200)
    stepAfterHours(state, 0.5, 1000, { reduced: true, beat: true })
    expect(state.flash).toBe(0)
  })

  it('caps a flash at 16% of white and fades it', () => {
    const state = createAfterHoursState(200)
    stepAfterHours(state, 0.016, 1000, { reduced: false, beat: true })
    expect(state.flash).toBeLessThanOrEqual(1)
    expect(STROBE_PEAK * state.flash).toBeLessThanOrEqual(STROBE_PEAK)
    const peaked = state.flash
    stepAfterHours(state, 0.09, 1400, { reduced: false, beat: false })
    expect(state.flash).toBeLessThan(peaked)
  })

  it('counts half bars from the tempo', () => {
    expect(halfBarIndex(0, 120)).toBe(0)
    expect(halfBarIndex(0.99, 120)).toBe(0)
    expect(halfBarIndex(1, 120)).toBe(1)
  })
})
