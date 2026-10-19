// One piece a month. October 2026 ships Gymnopédie No. 1's opening
// (Satie, 1888, public domain): 8 bars, 3/4, 72 BPM. The count-in is not
// part of the file.

import { type MidiFile, type MidiNote, nominalTempoMap } from '../core/midi/types'
import type { ClubMonth } from './types'

const BPM = 72
const BEAT = 60 / BPM
const BAR = 3 * BEAT

function at(bar: number, beat: number): number {
  return bar * BAR + beat * BEAT
}

function note(pitch: number, time: number, beats: number, midiVelocity: number): MidiNote {
  return { pitch, time, duration: beats * BEAT, velocity: midiVelocity / 127 }
}

export function gymnopedieOpening(): MidiFile {
  const left: MidiNote[] = []
  for (let bar = 0; bar < 8; bar++) {
    const even = bar % 2 === 0
    left.push(note(even ? 43 : 38, at(bar, 0), 3, 62))
    for (const pitch of even ? [59, 62, 66] : [57, 61, 66]) {
      left.push(note(pitch, at(bar, 1), 2, 62))
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
  const right = melody.map(([bar, beat, pitch, beats]) => note(pitch, at(bar, beat), beats, 72))
  const notes = [...left, ...right]
  const duration = notes.reduce((end, item) => Math.max(end, item.time + item.duration), 0)
  return {
    name: 'Gymnopédie No. 1',
    duration,
    bpm: BPM,
    timeSignature: [3, 4],
    ...nominalTempoMap(BPM, [3, 4]),
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
    id: '2026-10',
    kickerKey: 'club.sample.kicker',
    closesKey: 'club.sample.closes',
    title: 'Gymnopédie No. 1',
    composer: 'Erik Satie',
    bpm: BPM,
    beatsPerBar: 3,
    midi: gymnopedieOpening(),
  },
]

// The sample month, or the month whose id matches the local calendar month.
// Closing the month in a particular timezone is intentionally not implemented.
export function currentMonth(now = new Date()): ClubMonth {
  const id = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return CLUB_MONTHS.find((month) => month.id === id) ?? CLUB_MONTHS[0]!
}
