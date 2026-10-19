// Gymnopédie No. 1, opening (Satie, 1888, public domain). Eight bars of 3/4
// at 72 BPM. The client builds a MidiFile from these notes and the API scores
// against the same list.

export const PIECE_BPM = 72
export const PIECE_BEATS_PER_BAR = 3
export const PIECE_TITLE = 'Gymnopédie No. 1'
export const PIECE_COMPOSER = 'Erik Satie'
export const SAMPLE_MONTH_ID = '2026-10'
export const PIECE_MIDI_URL = '/club/pieces/2026-10.mid'

export interface PieceNote {
  pitch: number
  time: number
  duration: number
  /** 0–1, matching MidiNote.velocity. */
  velocity: number
  hand: 'left' | 'right'
}

const BEAT = 60 / PIECE_BPM
const BAR = PIECE_BEATS_PER_BAR * BEAT

function at(bar: number, beat: number): number {
  return bar * BAR + beat * BEAT
}

export function pieceNotes(): PieceNote[] {
  const notes: PieceNote[] = []
  for (let bar = 0; bar < 8; bar++) {
    const even = bar % 2 === 0
    notes.push({
      pitch: even ? 43 : 38,
      time: at(bar, 0),
      duration: 3 * BEAT,
      velocity: 62 / 127,
      hand: 'left',
    })
    for (const pitch of even ? [59, 62, 66] : [57, 61, 66]) {
      notes.push({
        pitch,
        time: at(bar, 1),
        duration: 2 * BEAT,
        velocity: 62 / 127,
        hand: 'left',
      })
    }
  }
  const melody: [number, number, number, number][] = [
    [2, 0, 78, 1],
    [2, 1, 81, 1],
    [2, 2, 79, 1],
    [3, 0, 78, 1],
    [3, 1, 73, 1],
    [3, 2, 71, 1],
    [4, 0, 73, 1],
    [4, 1, 74, 1],
    [4, 2, 69, 1],
    [5, 0, 78, 3],
    [6, 0, 78, 1],
    [6, 1, 81, 1],
    [6, 2, 79, 1],
    [7, 0, 78, 1],
    [7, 1, 73, 1],
    [7, 2, 71, 1],
  ]
  for (const [bar, beat, pitch, beats] of melody) {
    notes.push({
      pitch,
      time: at(bar, beat),
      duration: beats * BEAT,
      velocity: 72 / 127,
      hand: 'right',
    })
  }
  return notes
}

export function pieceDuration(notes: readonly PieceNote[] = pieceNotes()): number {
  return notes.reduce((end, note) => Math.max(end, note.time + note.duration), 0)
}
