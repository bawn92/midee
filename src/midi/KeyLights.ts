import type { MasterClock } from '../core/clock/MasterClock'
import { getHandPractice, subscribeHandPractice } from '../core/handPractice'
import {
  controllerKeyLow,
  DEFAULT_CONTROLLER_LOW,
  getKeyboardRange,
  PIANO_M_KEYS_PER_BOARD,
  placedPitch,
  subscribeKeyboardRange,
  unmapControllerPitch,
} from '../core/keyboardRange'
import { noteHandOf, noteMatchesHandOf } from '../core/midi/hands'
import type { MidiFile } from '../core/midi/types'
import { jsonPersisted } from '../core/persistence'
import type { Theme } from '../renderer/theme'
import { createEventSignal } from '../store/eventSignal'
import { isPianoMPortName } from './pianoM'
import {
  PIANO_M_CC_BASE,
  pianoMBoardBase,
  pianoMPaletteMessages,
  themeHandLights,
} from './pianoMColors'
import {
  getPianoMPortPrefs,
  markPianoMOutputChosen,
  PIANO_M_ALL_ID,
  type PianoMPortInfo,
  rememberPianoMPorts,
  swapPianoMPorts,
} from './pianoMPorts'

export type KeyLightsChannelMode = 'original' | 'track' | 'single' | 'synthesia' | 'pianoM'

export interface KeyLightsSettings {
  outputId: string
  channelMode: KeyLightsChannelMode
  channel: number // 1–16 in the UI
}

export interface LightNote {
  pitch: number
  // Written pitch when `pitch` was already folded for practice. Hand colour
  // follows this so a note folded across middle C keeps its hand.
  sourcePitch?: number
  velocity: number
  channel: number // zero-based MIDI channel
  trackIndex: number
}

interface LightEvent extends LightNote {
  time: number
  on: boolean
}

const IDENTIFY_ON_MS = 450
const IDENTIFY_GAP_MS = 120

const defaults: KeyLightsSettings = { outputId: '', channelMode: 'original', channel: 1 }
const preferences = jsonPersisted('midee.keyLights', defaults, (raw): KeyLightsSettings => {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    outputId: typeof value.outputId === 'string' ? value.outputId : '',
    channelMode:
      value.channelMode === 'track' ||
      value.channelMode === 'single' ||
      value.channelMode === 'synthesia' ||
      value.channelMode === 'pianoM'
        ? value.channelMode
        : 'original',
    channel:
      typeof value.channel === 'number' &&
      Number.isInteger(value.channel) &&
      value.channel >= 1 &&
      value.channel <= 16
        ? value.channel
        : 1,
  }
})

// Note on/off drive the lights. Sustain and audio tails do not extend them
// past the notated note end. Piano M mode also sends the theme's hand colours
// as control changes so the littlefoot script can paint them.
export class KeyLights {
  readonly settings = createEventSignal(preferences.load())
  readonly outputs = createEventSignal<PianoMPortInfo[]>([])
  // Left-to-right ids of the connected Piano M / LUMI outputs.
  readonly boardOrder = createEventSignal<string[]>([])
  readonly status = createEventSignal<'off' | 'connected' | 'disconnected' | 'error'>('off')
  private access: MIDIAccess | null = null
  private output: MIDIOutput | null = null
  private boundKey = ''
  private muted = false
  private identifying = false
  private identifyTimer: ReturnType<typeof setTimeout> | null = null
  private identifyGen = 0
  private applyingDefault = false
  private midi: MidiFile | null = null
  private disabled = new Set<string>()
  private events: LightEvent[] = []
  private handChannels = new Map<number, number>()
  private cursor = 0
  private counts = new Map<number, number>()
  private guidance: readonly LightNote[] | null = null
  private shownGuidance = new Map<number, LightNote>()
  private practiceMode = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly unsubscribe: () => void
  private readonly unsubscribeRange: () => void
  private readonly unsubscribeHand: () => void
  private disposed = false
  private theme: Theme | null = null

