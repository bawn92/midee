// One piece a month. October 2026 ships Gymnopédie No. 1's opening.
// The notes live in shared/club/piece.ts so the API scores the same piece.
// The count-in is not part of the file.

import { currentMonthId } from '../../shared/club/calendar'
import {
  PIECE_BEATS_PER_BAR,
  PIECE_BPM,
  PIECE_COMPOSER,
  PIECE_TITLE,
  pieceDuration,
  pieceNotes,
  SAMPLE_MONTH_ID,
} from '../../shared/club/piece'
import { type MidiFile, type MidiNote, nominalTempoMap } from '../core/midi/types'
import type { ClubMonth } from './types'

function toMidi(note: {
  pitch: number
  time: number
  duration: number
  velocity: number
}): MidiNote {
  return {
    pitch: note.pitch,
    time: note.time,
    duration: note.duration,
    velocity: note.velocity,
  }
}

export function gymnopedieOpening(): MidiFile {
  const notes = pieceNotes()
  const left = notes.filter((note) => note.hand === 'left').map(toMidi)
  const right = notes.filter((note) => note.hand === 'right').map(toMidi)
  return {
    name: PIECE_TITLE,
    duration: pieceDuration(notes),
    bpm: PIECE_BPM,
    timeSignature: [3, 4],
    ...nominalTempoMap(PIECE_BPM, [3, 4]),
    tracks: [
      {
        id: 'club-lh',
        name: 'Left hand',
        channel: 0,
        instrument: 0,
        isDrum: false,
        notes: left,
        colorIndex: 1,
        hand: 'left',
      },
      {
        id: 'club-rh',
        name: 'Right hand',
        channel: 1,
        instrument: 0,
        isDrum: false,
        notes: right,
        colorIndex: 0,
        hand: 'right',
      },
    ],
  }
}

export const CLUB_MONTHS: readonly ClubMonth[] = [
  {
    id: SAMPLE_MONTH_ID,
    kickerKey: 'club.sample.kicker',
    closesKey: 'club.sample.closes',
    title: PIECE_TITLE,
    composer: PIECE_COMPOSER,
    bpm: PIECE_BPM,
    beatsPerBar: PIECE_BEATS_PER_BAR,
    midi: gymnopedieOpening(),
  },
]

// The sample month, or the month whose id matches the calendar month in
// America/Los_Angeles. Other months fall back to the sample piece.
export function currentMonth(now = new Date()): ClubMonth {
  const id = currentMonthId(now)
  return CLUB_MONTHS.find((month) => month.id === id) ?? CLUB_MONTHS[0]!
}
