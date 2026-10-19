import { getContext, getTransport, immediate, Part, start as toneStart } from 'tone'
import { getHandPractice, type Hand } from '../core/handPractice'
import { getKeyboardRange, placedPitch } from '../core/keyboardRange'
import { noteHandOf } from '../core/midi/hands'
import { notesForLoop } from '../deadmau5/loopNotes'
import { audibleDuration, type MidiFile } from '../core/midi/types'
import { createEventSignal } from '../store/eventSignal'
import type { AudioEngine } from './AudioEngine'
import {
  createInstrument,
  type InstrumentId,
  type InstrumentRuntime,
  midiToNoteName,
} from './instruments'
import { setMasterVolume } from './masterBus'

export type { InstrumentId, InstrumentInfo } from './instruments'
export { INSTRUMENTS } from './instruments'

interface NoteEvent {
  note: string
  // Audible (pedal-extended) length at 1× speed. Divided by the CURRENT speed
  // at trigger time — the transport-bpm trick scales event spacing only, and
  // setSpeed can land mid-playback without rebuilding the Part.
  duration: number
  velocity: number
  trackId: string
  // Written pitch, before fit-to-range. The hand gate uses this so a note
  // folded across middle C stays with the hand that played it.
  pitch: number
  hand: 'left' | 'right' | null
}

export class SynthEngine implements AudioEngine {
  private instruments = new Map<InstrumentId, InstrumentRuntime>()
  private loadingPromises = new Map<InstrumentId, Promise<InstrumentRuntime>>()
  // Default voice is Upright (1.2 MB of our own samples) instead of the 30 MB
  // Salamander Grand set that @tonejs/piano pulls from an external CDN —
  // 25× lighter first-load, bulletproof against upstream CDN outages, still
  // musically pleasing. Users who specifically want the concert grand are
  // one tap away in the instrument dropdown.
  private currentId: InstrumentId = 'upright'
  // Emits the currently-active instrument id while its samples/patch are
  // loading, null otherwise. Only tracks the *current* instrument — background
  // preloads of other voices don't flicker the signal.
  readonly loadingInstrument = createEventSignal<InstrumentId | null>(null)
  private midi: MidiFile | null = null
  // Tone.Part holding every note as a single transport entry. Replaces N×2
  // transport.schedule calls on play/seek — O(N) work to build, but building a
  // Part is ~10× faster than N individual schedules on dense MIDIs (tested
  // 10k+ notes), and seek reuses the same Part via `part.start(0, offset)`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private scheduledPart: any | null = null
  private _speed = 1
  private scheduledFromTime = 0
  // Practice loop. `seamless` repeats a Tone.Part on the audio clock so a
  // wrap does not stop the transport. Learn leaves it off: wait mode has to
  // pause, and `play()` only schedules onsets inside the window.
  private practiceWindow: { start: number; end: number } | null = null
  private practiceSeamless = false
  private builtLoop: { start: number; end: number } | null = null
  private readyPromise: Promise<void> = Promise.resolve()
  private liveWarmupStarted = false
  // Latest-wins guard for `play()`. `play()` is async (awaits readyPromise +
  // Tone.start) and can be racing against a subsequent `pause()`. Without
  // this, calling pause during the async window lets the next transport.start
  // at the tail of play() fire after we thought we paused — audio leaks.
  // Each play() call increments; if a newer call or a pause() ran, the older
  // play() bails before hitting transport.start.
  private playGeneration = 0
  // Tracks the user has muted via the Tracks panel. Checked at trigger time
  // inside the scheduled Part — new notes from a disabled track are skipped,
  // notes already in flight finish their natural decay (we don't track per-track
  // voice handles, and stealing them mid-note would click).
  private disabledTrackIds = new Set<string>()
  // Checked at trigger time, same as the track mute, so Hear/Mute doesn't
  // rebuild the Part. Drums are `null` and always pass.
  private practiceHand: Hand = getHandPractice().hand
  private otherHandAudible = getHandPractice().otherHandAudible

  async load(source: MidiFile | AudioBuffer): Promise<void> {
    if (!(source instanceof AudioBuffer)) {
      this.midi = source as MidiFile
    }
    // A new file's tracks are unrelated to whatever the user muted previously.
    this.disabledTrackIds.clear()
    this.readyPromise = this.ensureInstrument(this.currentId).then(() => undefined)
    return this.readyPromise
  }