  constructor(private readonly clock: MasterClock) {
    this.unsubscribe = clock.subscribeTransport(() => {
      // Practice owns which chord is shown. Its clock pauses/seeks/resumes
      // internally; those transitions must not reset or replay the LEDs.
      if (!this.practiceMode && this.guidance === null) this.restart()
    })
    // Window, calibration, fit, and hand changes retarget lights immediately.
    const retarget = (): void => {
      if (this.disposed) return
      this.rebuild()
      this.sendPalette()
    }
    this.unsubscribeRange = subscribeKeyboardRange(retarget)
    this.unsubscribeHand = subscribeHandPractice(retarget)
    window.addEventListener('pagehide', this.onPageHide)
    window.addEventListener('pageshow', this.onPageShow)
  }

  setAccess(access: MIDIAccess | null): void {
    this.access = access
    this.muted = false
    const listed = [...(access?.outputs.values() ?? [])]
      .filter((port) => port.state === 'connected')
      .map((port) => ({
        id: port.id,
        name: port.name || port.id,
        manufacturer: port.manufacturer || '',
      }))
    this.outputs.set(listed)
    const pianoIds = listed
      .filter((port) => isPianoMPortName(port.name, port.manufacturer))
      .map((port) => port.id)
    this.boardOrder.set(rememberPianoMPorts(pianoIds))
    if (this.maybeDefaultAll(pianoIds)) return
    this.bindOutput()
  }

  // The Piano M script paints channels 12/13 with these colours and repaints
  // keys that are already on, so a theme change does not need new note-ons.
  setTheme(theme: Theme): void {
    this.theme = theme
    this.sendPalette()
  }

  configure(patch: Partial<KeyLightsSettings>): void {
    const nextPatch =
      patch.outputId === PIANO_M_ALL_ID && patch.channelMode === undefined
        ? { ...patch, channelMode: 'pianoM' as const }
        : patch
    this.stop()
    this.output = null
    this.muted = false
    this.settings.set({ ...this.settings.value, ...nextPatch })
    preferences.save(this.settings.value)
    if ('outputId' in nextPatch) markPianoMOutputChosen()
    this.setAccess(this.access)
  }

  // Flashes each connected Piano M in left-to-right order so the player can
  // confirm which port is the left board. Swap reverses that saved order.
  identifyPianoMBoards(): void {
    const boards = this.pianoMOutputPorts()
    if (boards.length < 2) return
    this.stop()
    const generation = this.identifyGen
    this.identifying = true
    const range = getKeyboardRange()
    const low = this.lightLow()
    const step = (index: number): void => {
      if (generation !== this.identifyGen || !this.identifying || this.disposed) return
      const port = boards[index]
      if (!port) {
        this.identifying = false
        this.sendPalette()
        this.restart()
        return
      }
      const base = pianoMBoardBase(low, index)
      const on = [0xbb, 123, 0]
      for (const message of pianoMPaletteMessages(
        { left: 0xffffff, right: 0xffffff },
        range,
        index,
      )) {
        on.push(...message)
      }
      for (let key = 0; key < PIANO_M_KEYS_PER_BOARD; key++) {
        const note = base + key
        if (note > 127) break
        on.push(0x9c, note, 127)
      }
      this.dispatch(port, on, false)
      this.identifyTimer = setTimeout(() => {
        this.identifyTimer = null
        if (generation !== this.identifyGen || !this.identifying) return
        const off: number[] = []
        for (let key = 0; key < PIANO_M_KEYS_PER_BOARD; key++) {
          const note = base + key
          if (note > 127) break
          off.push(0x8c, note, 0)
        }
        this.dispatch(port, off, false)
        this.identifyTimer = setTimeout(() => {
          this.identifyTimer = null
          step(index + 1)
        }, IDENTIFY_GAP_MS)
      }, IDENTIFY_ON_MS)
    }
    step(0)
  }

