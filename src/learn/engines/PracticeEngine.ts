import type { MasterClock } from '../../core/clock/MasterClock'
import { type Hand, noteHand } from '../../core/handPractice'
import { foldPitchIntoRange, type KeyboardRange } from '../../core/keyboardRange'
import { MIDI_MAX, MIDI_MIN, type MidiFile } from '../../core/midi/types'
import { createEventSignal } from '../../store/eventSignal'

// Minimum gap between two consecutive note-onsets to consider them a *new*
// step. Notes within this window collapse into a single chord step, which is
// how a human reads "play these together" off a score.
const STEP_GROUPING_SEC = 0.04

// Tiny seek-past offset used when the engine releases the clock — keeps the
// scheduler from re-triggering the chord the user just played.
const RESUME_NUDGE_SEC = 0.006

// The clock must move at least this far past the last cleared step before we
// re-arm waiting. Without it, a moment of float-precision drift on the very
// next tick would re-engage on the same step.
const REARM_BUFFER_SEC = 0.003

// Engage wait-mode slightly BEFORE the scheduled step time. Tone's scheduler
// pre-schedules note-ons into the WebAudio graph up to `lookAhead` seconds
// ahead; pausing the clock at exactly `step.time` doesn't recall already-
// queued events, so the player would hear the "answer" before pressing a key.
// The lead must stay > lookAhead.
//
// 10 ms pairs with `getContext().lookAhead = 0.005` set inside
// `PlayAlongExercise.start()` — 5 ms of safety margin. The aggressive pair
// keeps the perceived "wait engaged" gap to a single frame at 60 Hz, matching
// what Synthesia-class apps feel like. The override is scoped to the
// Play-Along session lifecycle so Play / Live keep Tone's default headroom
// (which is more forgiving on weaker machines) — see
// `PlayAlongExercise.start/stop` in `play-along/index.ts`.
const ENGAGE_LEAD_SEC = 0.01

// Human players often strike the next note just before the falling bar reaches
// the target edge. Treat a small anticipation as intentional instead of making
// the input feel dropped. Wider windows start to erase rhythm, so keep this
// below a typical sixteenth-note at moderate tempos.
const EARLY_ACCEPT_SEC = 0.12

// A chord tone the player cannot reach. The host sounds it when the step
// clears. A chord made only of these never becomes a step — the clock keeps
// running and the synth plays them on its own.
export interface AutoPlayedNote {
  pitch: number
  velocity: number
  duration: number
}

// A note the player must press. Shared with key-light guidance so consumers
// do not reconstruct the chord or its track/channel identities independently.
export interface PracticeNote {
  pitch: number
  velocity: number
  channel: number
  trackIndex: number
}

export interface PracticeStep {
  // Start time of the chord step (seconds).
  time: number
  // Pitches (MIDI numbers) the user must press to advance.
  pitches: ReadonlySet<number>
  auto: readonly AutoPlayedNote[]
  // Required notes only. Out-of-range and other-hand tones stay in `auto`
  // so key lights do not guide a key the player should not press.
  notes: readonly PracticeNote[]
  // Furthest end time of any *required* note in this step — handy for the
  // HUD's "next bar" affordance even though the engine itself doesn't consume it.
  latestEnd: number
}

export interface PracticeStatus {
  enabled: boolean
  // True only while the engine is actively holding the clock for a step.
  // The HUD uses this to surface a "play these notes" cue.
  waiting: boolean
  // Pitches the user still needs to press to clear the current step. Empty
  // when not waiting.
  pending: ReadonlySet<number>
  // Pitches already pressed and accepted for the current step. Lights up the
  // keyboard so the player sees their progress through a chord.
  accepted: ReadonlySet<number>
  // 0..1 how complete the current step is. Drives a subtle progress ring.
  progress: number
  // The step currently waited on (or null when not waiting).
  step: PracticeStep | null
}

const EMPTY_STATUS: PracticeStatus = Object.freeze({
  enabled: false,
  waiting: false,
  pending: new Set<number>(),
  accepted: new Set<number>(),
  progress: 0,
  step: null,
})

