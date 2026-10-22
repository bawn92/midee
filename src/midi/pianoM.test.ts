import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MasterClock } from '../core/clock/MasterClock'
import {
  getKeyboardRange,
  KEYBOARD_RANGE_STORAGE_KEY,
  reloadKeyboardRange,
  setKeyboardRange,
} from '../core/keyboardRange'
import { MidiInputManager } from './MidiInputManager'
import {
  dismissPianoMSuggest,
  getPianoMGuide,
  isPianoMPortName,
  noticePianoMNote,
  PIANO_M_GUIDE_KEY,
  pianoMSegmentCount,
  reloadPianoMGuide,
  rememberPianoMBoards,
  reopenPianoMGuide,
  resetPianoMForTests,
  setPianoMDetected,
} from './pianoM'

afterEach(() => {
  localStorage.removeItem(KEYBOARD_RANGE_STORAGE_KEY)
  localStorage.removeItem(PIANO_M_GUIDE_KEY)
  reloadKeyboardRange()
  resetPianoMForTests()
})

describe('Piano M port names', () => {
  it('recognises Piano M, LUMI, and ROLI, and leaves Roland alone', () => {
    expect(isPianoMPortName('Piano M')).toBe(true)
    expect(isPianoMPortName('ROLI Piano M', 'ROLI')).toBe(true)
    expect(isPianoMPortName('LUMI Keys')).toBe(true)
    expect(isPianoMPortName('lumi')).toBe(true)
    expect(isPianoMPortName('', 'ROLI')).toBe(true)
    expect(isPianoMPortName('My ROLI controller')).toBe(true)
    expect(isPianoMPortName('PianoM')).toBe(true)
    expect(isPianoMPortName('Roland FP-30', 'Roland')).toBe(false)
    expect(isPianoMPortName('RD-88', 'Roland')).toBe(false)
    expect(isPianoMPortName('Piano Module')).toBe(false)
    expect(isPianoMPortName('')).toBe(false)
    expect(isPianoMPortName('Casio CDP')).toBe(false)
  })

  it('follows a connected input and clears when that input is gone', async () => {
    const input = {
      id: 'lumi',
      name: 'LUMI Keys',
      manufacturer: 'ROLI',
      state: 'connected',
      onmidimessage: null as ((event: MIDIMessageEvent) => void) | null,
    }
    const access = {
      inputs: new Map([[input.id, input]]),
      outputs: new Map(),
      onstatechange: null as (() => void) | null,
    }
    vi.stubGlobal('navigator', { requestMIDIAccess: vi.fn(async () => access) })
    const manager = new MidiInputManager({} as MasterClock)
    try {
      await manager.requestAccess()
      expect(manager.pianoM.value).toBe(true)
      input.name = 'Roland FP-30'
      input.manufacturer = 'Roland'
      access.onstatechange?.()
      expect(manager.pianoM.value).toBe(false)
    } finally {
      manager.dispose()
      vi.unstubAllGlobals()
    }
  })
})

describe('Piano M board spans', () => {
  it('draws segments only for a connected 48 or 72 key window', () => {
    expect(pianoMSegmentCount(48, true)).toBe(2)
    expect(pianoMSegmentCount(72, true)).toBe(3)
    expect(pianoMSegmentCount(24, true)).toBe(0)
    expect(pianoMSegmentCount(88, true)).toBe(0)
    expect(pianoMSegmentCount(49, true)).toBe(0)
    expect(pianoMSegmentCount(48, false)).toBe(0)
    expect(pianoMSegmentCount(72, false)).toBe(0)
  })
})

describe('Piano M guide memory', () => {
  it('remembers the board count and a dismissed suggestion', () => {
    rememberPianoMBoards(2)
    reloadPianoMGuide()
    expect(getPianoMGuide().boards).toBe(2)

    rememberPianoMBoards(1)
    setKeyboardRange({ start: 48, size: 24, calibrated: false, controllerLow: null })
    setPianoMDetected(true)
    noticePianoMNote(83)
    expect(getPianoMGuide().suggest).toBe(false)
    noticePianoMNote(84)
    expect(getPianoMGuide().suggest).toBe(true)
    dismissPianoMSuggest()
    noticePianoMNote(96)
    expect(getPianoMGuide().suggest).toBe(false)
    reloadPianoMGuide()
    expect(getPianoMGuide().suggestDismissed).toBe(true)

    reopenPianoMGuide()
    noticePianoMNote(96)
    expect(getPianoMGuide().suggest).toBe(true)
  })

  it('uses a calibrated lowest key and stays quiet for other keyboards', () => {
    setKeyboardRange({ start: 36, size: 24, calibrated: true, controllerLow: 48 })
    setPianoMDetected(true)
    noticePianoMNote(71)
    expect(getPianoMGuide().suggest).toBe(false)
    noticePianoMNote(72)
    expect(getPianoMGuide().suggest).toBe(true)

    resetPianoMForTests()
    setKeyboardRange({ start: 21, size: 88 })
    setPianoMDetected(false)
    noticePianoMNote(100)
    expect(getPianoMGuide().suggest).toBe(false)
  })

  it('does not suggest once the window is already two boards', () => {
    setKeyboardRange({ start: 36, size: 48 })
    setPianoMDetected(true)
    rememberPianoMBoards(2)
    noticePianoMNote(100)
    expect(getPianoMGuide().suggest).toBe(false)
    expect(getKeyboardRange().size).toBe(48)
  })
})