  swapPianoMBoards(): void {
    const connected = [...this.boardOrder.value]
    if (connected.length < 2) return
    const wasIdentifying = this.identifying
    this.boardOrder.set(swapPianoMPorts(connected))
    if (wasIdentifying) {
      this.identifyPianoMBoards()
      return
    }
    this.stop()
    this.restart()
    this.sendPalette()
  }

  load(midi: MidiFile | null, disabledTracks: Iterable<string> = []): void {
    this.midi = midi
    this.guidance = null
    this.practiceMode = false
    this.disabled = new Set(disabledTracks)
    this.rebuild()
  }

  setTrackEnabled(id: string, enabled: boolean): void {
    if (enabled) this.disabled.delete(id)
    else this.disabled.add(id)
    this.rebuild()
  }

  setGuidance(notes: readonly LightNote[] | null): void {
    if (notes === null && this.guidance === null) return
    const enteringGuidance = this.guidance === null
    this.guidance = notes
    if (notes === null) this.restart()
    else {
      if (enteringGuidance) this.stop()
      this.syncGuidance()
    }
  }

  setPracticeMode(enabled: boolean): void {
    if (enabled === this.practiceMode) return
    this.practiceMode = enabled
    this.guidance = null
    this.restart()
  }

  private syncGuidance(): void {
    if (this.disposed || this.identifying || !this.hasDestination()) return
    const desired = new Map<number, LightNote>()
    for (const note of this.guidance ?? []) {
      const placed = this.place(note)
      if (!placed) continue
      const track = this.midi?.tracks[note.trackIndex]
      if (track && this.disabled.has(track.id)) continue
      desired.set(this.channel(placed) * 128 + placed.pitch, placed)
    }
    for (const [key] of this.shownGuidance) {
      if (desired.has(key)) continue
      this.send([0x80 | Math.floor(key / 128), key % 128, 0])
      if (!this.hasDestination()) return
      this.shownGuidance.delete(key)
    }
    for (const [key, note] of desired) {
      if (this.shownGuidance.has(key)) continue
      this.shownGuidance.set(key, note)
      const velocity = Math.max(1, Math.min(127, Math.round(note.velocity * 127)))
      this.send([0x90 | Math.floor(key / 128), note.pitch, velocity])
      if (!this.hasDestination()) return
    }
    this.shownGuidance = desired
  }

  private rebuild(): void {
    this.events = []
    this.handChannels.clear()
    const pianoTracks = this.midi?.tracks.filter((track) => !track.isDrum && track.notes.length > 0)
    this.midi?.tracks.forEach((track, trackIndex) => {
      if ((pianoTracks?.length ?? 0) > 1 && track.notes.length > 0) {
        // Synthesia's one-based channels 12/13 mean left/right, unknown finger.
        // A named or channel-assigned part wins. Otherwise the track's average
        // pitch is the old middle-C guess, and a single piano track stays
        // per-note (handChannels left unset).
        if (track.hand === 'left' || track.hand === 'right') {
          this.handChannels.set(trackIndex, track.hand === 'left' ? 11 : 12)
        } else {
          const average =
            track.notes.reduce((sum, note) => sum + note.pitch, 0) / track.notes.length
          this.handChannels.set(trackIndex, average < 60 ? 11 : 12)
        }
      }
      if (track.isDrum || this.disabled.has(track.id)) return
      for (const note of track.notes) {
        if (note.duration <= 0) continue
        const light = this.place({
          pitch: note.pitch,
          sourcePitch: note.pitch,
          velocity: note.velocity,
          channel: track.channel,
          trackIndex,
        })
        if (!light) continue
        this.events.push({ ...light, time: note.time, on: true })
        this.events.push({ ...light, time: note.time + note.duration, on: false })
      }
    })
    // Release before re-striking the same key at a shared boundary.
    this.events.sort((a, b) => a.time - b.time || Number(a.on) - Number(b.on))
    this.restart()
  }

