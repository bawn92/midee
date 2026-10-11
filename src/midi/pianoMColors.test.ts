import { describe, expect, it } from 'vitest'
import { FULL_PIANO_RANGE } from '../core/keyboardRange'
import { oceanTheme, sunsetTheme } from '../renderer/theme'
import { midiColorByte, pianoMPaletteMessages, themeHandLights } from './pianoMColors'

describe('Piano M theme colours', () => {
  it('uses Sunset’s second note colour on the left and the first on the right', () => {
    expect(themeHandLights(sunsetTheme)).toEqual({ left: 0xfbbf24, right: 0xf97316 })
    expect(themeHandLights(oceanTheme).right).toBe(oceanTheme.trackColors[0])
    expect(themeHandLights(oceanTheme).left).toBe(oceanTheme.trackColors[1])
  })

  it('encodes Sunset as channel 12 and 13 control changes', () => {
    const range = {
      ...FULL_PIANO_RANGE,
      start: 48,
      size: 24,
      followMidi: false,
      calibrated: false,
      controllerLow: null,
      fitToRange: true,
    }
    expect(pianoMPaletteMessages(themeHandLights(sunsetTheme), range)).toEqual([
      [0xbb, 23, 60],
      [0xbb, 20, midiColorByte(0xfb)],
      [0xbb, 21, midiColorByte(0xbf)],
      [0xbb, 22, midiColorByte(0x24)],
      [0xbc, 20, midiColorByte(0xf9)],
      [0xbc, 21, midiColorByte(0x73)],
      [0xbc, 22, midiColorByte(0x16)],
    ])
  })

  it('follows a calibrated lowest key', () => {
    const range = {
      ...FULL_PIANO_RANGE,
      start: 72,
      size: 24,
      followMidi: false,
      calibrated: true,
      controllerLow: 72,
      fitToRange: true,
    }
    expect(pianoMPaletteMessages(themeHandLights(sunsetTheme), range)[0]).toEqual([0xbb, 23, 72])
  })
})
