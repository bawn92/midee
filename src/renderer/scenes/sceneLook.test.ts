import { beforeEach, describe, expect, it } from 'vitest'
import { paintPrefs, setPaintPrefs } from '../../ui/paint'
import { keyboardStyleId, setKeyboardStyle } from '../keyboardStyle'
import { rangeOverlay, setRangeOverlay } from '../rangeOverlay'
import { AFTER_HOURS_LOOK, adoptSceneLook, primeAfterHours, primeSceneLook } from './sceneLook'

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

  it('applies Night defaults only the first time and keeps the range', () => {
    const first = primeSceneLook('night')
    expect(first?.keyboard).toBe('walnut')
    expect(first?.noteStyle).toBe('glass')
    expect(first?.particle).toBe('none')
    expect(first?.rangeStyle).toBe('outline')
    expect(keyboardStyleId()).toBe('walnut')
    expect(paintPrefs().noteStyle).toBe('glass')
    expect(rangeOverlay().style).toBe('outline')

    setKeyboardStyle('synth')
    setPaintPrefs({ noteStyle: 'beam' })
    expect(primeSceneLook('night')).toBeNull()
    expect(keyboardStyleId()).toBe('synth')
    expect(paintPrefs().noteStyle).toBe('beam')
  })

  it('keeps Night choices apart from After Hours and the shared look', () => {
    const entered = adoptSceneLook('golden-hour', 'night')
    expect(entered?.noteStyle).toBe('glass')
    expect(entered?.particle).toBe('none')
    expect(paintPrefs().noteStyle).toBe('glass')

    setKeyboardStyle('vintage')
    setPaintPrefs({ noteStyle: 'felt' })
    localStorage.setItem('midee.particle', 'pearl')
    const club = adoptSceneLook('night', 'after-hours')
    expect(club?.keyboard).toBe('synth')
    expect(club?.particle).toBe('sparks')

    const back = adoptSceneLook('after-hours', 'night')
    expect(back?.keyboard).toBe('vintage')
    expect(back?.noteStyle).toBe('felt')
    expect(back?.particle).toBe('pearl')

    const home = adoptSceneLook('night', 'rainy-study')
    expect(home?.keyboard).toBe('walnut')
    expect(home?.noteStyle).toBe('classic')
    expect(home?.particle).toBe('sparkle')
  })
})