  // File pitch → the raw note the controller key sends. Fit folds into the
  // window first; unmap then undoes calibration so the lit key is the one
  // the player should press. Other-hand and unreachable notes are skipped.
  private place(note: LightNote): LightNote | null {
    const sourcePitch = Math.round(note.sourcePitch ?? note.pitch)
    // A transposed file can carry pitches outside a MIDI byte. Those are not
    // notes to fold into the window.
    if (sourcePitch < 0 || sourcePitch > 127) return null
    const track = this.midi?.tracks[note.trackIndex]
    if (!noteMatchesHandOf(track, sourcePitch, getHandPractice().hand)) return null
    const range = getKeyboardRange()
    const placed = placedPitch(sourcePitch, range)
    if (!placed) return null
    const pitch = unmapControllerPitch(placed.pitch, range)
    if (pitch === null) return null
    return { ...note, pitch, sourcePitch }
  }

  private channel(note: LightNote): number {
    const settings = this.settings.value
    if (settings.channelMode === 'single') return settings.channel - 1
    const handPitch = note.sourcePitch ?? note.pitch
    const track = this.midi?.tracks[note.trackIndex]
    // Piano M littlefoot listeners (and Synthesia's LUMI script) colour
    // channel 12 left and channel 13 right. An assigned track uses that hand
    // for every note. A single unnamed piano track still splits at middle C.
    const hand = noteHandOf(track, handPitch)
    if (settings.channelMode === 'pianoM') return hand === 'left' ? 11 : 12
    if (settings.channelMode === 'synthesia') {
      if (track?.hand === 'left' || track?.hand === 'right') return hand === 'left' ? 11 : 12
      return this.handChannels.get(note.trackIndex) ?? (hand === 'left' ? 11 : 12)
    }
    if (settings.channelMode === 'track') return note.trackIndex % 16
    return note.channel & 0x0f
  }

  private sendPalette(): void {
    if (this.disposed || this.identifying || !this.hasDestination() || !this.theme) return
    if (this.settings.value.channelMode !== 'pianoM') return
    const batch: number[] = []
    for (const message of pianoMPaletteMessages(themeHandLights(this.theme), getKeyboardRange())) {
      batch.push(...message)
    }
    this.send(batch)
  }

  private send(data: number[]): void {
    this.route(data, true)
  }

  // One Web MIDI send per poll. A chord used to be one IPC per note, and on a
  // Piano M that hitch landed on the same frame as the attack.
  private queue(batch: number[], event: LightNote, on: boolean): void {
    const channel = this.channel(event)
    const key = channel * 128 + event.pitch
    const count = this.counts.get(key) ?? 0
    if (on) {
      this.counts.set(key, count + 1)
      if (count === 0) {
        const velocity = Math.max(1, Math.min(127, Math.round(event.velocity * 127)))
        batch.push(0x90 | channel, event.pitch, velocity)
      }
    } else if (count > 0) {
      if (count === 1) {
        batch.push(0x80 | channel, event.pitch, 0)
        this.counts.delete(key)
      } else this.counts.set(key, count - 1)
    }
  }

  private restart(): void {
    if (this.identifying) return
    this.stop()
    if (this.disposed || !this.hasDestination()) return
    if (this.guidance) {
      this.syncGuidance()
      return
    }
    if (this.practiceMode || !this.clock.playing || !this.midi) return
    const time = this.clock.currentTime
    const held = new Map<number, LightNote>()
    // Reconstruct notes held at the new position, including a seek mid-note.
    this.cursor = 0
    while (this.cursor < this.events.length && this.events[this.cursor]!.time <= time) {
      const event = this.events[this.cursor++]!
      const key = this.channel(event) * 128 + event.pitch
      const count = this.counts.get(key) ?? 0
      if (event.on) {
        this.counts.set(key, count + 1)
        held.set(key, event)
      } else if (count <= 1) this.counts.delete(key)
      else this.counts.set(key, count - 1)
    }
    const batch: number[] = []
    for (const [key] of this.counts) {
      const velocity = Math.max(1, Math.min(127, Math.round(held.get(key)!.velocity * 127)))
      batch.push(0x90 | Math.floor(key / 128), key % 128, velocity)
    }
    this.send(batch)
    if (!this.hasDestination()) return
    // Chromium cannot cancel timestamped MIDI messages (no output.clear()).
    // A local timer can be cleared on pause, so nothing is left queued in the
    // browser. The wait matches the next note instead of polling every 10ms.
    this.schedule()
  }

