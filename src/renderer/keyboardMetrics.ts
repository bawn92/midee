import { isBlackKey, MIDI_MAX, MIDI_MIN } from '../core/midi/types'

// Hero case, node-matched to the landing keyboard at a 26px white-key pitch.
// The case is a slim rim, a thin felt line, and a short foot — the keys are
// the body. `outer` and `shadow` are the transparent margin that lets the
// rounded ends and the drop shadow sit on the scene.
export const KBD = {
  pitch: 26,
  outer: 12,
  side: 16,
  cheek: 28,
  caseH: 164,
  caseR: 16,
  keysY: 18,
  keysH: 110,
  foot: 22,
  shadow: 14,
  feltY: 14,
  feltH: 3,
  whiteGap: 3,
  whiteRadius: 4,
  blackW: 15.08,
  blackOff: 18.46,
  blackH: 66,
  blackRadius: 3,
  glassTop: 18,
  glassH: 110,
  hitGap: 4,
} as const

export interface KeyFrame {
  /** Horizontal scale. 1 means a 26px white key. */
  h: number
  /** Vertical scale. 1 means a 164px case. */
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

// canvas = whiteKeys * pitch + two cheeks. Cheek is the outer margin plus
// the 16px wood beside the keys.
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
