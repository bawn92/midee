import {
  controllerKeyLow,
  DEFAULT_CONTROLLER_LOW,
  type KeyboardRangePrefs,
} from '../core/keyboardRange'
import type { Theme } from '../renderer/theme'

// Piano M littlefoot listens on these (zero-based) channels. MIDI channels
// 12 and 13, the same left/right pair as the Synthesia LUMI script.
export const PIANO_M_LEFT_CHANNEL = 11
export const PIANO_M_RIGHT_CHANNEL = 12

// CC 20/21/22 carry red/green/blue, 0–127. CC 23 carries the lowest key's
// MIDI note so the 25-key map follows calibration and the octave buttons.
export const PIANO_M_CC_RED = 20
export const PIANO_M_CC_GREEN = 21
export const PIANO_M_CC_BLUE = 22
export const PIANO_M_CC_BASE = 23

// The theme's first note colour is the right hand, the second is the left.
// Sunset is orange then yellow, which is what the falling notes use for a
// two-track piano part.
export function themeHandLights(theme: Pick<Theme, 'trackColors'>): {
  left: number
  right: number
} {
  const right = theme.trackColors[0] ?? 0xffffff
  const left = theme.trackColors[1] ?? right
  return { left, right }
}

export function midiColorByte(component: number): number {
  const clamped = Math.max(0, Math.min(255, Math.round(component)))
  return Math.max(0, Math.min(127, Math.round((clamped * 127) / 255)))
}

function rgbMessages(channel: number, color: number): number[][] {
  const status = 0xb0 | channel
  return [
    [status, PIANO_M_CC_RED, midiColorByte((color >> 16) & 0xff)],
    [status, PIANO_M_CC_GREEN, midiColorByte((color >> 8) & 0xff)],
    [status, PIANO_M_CC_BLUE, midiColorByte(color & 0xff)],
  ]
}

export function pianoMPaletteMessages(
  colors: { left: number; right: number },
  range: KeyboardRangePrefs,
): number[][] {
  const base = controllerKeyLow(range) ?? DEFAULT_CONTROLLER_LOW
  return [
    [0xb0 | PIANO_M_LEFT_CHANNEL, PIANO_M_CC_BASE, base],
    ...rgbMessages(PIANO_M_LEFT_CHANNEL, colors.left),
    ...rgbMessages(PIANO_M_RIGHT_CHANNEL, colors.right),
  ]
}
