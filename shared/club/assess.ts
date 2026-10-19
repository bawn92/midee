import { Midi } from '@tonejs/midi'
import { isMonthClosed } from './calendar'
import { PIECE_BPM, pieceDuration, pieceNotes } from './piece'
import { type ExpectedNote, type PlayedNote, type ScoreBreakdown, scoreTake } from './score'

export const MAX_TAKE_BYTES = 200 * 1024
export const SUBMIT_LIMIT = 5
export const SUBMIT_WINDOW_MS = 10 * 60 * 1000

const DENSITY_WINDOW_SEC = 0.04
const DENSITY_MAX = 16
const MAX_NOTES = 4000

export type TakeError =
  | 'too_large'
  | 'wrong_speed'
  | 'impossible_timing'
  | 'bad_midi'
  | 'closed'
  | 'rate_limited'

export interface Assessment {
  serverScore: number
  breakdown: ScoreBreakdown
  played: PlayedNote[]
}

export function officialExpected(): ExpectedNote[] {
  return pieceNotes().map((note) => ({
    pitch: note.pitch,
    time: note.time,
    velocity: note.velocity,
  }))
}

/** Encode a performance at the month tempo so the API can read it back. */
export function encodeTake(played: readonly PlayedNote[], bpm = PIECE_BPM): Uint8Array {
  const midi = new Midi()
  midi.header.setTempo(bpm)
  midi.header.timeSignatures = [{ ticks: 0, timeSignature: [3, 4], measures: 0 }]
  const track = midi.addTrack()
  for (const note of played) {
    const velocity = note.velocity <= 1 ? note.velocity : note.velocity / 127
    track.addNote({
      midi: note.pitch,
      time: Math.max(0, note.time),
      duration: 0.2,
      velocity: Math.max(0.01, Math.min(1, velocity)),
    })
  }
  return midi.toArray()
}

/**
 * Re-score an uploaded take. The leaderboard stores `serverScore` from this
 * function, which calls the same `scoreTake` the client uses.
 */
export function assessTake(input: {
  bytes: Uint8Array
  speed: number
  now?: Date
  monthId?: string
  submitsInWindow?: number
  /** Database close, when the row is the source of truth. */
  closesAt?: Date
}): { ok: true; result: Assessment } | { ok: false; error: TakeError } {
  if (input.bytes.byteLength > MAX_TAKE_BYTES) return { ok: false, error: 'too_large' }
  if (!Number.isFinite(input.speed) || Math.abs(input.speed - 1) > 0.001) {
    return { ok: false, error: 'wrong_speed' }
  }
  const monthId = input.monthId ?? '2026-10'
  const now = input.now ?? new Date()
  if ((input.submitsInWindow ?? 0) >= SUBMIT_LIMIT) return { ok: false, error: 'rate_limited' }
  const closesAt = input.closesAt?.getTime()
  if (closesAt !== undefined ? now.getTime() >= closesAt : isMonthClosed(monthId, now)) {
    return { ok: false, error: 'closed' }
  }

  let midi: Midi
  try {
    midi = new Midi(input.bytes)
  } catch {
    return { ok: false, error: 'bad_midi' }
  }
  const bpm = midi.header.tempos[0]?.bpm
  if (bpm === undefined || Math.abs(bpm - PIECE_BPM) > 0.5) {
    return { ok: false, error: 'wrong_speed' }
  }

  const duration = pieceDuration()
  const played: PlayedNote[] = []
  for (const track of midi.tracks) {
    for (const note of track.notes) {
      played.push({ pitch: note.midi, time: note.time, velocity: note.velocity })
    }
  }
  if (played.length > MAX_NOTES) return { ok: false, error: 'impossible_timing' }
  const times: number[] = []
  for (const note of played) {
    if (!Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127) {
      return { ok: false, error: 'impossible_timing' }
    }
    if (!Number.isFinite(note.time) || note.time < -0.02 || note.time > duration + 0.25) {
      return { ok: false, error: 'impossible_timing' }
    }
    times.push(note.time)
  }
  times.sort((a, b) => a - b)
  let start = 0
  for (let i = 0; i < times.length; i++) {
    const time = times[i]
    if (time === undefined) continue
    while (start < i) {
      const opened = times[start]
      if (opened === undefined || time - opened <= DENSITY_WINDOW_SEC) break
      start += 1
    }
    if (i - start + 1 > DENSITY_MAX) return { ok: false, error: 'impossible_timing' }
  }

  const breakdown = scoreTake(officialExpected(), played)
  return {
    ok: true,
    result: { serverScore: breakdown.score, breakdown, played },
  }
}
