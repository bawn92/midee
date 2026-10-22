import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MasterClock } from '../core/clock/MasterClock'
import { setHandPractice } from '../core/handPractice'
import {
  FULL_PIANO_RANGE,
  getKeyboardRange,
  resizeKeyboardRangeSnapped,
  setKeyboardRange,
} from '../core/keyboardRange'
import { deriveMidi } from '../core/midi/derive'
import { type MidiFile, nominalTempoMap } from '../core/midi/types'
import { highwayLaneColor } from '../renderer/highwayNotes'
import { goldenHourTheme } from '../renderer/scenes/goldenHour'
import { highwayTheme } from '../renderer/scenes/highway'
import { rainyStudyTheme } from '../renderer/scenes/rainyStudy'
import { KeyLights } from './KeyLights'
import { midiColorByte, pianoMPaletteMessages, themeHandLights } from './pianoMColors'
import { PIANO_M_ALL_ID, resetPianoMPortsForTests } from './pianoMPorts'

function resetGuide(): void {
  setKeyboardRange({
    ...FULL_PIANO_RANGE,
    followMidi: false,
    controllerLow: null,
    calibrated: false,
    fitToRange: true,
  })
  setHandPractice({ hand: 'both', otherHandAudible: true })
}

vi.mock('tone', () => ({
  getContext: () => ({ rawContext: { state: 'running' } }),
  start: () => Promise.resolve(),
}))

function midiMessages(send: { mock: { calls: unknown[][] } }): number[][] {
  const out: number[][] = []
  for (const call of send.mock.calls) {
    const bytes = call[0]
    if (!Array.isArray(bytes)) continue
    for (let i = 0; i + 2 < bytes.length; i += 3) out.push(bytes.slice(i, i + 3))
  }
  return out
}

function file(): MidiFile {
  return {
    name: 'lights.mid',
    duration: 3,
    bpm: 120,
    timeSignature: [4, 4],
    ...nominalTempoMap(120, [4, 4]),
    tracks: [
      {
        id: 'right',
        name: 'Right',
        channel: 2,
        instrument: 0,
        isDrum: false,
        colorIndex: 0,
        notes: [{ pitch: 60, velocity: 0.5, time: 0.05, duration: 0.1, releaseAt: 3 }],
      },
      {
        id: 'left',
        name: 'Left',
        channel: 4,
        instrument: 0,
        isDrum: false,
        colorIndex: 1,
        notes: [{ pitch: 48, velocity: 1, time: 0.06, duration: 0.02 }],
      },
    ],
  }
}

