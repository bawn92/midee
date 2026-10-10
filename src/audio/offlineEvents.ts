// Pure helper extracted from OfflineAudioRenderer so the disabled-track
// filtering can be unit-tested without instantiating an OfflineAudioContext
// (which jsdom lacks) or pulling Tone (which won't resolve under vitest).

import { type Hand, noteMatchesHand } from '../core/handPractice'
import { type KeyboardRangePrefs, placedPitch } from '../core/keyboardRange'
import { audibleDuration, type MidiFile } from '../core/midi/types'
import { midiToNoteName } from './midiNoteName'

export interface OfflineNoteEvent {
  time: number
  note: string
  duration: number // audible length (pedal-extended), not the notated one
  velocity: number
}

export interface OfflineAudibility {
  range?: KeyboardRangePrefs
  hand?: Hand
  otherHandAudible?: boolean
}

// Flattens midi.tracks → time-ordered note events, skipping any track the
// user has muted in the Tracks panel. The export pipeline calls this so the
// rendered MP4's audio matches what the user heard interactively — including
// octave-folded pitches and a silenced practice hand when those are set.
export function buildOfflineEvents(
  midi: MidiFile,
  disabledTrackIds?: ReadonlySet<string>,
  audibility?: OfflineAudibility,
): OfflineNoteEvent[] {
  const events: OfflineNoteEvent[] = []
  const hand = audibility?.hand ?? 'both'
  const otherHandAudible = audibility?.otherHandAudible !== false
  const range = audibility?.range
  for (const track of midi.tracks) {
    if (disabledTrackIds?.has(track.id)) continue
    for (const note of track.notes) {
      if (
        !track.isDrum &&
        hand !== 'both' &&
        !otherHandAudible &&
        !noteMatchesHand(note.pitch, hand)
      ) {
        continue
      }
      const placed = !track.isDrum && range ? placedPitch(note.pitch, range) : null
      events.push({
        time: note.time,
        note: midiToNoteName(placed?.pitch ?? note.pitch),
        // Offline render has no speed control, so no 1/speed scaling here.
        duration: audibleDuration(note),
        velocity: note.velocity,
      })
    }
  }
  return events
}