  private schedule(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.identifying || !this.hasDestination() || !this.clock.playing) return
    const time = this.clock.currentTime
    const batch: number[] = []
    while (this.cursor < this.events.length && this.events[this.cursor]!.time <= time) {
      const event = this.events[this.cursor++]!
      this.queue(batch, event, event.on)
    }
    this.send(batch)
    this.armTimer()
  }

  private armTimer(): void {
    if (
      this.disposed ||
      this.identifying ||
      !this.hasDestination() ||
      !this.clock.playing ||
      this.guidance
    )
      return
    const next = this.events[this.cursor]
    if (!next) return
    const until = (next.time - this.clock.currentTime) * 1000
    const delay = until > 40 ? Math.min(until, 250) : 10
    this.timer = setTimeout(() => {
      this.timer = null
      this.schedule()
    }, delay)
  }

  private stop(): void {
    this.finishIdentify()
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    const active = new Set([...this.counts.keys(), ...this.shownGuidance.keys()])
    const batch: number[] = []
    for (const key of active) batch.push(0x80 | Math.floor(key / 128), key % 128, 0)
    if (batch.length > 0) this.route(batch, false)
    this.counts.clear()
    this.shownGuidance.clear()
  }

  private updateStatus(): void {
    const id = this.settings.value.outputId
    if (!id) {
      this.status.set('off')
      return
    }
    if (this.muted) {
      this.status.set('error')
      return
    }
    if (id === PIANO_M_ALL_ID) {
      this.status.set(this.boardOrder.value.length > 0 ? 'connected' : 'disconnected')
      return
    }
    this.status.set(this.output ? 'connected' : 'disconnected')
  }

  private maybeDefaultAll(pianoIds: readonly string[]): boolean {
    if (this.applyingDefault || pianoIds.length < 2) return false
    if (this.settings.value.outputId !== '') return false
    if (getPianoMPortPrefs().choseOutput) return false
    this.applyingDefault = true
    try {
      this.configure({ outputId: PIANO_M_ALL_ID, channelMode: 'pianoM' })
    } finally {
      this.applyingDefault = false
    }
    return true
  }

  private bindOutput(): void {
    const id = this.settings.value.outputId
    const next = id && id !== PIANO_M_ALL_ID ? (this.access?.outputs.get(id) ?? null) : null
    const connected = next?.state === 'connected' ? next : null
    const key = this.destinationKeyFor(connected)
    if (key !== this.boundKey || connected !== this.output) {
      this.stop()
      this.output = connected
      this.boundKey = key
      this.updateStatus()
      this.restart()
    } else this.updateStatus()
    this.sendPalette()
  }

  private destinationKeyFor(connected: MIDIOutput | null): string {
    const id = this.settings.value.outputId
    if (!id || this.muted) return ''
    if (id === PIANO_M_ALL_ID) {
      return this.boardOrder.value.length > 0 ? `all:${this.boardOrder.value.join(',')}` : ''
    }
    return connected ? `port:${connected.id}` : ''
  }

  private lightLow(): number {
    return controllerKeyLow(getKeyboardRange()) ?? DEFAULT_CONTROLLER_LOW
  }

  private hasDestination(): boolean {
    return this.targets().length > 0
  }

  private pianoMOutputPorts(): MIDIOutput[] {
    if (!this.access) return []
    return this.boardOrder.value.flatMap((id) => {
      const port = this.access?.outputs.get(id)
      return port && port.state === 'connected' ? [port] : []
    })
  }

  private targets(): { port: MIDIOutput; boardIndex: number | null }[] {
    if (this.muted || !this.access) return []
    const settings = this.settings.value
    if (!settings.outputId) return []
    if (settings.outputId === PIANO_M_ALL_ID) {
      const ports = this.boardOrder.value.flatMap((id, boardIndex) => {
        const port = this.access?.outputs.get(id)
        if (!port || port.state !== 'connected') return []
        return [{ port, boardIndex: settings.channelMode === 'pianoM' ? boardIndex : null }]
      })
      return ports
    }
    if (!this.output) return []
    if (settings.channelMode !== 'pianoM') return [{ port: this.output, boardIndex: null }]
    const info = this.outputs.value.find((port) => port.id === this.output?.id)
    if (!info || !isPianoMPortName(info.name, info.manufacturer)) {
      return [{ port: this.output, boardIndex: null }]
    }
    const index = this.boardOrder.value.indexOf(this.output.id)
    return [{ port: this.output, boardIndex: index >= 0 ? index : 0 }]
  }

  private route(data: number[], fatal: boolean): void {
    const targets = this.targets()
    if (targets.length === 0 || data.length === 0) return
    if (targets.every((target) => target.boardIndex === null)) {
      for (const target of targets) {
        if (!this.dispatch(target.port, data, fatal)) return
      }
      return
    }
    const low = this.lightLow()
    const batches = targets.map(() => [] as number[])
    for (let i = 0; i + 2 < data.length; i += 3) {
      const status = data[i] ?? 0
      const data1 = data[i + 1] ?? 0
      const data2 = data[i + 2] ?? 0
      const kind = status & 0xf0
      const noteOff = kind === 0x80 || (kind === 0x90 && data2 === 0)
      if (noteOff) {
        for (const batch of batches) batch.push(status, data1, data2)
        continue
      }
      if (kind === 0x90) {
        const board = Math.floor((data1 - low) / PIANO_M_KEYS_PER_BOARD)
        const slot = targets.findIndex((target) => target.boardIndex === board)
        if (slot >= 0) batches[slot]?.push(status, data1, data2)
        continue
      }
      if (kind === 0xb0 && data1 === PIANO_M_CC_BASE) {
        targets.forEach((target, slot) => {
          batches[slot]?.push(status, data1, pianoMBoardBase(low, target.boardIndex ?? 0))
        })
        continue
      }
      for (const batch of batches) batch.push(status, data1, data2)
    }
    for (let slot = 0; slot < targets.length; slot++) {
      const batch = batches[slot]
      const target = targets[slot]
      if (!batch || batch.length === 0 || !target) continue
      if (!this.dispatch(target.port, batch, fatal)) return
    }
  }

  private dispatch(port: MIDIOutput, data: number[], fatal: boolean): boolean {
    try {
      port.send(data)
      return true
    } catch {
      if (fatal) {
        this.stop()
        this.muted = true
        this.output = null
        this.boundKey = ''
        this.status.set('error')
      }
      return false
    }
  }

  private finishIdentify(): void {
    if (this.identifyTimer !== null) clearTimeout(this.identifyTimer)
    this.identifyTimer = null
    this.identifying = false
    this.identifyGen += 1
  }

  private onPageHide = (): void => this.stop()
  private onPageShow = (event: PageTransitionEvent): void => {
    if (event.persisted) this.restart()
  }

  dispose(): void {
    this.disposed = true
    this.stop()
    this.unsubscribe()
    this.unsubscribeRange()
    this.unsubscribeHand()
    window.removeEventListener('pagehide', this.onPageHide)
    window.removeEventListener('pageshow', this.onPageShow)
  }
}
