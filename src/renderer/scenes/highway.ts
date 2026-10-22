import type { Theme } from '../theme'
import type { Scene } from './types'

// Right hand is the first note colour, left hand the second. The falling
// blocks use a colour per pitch class; these two still feed the Piano M.
export const highwayTheme: Theme = {
  id: 'highway',
  name: 'Highway',
  preview: 'linear-gradient(#1a1d28 0% 18%, #12141a 18% 62%, #c9b6ff 62% 64%, #f3f3f6 64%)',
  background: 0x12141a,
  noteRadius: 4,
  noteGlowStrength: 0,
  noteGlowDistance: 0,
  whiteKey: 0xf3f3f6,
  whiteKeyActive: 0x2ad4ff,
  blackKey: 0x1a1c24,
  blackKeyActive: 0x2ad4ff,
  keyBorder: 0x0c0d12,
  nowLine: 0xe4dcff,
  nowLineAlpha: 0.95,
  nowLineGlow: 0xc9b6ff,
  beatLineAlpha: 0,
  barLineAlpha: 0,
  gridColor: 0xd2d6e6,
  accent: 0x8b7cf0,
  trackColors: [0x3ee0ff, 0xff3d9a, 0xffe14a, 0x7a4dff, 0xff9a2e, 0xb44dff, 0x4d6dff, 0xff6a3c],
}

export const highwayScene: Scene = {
  id: 'highway',
  name: 'Highway',
  themeId: 'highway',
  className: 'scene-highway',
  token: 'highway',
  preview: highwayTheme.preview ?? '#12141a',
  theme: highwayTheme,
  background: {
    top: '#1a1d28',
    mid: '#161820',
    bottom: '#12141a',
    decor: 'none',
  },
  keyboard: {
    material: 'flat',
    case: 0x0c0d12,
    caseLight: 0x23262f,
  },
}
