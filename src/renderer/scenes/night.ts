import type { Theme } from '../theme'
import type { Scene } from './types'

// Right hand is the first note colour, left hand the second. Key lights
// read those same slots, so the Piano M follows the falling notes.
export const nightTheme: Theme = {
  id: 'night',
  name: 'Night',
  preview: 'linear-gradient(#1c1d27, #14151c)',
  background: 0x14151c,
  noteRadius: 8,
  noteStyle: 'pill',
  noteGlowStrength: 0,
  noteGlowDistance: 0,
  whiteKey: 0xdcd4c6,
  whiteKeyActive: 0xdda95e,
  blackKey: 0x2b211b,
  blackKeyActive: 0xb0823f,
  keyBorder: 0x3a291e,
  nowLine: 0xe2ae63,
  nowLineAlpha: 0.85,
  nowLineGlow: 0xe2ae63,
  beatLineAlpha: 0.05,
  barLineAlpha: 0.08,
  gridColor: 0xd8cfc2,
  accent: 0xe2ae63,
  trackColors: [0xdda95e, 0xd49395, 0xb0823f, 0xe2ae63, 0xa86a6c, 0xf3eee7, 0x5a3f2d, 0xdcd4c6],
}

export const nightScene: Scene = {
  id: 'night',
  name: 'Night',
  themeId: 'night',
  className: 'scene-night',
  token: 'night',
  preview: nightTheme.preview ?? '#1c1d27',
  theme: nightTheme,
  background: {
    top: '#1c1d27',
    mid: '#181920',
    bottom: '#14151c',
    decor: 'none',
  },
  keyboard: {
    material: 'upright-walnut',
    case: 0x3a291e,
    caseLight: 0x5a3f2d,
  },
}
