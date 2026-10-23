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
import { screenNoteColor } from '../renderer/noteColor'
import type { Theme } from '../renderer/theme'
import { getTrackColor } from '../renderer/theme'
import { createEventSignal } from '../store/eventSignal'
import { subscribePaint } from '../ui/paint'
import { isPianoMPortName } from './pianoM'
import {
  pianoMBoardBase,
  pianoMNoteColorMessages,
  pianoMPaletteMessages,
  themeHandLights,
} from './pianoMColors'
import {
  getPianoMPortPrefs,
  markPianoMOutputChosen,
  PIANO_M_ALL_ID,
  type PianoMPortInfo,
  rememberPianoMPorts,
  setPianoMPortOrder,
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

const defaults: KeyLightsSettings = { outputId: '', channelMode: 'original', channel: 1 }

export interface KeyLightsSend {
  portId: string
  portName: string
  bytes: number[]
  truncated: boolean
}
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
  readonly sentLog = createEventSignal<KeyLightsSend[]>([])
  readonly status = createEventSignal<'off' | 'connected' | 'disconnected' | 'error'>('off')
  private access: MIDIAccess | null = null
  private output: MIDIOutput | null = null
  private boundKey = ''
  private muted = false
  private identifying = false
  private sweepNotes: number[] = []
  private sweepPorts: MIDIOutput[] = []
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
  private readonly unsubscribePaint: () => void
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
    // Hand, finger, and note shape change the block fill. Held keys take the
    // new colour on the next note-on, so restart the notes that are already lit.
    this.unsubscribePaint = subscribePaint(() => {
      if (this.disposed || this.settings.value.channelMode !== 'pianoM' || !this.theme) return
      this.restart()
    })
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

  // Palette CCs name the hand colours. Keys that are already lit keep the
  // colour snapshotted at their note-on, so a theme change sends those
  // note-ons again with the new block colour.
  setTheme(theme: Theme): void {
    this.theme = theme
    this.sendPalette()
    if (!this.disposed && this.settings.value.channelMode === 'pianoM') this.restart()
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

  // Lights one board's range and holds it until the setup flow gets an answer.
  // CC 23 stays the window's lowest note. The note numbers are that note plus
  // 24 times the board index, so a script that knows its index lights only
  // its own keys. `portId` limits the send to one output; the all-boards id
  // sends the same bytes to every Piano M port.
  startBoardSweep(boardIndex: number, portId: string): void {
    this.stop()
    const low = this.lightLow()
    const origin = pianoMBoardBase(low, boardIndex)
    const notes: number[] = []
    for (let key = 0; key < PIANO_M_KEYS_PER_BOARD; key++) {
      const note = origin + key
      if (note > 127) break
      notes.push(note)
    }
    const ports = this.portsForSweep(portId)
    this.sweepNotes = notes
    this.sweepPorts = ports
    this.identifying = true
    const on = [0xbb, 123, 0]
    for (const message of pianoMPaletteMessages(
      { left: 0xffffff, right: 0xffffff },
      getKeyboardRange(),
    )) {
      on.push(...message)
    }
    for (const note of notes) on.push(0x9c, note, 110)
    for (const port of ports) this.dispatch(port, on, false)
  }

  stopBoardSweep(): void {
    if (!this.identifying && this.sweepNotes.length === 0) return
    this.stop()
    this.sendPalette()
    this.restart()
  }

  setPianoMBoardOrder(order: readonly string[]): void {
    const connected = new Set(this.pianoMOutputPorts().map((port) => port.id))
    const stored = setPianoMPortOrder(order)
    this.boardOrder.set(stored.filter((id) => connected.has(id)))
    this.stop()
    this.restart()
    this.sendPalette()
  }

  swapPianoMBoards(): void {
    const connected = [...this.boardOrder.value]
    if (connected.length < 2) return
    this.boardOrder.set(swapPianoMPorts(connected))
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
      const batch: number[] = []
      this.pushNoteOn(batch, Math.floor(key / 128), note.pitch, velocity, note)
      this.send(batch)
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
    const colors = themeHandLights(this.theme)
    const batch: number[] = []
    for (const message of pianoMPaletteMessages(colors, getKeyboardRange())) {
      batch.push(...message)
    }
    this.send(batch)
  }

  private pushNoteOn(
    batch: number[],
    channel: number,
    pitch: number,
    velocity: number,
    event: LightNote,
  ): void {
    // The script copies its colour registers at note-on, and only after a
    // complete red/green/blue triplet. The triplet has to be the bytes
    // immediately before this note-on, including when it matches the previous
    // note on the same hand. A skipped triplet leaves the next key with a
    // stale or half-updated colour.
    if (this.settings.value.channelMode === 'pianoM' && this.theme) {
      const color = this.noteColor(event)
      for (const message of pianoMNoteColorMessages(channel, color)) batch.push(...message)
    }
    batch.push(0x90 | channel, pitch, velocity)
  }

  // Same fill the block is drawn with, for the pitch the block is drawn on.
  private noteColor(event: LightNote): number {
    const theme = this.theme
    if (!theme) return 0xffffff
    const source = Math.round(event.sourcePitch ?? event.pitch)
    const track = this.midi?.tracks[event.trackIndex]
    const trackColor = track ? getTrackColor(track, theme) : (theme.trackColors[0] ?? 0xffffff)
    const hand = noteHandOf(track, source)
    const drawn = placedPitch(source, getKeyboardRange())
    return screenNoteColor(theme, drawn?.pitch ?? source, hand, trackColor)
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
        this.pushNoteOn(batch, channel, event.pitch, velocity, event)
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
      const event = held.get(key)!
      const velocity = Math.max(1, Math.min(127, Math.round(event.velocity * 127)))
      this.pushNoteOn(batch, Math.floor(key / 128), key % 128, velocity, event)
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

  private targets(): MIDIOutput[] {
    if (this.muted || !this.access) return []
    const settings = this.settings.value
    if (!settings.outputId) return []
    if (settings.outputId === PIANO_M_ALL_ID) return this.pianoMOutputPorts()
    return this.output ? [this.output] : []
  }

  // Every Piano M port gets the same bytes. The script on each board keeps
  // the notes in its own range. Sending the same note twice is harmless.
  private route(data: number[], fatal: boolean): void {
    if (data.length === 0) return
    for (const port of this.targets()) {
      if (!this.dispatch(port, data, fatal)) return
    }
  }

  private portsForSweep(portId: string): MIDIOutput[] {
    const ports = this.pianoMOutputPorts()
    if (!portId || portId === PIANO_M_ALL_ID) return ports
    const match = ports.filter((port) => port.id === portId)
    return match.length > 0 ? match : ports
  }

  private dispatch(port: MIDIOutput, data: number[], fatal: boolean): boolean {
    try {
      port.send(data)
      const bytes = data.slice(0, 24)
      const next = [
        ...this.sentLog.value,
        {
          portId: port.id,
          portName: port.name || port.id,
          bytes,
          truncated: data.length > bytes.length,
        },
      ]
      this.sentLog.set(next.slice(-8))
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
    const notes = this.sweepNotes
    const ports = this.sweepPorts
    this.sweepNotes = []
    this.sweepPorts = []
    this.identifying = false
    if (notes.length === 0 || ports.length === 0) return
    const off: number[] = []
    for (const note of notes) off.push(0x8c, note, 0)
    for (const port of ports) this.dispatch(port, off, false)
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
    this.unsubscribePaint()
    window.removeEventListener('pagehide', this.onPageHide)
    window.removeEventListener('pageshow', this.onPageShow)
  }
}
