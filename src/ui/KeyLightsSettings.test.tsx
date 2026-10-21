import { fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MasterClock } from '../core/clock/MasterClock'
import { KeyLights } from '../midi/KeyLights'
import { MidiInputManager } from '../midi/MidiInputManager'
import { PIANO_M_ALL_ID, resetPianoMPortsForTests } from '../midi/pianoMPorts'
import { KeyLightsSettings } from './KeyLightsSettings'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  resetPianoMPortsForTests()
})

describe('Key Lights settings', () => {
  it('retains the selected device through output refreshes and reconnects', () => {
    vi.stubGlobal('navigator', { requestMIDIAccess: vi.fn() })
    const clock = { subscribeTransport: () => () => {}, playing: false } as unknown as MasterClock
    const lights = new KeyLights(clock)
    const midiInput = new MidiInputManager(clock)
    const output = {
      id: 'keezi',
      name: 'KEEZI',
      state: 'connected',
      send: vi.fn(),
    }
    const access = { outputs: new Map([[output.id, output]]) } as unknown as MIDIAccess
    const view = render(() => <KeyLightsSettings lights={lights} midiInput={midiInput} />)
    lights.setAccess(access)
    midiInput.midiAccess.set(access)
    const device = screen.getByLabelText('Light device') as HTMLSelectElement
    expect(screen.queryByLabelText('Colors')).toBeNull()
    fireEvent.change(device, { target: { value: 'keezi' } })
    expect(lights.settings.value.outputId).toBe('keezi')
    expect(device.value).toBe('keezi')
    fireEvent.change(screen.getByLabelText('Colors'), { target: { value: 'single' } })
    expect(device.value).toBe('keezi')
    fireEvent.change(screen.getByLabelText('Channel'), { target: { value: '16' } })
    expect(lights.settings.value.channel).toBe(16)
    output.state = 'disconnected'
    lights.setAccess(access)
    expect(device.value).toBe('keezi')
    expect(device.selectedOptions[0]!.textContent).toBe('Device disconnected')
    output.state = 'connected'
    lights.setAccess(access)
    expect(device.value).toBe('keezi')
    expect(device.selectedOptions[0]!.textContent).toBe('KEEZI')
    fireEvent.change(device, { target: { value: '' } })
    expect(lights.status.value).toBe('off')
    expect(screen.queryByLabelText('Colors')).toBeNull()
    lights.dispose()
    view.unmount()
  })

  it('explains how to light a ROLI Piano M', () => {
    vi.stubGlobal('navigator', { requestMIDIAccess: vi.fn() })
    const clock = { subscribeTransport: () => () => {}, playing: false } as unknown as MasterClock
    const lights = new KeyLights(clock)
    const midiInput = new MidiInputManager(clock)
    const output = { id: 'piano-m', name: 'ROLI Piano M', state: 'connected', send: vi.fn() }
    const access = { outputs: new Map([[output.id, output]]) } as unknown as MIDIAccess
    const view = render(() => <KeyLightsSettings lights={lights} midiInput={midiInput} />)
    lights.setAccess(access)
    midiInput.midiAccess.set(access)
    fireEvent.change(screen.getByLabelText('Light device'), { target: { value: 'piano-m' } })
    fireEvent.change(screen.getByLabelText('Colors'), { target: { value: 'pianoM' } })
    expect(lights.settings.value.channelMode).toBe('pianoM')
    expect(screen.getAllByText(/littlefoot/).length).toBeGreaterThan(0)
    expect(screen.getByText(/factory key handler/)).toBeTruthy()
    expect(screen.getByText(/press both octave buttons to reset the octave/)).toBeTruthy()
    expect(screen.queryByText(/cyan/i)).toBeNull()
    expect(screen.queryByText(/Power\/Mode/)).toBeNull()
    const script = screen.getByRole('link', { name: /piano-m-theme-lights\.littlefoot/ })
    expect(script.getAttribute('href')).toBe('/piano-m-theme-lights.littlefoot')
    expect(script.getAttribute('download')).toBe('piano-m-theme-lights.littlefoot')
    lights.dispose()
    view.unmount()
  })

  it('offers every Piano M and distinct board names when the ports match', () => {
    localStorage.clear()
    resetPianoMPortsForTests()
    vi.stubGlobal('navigator', { requestMIDIAccess: vi.fn() })
    const clock = { subscribeTransport: () => () => {}, playing: false } as unknown as MasterClock
    const lights = new KeyLights(clock)
    const midiInput = new MidiInputManager(clock)
    const left = {
      id: 'lumi-a',
      name: 'LUMI Keys BLOCK',
      manufacturer: 'ROLI',
      state: 'connected',
      send: vi.fn(),
    }
    const right = {
      id: 'lumi-b',
      name: 'LUMI Keys BLOCK',
      manufacturer: 'ROLI',
      state: 'connected',
      send: vi.fn(),
    }
    const access = {
      outputs: new Map([
        [left.id, left],
        [right.id, right],
      ]),
    } as unknown as MIDIAccess
    const view = render(() => <KeyLightsSettings lights={lights} midiInput={midiInput} />)
    lights.setAccess(access)
    midiInput.midiAccess.set(access)
    const device = screen.getByLabelText('Light device') as HTMLSelectElement
    expect(device.value).toBe(PIANO_M_ALL_ID)
    expect(screen.getByRole('option', { name: 'All Piano M boards (2)' })).toBeTruthy()
    expect(
      (screen.getByRole('option', { name: 'Piano M board 1' }) as HTMLOptionElement).value,
    ).toBe('lumi-a')
    expect(
      (screen.getByRole('option', { name: 'Piano M board 2' }) as HTMLOptionElement).value,
    ).toBe('lumi-b')
    expect(screen.queryByRole('option', { name: 'LUMI Keys BLOCK' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Swap boards' }))
    expect(
      (screen.getByRole('option', { name: 'Piano M board 1' }) as HTMLOptionElement).value,
    ).toBe('lumi-b')
    expect(
      screen.getByText(
        'Identify flashes board 1, then board 2. Swap if the right board flashes first. The order is remembered.',
      ),
    ).toBeTruthy()
    lights.dispose()
    view.unmount()
  })

  it('explains unavailable MIDI output in unsupported browsers', () => {
    vi.stubGlobal('navigator', {})
    const clock = { subscribeTransport: () => () => {} } as unknown as MasterClock
    const lights = new KeyLights(clock)
    const midiInput = new MidiInputManager(clock)
    const view = render(() => <KeyLightsSettings lights={lights} midiInput={midiInput} />)
    expect(screen.getByRole('status').textContent).toContain('Try Chrome or Edge on desktop')
    expect(screen.queryByLabelText('Light device')).toBeNull()
    lights.dispose()
    view.unmount()
  })
})
