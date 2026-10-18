// Pure note-style decisions: which bodies join, which chord is next, and how
// dashes and badges size themselves. Drawing lives in sceneNotes.ts.

export const NOTE_SHAPES = ['classic', 'glass', 'felt', 'beam', 'outline', 'petal'] as const
export type NoteShapeId = (typeof NOTE_SHAPES)[number]

export const MERGE_GAP_SEC = 0.04
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
  notes: { pitch: number; time: number; duration: number; velocity: number }[]
}

// Same key, same fold, and a gap too small to be a rest: one capsule.
// A real rest (an eighth at 120 is 0.25s) stays two notes.
export function mergeNoteBodies(spans: readonly NoteBody[], gap = MERGE_GAP_SEC): NoteBody[] {
  const sorted = [...spans].sort(
    (a, b) => a.drawPitch - b.drawPitch || a.time - b.time || a.pitch - b.pitch,
  )
  const out: NoteBody[] = []
  for (const span of sorted) {
    const prev = out.at(-1)
    const join =
      prev !== undefined &&
      prev.drawPitch === span.drawPitch &&
      prev.shifted === span.shifted &&
      prev.octaves === span.octaves &&
      prev.dimmed === span.dimmed &&
      span.time <= prev.end + gap
    if (prev && join) {
      prev.end = Math.max(prev.end, span.end)
      prev.velocity = Math.max(prev.velocity, span.velocity)
      prev.notes.push(...span.notes)
    } else {
      out.push({ ...span, notes: [...span.notes] })
    }
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