export interface PracticeCallbacks {
  // Called when the engine wants playback to halt. The host should mirror its
  // own paused state (status.set('paused')) and call `clock.pause()`.
  onWaitStart(step: PracticeStep): void
  // Called when the engine has cleared the current step. The host should
  // resume playback from `resumeTime` — slightly past the chord onset so the
  // scheduler doesn't re-trigger the chord the user just played.
  onWaitEnd(resumeTime: number, auto?: readonly AutoPlayedNote[]): void
}

// Outcome of `notePressed`. `articulationMs` is wall-clock between the FIRST
// and LAST pending pitch on the cleared step — single-note steps are always
// 0 (perfect). `clearedStep` lets hosts drive the legato bonus without
// poking at engine private state.
//
// `'duplicate'` is split out from `'rejected'` because re-strikes of an
// already-accepted pitch (MIDI bounce, octave doubling) shouldn't bump an
// error counter — the user already played that note. Hosts treat
// `'duplicate'` as a no-op; `'rejected'` is a wrong-pitch press.
export type PressOutcome =
  | { kind: 'advanced'; articulationMs: number; clearedStep: PracticeStep }
  | { kind: 'accepted' }
  | { kind: 'duplicate' }
  | { kind: 'rejected' }

// Synthesia-style "wait mode". When enabled, playback halts at every chord
// onset and resumes only after the player presses the right pitches. The
// engine watches the clock + emits intent through `onWaitStart` / `onWaitEnd`;
// the host (App) owns the actual clock/appState orchestration so audio,
// visuals, and analytics stay coherent.
export class PracticeEngine {
  readonly status = createEventSignal<PracticeStatus>(EMPTY_STATUS)

  private midi: MidiFile | null = null
  private steps: PracticeStep[] = []
  private enabled = false
  // Index of the next step to wait on. -1 means "no pending step" (we're
  // either past the end or at the very start).
  private nextStepIdx = -1
  private accepted = new Set<number>()
  private pending = new Set<number>()
  private waiting = false
  // Time-cursor floor — the engine only re-arms waiting when the clock has
  // advanced past this. Set when releasing the wait so the very next tick
  // doesn't re-engage on the step we just satisfied.
  private earliestRearmTime = -Infinity
  // Wall-clock (ms) when the FIRST pending pitch of the current step landed.
  // Captured on the first `notePressed` of a step, read when the step clears
  // to compute articulationMs. Field is mutable so tests can swap in a
  // deterministic clock via reflection — there's no production caller that
  // needs to override.
  private chordStartMs: number | null = null
  private nowMs: () => number = () =>
    typeof performance !== 'undefined' ? performance.now() : Date.now()

  private visibleTrackIds: Set<string> | null = null
  // Inclusive MIDI window the player can press. Notes outside it are not
  // waited on unless fit-to-range can shift them onto a key inside it.
  // Defaults to the 88-key piano, which is the historical behavior.
  private playableMin = MIDI_MIN
  private playableMax = MIDI_MAX
  // Off until a host turns it on. Play-along reads the keyboard-range pref
  // (on by default); direct callers keep the historical "skip" behavior.
  private fitToRange = false
  private handFilter: Hand = 'both'
  // Notes for the hand not being practised. Heard (as auto) when true, dropped
  // from the step entirely when false. Ignored while both hands are selected.
  private otherHandAudible = true

  private unsubClock: (() => void) | null = null

  constructor(
    private clock: MasterClock,
    private callbacks: PracticeCallbacks,
  ) {
    this.unsubClock = clock.subscribe((t) => this.onClockTick(t))
  }

  loadMidi(midi: MidiFile | null): void {
    this.midi = midi
    this.rebuildSteps()
    this.recomputeNextStep(this.clock.currentTime)
    this.releaseInternalState()
    this.publish()
  }

  // Narrow (or restore) which pitches wait mode demands. Out-of-range notes
  // in a chord the player *does* have to finish are recorded on the step as
  // `auto` so the host can sound them; a chord with nothing in range is
  // omitted and the clock plays straight through it. `fitToRange` shifts
  // those notes by whole octaves onto a key inside the window and then waits
  // for the shifted pitch.
  //
  // Mirrors `setVisibleTracks`: if a wait was holding a chord that no longer
  // has a required pitch, the wait drops and the host decides whether to
  // resume (PlayAlongEngine does, when the player still wants playback).
  setPlayableRange(min: number, max: number, fitToRange?: boolean): void {
    const lo = Number.isFinite(min) ? min : this.playableMin
    const hi = Number.isFinite(max) ? max : this.playableMax
    const nextMin = Math.min(lo, hi)
    const nextMax = Math.max(lo, hi)
    const nextFit = fitToRange ?? this.fitToRange
    if (
      nextMin === this.playableMin &&
      nextMax === this.playableMax &&
      nextFit === this.fitToRange
    ) {
      return
    }
    this.playableMin = nextMin
    this.playableMax = nextMax
    this.fitToRange = nextFit
    this.commitFilterChange()
  }