describe('Key Lights MIDI output', () => {
  let now: number
  let clock: MasterClock
  let lights: KeyLights
  let port: MIDIOutput
  let send: ReturnType<typeof vi.fn>
  let access: MIDIAccess

  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    resetPianoMPortsForTests()
    resetGuide()
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    now = 0
    clock = new MasterClock(() => now)
    send = vi.fn()
    // Chromium implements send() but not clear().
    port = { id: 'keezi', name: 'KEEZI', state: 'connected', send } as unknown as MIDIOutput
    access = { outputs: new Map([[port.id, port]]) } as unknown as MIDIAccess
    lights = new KeyLights(clock)
    lights.setAccess(access)
    lights.load(file())
  })

  afterEach(() => {
    lights.dispose()
    clock.dispose()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  function enable(): void {
    lights.configure({ outputId: 'keezi' })
    send.mockClear()
  }

  function advance(time: number): void {
    now = time
    vi.advanceTimersByTime(100)
  }

  it('keeps output opt-in, including when a device is already connected', () => {
    clock.play()
    advance(0.1)
    expect(send).not.toHaveBeenCalled()
    expect(lights.status.value).toBe('off')
    expect(lights.outputs.value).toEqual([{ id: 'keezi', name: 'KEEZI', manufacturer: '' }])
  })

  it('sends due note on/off immediately, including short notes and notated releases', () => {
    enable()
    clock.play()
    expect(send).not.toHaveBeenCalled()
    advance(0.05)
    advance(0.06)
    advance(0.08)
    expect(midiMessages(send)).toEqual([
      [0x92, 60, 64],
      [0x94, 48, 127],
      [0x84, 48, 0],
    ])
    expect(send.mock.calls.every((args) => args.length === 1)).toBe(true)
    advance(0.151)
    expect(send).toHaveBeenLastCalledWith([0x82, 60, 0])
  })

  it('cancels future work and releases active lights on ports without clear()', () => {
    enable()
    clock.play()
    advance(0.065)
    send.mockClear()
    clock.pause()
    expect(midiMessages(send)).toEqual([
      [0x82, 60, 0],
      [0x84, 48, 0],
    ])
    send.mockClear()
    advance(1)
    expect(send).not.toHaveBeenCalled()
  })

  it('rebuilds held notes on seeks and clears lights when seeking past them', () => {
    enable()
    clock.play()
    send.mockClear()
    clock.seek(0.1)
    expect(midiMessages(send)).toContainEqual([0x92, 60, 64])
    send.mockClear()
    clock.seek(2)
    expect(midiMessages(send).every((data) => (data[0]! & 0xf0) === 0x80)).toBe(true)
  })

  it('assigns one channel per track or a single channel from 1–16', () => {
    enable()
    lights.configure({ channelMode: 'track' })
    clock.play()
    advance(0.065)
    expect(midiMessages(send)).toContainEqual([0x90, 60, 64])
    expect(midiMessages(send)).toContainEqual([0x91, 48, 127])
    lights.configure({ channelMode: 'single', channel: 16 })
    expect(midiMessages(send)).toContainEqual([0x9f, 60, 64])
  })

  it('follows playback speed without submitting future timestamps', () => {
    enable()
    clock.play()
    send.mockClear()
    clock.speed = 0.5
    advance(0.05)
    expect(send).not.toHaveBeenCalled()
    advance(0.101)
    expect(midiMessages(send)).toContainEqual([0x92, 60, 64])
  })

  it('sends every note due in one poll as a single MIDI buffer', () => {
    enable()
    clock.play()
    advance(0.065)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith([0x92, 60, 64, 0x94, 48, 127])
  })

  it('uses Synthesia unknown-finger channels 12/13 for inferred left/right tracks', () => {
    enable()
    lights.configure({ channelMode: 'synthesia' })
    clock.play()
    advance(0.065)
    expect(midiMessages(send)).toContainEqual([0x9c, 60, 64])
    expect(midiMessages(send)).toContainEqual([0x9b, 48, 127])
    advance(0.151)
    expect(midiMessages(send)).toContainEqual([0x8c, 60, 0])
  })

  it('splits a single-track file at middle C for the Synthesia hand preset', () => {
    const midi = file()
    midi.tracks[0]!.notes.push(...midi.tracks[1]!.notes)
    midi.tracks = [midi.tracks[0]!]
    lights.load(midi)
    enable()
    lights.configure({ channelMode: 'synthesia' })
    clock.play()
    advance(0.065)
    expect(midiMessages(send)).toContainEqual([0x9c, 60, 64])
    expect(midiMessages(send)).toContainEqual([0x9b, 48, 127])
  })

  it('keeps overlapping notes lit until their final note-off', () => {
    const midi = file()
    midi.tracks = [midi.tracks[0]!]
    midi.tracks[0]!.notes.push({ pitch: 60, velocity: 1, time: 0.1, duration: 0.2 })
    lights.load(midi)
    enable()
    clock.play()
    advance(0.1)
    advance(0.16)
    expect(midiMessages(send).filter((data) => data[0] === 0x92)).toHaveLength(1)
    expect(midiMessages(send).filter((data) => data[0] === 0x82)).toHaveLength(0)
    advance(0.31)
    expect(midiMessages(send).at(-1)).toEqual([0x82, 60, 0])
  })

  it('clears muted tracks immediately and skips drums', () => {
    const midi = file()
    midi.tracks[1]!.isDrum = true
    lights.load(midi)
    enable()
    clock.play()
    advance(0.065)
    expect(midiMessages(send)).not.toContainEqual([0x94, 48, 127])
    send.mockClear()
    lights.setTrackEnabled('right', false)
    expect(midiMessages(send)).toContainEqual([0x82, 60, 0])
    expect(midiMessages(send).every((data) => (data[0]! & 0xf0) === 0x80)).toBe(true)
  })

  it('updates guidance incrementally and keeps it stable during transport transitions', () => {
    enable()
    const note = { pitch: 64, velocity: 0.8, channel: 1, trackIndex: 0 }
    lights.setGuidance([note])
    expect(send).toHaveBeenCalledWith([0x91, 64, 102])
    send.mockClear()
    clock.play()
    clock.pause()
    lights.setGuidance([{ ...note }])
    expect(send).not.toHaveBeenCalled()
    lights.setGuidance([])
    expect(send).toHaveBeenLastCalledWith([0x81, 64, 0])
    lights.load(null)
  })

  it('reconnects only the selected device and contains send failures', () => {
    enable()
    clock.play()
    advance(0.065)
    ;(port as unknown as { state: string }).state = 'disconnected'
    lights.setAccess(access)
    expect(lights.status.value).toBe('disconnected')
    expect(lights.outputs.value).toEqual([])
    send.mockClear()
    advance(0.01)
    expect(send).not.toHaveBeenCalled()
    ;(port as unknown as { state: string }).state = 'connected'
    lights.setAccess(access)
    expect(lights.status.value).toBe('connected')
    send.mockImplementation(() => {
      throw new Error('Device disconnected')
    })
    expect(() => clock.seek(0.1)).not.toThrow()
    expect(lights.status.value).toBe('error')
  })

  it('turns off active lights on page exit and disposal', () => {
    enable()
    clock.play()
    advance(0.065)
    send.mockClear()
    window.dispatchEvent(new Event('pagehide'))
    expect(midiMessages(send)).toContainEqual([0x82, 60, 0])
    lights.dispose()
    send.mockClear()
    clock.seek(0)
    expect(send).not.toHaveBeenCalled()
  })

  it.each([12, -60])('skips invalid MIDI pitches after transposing by %s', (transpose) => {
    const midi = file()
    midi.tracks[0]!.notes[0]!.pitch = 127
    lights.load(deriveMidi(midi, { transpose }))
    send.mockImplementation((bytes: number[]) => {
      if (bytes.slice(1).some((byte) => byte < 0 || byte > 127))
        throw new TypeError('Invalid MIDI byte')
    })
    enable()
    clock.play()
    advance(0.065)
    expect(lights.status.value).toBe('connected')
    expect(midiMessages(send)).toHaveLength(1)
    expect(midiMessages(send)[0]![1]).toBe(transpose > 0 ? 60 : 67)
  })

  it('keeps a failed release batch from escaping playback', () => {
    enable()
    clock.play()
    advance(0.065)
    send.mockClear()
    send.mockImplementationOnce(() => {
      throw new Error('Failed release')
    })
    expect(() => clock.pause()).not.toThrow()
    expect(send).toHaveBeenCalledTimes(1)
    expect(midiMessages(send)).toEqual([
      [0x82, 60, 0],
      [0x84, 48, 0],
    ])
  })

  it('restores playback and practice lights after returning from the page cache', () => {
    enable()
    clock.play()
    advance(0.065)
    window.dispatchEvent(new Event('pagehide'))
    send.mockClear()
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    expect(midiMessages(send)).toContainEqual([0x92, 60, 64])
    clock.pause()
    lights.setPracticeMode(true)
    lights.setGuidance([{ pitch: 64, velocity: 1, channel: 0, trackIndex: 0 }])
    window.dispatchEvent(new Event('pagehide'))
    send.mockClear()
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    expect(send).toHaveBeenCalledWith([0x90, 64, 127])
  })
})

