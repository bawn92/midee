import { paintPrefs } from '../ui/paint'
import { highwayLaneColor } from './highwayNotes'
import { sceneForTheme } from './scenes'
import type { Theme } from './theme'

// The colour a note is painted with. Highway uses the pitch-class lane.
// Other scenes use the hand colour when the note is drawn that way, and the
// track colour in finger mode on a classic roll.
export function screenNoteColor(
  theme: Theme,
  pitch: number,
  hand: 'left' | 'right',
  trackColor: number,
): number {
  if (theme.id === 'highway') return highwayLaneColor(pitch)
  const byHand = paintPrefs().colorBy === 'hand'
  const scene = sceneForTheme(theme.id) !== null
  if (scene && (byHand || theme.noteStyle === 'pill')) {
    return (hand === 'left' ? theme.trackColors[1] : theme.trackColors[0]) ?? trackColor
  }
  return trackColor
}
