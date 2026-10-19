// Turns the month's MIDI into the notes the scorer waits for, using the
// same 24-key window as the rest of the app. Hardware MIDI is mapped onto
// that window before it reaches the input bus (see App.takeMidiPitch), so a
// take matches the pitches the player hears.

import type { KeyboardRangePrefs } from '../core/keyboardRange'
import { mapControllerPitch, placedPitch } from '../core/keyboardRange'
import type { MidiFile } from '../core/midi/types'
import type { ExpectedNote } from './score'

export function notesForTake(midi: MidiFile, prefs: KeyboardRangePrefs): ExpectedNote[] {
  const notes: ExpectedNote[] = []
  for (const track of midi.tracks) {
    if (track.isDrum) continue
    for (const note of track.notes) {
      const placed = placedPitch(note.pitch, prefs)
      notes.push({
        pitch: placed?.pitch ?? note.pitch,
        time: note.time,
        velocity: note.velocity,
        reachable: placed != null,
      })
    }
  }
  notes.sort((a, b) => a.time - b.time || a.pitch - b.pitch)
  return notes
}

/** Where a raw controller note sounds once the window's transpose is applied. */
export function soundingPitch(rawPitch: number, prefs: KeyboardRangePrefs): number {
  return mapControllerPitch(rawPitch, prefs)
}
