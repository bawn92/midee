import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  finishRangeAdjust,
  holdRangeAdjust,
  pulseRangeAdjust,
  rangeAdjusting,
  rangeGlassOpen,
  rangeLayerAlpha,
  rangeOverlay,
  rangePlayAlpha,
  releaseRangeAdjust,
  resetRangeOverlayForTests,
  setRangeOverlay,
  setRangePhase,
  wantsDim,
  wantsLanes,
  wantsOutline,
  wantsStrip,
} from './rangeOverlay'

describe('range overlay', () => {
  afterEach(() => {
    resetRangeOverlayForTests()
    vi.restoreAllMocks()
  })

  it('keeps add-on values when the primary style already includes that layer', () => {
    setRangeOverlay({ style: 'dim', addonStrip: true, addonLanes: false })
    expect(wantsDim()).toBe(true)
    expect(wantsStrip()).toBe(true)
    expect(wantsLanes()).toBe(false)
    expect(wantsOutline()).toBe(false)

    setRangeOverlay({ style: 'strip' })
    expect(rangeOverlay().addonStrip).toBe(true)
    expect(wantsStrip()).toBe(true)
    expect(wantsDim()).toBe(false)

    setRangeOverlay({ style: 'lanes' })
    expect(wantsLanes()).toBe(true)
    expect(rangeOverlay().addonLanes).toBe(false)
    setRangeOverlay({ addonLanes: true, style: 'outline' })
    expect(wantsLanes()).toBe(true)
    setRangeOverlay({ style: 'outline' })
    expect(wantsOutline()).toBe(true)
    expect(wantsLanes()).toBe(true)
    expect(wantsStrip()).toBe(true)
  })

  it('crossfades to the playing style 60ms after adjusting ends', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1_000)
    setRangePhase('glass')
    expect(rangePlayAlpha()).toBeCloseTo(1)

    vi.spyOn(performance, 'now').mockReturnValue(2_000)
    setRangePhase('play')
    vi.spyOn(performance, 'now').mockReturnValue(2_030)
    expect(rangePlayAlpha()).toBeCloseTo(0)

    vi.spyOn(performance, 'now').mockReturnValue(2_000 + 60 + 300)
    expect(rangePlayAlpha()).toBeCloseTo(1)
    expect(rangeLayerAlpha('dim')).toBeCloseTo(1)
  })

  it('holds the frost while the pointer is down, then for 1.5s', () => {
    vi.spyOn(performance, 'now').mockReturnValue(5_000)
    holdRangeAdjust()
    expect(rangeGlassOpen()).toBe(true)
    releaseRangeAdjust()
    vi.spyOn(performance, 'now').mockReturnValue(6_499)
    expect(rangeGlassOpen()).toBe(true)
    vi.spyOn(performance, 'now').mockReturnValue(6_510)
    expect(rangeAdjusting()).toBe(false)
    expect(rangeGlassOpen()).toBe(false)
  })

  it('ends the settle when playback or a note arrives', () => {
    vi.spyOn(performance, 'now').mockReturnValue(5_000)
    pulseRangeAdjust()
    expect(rangeGlassOpen()).toBe(true)
    finishRangeAdjust()
    expect(rangeGlassOpen()).toBe(false)
  })

  it('skips the frost when blur while adjusting is off', () => {
    setRangeOverlay({ blurWhileAdjusting: false })
    holdRangeAdjust()
    expect(rangeAdjusting()).toBe(true)
    expect(rangeGlassOpen()).toBe(false)
    releaseRangeAdjust()
  })
})
