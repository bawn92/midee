import type { Theme } from '../theme'
import type { Scene } from './types'

// Right hand is the first note colour, left hand the second. Key lights
// read those same slots, so the Piano M follows the falling notes.
export const goldenHourTheme: Theme = {
  id: 'golden-hour',
  name: 'Golden Hour',
  preview: 'linear-gradient(135deg, #f8e3c8, #e6a94f 58%, #d9908f)',
  background: 0xf2c9a0,
  noteRadius: 8,
  noteStyle: 'pill',
  noteGlowStrength: 1.4,
  noteGlowDistance: 12,
  whiteKey: 0xf6ebda,
  whiteKeyActive: 0xe6a94f,
  blackKey: 0x3e2a1f,
  blackKeyActive: 0x5e3b24,
  keyBorder: 0x5e3b24,
  nowLine: 0xb9773a,
  nowLineAlpha: 0.7,
  nowLineGlow: 0xe6a94f,
  beatLineAlpha: 0.08,
  barLineAlpha: 0.14,
  gridColor: 0xc4a080,
  accent: 0xb9773a,
  trackColors: [0xe6a94f, 0xd9908f, 0xc98a32, 0xebc99a, 0xb8706f, 0xf6ebda, 0x9a6640, 0xfbf3e8],
}

export const goldenHourScene: Scene = {
  id: 'golden-hour-living-room',
  name: 'Golden Hour Living Room',
  themeId: 'golden-hour',
  className: 'scene-golden-hour',
  token: 'golden-hour',
  preview: goldenHourTheme.preview ?? '#f8e3c8',
  theme: goldenHourTheme,
  background: {
    top: '#f8e3c8',
    mid: '#f5d4ae',
    bottom: '#f2c9a0',
    decor: 'window-leaf',
  },
  keyboard: {
    material: 'upright-walnut',
    case: 0x5e3b24,
    caseLight: 0x9a6640,
  },
}
