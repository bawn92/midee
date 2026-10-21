import { fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MasterClock } from '../core/clock/MasterClock'
import {
  getKeyboardRange,
  isControllerCalibrateArmed,
  KEYBOARD_RANGE_STORAGE_KEY,
  reloadKeyboardRange,
  setControllerCalibrateArmed,
  setKeyboardRange,
} from '../core/keyboardRange'
import { KeyLights } from '../midi/KeyLights'
import { MidiInputManager } from '../midi/MidiInputManager'
import {
  dismissPianoMGuide,
  getPianoMGuide,
  noticePianoMNote,
  PIANO_M_GUIDE_KEY,
  reloadPianoMGuide,
  resetPianoMForTests,
  setPianoMDetected,
} from '../midi/pianoM'
import { createAppStore } from '../store/state'
import { KeyboardRangeBand, KeyboardRangeControl } from './KeyboardRangeControl'
import { KeyLightsSettings } from './KeyLightsSettings'
import { PianoMGuide } from './PianoMGuide'

const cleanups: Array<() => void> = []

afterEach(() => {
  for (const cleanup of cleanups) cleanup()
  cleanups.length = 0
  document.body.replaceChildren()
  localStorage.removeItem(KEYBOARD_RANGE_STORAGE_KEY)
  localStorage.removeItem(PIANO_M_GUIDE_KEY)
  localStorage.removeItem('midee.kbdRangeExpanded')
  reloadKeyboardRange()
  reloadPianoMGuide()
  resetPianoMForTests()
  setControllerCalibrateArmed(false)
  vi.unstubAllGlobals()
})

function mountGuide(mode: 'play' | 'home' = 'play'): void {
  const store = createAppStore()
  store.setState('mode', mode)
  const host = document.createElement('div')
  document.body.append(host)
  const guide = new PianoMGuide(host, store)
  cleanups.push(() => guide.dispose())
}

describe('Piano M guide', () => {
  it('stays hidden until a Piano M is connected, then sets the range from the board count', () => {
    mountGuide()
    expect(screen.queryByText('How many Piano Ms are snapped together?')).toBeNull()
    setPianoMDetected(true)
    expect(screen.getByText('How many Piano Ms are snapped together?')).toBeTruthy()
    expect(screen.getByText(/act as one keyboard/)).toBeTruthy()
    expect(screen.getByText(/All Piano M boards/)).toBeTruthy()
    expect(screen.getByText(/press both octave buttons to reset the octave/)).toBeTruthy()
    expect(screen.queryByText(/cyan/i)).toBeNull()
    expect(screen.queryByText(/Power\/Mode/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /48 keys/ }))
    expect(getKeyboardRange().size).toBe(48)
    expect(getPianoMGuide().boards).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'Press your lowest key' }))
    expect(isControllerCalibrateArmed()).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('How many Piano Ms are snapped together?')).toBeNull()
    expect(getPianoMGuide().dismissed).toBe(true)
  })

  it('suggests 48 keys when a note arrives past the first board', () => {
    mountGuide()
    setKeyboardRange({ start: 48, size: 24, calibrated: false, controllerLow: null })
    setPianoMDetected(true)
    noticePianoMNote(84)
    expect(screen.getByText(/second Piano M/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Switch to 48' }))
    expect(getKeyboardRange().size).toBe(48)
    expect(screen.queryByText(/second Piano M/)).toBeNull()
  })

  it('keeps the card off the home screen', () => {
    mountGuide('home')
    setPianoMDetected(true)
    expect(screen.queryByText('How many Piano Ms are snapped together?')).toBeNull()
  })
})

describe('Piano M range segments', () => {
  it('tints each board on the highlight and in the range card only for a Piano M', () => {
    const store = createAppStore()
    store.setState('mode', 'play')
    const host = document.createElement('div')
    document.body.append(host)
    setKeyboardRange({ start: 36, size: 48 })
    const band = new KeyboardRangeBand(host, store, {
      rect: () => ({ left: 8, top: 400, width: 640, height: 120 }),
      pitchAt: () => 60,
    })
    const card = new KeyboardRangeControl(host, store)
    cleanups.push(() => {
      band.dispose()
      card.dispose()
    })
    expect(host.querySelector('.kbd-range-board')).toBeNull()
    expect(host.querySelector('.kbd-range-boards-mini')).toBeNull()
    setPianoMDetected(true)
    expect(host.querySelectorAll('.kbd-range-board')).toHaveLength(2)
    expect(host.querySelectorAll('.kbd-range-boards-mini-board')).toHaveLength(2)
    expect(host.textContent).toContain('Board 1')
    expect(host.textContent).toContain('Board 2')
    setKeyboardRange({ start: 24, size: 72 })
    expect(host.querySelectorAll('.kbd-range-board')).toHaveLength(3)
    setPianoMDetected(false)
    expect(host.querySelector('.kbd-range-board')).toBeNull()
    expect(host.querySelector('.kbd-range-boards-mini')).toBeNull()
  })
})

describe('Key Lights Piano M setup', () => {
  it('reopens the guide from setup help only when a Piano M is connected', () => {
    vi.stubGlobal('navigator', { requestMIDIAccess: vi.fn() })
    const clock = { subscribeTransport: () => () => {}, playing: false } as unknown as MasterClock
    const lights = new KeyLights(clock)
    const midiInput = new MidiInputManager(clock)
    cleanups.push(() => {
      lights.dispose()
      midiInput.dispose()
    })
    render(() => <KeyLightsSettings lights={lights} midiInput={midiInput} />)
    dismissPianoMGuide()
    fireEvent.click(screen.getByText('Setup help'))
    expect(screen.queryByRole('button', { name: 'Piano M setup' })).toBeNull()
    midiInput.pianoM.set(true)
    fireEvent.click(screen.getByRole('button', { name: 'Piano M setup' }))
    expect(getPianoMGuide().dismissed).toBe(false)
  })
})
