import { isBlackKey, MIDI_MAX, MIDI_MIN } from '../core/midi/types'

// Walnut upright, node 28:21911, at a 26px white-key pitch. Focus zoom scales
// every length from that pitch. The case height stays in the same proportion
// unless the player has dragged the keyboard taller or shorter.
export const KBD = {
  pitch: 26,
  cheek: 44,
  caseH: 198,
  caseR: 18,
  keysY: 46,
  keysH: 140,
  feltY: 40,
  feltH: 6,
  whiteTopH: 130,
  whiteFront: 10,
  whiteGap: 1,
  whiteFrontR: 6,
  blackW: 16,
  blackOff: 17.5,
  blackH: 88,
  blackTop: 80,
  blackFront: 8,
  blackTopR: 2,
  blackFrontR: 3,
  glassTop: 38,
  glassH: 148,
  hitGap: 4,
  pressDrop: 3,
} as const

export interface KeyFrame {
  /** Horizontal scale. 1 means a 26px white key. */
  h: number
  /** Vertical scale. 1 means a 198px case. */
  v: number
  pitch: number
  cheek: number
  keysY: number
  keysH: number
  blackH: number
  feltY: number
  feltH: number
  caseR: number
  glassTop: number
  glassH: number
}

export function whiteKeyCount(pitchMin: number, pitchMax: number): number {
  const lo = Math.max(MIDI_MIN, pitchMin)
  const hi = Math.min(MIDI_MAX, pitchMax)
  let count = 0
  for (let pitch = lo; pitch <= hi; pitch++) if (!isBlackKey(pitch)) count++
  return count
}

// canvas = whiteKeys * pitch + two cheeks, with cheek / pitch = 44 / 26.
export function horizontalScale(canvasWidth: number, whites: number): number {
  const units = Math.max(1, whites) + (KBD.cheek * 2) / KBD.pitch
  return canvasWidth / units / KBD.pitch
}

export function keyFrame(canvasWidth: number, whites: number, keyboardHeight: number): KeyFrame {
  const h = horizontalScale(canvasWidth, whites)
  const v = keyboardHeight / KBD.caseH
  return {
    h,
    v,
    pitch: KBD.pitch * h,
    cheek: KBD.cheek * h,
    keysY: KBD.keysY * v,
    keysH: KBD.keysH * v,
    blackH: KBD.blackH * v,
    feltY: KBD.feltY * v,
    feltH: KBD.feltH * v,
    caseR: KBD.caseR * Math.min(h, v),
    glassTop: KBD.glassTop * v,
    glassH: KBD.glassH * v,
  }
}

export function proportionalKeyboardHeight(canvasWidth: number, whites: number): number {
  return Math.round(KBD.caseH * horizontalScale(canvasWidth, whites))
}
