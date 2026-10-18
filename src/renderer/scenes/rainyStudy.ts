import type { Theme } from '../theme'
import type { Scene } from './types'

export const rainyStudyTheme: Theme = {
  id: 'rainy-study',
  name: 'Rainy Study',
  preview: 'linear-gradient(160deg, #e7e2d8, #9eb4bc 70%, #c4897a)',
  background: 0xc5d0d4,
  noteRadius: 8,
  noteStyle: 'pill',
  noteGlowStrength: 1.2,
  noteGlowDistance: 12,
  whiteKey: 0xf3eee6,
  whiteKeyActive: 0x7ba3b0,
  blackKey: 0x2e3336,
  blackKeyActive: 0x4e6270,
  keyBorder: 0x3e342c,
  nowLine: 0x6e8494,
  nowLineAlpha: 0.7,
  nowLineGlow: 0x7ba3b0,
  beatLineAlpha: 0.08,
  barLineAlpha: 0.14,
  gridColor: 0x8aa0a8,
  accent: 0x6e8494,
  trackColors: [0x7ba3b0, 0xc4897a, 0x8d7356, 0xd5e0e4, 0xa56d60, 0x9eb4bc, 0xc4a574, 0xf4f1ea],
}

export const rainyStudyScene: Scene = {
  id: 'rainy-study',
  name: 'Rainy Study',
  themeId: 'rainy-study',
  className: 'scene-rainy-study',
  token: 'rainy-study',
  preview: rainyStudyTheme.preview ?? '#c5d0d4',
  theme: rainyStudyTheme,
  background: {
    top: '#e7e2d8',
    mid: '#d5ddd8',
    bottom: '#c5d0d4',
    decor: 'none',
  },
  keyboard: {
    material: 'upright-walnut',
    case: 0x3e342c,
    caseLight: 0x8d7356,
  },
}