  setVisibleTracks(ids: Iterable<string> | null): void {
    const next = ids ? new Set(ids) : null
    if (sameIdSet(this.visibleTrackIds, next)) return
    this.visibleTrackIds = next
    this.commitFilterChange()
  }

  // `tracks` omitted keeps the current track filter. Passing it together with
  // the hand applies both in one rebuild, so a hand switch doesn't release
  // and re-engage the wait twice.
  setHandFilter(filter: Hand, tracks?: Iterable<string> | null): void {
    const nextTracks = tracks === undefined ? this.visibleTrackIds : tracks ? new Set(tracks) : null
    if (filter === this.handFilter && sameIdSet(this.visibleTrackIds, nextTracks)) return
    this.handFilter = filter
    this.visibleTrackIds = nextTracks
    this.commitFilterChange()
  }

  setOtherHandAudible(on: boolean): void {
    if (on === this.otherHandAudible) return
    this.otherHandAudible = on
    this.commitFilterChange()
  }

  private commitFilterChange(): void {
    const previousWaitStep = this.waiting ? (this.steps[this.nextStepIdx] ?? null) : null
    this.rebuildSteps()
    this.releaseInternalState()
    if (!this.enabled) {
      this.publish()
      return
    }
    if (previousWaitStep && this.reengageFilteredWait(previousWaitStep)) return
    this.recomputeNextStep(this.clock.currentTime)
    if (this.engageWaitIfDue(this.clock.currentTime)) return
    this.publish()
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return
    this.enabled = enabled
    if (!enabled) {
      // Drop wait state silently — disabling practice is the CALLER'S
      // transport decision (pause, detach, mode switch). Firing `onWaitEnd`
      // here would ask the caller to resume playback while they're actively
      // trying to stop; the caller already handles resume/seek explicitly
      // when they re-enable or resume elsewhere.
      this.releaseInternalState()
    } else {
      this.recomputeNextStep(this.clock.currentTime)
    }
    this.publish()
  }

  toggle(): boolean {
    this.setEnabled(!this.enabled)
    return this.enabled
  }

  get isEnabled(): boolean {
    return this.enabled
  }
  get isWaiting(): boolean {
    return this.waiting
  }

  // See `PressOutcome` for the four kinds and what they signal.
  notePressed(pitch: number): PressOutcome {
    if (!this.enabled) return { kind: 'rejected' }
    if (!this.waiting && !this.tryEngageEarly(pitch)) return { kind: 'rejected' }
    if (this.accepted.has(pitch)) return { kind: 'duplicate' }
    if (!this.pending.has(pitch)) return { kind: 'rejected' }
    // Articulation timer starts on the FIRST accepted pitch of the step;
    // span from first to last is what we grade.
    if (this.accepted.size === 0) {
      this.chordStartMs = this.nowMs()
    }
    this.pending.delete(pitch)
    this.accepted.add(pitch)
    if (this.pending.size === 0) {
      const startedMs = this.chordStartMs ?? this.nowMs()
      const articulationMs = Math.max(0, this.nowMs() - startedMs)
      // Snapshot the step BEFORE `advancePastCurrentStep` moves the cursor.
      const clearedStep = this.steps[this.nextStepIdx] ?? null
      this.advancePastCurrentStep()
      this.publish()
      if (clearedStep) {
        return { kind: 'advanced', articulationMs, clearedStep }
      }
      // Should be unreachable (we were waiting, so a step existed) but the
      // type system can't see that — fall back to "rejected" so callers
      // never need to defend a nullish step on the advanced branch.
      return { kind: 'rejected' }
    }
    this.publish()
    return { kind: 'accepted' }
  }

