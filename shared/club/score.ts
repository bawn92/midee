// Shared Club scorer, 0–1000. The browser HUD and the API both import this
// file, so a posted take is judged by the same rules as the one on screen.
//
// A played note matches one score note of the same pitch inside ±200 ms.
// The closest free pair wins. perfect ±50 ms (1.0), good ±120 ms (0.7),
// early/late ±200 ms (0.4). Each note is
//   45% hit + 30% timing + 10% dynamics + 15% reached.
// Reached is 1 once the note is judged, including a miss, so a total miss
// still scores 150. Dynamics compare MIDI velocity (0–127); a 40-unit gap
// spends the whole dynamics credit. Extra notes cost half a note each,
// capped at 100 points. Streak is returned for the HUD and is not part of
// the number.

export interface NoteCounts {
  perfect: number
  good: number
  early: number
  late: number
  miss: number
  extra: number
}

export const WINDOW_MS = 200
export const PERFECT_MS = 50
export const GOOD_MS = 120
export const HIT_WEIGHT = 0.45
export const TIMING_WEIGHT = 0.3
export const DYNAMICS_WEIGHT = 0.1
export const REACHED_WEIGHT = 0.15
export const EXTRA_NOTE_COST = 0.5
export const EXTRA_PENALTY_CAP = 100
export const SCORE_SCALE = 1000
export const DYNAMICS_UNITS = 40

export type JudgementName = 'perfect' | 'good' | 'early' | 'late' | 'miss'

export interface ExpectedNote {
  pitch: number
  /** Seconds from the downbeat. */
  time: number
  /** 0–1, same as MidiNote.velocity. Values above 1 are already MIDI units. */
  velocity: number
  /** False when the 24-key window cannot hold this note. It still earns reached. */
  reachable?: boolean
}

export interface PlayedNote {
  pitch: number
  time: number
  velocity: number
}

export interface JudgedNote {
  index: number
  pitch: number
  time: number
  judgement: JudgementName
  /** Played time minus score time, in milliseconds. Null on a miss. */
  deltaMs: number | null
  hit: number
  timing: number
  dynamics: number
  reached: number
  points: number
  /** Seconds. A hit lands on the played time; a miss lands 200 ms later. */
  judgedAt: number
}

export interface ScoreBreakdown {
  score: number
  pointsBeforePenalty: number
  extraPenalty: number
  /** Hits divided by judged notes. 0 before the first judgement. */
  accuracy: number
  /** Trailing non-miss judgements. Cosmetic. */
  streak: number
  counts: NoteCounts
  notes: JudgedNote[]
  judged: number
  total: number
}

export function judgeDelta(
  deltaMs: number,
): { name: Exclude<JudgementName, 'miss'>; timing: number } | null {
  const abs = Math.abs(deltaMs)
  if (abs <= PERFECT_MS) return { name: 'perfect', timing: 1 }
  if (abs <= GOOD_MS) return { name: 'good', timing: 0.7 }
  if (abs <= WINDOW_MS) return { name: deltaMs < 0 ? 'early' : 'late', timing: 0.4 }
  return null
}

export function midiVelocity(velocity: number): number {
  if (!Number.isFinite(velocity)) return 0
  const units = velocity <= 1 ? velocity * 127 : velocity
  return Math.max(0, Math.min(127, units))
}

/** 1 when the velocities match, 0 once they differ by 40 MIDI units. */
export function dynamicsCredit(expected: number, played: number): number {
  const dv = Math.abs(midiVelocity(played) - midiVelocity(expected))
  return Math.max(0, 1 - Math.min(1, dv / DYNAMICS_UNITS))
}

export function emptyCounts(): NoteCounts {
  return { perfect: 0, good: 0, early: 0, late: 0, miss: 0, extra: 0 }
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(SCORE_SCALE, Math.round(n)))
}

/**
 * Score the take. `now` (seconds) leaves notes that are still inside their
 * window unjudged, which is what the live HUD reads. Omit it for the result.
 */
