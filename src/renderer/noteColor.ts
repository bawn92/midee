import { paintPrefs } from '../ui/paint'
import { readCssColor } from './cssColor'
import { highwayLaneColor } from './highwayNotes'
import { sceneForTheme } from './scenes'
import type { Theme } from './theme'

// The fill of the note block on screen. Highway uses the pitch-class lane of
// the drawn pitch. Scene blocks follow sceneInk: a hand colouring, or any
// shape other than classic, uses the scene's left/right fill; a classic
// finger-coloured note keeps the track colour. Landing bloom is a flash on
// top of this fill, so it is not part of the colour.
export function screenNoteColor(
  theme: Theme,
  pitch: number,
  hand: 'left' | 'right',
  trackColor: number,
): number {
  if (theme.id === 'highway') return highwayLaneColor(pitch)
  if (sceneForTheme(theme.id) === null) return trackColor
  const prefs = paintPrefs()
  const handColor = (hand === 'left' ? theme.trackColors[1] : theme.trackColors[0]) ?? trackColor
  if (prefs.noteStyle !== 'classic' || prefs.colorBy === 'hand') {
    return readCssColor(hand === 'left' ? '--note-lh' : '--note-rh', {
      color: handColor,
      alpha: 1,
    }).color
  }
  return trackColor
}