describe('ROLI Piano M key lights', () => {
  let now: number
  let clock: MasterClock
  let lights: KeyLights
  let send: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    resetPianoMPortsForTests()
    resetGuide()
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    now = 0
    clock = new MasterClock(() => now)
    send = vi.fn()
    const port = {
      id: 'piano-m',
      name: 'ROLI Piano M',
      state: 'connected',
      send,
    } as unknown as MIDIOutput
    const access = { outputs: new Map([[port.id, port]]) } as unknown as MIDIAccess
    lights = new KeyLights(clock)
    lights.setAccess(access)
    lights.configure({ outputId: 'piano-m', channelMode: 'pianoM' })
    send.mockClear()
  })

  afterEach(() => {
    lights.dispose()
    clock.dispose()
    resetGuide()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  function play(midi: MidiFile): void {
    lights.load(midi)
    clock.play()
    now = 0.1
    vi.advanceTimersByTime(100)
  }

  function song(pitches: number[]): MidiFile {
    return {
      name: 'guide.mid',
      duration: 2,
      bpm: 120,
      timeSignature: [4, 4],
      ...nominalTempoMap(120, [4, 4]),
      tracks: [
        {
          id: 'piano',
          name: 'Piano',
          channel: 0,
          instrument: 0,
          isDrum: false,
          colorIndex: 0,
          notes: pitches.map((pitch) => ({ pitch, velocity: 1, time: 0, duration: 1 })),
        },
      ],
    }
  }

  it('lights the factory lowest key for a C4 window before calibration', () => {
    setKeyboardRange({
      start: 60,
      size: 24,
      calibrated: false,
      controllerLow: null,
      fitToRange: true,
    })
    play(song([60]))
    expect(send).toHaveBeenCalledWith([0x9c, 60, 127])
  })

  it('lights the factory lowest key for the window low note on an uncalibrated C3 window', () => {
    setKeyboardRange({
      start: 48,
      size: 24,
      calibrated: false,
      controllerLow: null,
      fitToRange: true,
    })
    play(song([48]))
    expect(send).toHaveBeenCalledWith([0x9b, 60, 127])
  })

  it('uses the calibrated lowest key after the player presses it', () => {
    setKeyboardRange({ start: 60, size: 24, calibrated: true, controllerLow: 48, fitToRange: true })
    play(song([60]))
    expect(send).toHaveBeenCalledWith([0x9c, 48, 127])
  })

  it('lights one left-hand guide on the displayed key, measured from C4', () => {
    setKeyboardRange({
      start: 60,
      size: 48,
      calibrated: false,
      controllerLow: null,
      fitToRange: true,
    })
    // F3 is below middle C, so it is the left hand. Fit draws it on F4.
    // F4 is MIDI 65, five semitones above C4: the 4th white key, not an edge.
    play(song([53]))
    expect(
      midiMessages(send)
        .filter((message) => (message[0]! & 0xf0) === 0x90)
        .map((message) => [message[0], message[1]]),
    ).toEqual([[0x9b, 65]])
  })

  it('lights a 48-key chord on both boards and does not clamp notes outside it', () => {
    setKeyboardRange({
      start: 60,
      size: 48,
      calibrated: false,
      controllerLow: null,
      fitToRange: true,
    })
    play(song([59, 60, 65, 83, 84, 107, 108]))
    const pitches = midiMessages(send)
      .filter((message) => (message[0]! & 0xf0) === 0x90)
      .map((message) => message[1])
      .sort((a, b) => a! - b!)
    // 59 folds to 71 and 108 folds to 96. Neither is shoved onto an edge key.
    expect(pitches).toEqual([60, 65, 71, 83, 84, 96, 107])
    expect(pitches).not.toContain(59)
    expect(pitches).not.toContain(108)
  })

  it('spreads a centred 48-key window across both boards and colours each note', () => {
    lights.setTheme(highwayTheme)
    send.mockClear()
    const window = resizeKeyboardRangeSnapped(FULL_PIANO_RANGE, 48)
    setKeyboardRange({
      ...window,
      calibrated: false,
      controllerLow: null,
      fitToRange: true,
    })
    play(song([48, 60, 83]))
    const notes = midiMessages(send).filter((message) => (message[0]! & 0xf0) === 0x90)
    expect(notes.map((message) => message[1])).toEqual([72, 84, 107])
    expect(midiMessages(send)).toEqual(expect.arrayContaining([[0xbb, 23, 60]]))
    const yellow = highwayLaneColor(60)
    expect(midiMessages(send)).toEqual(
      expect.arrayContaining([
        [0xbc, 20, midiColorByte((yellow >> 16) & 0xff)],
        [0xbc, 21, midiColorByte((yellow >> 8) & 0xff)],
        [0xbc, 22, midiColorByte(yellow & 0xff)],
      ]),
    )
  })

  it('sends the whole window to one selected Piano M port', () => {
    setKeyboardRange({
      start: 60,
      size: 48,
      calibrated: false,
      controllerLow: null,
      fitToRange: true,
    })
    play(song([60, 83, 84, 107]))
    expect(midiMessages(send)).toEqual([
      [0x9c, 60, 127],
      [0x9c, 83, 127],
      [0x9c, 84, 127],
      [0x9c, 107, 127],
    ])
  })

  it('folds a note into the window and lights the physical key for that sounding pitch', () => {
    setKeyboardRange({
      start: 48,
      size: 24,
      calibrated: false,
      controllerLow: null,
      fitToRange: true,
    })
    play(song([84]))
    // 84 folds two octaves to 60; the Piano M key that plays 60 sends 72.
    expect(send).toHaveBeenCalledWith([0x9c, 72, 127])
  })

  it('skips a note the window cannot hold when fit is off', () => {
    setKeyboardRange({
      start: 48,
      size: 24,
      calibrated: false,
      controllerLow: null,
      fitToRange: false,
    })
    play(song([84, 60]))
    expect(send.mock.calls.map(([data]) => data)).toEqual([[0x9c, 72, 127]])
  })

  it('lights only the practised hand, and colours both hands on channels 12 and 13', () => {
    setKeyboardRange({
      start: 48,
      size: 24,
      calibrated: false,
      controllerLow: null,
      fitToRange: false,
    })
    setHandPractice({ hand: 'left' })
    play(song([48, 60]))
    expect(send.mock.calls.map(([data]) => data)).toEqual([[0x9b, 60, 127]])
    send.mockClear()
    setHandPractice({ hand: 'both' })
    expect(midiMessages(send)).toEqual([
      [0x8b, 60, 0],
      [0x9b, 60, 127],
      [0x9c, 72, 127],
    ])
  })

  it('releases the physical key on pause and retargets it when the window moves', () => {
    setKeyboardRange({
      start: 60,
      size: 24,
      calibrated: false,
      controllerLow: null,
      fitToRange: false,
    })
    play(song([60]))
    expect(send).toHaveBeenCalledWith([0x9c, 60, 127])
    send.mockClear()
    clock.pause()
    expect(send).toHaveBeenCalledWith([0x8c, 60, 0])
    clock.play()
    send.mockClear()
    setKeyboardRange({
      start: 48,
      size: 24,
      calibrated: false,
      controllerLow: null,
      fitToRange: false,
    })
    expect(send.mock.calls.map(([data]) => data)).toEqual([
      [0x8c, 60, 0],
      [0x9c, 72, 127],
    ])
  })

  it('guides a waited chord on the physical keys, using the written pitch for hand colour', () => {
    setKeyboardRange({
      start: 48,
      size: 24,
      calibrated: false,
      controllerLow: null,
      fitToRange: true,
    })
    lights.load(song([48, 84]))
    lights.setPracticeMode(true)
    lights.setGuidance([
      { pitch: 48, sourcePitch: 48, velocity: 1, channel: 0, trackIndex: 0 },
      { pitch: 60, sourcePitch: 84, velocity: 1, channel: 0, trackIndex: 0 },
    ])
    expect(midiMessages(send).sort()).toEqual([
      [0x9b, 60, 127],
      [0x9c, 72, 127],
    ])
    send.mockClear()
    setHandPractice({ hand: 'left' })
    expect(midiMessages(send)).toEqual([
      [0x8b, 60, 0],
      [0x8c, 72, 0],
      [0x9b, 60, 127],
    ])
  })

  it('sends Golden Hour hand colours, then replaces them when the scene changes', () => {
    lights.setTheme(goldenHourTheme)
    expect(midiMessages(send)).toEqual(
      pianoMPaletteMessages(themeHandLights(goldenHourTheme), getKeyboardRange()),
    )
    send.mockClear()
    lights.setTheme(rainyStudyTheme)
    expect(midiMessages(send)).toEqual(
      pianoMPaletteMessages(themeHandLights(rainyStudyTheme), getKeyboardRange()),
    )

    send.mockClear()
    lights.configure({ channelMode: 'original' })
    send.mockClear()
    lights.setTheme(goldenHourTheme)
    expect(send).not.toHaveBeenCalled()

    lights.configure({ channelMode: 'pianoM' })
    send.mockClear()
    setKeyboardRange({
      start: 48,
      size: 24,
      calibrated: false,
      controllerLow: null,
      fitToRange: true,
    })
    expect(midiMessages(send)).toEqual(
      pianoMPaletteMessages(themeHandLights(goldenHourTheme), getKeyboardRange()),
    )
    send.mockClear()
    play(song([48]))
    expect(send.mock.calls.map(([data]) => data)).toEqual([[0x9b, 60, 127]])
  })
})

