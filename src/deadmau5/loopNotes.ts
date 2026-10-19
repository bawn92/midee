// Which notes belong to one pass of a practice loop.
//
// The region is half-open: a note is in the pass when its onset is at `start`
// or later and strictly before `end`. The note keeps the duration it arrived
// with, so a sustain that crosses `end` is not trimmed, and a note that
// started before `start` is left out so the next pass does not attack it again.

export interface LoopNote {
  time: number
  duration: number
}

export function noteInLoop(note: LoopNote, start: number, end: number): boolean {
  if (!(end > start)) return false
  if (!(note.duration > 0)) return false
  return note.time >= start && note.time < end
}

export function notesForLoop<T extends LoopNote>(
  notes: readonly T[],
  start: number,
  end: number,
): T[] {
  if (!(end > start)) return []
  const out: T[] = []
  for (const note of notes) {
    if (noteInLoop(note, start, end)) out.push(note)
  }
  return out
}
