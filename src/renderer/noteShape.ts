// Pure note-style decisions: how repeated notes stay apart, which chord is
// next, and how dashes and badges size themselves. Drawing lives in sceneNotes.ts.

export const NOTE_SHAPES = ['classic', 'glass', 'felt', 'beam', 'outline', 'petal'] as const
export type NoteShapeId = (typeof NOTE_SHAPES)[number]

// Air between two presses on the same key. A few pixels, or a little of the
// note's own height when that is larger, so the capsules never touch.
export const NOTE_REPEAT_GAP_PX = 4
export const NOTE_REPEAT_GAP_FRACTION = 0.06
export const CHORD_CLUSTER_SEC = 0.04
export const MIN_BADGE_PX = 14

export function isNoteShape(value: unknown): value is NoteShapeId {
  return typeof value === 'string' && (NOTE_SHAPES as readonly string[]).includes(value)
}

export interface NoteBody {
  drawPitch: number
  pitch: number
  time: number
  end: number
  velocity: number
  shifted: boolean
  octaves: number
  dimmed: boolean
  color: number
  hand?: 'left' | 'right'
  notes: { pitch: number; time: number; duration: number; velocity: number }[]
}

// One MIDI note is one body. A repeated press on the same key used to be
// swallowed into the note before it, including when the two events touched
// or overlapped. Shorten the earlier drawn end so each press keeps its own
// caps, edge, badge, and landing. A single sustained event is left whole.
export function separateNoteBodies(
  spans: readonly NoteBody[],
  pixelsPerSecond: number,
): NoteBody[] {
  const pps = Number.isFinite(pixelsPerSecond) && pixelsPerSecond > 0 ? pixelsPerSecond : 1
  const sorted = [...spans].sort(
    (a, b) => a.drawPitch - b.drawPitch || a.time - b.time || a.pitch - b.pitch,
  )
  const out: NoteBody[] = []
  for (const span of sorted) {
    const prev = out.at(-1)
    const body: NoteBody = { ...span, notes: [...span.notes] }
    if (prev && prev.drawPitch === body.drawPitch && body.time > prev.time) {
      const naturalPx = Math.max(0, (prev.end - prev.time) * pps)
      const gapPx = Math.max(NOTE_REPEAT_GAP_PX, naturalPx * NOTE_REPEAT_GAP_FRACTION)
      const limit = body.time - gapPx / pps
      if (prev.end > limit) prev.end = limit
      // Legato and a zero gap both split at the next onset, then keep air.
      const minAir = 1 / pps
      if (prev.end > body.time - minAir) prev.end = body.time - minAir
      const minBody = 2 / pps
      if (prev.end < prev.time + minBody) {
        const room = body.time - minAir - prev.time
        prev.end = prev.time + Math.max(0, Math.min(minBody, room))
      }
    }
    out.push(body)
  }
  return out
}

export function earliestFutureOnset(times: readonly number[], now: number): number | null {
  let earliest = Number.POSITIVE_INFINITY
  for (const time of times) {
    if (time > now + 0.01 && time < earliest) earliest = time
  }
  return earliest === Number.POSITIVE_INFINITY ? null : earliest
}

export function inNextChord(
  time: number,
  onset: number | null,
  cluster = CHORD_CLUSTER_SEC,
): boolean {
  if (onset === null) return false
  return time >= onset - 0.008 && time <= onset + cluster
}

// Whole dashes that fill the span, with the gap a fixed fraction of the dash
// so a short note and a long one both look even.
export function fittedDashes(span: number): { dash: number; gap: number; count: number } {
  if (span <= 1) return { dash: Math.max(0, span), gap: 0, count: 1 }
  const target = Math.max(2.5, Math.min(8, span * 0.16))
  const ratio = 0.68
  const count = Math.max(1, Math.round(span / (target * (1 + ratio))))
  const dash = span / (count + (count - 1) * ratio)
  return { dash, gap: dash * ratio, count }
}

export function badgeDiameter(noteWidth: number): number {
  return Math.max(MIN_BADGE_PX, Math.min(16, Math.max(noteWidth, MIN_BADGE_PX)))
}

export function countOnsets(times: readonly number[], now: number, window = 1): number {
  const seen = new Set<number>()
  for (const time of times) {
    if (time < now || time > now + window) continue
    seen.add(Math.round(time * 50))
  }
  return seen.size
}

export function outlineFillRatio(
  now: number,
  onset: number,
  beatSec: number,
  reduced: boolean,
): number {
  const span = Math.max(0.25, beatSec * 2)
  const raw = (now - (onset - span)) / span
  const clamped = Math.min(1, Math.max(0, raw))
  if (!reduced) return clamped
  return Math.round(clamped * 4) / 4
}

let reducedMotion = false

function readReducedMotion(): boolean {
  if (typeof matchMedia !== 'function') return false
  return matchMedia('(prefers-reduced-motion: reduce)').matches
}

reducedMotion = readReducedMotion()
if (typeof matchMedia === 'function') {
  const query = matchMedia('(prefers-reduced-motion: reduce)')
  query.addEventListener?.('change', () => {
    reducedMotion = query.matches
  })
}

export function prefersReducedMotion(): boolean {
  return reducedMotion
}