  // App calls this whenever the user seeks (scrubber, skip-back/-fwd, etc.)
  // so we re-find the next step relative to the new position.
  notifySeek(time: number): void {
    this.recomputeNextStep(time)
    this.releaseInternalState()
    this.earliestRearmTime = -Infinity
    this.publish()
  }

  peekNextStep(): PracticeStep | null {
    if (this.nextStepIdx < 0) return null
    return this.steps[this.nextStepIdx] ?? null
  }

  private onClockTick(time: number): void {
    if (!this.enabled || !this.midi) return
    if (this.waiting) return
    if (this.nextStepIdx < 0) return
    if (time < this.earliestRearmTime) return

    this.engageWaitIfDue(time)
  }

  private engageWaitIfDue(time: number): boolean {
    const step = this.steps[this.nextStepIdx]
    if (!step) return false

    if (time >= step.time - ENGAGE_LEAD_SEC) {
      this.engageWait(step)
      return true
    }
    return false
  }

  private engageWait(step: PracticeStep): void {
    this.waiting = true
    this.pending = new Set(step.pitches)
    this.accepted = new Set()
    this.publish()
    this.callbacks.onWaitStart(step)
  }

  private tryEngageEarly(pitch: number): boolean {
    if (this.nextStepIdx < 0) return false
    const step = this.steps[this.nextStepIdx]
    if (!step) return false
    const time = this.clock.currentTime
    if (time < step.time - EARLY_ACCEPT_SEC || time >= step.time) return false
    if (!step.pitches.has(pitch)) return false
    this.engageWait(step)
    return true
  }

