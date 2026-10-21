import { fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MasterClock } from '../core/clock/MasterClock'
import { setKeyboardRange } from '../core/keyboardRange'
import { KeyLights } from '../midi/KeyLights'
import { MidiInputManager } from '../midi/MidiInputManager'
import { resetPianoMForTests } from '../midi/pianoM'
import { PIANO_M_PORTS_KEY, resetPianoMPortsForTests } from '../midi/pianoMPorts'
import { PIANO_M_SETUP_KEY, resetPianoMSetupForTests } from '../midi/pianoMSetup'
import { PianoMSetup } from './PianoMSetup'

function port(id: string, send = vi.fn()) {
  return {
    id,
    name: 'LUMI Keys BLOCK',
    manufacturer: 'ROLI',
    state: 'connected',
    connection: 'open',
    onmidimessage: null as ((event: MIDIMessageEvent) => void) | null,
    send,
  }
}

afterEach(() => {
  localStorage.removeItem(PIANO_M_SETUP_KEY)
  localStorage.removeItem(PIANO_M_PORTS_KEY)
  resetPianoMSetupForTests()
  resetPianoMPortsForTests()
  resetPianoMForTests()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('Set up your boards', () => {
  it('maps two ports, shows the shifted lowest keys, and remembers the lights', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-21T12:00:00Z'))
    setKeyboardRange({
      start: 60,
      size: 48,
      calibrated: false,
      controllerLow: null,
      fitToRange: true,
    })
    const sendA = vi.fn()
    const sendB = vi.fn()
    const left = port('in-a')
    const right = port('in-b')
    const outA = port('lumi-a', sendA)
    const outB = port('lumi-b', sendB)
    const access = {
      inputs: new Map([
        [left.id, left],
        [right.id, right],
      ]),
      outputs: new Map([
        [outA.id, outA],
        [outB.id, outB],
      ]),
      onstatechange: null,
    }
    vi.stubGlobal('navigator', { requestMIDIAccess: vi.fn(async () => access) })
    const clock = {
      currentTime: 0,
      speed: 1,
      playing: false,
      subscribeTransport: () => () => {},
    } as unknown as MasterClock
    const midi = new MidiInputManager(clock)
    const lights = new KeyLights(clock)
    await midi.requestAccess()
    lights.setAccess(access as unknown as MIDIAccess)
    const view = render(() => <PianoMSetup midi={midi} lights={lights} boards={2} />)

    expect(screen.getByText('Press any key on your LEFT board.')).toBeTruthy()
    left.onmidimessage?.({ data: new Uint8Array([0x90, 62, 80]), timeStamp: 0 } as MIDIMessageEvent)
    expect(screen.getByText('Press any key on your RIGHT board.')).toBeTruthy()
    expect(screen.getByText('Heard D4 from LUMI Keys BLOCK.')).toBeTruthy()
    vi.setSystemTime(new Date('2026-10-21T12:00:01Z'))
    right.onmidimessage?.({
      data: new Uint8Array([0x90, 62, 80]),
      timeStamp: 0,
    } as MIDIMessageEvent)
    expect(screen.getByText('Play the lowest key on each board.')).toBeTruthy()
    expect(screen.getByText('The right board now plays 24 semitones higher.')).toBeTruthy()
    vi.setSystemTime(new Date('2026-10-21T12:00:02Z'))
    left.onmidimessage?.({ data: new Uint8Array([0x90, 60, 80]), timeStamp: 0 } as MIDIMessageEvent)
    vi.setSystemTime(new Date('2026-10-21T12:00:03Z'))
    right.onmidimessage?.({
      data: new Uint8Array([0x90, 60, 80]),
      timeStamp: 0,
    } as MIDIMessageEvent)
    expect(screen.getByText('Left C4. Right C6.')).toBeTruthy()
    expect(screen.getByText('ROLI calls these C3 and C5.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Did the LEFT board light?')).toBeTruthy()
    const notes = (send: ReturnType<typeof vi.fn>, note: number) =>
      send.mock.calls.some((call) => {
        const data = call[0] as number[]
        return data.some((byte, index) => byte === 0x9c && data[index + 1] === note)
      })
    expect(notes(sendA, 60)).toBe(true)
    expect(notes(sendB, 60)).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(screen.getByText('Did the RIGHT board light?')).toBeTruthy()
    expect(notes(sendB, 84)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(screen.getByRole('status').textContent).toContain('All set')
    expect(screen.getByText('Left C4. Right C6.')).toBeTruthy()
    view.unmount()
    lights.dispose()
    midi.dispose()
  })

  it('explains a cluster when both presses share a port', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-21T12:00:00Z'))
    const input = port('only')
    const access = {
      inputs: new Map([[input.id, input]]),
      outputs: new Map(),
      onstatechange: null,
    }
    vi.stubGlobal('navigator', { requestMIDIAccess: vi.fn(async () => access) })
    const clock = {
      currentTime: 0,
      speed: 1,
      playing: false,
      subscribeTransport: () => () => {},
    } as unknown as MasterClock
    const midi = new MidiInputManager(clock)
    await midi.requestAccess()
    const view = render(() => <PianoMSetup midi={midi} lights={null} boards={2} />)
    input.onmidimessage?.({
      data: new Uint8Array([0x90, 60, 40]),
      timeStamp: 0,
    } as MIDIMessageEvent)
    vi.setSystemTime(new Date('2026-10-21T12:00:01Z'))
    input.onmidimessage?.({
      data: new Uint8Array([0x90, 60, 40]),
      timeStamp: 0,
    } as MIDIMessageEvent)
    expect(screen.getByText(/clustered without an octave offset/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Play the lowest key on each board.')).toBeTruthy()
    view.unmount()
    midi.dispose()
  })
})
