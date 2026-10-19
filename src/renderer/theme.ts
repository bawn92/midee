import type { MidiTrack } from '../core/midi/types'
import { availableVisuals, FOR_LATER_THEME_IDS } from './forLater/visuals'
import type { NoteMaterialId } from './NoteMaterial'
import type { ParticleStyle } from './particleStyles'
import { afterHoursTheme } from './scenes/afterHours'
import { goldenHourTheme } from './scenes/goldenHour'
import { nightTheme } from './scenes/night'
import { rainyStudyTheme } from './scenes/rainyStudy'

// Persisted in localStorage (`midee.theme`). The four scenes ship.
// Anything else — a classic id or a legacy index — is rewritten to Golden Hour.
export type ThemeId = 'golden-hour' | 'rainy-study' | 'after-hours' | 'night'

export interface Theme {
  id: ThemeId
  name: string
  background: number
  noteMaterial?: NoteMaterialId
  recommendedParticles?: ParticleStyle
  // Art direction for the environment and the Appearance material swatch.
  atmosphere?: { horizon: number; light: number }
  preview?: string

  noteRadius: number
  noteGlowStrength: number
  noteGlowDistance: number
  // Wide capsules with a soft inner highlight. Omitted themes keep flat bars.
  noteStyle?: 'pill'

  whiteKey: number
  whiteKeyActive: number // color of white key when pressed
  blackKey: number
  blackKeyActive: number // color of black key when pressed
  keyBorder: number

  nowLine: number
  nowLineAlpha: number
  nowLineGlow: number

  beatLineAlpha: number
  barLineAlpha: number
  // Beat and bar lines. Omitted themes keep the original white grid.
  gridColor?: number

  // UI accent as a Pixi hex; CSS gets its string form via `accentCSS()`.
  accent: number

  // Per-track note/particle colors — indexed by MidiTrack.colorIndex
  trackColors: number[]
}

// 0xRRGGBB → '#rrggbb'. Lives here so the renderer never imports UI code.
export function hexToCSS(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

export function accentCSS(theme: Theme): string {
  return hexToCSS(theme.accent)
}

// Colour for the user's own live notes, particles, and key highlights.
export function liveNoteColor(theme: Theme): number {
  return theme.trackColors[0] ?? theme.nowLine
}

export function getTrackColor(track: MidiTrack, theme: Theme): number {
  return theme.trackColors[track.colorIndex % theme.trackColors.length]!
}

// The shipping roster is the four scenes. Golden Hour stays the default.
export const ALL_THEMES: readonly Theme[] = [
  goldenHourTheme,
  rainyStudyTheme,
  afterHoursTheme,
  nightTheme,
]

// New visitors land in the living room. A saved scene id still wins.
export const DEFAULT_THEME_ID: ThemeId = 'golden-hour'

// Every user entry point (menu, cycling, persistence) uses this shipping roster.
export const THEMES = availableVisuals(ALL_THEMES, FOR_LATER_THEME_IDS)

const SCENE_THEME_IDS: readonly ThemeId[] = ['golden-hour', 'rainy-study', 'after-hours', 'night']

/** Scene id from storage. Classic ids and a missing key become Golden Hour. */
export function readStoredThemeId(): ThemeId {
  let raw: string | null = null
  try {
    raw = localStorage.getItem('midee.theme')
  } catch {
    return DEFAULT_THEME_ID
  }
  if (raw !== null && (SCENE_THEME_IDS as readonly string[]).includes(raw)) return raw as ThemeId
  try {
    localStorage.setItem('midee.theme', DEFAULT_THEME_ID)
  } catch {
    // Persistence is best-effort.
  }
  return DEFAULT_THEME_ID
}