  private reengageFilteredWait(previousStep: PracticeStep): boolean {
    if (!this.enabled) return false
    // Prefer a step that still contains a pitch we were waiting on. Fit-to-range
    // can retarget every pitch in the chord, so the same onset with a new set
    // of pitches is still this wait — a later chord inside the grouping window
    // is not.
    let sameOnset = -1
    let intersecting = -1
    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i]!
      if (Math.abs(step.time - previousStep.time) > STEP_GROUPING_SEC) continue
      if (setsIntersect(step.pitches, previousStep.pitches)) {
        intersecting = i
        break
      }
      if (sameOnset < 0 && Math.abs(step.time - previousStep.time) <= 0.001) sameOnset = i
    }
    const idx = intersecting >= 0 ? intersecting : sameOnset
    if (idx < 0) return false
    this.nextStepIdx = idx
    this.engageWait(this.steps[idx]!)
    return true
  }

  private advancePastCurrentStep(): void {
    const step = this.steps[this.nextStepIdx]
    const resumeAt = step ? step.time + RESUME_NUDGE_SEC : this.clock.currentTime
    const auto = step && step.auto.length > 0 ? step.auto : undefined
    this.earliestRearmTime = resumeAt + REARM_BUFFER_SEC
    const nextIdx = this.nextStepIdx + 1
    this.nextStepIdx = nextIdx < this.steps.length ? nextIdx : -1
    this.waiting = false
    this.pending = new Set()
    this.accepted = new Set()
    this.chordStartMs = null
    // Omit the second argument when there's nothing to sound. Callers and
    // tests treat `onWaitEnd(time)` as the no-auto shape.
    if (auto) this.callbacks.onWaitEnd(resumeAt, auto)
    else this.callbacks.onWaitEnd(resumeAt)
  }

  private releaseInternalState(): void {
    this.waiting = false
    this.pending = new Set()
    this.accepted = new Set()
    this.chordStartMs = null
  }

  private recomputeNextStep(time: number): void {
    if (this.steps.length === 0) {
      this.nextStepIdx = -1
      return
    }
    for (let i = 0; i < this.steps.length; i++) {
      if (this.steps[i]!.time >= time) {
        this.nextStepIdx = i
        return
      }
    }
    this.nextStepIdx = -1
  }

  private rebuildSteps(): void {
    if (!this.midi) {
      this.steps = []
      return
    }

    interface Onset extends PracticeNote {
      time: number
      pitch: number
      end: number
      velocity: number
      duration: number
      playable: boolean
    }
    const onsets: Onset[] = []
    for (const [trackIndex, track] of this.midi.tracks.entries()) {
      if (track.isDrum) continue
      if (this.visibleTrackIds && !this.visibleTrackIds.has(track.id)) continue
      for (const note of track.notes) {
        const role = this.classifyNote(note.pitch)
        if (role.kind === 'omit') continue
        onsets.push({
          time: note.time,
          pitch: role.pitch,
          end: note.time + note.duration,
          velocity: note.velocity,
          duration: note.duration,
          playable: role.kind === 'required',
          channel: track.channel,
          trackIndex,
        })
      }
    }
    onsets.sort((a, b) => a.time - b.time)

    const steps: PracticeStep[] = []
    let i = 0
    while (i < onsets.length) {
      const head = onsets[i]!
      const groupEnd = head.time + STEP_GROUPING_SEC
      const pitches = new Set<number>()
      const auto = new Map<number, AutoPlayedNote>()
      let latestEnd = -Infinity
      let j = i
      while (j < onsets.length && onsets[j]!.time <= groupEnd) {
        const onset = onsets[j]!
        if (onset.playable) {
          pitches.add(onset.pitch)
          if (onset.end > latestEnd) latestEnd = onset.end
        } else {
          const prev = auto.get(onset.pitch)
          if (!prev || onset.duration > prev.duration) {
            auto.set(onset.pitch, {
              pitch: onset.pitch,
              velocity: onset.velocity,
              duration: onset.duration,
            })
          } else if (onset.velocity > prev.velocity) {
            prev.velocity = onset.velocity
          }
        }
        j++
      }
      // Nothing the player can press — let the clock carry these notes.
      if (pitches.size > 0) {
        const notes: PracticeNote[] = []
        for (let k = i; k < j; k++) {
          const onset = onsets[k]!
          if (!onset.playable) continue
          notes.push({
            pitch: onset.pitch,
            velocity: onset.velocity,
            channel: onset.channel,
            trackIndex: onset.trackIndex,
          })
        }
        steps.push({ time: head.time, pitches, auto: [...auto.values()], latestEnd, notes })
      }
      i = j
    }

    this.steps = steps
  }

  private isPlayablePitch(pitch: number): boolean {
    return (
      pitch >= MIDI_MIN &&
      pitch <= MIDI_MAX &&
      pitch >= this.playableMin &&
      pitch <= this.playableMax
    )
  }

  private playableWindow(): KeyboardRange {
    return {
      start: this.playableMin,
      size: Math.max(1, this.playableMax - this.playableMin + 1),
    }
  }

  // Hand identity uses the written pitch, so a left-hand note folded up across
  // middle C is still the left hand. The pitch the player must press is the
  // folded one when fit-to-range can place it on a key.
  private classifyNote(pitch: number): { kind: 'required' | 'auto' | 'omit'; pitch: number } {
    const matches = this.handFilter === 'both' || noteHand(pitch) === this.handFilter
    const folded = this.fitToRange ? foldPitchIntoRange(pitch, this.playableWindow()) : null
    const inWindow = this.isPlayablePitch(pitch)
    const reachable = folded !== null && this.isPlayablePitch(folded.pitch)
    const sounding = inWindow ? pitch : reachable ? folded!.pitch : pitch
    if (!matches) {
      if (!this.otherHandAudible) return { kind: 'omit', pitch }
      return { kind: 'auto', pitch: sounding }
    }
    if (inWindow) return { kind: 'required', pitch }
    if (reachable) return { kind: 'required', pitch: folded!.pitch }
    return { kind: 'auto', pitch }
  }

  private publish(): void {
    if (!this.enabled) {
      this.status.set(EMPTY_STATUS)
      return
    }

    const total = this.waiting ? this.pending.size + this.accepted.size : 0
    const progress = total > 0 ? this.accepted.size / total : 0
    const step =
      this.waiting && this.nextStepIdx >= 0 ? (this.steps[this.nextStepIdx] ?? null) : null
    this.status.set({
      enabled: true,
      waiting: this.waiting,
      pending: new Set(this.pending),
      accepted: new Set(this.accepted),
      progress,
      step,
    })
  }

  dispose(): void {
    this.unsubClock?.()
    this.unsubClock = null
  }
}

function sameIdSet(a: Set<string> | null, b: Set<string> | null): boolean {
  if (a === b) return true
  if (!a || !b || a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}

function setsIntersect(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  for (const value of a) {
    if (b.has(value)) return true
  }
  return false
}
