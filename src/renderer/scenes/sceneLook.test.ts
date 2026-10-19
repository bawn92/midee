import { beforeEach, describe, expect, it } from 'vitest'
import { paintPrefs, setPaintPrefs } from '../../ui/paint'
import { keyboardStyleId, setKeyboardStyle } from '../keyboardStyle'
import { rangeOverlay, setRangeOverlay } from '../rangeOverlay'
import { AFTER_HOURS_LOOK, adoptSceneLook, primeAfterHours } from './sceneLook'

describe('After Hours scene look', () => {
  beforeEach(() => {
    localStorage.clear()
    setKeyboardStyle('walnut')
    setPaintPrefs({ noteStyle: 'classic' })
    setRangeOverlay({ style: 'outline', addonStrip: true, addonLanes: false })
    localStorage.setItem('midee.particle', 'sparkle')
  })

  it('applies the club defaults only the first time', () => {
    expect(primeAfterHours('golden-hour')).toBeNull()
    const first = primeAfterHours('after-hours')
    expect(first).toEqual(AFTER_HOURS_LOOK)
    expect(keyboardStyleId()).toBe('synth')
    expect(paintPrefs().noteStyle).toBe('beam')
    expect(rangeOverlay().style).toBe('dim')
    expect(rangeOverlay().addonStrip).toBe(false)

    setKeyboardStyle('grand')
    setPaintPrefs({ noteStyle: 'glass' })
    expect(primeAfterHours('after-hours')).toBeNull()
    expect(keyboardStyleId()).toBe('grand')
    expect(paintPrefs().noteStyle).toBe('glass')
  })

  it('restores each scene’s own choices', () => {
    const entered = adoptSceneLook('golden-hour', 'after-hours')
    expect(entered?.keyboard).toBe('synth')
    expect(entered?.particle).toBe('sparks')
    expect(keyboardStyleId()).toBe('synth')

    setKeyboardStyle('grand')
    setPaintPrefs({ noteStyle: 'outline' })
    localStorage.setItem('midee.particle', 'bloom')
    const home = adoptSceneLook('after-hours', 'golden-hour')
    expect(home?.keyboard).toBe('walnut')
    expect(home?.noteStyle).toBe('classic')
    expect(home?.particle).toBe('sparkle')
    expect(keyboardStyleId()).toBe('walnut')
    expect(paintPrefs().noteStyle).toBe('classic')

    const back = adoptSceneLook('golden-hour', 'after-hours')
    expect(back?.keyboard).toBe('grand')
    expect(back?.noteStyle).toBe('outline')
    expect(back?.particle).toBe('bloom')
    expect(keyboardStyleId()).toBe('grand')
  })

  it('leaves Rainy Study on the shared look', () => {
    expect(adoptSceneLook('golden-hour', 'rainy-study')).toBeNull()
    expect(keyboardStyleId()).toBe('walnut')
  })
})