  setTrackEnabled(trackId: string, enabled: boolean): void {
    if (enabled) this.disabledTrackIds.delete(trackId)
    else this.disabledTrackIds.add(trackId)
  }

  getDisabledTrackIds(): ReadonlySet<string> {
    return this.disabledTrackIds
  }

  setHandGate(hand: Hand, otherHandAudible: boolean): void {
    this.practiceHand = hand
    this.otherHandAudible = otherHandAudible
  }

  // The pause-resume shortcut replays the Part built at the last `play()`.
  // Fit-to-range changes the pitches in that Part, so the next play must
  // rebuild even when the playhead has not moved.
  invalidateScheduledPitches(): void {
    this.scheduledFromTime = -1
  }

  // Kick off piano sample download in the background — safe to call at app
  // boot. AudioContext still requires a user gesture before `play()`.
  preloadDefault(): void {
    void this.ensureInstrument(this.currentId).catch(() => undefined)
  }

  // Switch the active instrument for both scheduled and live playback.
  // Loading is lazy; selecting an unloaded instrument kicks off its init.
  async setInstrument(id: InstrumentId): Promise<void> {
    if (id === this.currentId) return
    // Release anything currently sounding on the old instrument
    this.instruments.get(this.currentId)?.releaseAll()
    this.currentId = id
    await this.ensureInstrument(id)
  }

  get instrument(): InstrumentId {
    return this.currentId
  }

  private ensureInstrument(id: InstrumentId): Promise<InstrumentRuntime> {
    const cached = this.instruments.get(id)
    if (cached) return Promise.resolve(cached)
    const existing = this.loadingPromises.get(id)
    if (existing) return existing

    // Reflect loading in the signal only when we're loading the *current*
    // instrument — preloads of others happen silently in the background.
    if (id === this.currentId) this.loadingInstrument.set(id)

    const clearIfCurrent = (): void => {
      if (this.loadingInstrument.value === id) this.loadingInstrument.set(null)
    }
    const promise = createInstrument(id).then(
      (inst) => {
        this.instruments.set(id, inst)
        this.loadingPromises.delete(id)
        clearIfCurrent()
        return inst
      },
      (err) => {
        this.loadingPromises.delete(id)
        clearIfCurrent()
        throw err
      },
    )
    this.loadingPromises.set(id, promise)
    return promise
  }

  setPracticeLoop(window: { start: number; end: number } | null, seamless: boolean): void {
    this.practiceWindow = window && window.end > window.start ? window : null
    this.practiceSeamless = this.practiceWindow !== null && seamless
  }

