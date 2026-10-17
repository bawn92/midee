import type { MidiFile } from '../core/midi/types'
import type { SongGuide } from './types'
import { untitledGSharpMinor } from './untitledGSharpMinor'

export const SONG_GUIDES: readonly SongGuide[] = [untitledGSharpMinor]

export const GUIDE_TEMPOS = [60, 80, 100, 110, 120] as const

export function guideForMidi(midi: Pick<MidiFile, 'duration' | 'tracks'> | null): SongGuide | null {
  if (!midi) return null
  let notes = 0
  for (const track of midi.tracks) notes += track.notes.length
  return (
    SONG_GUIDES.find(
      (guide) => Math.abs(midi.duration - guide.duration) < 1.5 && notes === guide.noteCount,
    ) ?? null
  )
}

export function guideSpeed(tempo: number, songBpm = 120): number {
  return tempo / songBpm
}
