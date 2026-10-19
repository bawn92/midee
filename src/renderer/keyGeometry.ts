import { isBlackKey } from '../core/midi/types'
import { KBD } from './keyboardMetrics'

// Black keys are 88px of the 198px case. Hit-testing uses the same ratio,
// measured from the top of the key bed rather than the top of the case.
export const BLACK_KEY_HEIGHT_RATIO = KBD.blackH / KBD.caseH

export interface KeyRect {
  x: number
  y: number
  w: number
  h: number
  radius: number
}

// Drawn key body. `pos` is the key's column from Viewport: a white key's
// width is the 26px pitch (scaled), a black key's width is the 16px key.
// The 1px gap sits on the right of each white key. y is keyboard-local.
export function keyRect(
  pitch: number,
  pos: { x: number; width: number },
  keyboardHeight: number,
): KeyRect {
  const v = keyboardHeight / KBD.caseH
  if (isBlackKey(pitch)) {
    return {
      x: pos.x,
      y: KBD.keysY * v,
      w: pos.width,
      h: KBD.blackH * v,
      radius: (KBD.blackTopR / KBD.blackW) * pos.width,
    }
  }
  const gap = (KBD.whiteGap / KBD.pitch) * pos.width
  return {
    x: pos.x,
    y: KBD.keysY * v,
    w: pos.width - gap,
    h: KBD.keysH * v,
    radius: 0,
  }
}
