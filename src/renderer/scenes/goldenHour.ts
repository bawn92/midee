import type { Theme } from '../theme'
import type { Scene } from './types'

// Right hand is the first note colour, left hand the second. Key lights
// read those same slots, so the Piano M follows the falling notes.
export const goldenHourTheme: Theme = {
  id: 'golden-hour',
  name: 'Golden Hour',
  preview: 'linear-gradient(135deg, #f6d2b0, #f0b95a 58%, #e8a0a0)',
  background: 0xf3c49a,
  noteRadius: 14,
  noteStyle: 'pill',
  noteGlowStrength: 1.8,
  noteGlowDistance: 16,
  whiteKey: 0xfff6ea,
  whiteKeyActive: 0xf0b95a,
  blackKey: 0x3c261c,
  blackKeyActive: 0x6b4a2f,
  keyBorder: 0x6b3e2a,
  nowLine: 0xffe3b0,
  nowLineAlpha: 0.9,
  nowLineGlow: 0xf0b95a,
  beatLineAlpha: 0.1,
  barLineAlpha: 0.18,
  gridColor: 0xc48a62,
  accent: 0xc4843a,
  trackColors: [0xf0b95a, 0xe8a0a0, 0xd9896a, 0xf2d2a2, 0xc47d7d, 0xe7c48a, 0xb96b58, 0xf6e6c8],
}

export const goldenHourScene: Scene = {
  id: 'golden-hour-living-room',
  name: 'Golden Hour Living Room',
  themeId: 'golden-hour',
  className: 'scene-golden-hour',
  preview: goldenHourTheme.preview ?? '#f6d2b0',
  theme: goldenHourTheme,
  background: {
    top: '#f6d2b0',
    mid: '#f3c49a',
    bottom: '#e7b07a',
    decor: 'window-leaf',
  },
  keyboard: {
    material: 'upright-walnut',
    case: 0x6b3e2a,
    caseLight: 0xc4926a,
  },
}