  async play(fromTime: number): Promise<void> {
    if (!this.midi) return
    if (this.practiceSeamless && this.practiceWindow) {
      const window = this.practiceWindow
      const from = Math.min(Math.max(fromTime, window.start), window.end - 0.001)
      return this.playLoop(window.start, window.end, from)
    }
    const gen = ++this.playGeneration
    await this.readyPromise
    await toneStart()
    // A pause() or a newer play() happened during the awaits — abandon this
    // invocation so we don't resurrect transport audio against user intent.
    if (gen !== this.playGeneration) return

    const transport = getTransport()
    if (transport.state === 'paused' && Math.abs(fromTime - this.scheduledFromTime) < 0.05) {
      transport.start()
      return
    }

    this.clearScheduled()
    transport.stop()
    transport.position = 0
    this.scheduledFromTime = fromTime

    // Tone converts seconds→ticks using the *current* bpm at schedule time.
    // We schedule at the nominal tempo so every event's tick position encodes
    // the note's original musical moment, then reapply the speed-scaled bpm
    // right before start(). The transport then ticks `speed ×` faster and
    // events fire at `t / speed` wall time — matching MasterClock.currentTime,
    // which advances at `speed × wall`. If we schedule while bpm is already
    // `midi.bpm × speed`, the two scalings cancel and audio plays at 1× while
    // the visual clock is at `speed ×` → desync on fresh play / seek.
    const nominalBpm = this.midi.bpm
    transport.bpm.value = nominalBpm

    // Build (or rebuild) a single Tone.Part containing every note from fromTime
    // onward. One transport entry instead of 2×N — on a 10k-note MIDI, seek
    // goes from "visible stall" to "imperceptible".
    //
    // Notes are time-sorted (parser invariant) so binary-search skips past
    // events before fromTime without scanning them.
    const partEvents: [number, NoteEvent][] = []
    for (const track of this.midi.tracks) {
      const notes = track.notes
      let lo = 0
      let hi = notes.length
      while (lo < hi) {
        const mid = (lo + hi) >>> 1
        if (notes[mid]!.time < fromTime) lo = mid + 1
        else hi = mid
      }
      for (let i = lo; i < notes.length; i++) {
        const note = notes[i]!
        // Learn's window is the same half-open rule as the practice loop:
        // an onset at `end` belongs to the next pass, and a note that
        // started before the window is not attacked again.
        if (this.practiceWindow && note.time < this.practiceWindow.start) continue
        if (this.practiceWindow && note.time >= this.practiceWindow.end) break
        const placed = track.isDrum ? null : placedPitch(note.pitch, getKeyboardRange())
        partEvents.push([
          note.time - fromTime,
          {
            note: midiToNoteName(placed?.pitch ?? note.pitch),
            duration: audibleDuration(note),
            velocity: note.velocity,
            trackId: track.id,
            pitch: note.pitch,
            hand: track.isDrum ? null : noteHandOf(track, note.pitch),
          },
        ])
      }
    }

    // Tone's Part type wants events with a `time` field, but the runtime also
    // accepts `[time, payload]` tuples — cheaper for our 2-key payload. Cast
    // at the boundary; the named import still tree-shakes unused synths.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const part = new (Part as any)((time: number, ev: NoteEvent) => {
      // Re-resolve the instrument each tick so mid-playback switches take
      // effect without rebuilding the Part. setInstrument() releases the old
      // voice so overlapping notes from the previous instrument don't linger.
      if (this.disabledTrackIds.has(ev.trackId)) return
      if (
        ev.hand &&
        this.practiceHand !== 'both' &&
        !this.otherHandAudible &&
        ev.hand !== this.practiceHand
      ) {
        return
      }
      const inst = this.instruments.get(this.currentId)
      const speed = this._speed > 0 ? this._speed : 1
      inst?.triggerAttackRelease(ev.note, ev.duration / speed, time, ev.velocity)
    }, partEvents)
    part.start(0)
    this.scheduledPart = part

    transport.bpm.value = nominalBpm * this._speed
    transport.start()
  }

  // One Tone.Part for [start, end), looping on the audio clock. Event times
  // are relative to `start` and durations are the notes' full audible length.
  // The transport is not torn down when the part wraps.
  private async playLoop(start: number, end: number, fromTime: number): Promise<void> {
    if (!this.midi || !(end > start)) return
    const gen = ++this.playGeneration
    await this.readyPromise
    await toneStart()
    if (gen !== this.playGeneration) return

    const transport = getTransport()
    const nominalBpm = this.midi.bpm
    if (
      transport.state === 'paused' &&
      this.scheduledPart &&
      this.builtLoop &&
      this.builtLoop.start === start &&
      this.builtLoop.end === end
    ) {
      transport.bpm.value = nominalBpm * this._speed
      transport.start()
      return
    }

    this.clearScheduled()
    transport.stop()
    transport.position = 0
    this.scheduledFromTime = fromTime
    this.builtLoop = { start, end }
    transport.bpm.value = nominalBpm

    const partEvents: [number, NoteEvent][] = []
    for (const track of this.midi.tracks) {
      for (const note of notesForLoop(track.notes, start, end)) {
        const placed = track.isDrum ? null : placedPitch(note.pitch, getKeyboardRange())
        partEvents.push([
          note.time - start,
          {
            note: midiToNoteName(placed?.pitch ?? note.pitch),
            duration: audibleDuration(note),
            velocity: note.velocity,
            trackId: track.id,
            pitch: note.pitch,
            hand: track.isDrum ? null : noteHandOf(track, note.pitch),
          },
        ])
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const part = new (Part as any)((time: number, ev: NoteEvent) => {
      if (this.disabledTrackIds.has(ev.trackId)) return
      if (
        ev.hand &&
        this.practiceHand !== 'both' &&
        !this.otherHandAudible &&
        ev.hand !== this.practiceHand
      ) {
        return
      }
      const inst = this.instruments.get(this.currentId)
      const speed = this._speed > 0 ? this._speed : 1
      inst?.triggerAttackRelease(ev.note, ev.duration / speed, time, ev.velocity)
    }, partEvents)
    const span = end - start
    part.loop = true
    part.loopEnd = span
    const offset = Math.max(0, Math.min(span - 0.001, fromTime - start))
    part.start(0, offset)
    this.scheduledPart = part

    transport.bpm.value = nominalBpm * this._speed
    transport.start()
  }

  pause(): void {
    // Bump the generation so any in-flight `play()` aborts before it can
    // reach `transport.start()` and resurrect audio after the pause.
    this.playGeneration++
    getTransport().pause()
    this.releaseAllInstruments()
  }

  seek(time: number): void {
    const wasPlaying = getTransport().state === 'started'
    // Same latest-wins guard — a concurrent play() racing with a seek would
    // otherwise restart transport at a stale fromTime.
    this.playGeneration++
    getTransport().stop()
    this.clearScheduled()
    this.releaseAllInstruments()
    if (!wasPlaying) return
    if (this.practiceSeamless && this.practiceWindow) {
      const window = this.practiceWindow
      const from = Math.min(Math.max(time, window.start), window.end - 0.001)
      void this.playLoop(window.start, window.end, from)
      return
    }
    void this.play(time)
  }

  setVolume(v: number): void {
    setMasterVolume(v)
  }

  setSpeed(s: number): void {
    this._speed = s
    getTransport().bpm.value = (this.midi?.bpm ?? 120) * s
  }

  // ── Live MIDI keyboard input ───────────────────────────────────────────

  primeLiveInput(): void {
    if (this.liveWarmupStarted) return
    this.liveWarmupStarted = true
    void toneStart().catch(() => undefined)
    void this.ensureInstrument(this.currentId).catch(() => undefined)
  }

  liveNoteOn(pitch: number, velocity: number): void {
    this.primeLiveInput()
    const inst = this.instruments.get(this.currentId)
    if (!inst) return // still loading — first notes may drop, acceptable tradeoff
    inst.triggerAttack(midiToNoteName(pitch), immediate(), velocity)
  }

  liveNoteOff(pitch: number): void {
    const inst = this.instruments.get(this.currentId)
    if (!inst) return
    inst.triggerRelease(midiToNoteName(pitch), immediate())
  }

  liveReleaseAll(): void {
    this.releaseAllInstruments()
  }

  // Scheduled variants for loop playback. Caller supplies an AudioContext time
  // so notes land sample-accurately even if the UI thread stalls.
  scheduleNoteOn(pitch: number, velocity: number, ctxTime: number): void {
    this.primeLiveInput()
    const inst = this.instruments.get(this.currentId)
    if (!inst) return
    inst.triggerAttack(midiToNoteName(pitch), ctxTime, velocity)
  }

  scheduleNoteOff(pitch: number, ctxTime: number): void {
    const inst = this.instruments.get(this.currentId)
    if (!inst) return
    inst.triggerRelease(midiToNoteName(pitch), ctxTime)
  }

  // Exposed so non-audio modules (UI, visuals) can convert AudioContext time
  // into a setTimeout delay without pulling Tone into their imports.
  get audioContextTime(): number {
    return getContext().currentTime
  }

  // ── Scheduled playback (internal) ──────────────────────────────────────

  private clearScheduled(): void {
    this.builtLoop = null
    if (this.scheduledPart) {
      this.scheduledPart.stop(0)
      this.scheduledPart.clear()
      this.scheduledPart.dispose()
      this.scheduledPart = null
    }
  }

  private releaseAllInstruments(): void {
    for (const inst of this.instruments.values()) inst.releaseAll()
  }

  dispose(): void {
    this.clearScheduled()
    getTransport().stop()
    for (const inst of this.instruments.values()) inst.dispose()
    this.instruments.clear()
  }
}
