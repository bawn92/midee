import { describe, expect, it } from 'vitest'
import { FULL_PIANO_RANGE } from '../core/keyboardRange'
import { goldenHourTheme } from '../renderer/scenes/goldenHour'
import { rainyStudyTheme } from '../renderer/scenes/rainyStudy'
import {
  midiColorByte,
  pianoMBoardBase,
  pianoMPaletteMessages,
  themeHandLights,
} from './pianoMColors'

describe('Piano M theme colours', () => {
  it('uses the scene’s second note colour on the left and the first on the right', () => {
    expect(themeHandLights(goldenHourTheme)).toEqual({ left: 0xd9908f, right: 0xe6a94f })
    expect(themeHandLights(rainyStudyTheme).right).toBe(rainyStudyTheme.trackColors[0])
    expect(themeHandLights(rainyStudyTheme).left).toBe(rainyStudyTheme.trackColors[1])
  })

  it('encodes Golden Hour as channel 12 and 13 control changes', () => {
    const range = {
      ...FULL_PIANO_RANGE,
      start: 48,
      size: 24,
      followMidi: false,
      calibrated: false,
      controllerLow: null,
      fitToRange: true,
    }
    expect(pianoMPaletteMessages(themeHandLights(goldenHourTheme), range)).toEqual([
      [0xbb, 23, 60],
      [0xbb, 20, midiColorByte(0xd9)],
      [0xbb, 21, midiColorByte(0x90)],
      [0xbb, 22, midiColorByte(0x8f)],
      [0xbc, 20, midiColorByte(0xe6)],
      [0xbc, 21, midiColorByte(0xa9)],
      [0xbc, 22, midiColorByte(0x4f)],
    ])
  })

  it('shares one lowest note and still names each board’s key range', () => {
    const range = {
      ...FULL_PIANO_RANGE,
      start: 60,
      size: 48,
      followMidi: false,
      calibrated: false,
      controllerLow: null,
      fitToRange: true,
    }
    const colors = themeHandLights(goldenHourTheme)
    expect(pianoMPaletteMessages(colors, range)[0]).toEqual([0xbb, 23, 60])
    expect(pianoMBoardBase(60, 0)).toBe(60)
    expect(pianoMBoardBase(60, 1)).toBe(84)
    expect(pianoMBoardBase(60, 2)).toBe(108)
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
    expect(pianoMPaletteMessages(themeHandLights(goldenHourTheme), range)[0]).toEqual([
      0xbb, 23, 72,
    ])
  })
})