export function scoreTake(
  expected: readonly ExpectedNote[],
  played: readonly PlayedNote[],
  now = Number.POSITIVE_INFINITY,
): ScoreBreakdown {
  const total = expected.length
  const noteValue = total > 0 ? SCORE_SCALE / total : 0
  const usedPlayed = new Set<number>()
  const assigned = new Map<number, number>()

  const pairs: { index: number; played: number; abs: number; time: number }[] = []
  for (let index = 0; index < expected.length; index++) {
    const note = expected[index]
    if (!note || note.reachable === false) continue
    if (note.time - WINDOW_MS / 1000 > now) continue
    for (let p = 0; p < played.length; p++) {
      const hit = played[p]
      if (!hit || hit.time > now) continue
      if (hit.pitch !== note.pitch) continue
      const deltaMs = (hit.time - note.time) * 1000
      const abs = Math.abs(deltaMs)
      if (abs > WINDOW_MS) continue
      pairs.push({ index, played: p, abs, time: note.time })
    }
  }
  pairs.sort((a, b) => a.abs - b.abs || a.time - b.time || a.index - b.index)
  const usedExpected = new Set<number>()
  for (const pair of pairs) {
    if (usedExpected.has(pair.index) || usedPlayed.has(pair.played)) continue
    usedExpected.add(pair.index)
    usedPlayed.add(pair.played)
    assigned.set(pair.index, pair.played)
  }

  const notes: JudgedNote[] = []
  for (let index = 0; index < expected.length; index++) {
    const note = expected[index]
    if (!note) continue
    const playIndex = assigned.get(index)
    const play = playIndex === undefined ? undefined : played[playIndex]
    const deadline = note.time + WINDOW_MS / 1000
    if (!play && now < deadline) continue

    let judgement: JudgementName = 'miss'
    let timing = 0
    let hit = 0
    let dynamics = 0
    let deltaMs: number | null = null
    let judgedAt = deadline
    if (play && note.reachable !== false) {
      deltaMs = (play.time - note.time) * 1000
      const window = judgeDelta(deltaMs)
      if (window) {
        judgement = window.name
        timing = window.timing
        hit = 1
        dynamics = dynamicsCredit(note.velocity, play.velocity)
        judgedAt = play.time
      }
    }
    const credit =
      HIT_WEIGHT * hit + TIMING_WEIGHT * timing + DYNAMICS_WEIGHT * dynamics + REACHED_WEIGHT
    const points = noteValue * credit
    notes.push({
      index,
      pitch: note.pitch,
      time: note.time,
      judgement,
      deltaMs,
      hit,
      timing,
      dynamics,
      reached: 1,
      points,
      judgedAt,
    })
  }

  // The odometer shows rounded running totals. Store that same increment so
  // the saved score and the last frame of the HUD agree.
  let cum = 0
  let prev = 0
  for (const note of notes) {
    cum += note.points
    const rounded = Math.round(cum)
    note.points = rounded - prev
    prev = rounded
  }

  const counts = emptyCounts()
  let hits = 0
  let streak = 0
  for (const note of notes) {
    counts[note.judgement] += 1
    if (note.hit) hits += 1
  }
  for (let i = notes.length - 1; i >= 0; i--) {
    if (!notes[i]?.hit) break
    streak += 1
  }

  let extra = 0
  if (now === Number.POSITIVE_INFINITY) {
    for (let p = 0; p < played.length; p++) {
      if (!usedPlayed.has(p)) extra += 1
    }
  }
  counts.extra = extra
  const extraPenalty =
    total > 0 ? Math.min(EXTRA_PENALTY_CAP, extra * EXTRA_NOTE_COST * noteValue) : 0
  const pointsBeforePenalty = prev
  return {
    score: clampScore(pointsBeforePenalty - extraPenalty),
    pointsBeforePenalty,
    extraPenalty,
    accuracy: notes.length > 0 ? hits / notes.length : 0,
    streak,
    counts,
    notes,
    judged: notes.length,
    total,
  }
}

/** Where the live score is heading, rounded to the nearest 10. Null before the first note. */
export function paceFor(points: number, judged: number, total: number): number | null {
  if (judged <= 0 || total <= 0) return null
  return Math.round(((points / judged) * total) / 10) * 10
}