describe('several Piano M outputs', () => {
  let now: number
  let clock: MasterClock
  let lights: KeyLights
  let sendA: ReturnType<typeof vi.fn>
  let sendB: ReturnType<typeof vi.fn>
  let access: MIDIAccess

  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    resetPianoMPortsForTests()
    resetGuide()
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    now = 0
    clock = new MasterClock(() => now)
    sendA = vi.fn()
    sendB = vi.fn()
    const portA = {
      id: 'lumi-a',
      name: 'LUMI Keys BLOCK',
      manufacturer: 'ROLI',
      state: 'connected',
      send: sendA,
    } as unknown as MIDIOutput
    const portB = {
      id: 'lumi-b',
      name: 'LUMI Keys BLOCK',
      manufacturer: 'ROLI',
      state: 'connected',
      send: sendB,
    } as unknown as MIDIOutput
    const roland = {
      id: 'roland',
      name: 'Roland FANTOM',
      manufacturer: 'Roland',
      state: 'connected',
      send: vi.fn(),
    } as unknown as MIDIOutput
    access = {
      outputs: new Map([
        [portA.id, portA],
        [portB.id, portB],
        [roland.id, roland],
      ]),
    } as unknown as MIDIAccess
    lights = new KeyLights(clock)
    lights.setAccess(access)
    lights.setTheme(goldenHourTheme)
    sendA.mockClear()
    sendB.mockClear()
  })

  afterEach(() => {
    lights.dispose()
    clock.dispose()
    resetPianoMPortsForTests()
    resetGuide()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  function play(pitches: number[]): void {
    lights.load({
      name: 'guide.mid',
      duration: 2,
      bpm: 120,
      timeSignature: [4, 4],
      ...nominalTempoMap(120, [4, 4]),
      tracks: [
        {
          id: 'piano',
          name: 'Piano',
          channel: 0,
          instrument: 0,
          isDrum: false,
          colorIndex: 0,
          notes: pitches.map((pitch) => ({ pitch, velocity: 1, time: 0, duration: 1 })),
        },
      ],
    })
    clock.play()
    now = 0.1
    vi.advanceTimersByTime(100)
  }

  it('defaults to every Piano M board', () => {
    expect(lights.settings.value.outputId).toBe(PIANO_M_ALL_ID)
    expect(lights.settings.value.channelMode).toBe('pianoM')
    expect(lights.boardOrder.value).toEqual(['lumi-a', 'lumi-b'])
    lights.configure({ outputId: '' })
    expect(lights.settings.value.outputId).toBe('')
    lights.setAccess(access)
    expect(lights.settings.value.outputId).toBe('')
  })

  it('sends every note and one lowest note to each board', () => {
    sendA.mockClear()
    sendB.mockClear()
    setKeyboardRange({
      start: 60,
      size: 48,
      calibrated: false,
      controllerLow: null,
      fitToRange: true,
    })
    play([60, 83, 84, 107])
    const colours = themeHandLights(goldenHourTheme)
    const shared = [
      [0x9c, 60, 127],
      [0x9c, 83, 127],
      [0x9c, 84, 127],
      [0x9c, 107, 127],
    ]
    expect(midiMessages(sendA).filter((message) => (message[0]! & 0xf0) === 0x90)).toEqual(shared)
    expect(midiMessages(sendB).filter((message) => (message[0]! & 0xf0) === 0x90)).toEqual(shared)
    const palette = pianoMPaletteMessages(colours, getKeyboardRange())
    expect(midiMessages(sendA)).toEqual(expect.arrayContaining(palette))
    expect(midiMessages(sendB)).toEqual(expect.arrayContaining(palette))
    expect(midiMessages(sendA)).toEqual(expect.arrayContaining([[0xbb, 23, 60]]))
    expect(midiMessages(sendB)).not.toEqual(expect.arrayContaining([[0xbb, 23, 84]]))
  })

  it('remembers a swapped order and still sends one shared stream', () => {
    setKeyboardRange({
      start: 60,
      size: 48,
      calibrated: false,
      controllerLow: null,
      fitToRange: true,
    })
    lights.swapPianoMBoards()
    expect(lights.boardOrder.value).toEqual(['lumi-b', 'lumi-a'])
    sendA.mockClear()
    sendB.mockClear()
    lights.setTheme(goldenHourTheme)
    play([60, 84])
    const notes = [
      [0x9c, 60, 127],
      [0x9c, 84, 127],
    ]
    expect(midiMessages(sendA).filter((message) => message[0] === 0x9c)).toEqual(notes)
    expect(midiMessages(sendB).filter((message) => message[0] === 0x9c)).toEqual(notes)
    expect(midiMessages(sendA)).toEqual(expect.arrayContaining([[0xbb, 23, 60]]))
    expect(midiMessages(sendB)).toEqual(expect.arrayContaining([[0xbb, 23, 60]]))
  })

  it('sends one selected port the whole stream', () => {
    lights.configure({ outputId: 'lumi-b' })
    setKeyboardRange({
      start: 60,
      size: 48,
      calibrated: false,
      controllerLow: null,
      fitToRange: true,
    })
    sendA.mockClear()
    sendB.mockClear()
    lights.setTheme(goldenHourTheme)
    play([60, 84])
    expect(sendA).not.toHaveBeenCalled()
    expect(midiMessages(sendB).filter((message) => message[0] === 0x9c)).toEqual([
      [0x9c, 60, 127],
      [0x9c, 84, 127],
    ])
    expect(midiMessages(sendB)).toEqual(expect.arrayContaining([[0xbb, 23, 60]]))
  })

  it('holds a sweep for one board on one port', () => {
    sendA.mockClear()
    sendB.mockClear()
    lights.startBoardSweep(0, 'lumi-a')
    const onA = midiMessages(sendA)
    expect(onA.some((message) => message[0] === 0x9c && message[1] === 60)).toBe(true)
    expect(onA.some((message) => message[0] === 0x9c && message[1] === 83)).toBe(true)
    expect(onA.some((message) => message[0] === 0x9c && message[1] === 84)).toBe(false)
    expect(onA).toEqual(expect.arrayContaining([[0xbb, 23, 60]]))
    expect(sendB).not.toHaveBeenCalled()
    expect(lights.sentLog.value.some((row) => row.portId === 'lumi-a')).toBe(true)
    lights.startBoardSweep(1, 'lumi-b')
    const onB = midiMessages(sendB)
    expect(onB.some((message) => message[0] === 0x9c && message[1] === 84)).toBe(true)
    expect(onB.some((message) => message[0] === 0x9c && message[1] === 60)).toBe(false)
    expect(onB).toEqual(expect.arrayContaining([[0xbb, 23, 60]]))
    expect(midiMessages(sendA).some((message) => message[0] === 0x8c && message[1] === 60)).toBe(
      true,
    )
  })
})
