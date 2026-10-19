import type { Theme } from '../theme'
import type { Scene } from './types'

// Right hand is the first note colour, left hand the second. Key lights
// read those same slots, so the Piano M follows the falling notes.
export const afterHoursTheme: Theme = {
  id: 'after-hours',
  name: 'After Hours',
  preview:
    'linear-gradient(118deg, rgba(34,232,255,0.0) 36%, rgba(34,232,255,0.75) 48%, rgba(34,232,255,0.0) 58%), linear-gradient(64deg, rgba(255,63,164,0.0) 28%, rgba(255,63,164,0.7) 40%, rgba(255,63,164,0.0) 52%), linear-gradient(#0e0f17, #050509)',
  background: 0x050509,
  noteRadius: 8,
  noteStyle: 'pill',
  noteGlowStrength: 1.6,
  noteGlowDistance: 16,
  whiteKey: 0xe3e6ee,
  whiteKeyActive: 0x22e8ff,
  blackKey: 0x17181d,
  blackKeyActive: 0x0aa3c2,
  keyBorder: 0x23252d,
  nowLine: 0xc6ff3d,
  nowLineAlpha: 0.85,
  nowLineGlow: 0xc6ff3d,
  beatLineAlpha: 0.06,
  barLineAlpha: 0.12,
  gridColor: 0xa7b0ff,
  accent: 0xc6ff3d,
  trackColors: [0x22e8ff, 0xff3fa4, 0xc6ff3d, 0x0aa3c2, 0xc41e7c, 0xa7b0ff, 0xf2ffff, 0x9d7bff],
}

export const afterHoursScene: Scene = {
  id: 'after-hours',
  name: 'After Hours',
  themeId: 'after-hours',
  className: 'scene-after-hours',
  token: 'after-hours',
  preview: afterHoursTheme.preview ?? '#0e0f17',
  theme: afterHoursTheme,
  background: {
    top: '#0e0f17',
    mid: '#0a0b12',
    bottom: '#050509',
    decor: 'none',
  },
  keyboard: {
    material: 'upright-walnut',
    case: 0x0e0f13,
    caseLight: 0x23252d,
  },
}
