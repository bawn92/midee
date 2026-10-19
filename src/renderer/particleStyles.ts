import { availableVisuals, FOR_LATER_PARTICLE_IDS } from './forLater/visuals'
import type { MaterialParticleStyle } from './materialParticles'

export type ParticleStyle =
  | 'sparks'
  | 'embers'
  | 'bloom'
  | 'sparkle'
  | 'none'
  | 'glass'
  | 'rain'
  | MaterialParticleStyle

export interface ParticleStyleInfo {
  id: ParticleStyle
  name: string
}

// Historical order is immutable: old localStorage indices migrate through it.
export const ALL_PARTICLE_STYLES: readonly ParticleStyleInfo[] = [
  { id: 'sparks', name: 'Sparks' },
  { id: 'embers', name: 'Embers' },
  { id: 'bloom', name: 'Bloom' },
  { id: 'sparkle', name: 'Sparkle' },
  { id: 'none', name: 'Off' },
  { id: 'glass', name: 'Glass glints' },
  { id: 'silk', name: 'Silk fibers' },
  { id: 'gold', name: 'Gold leaf' },
  { id: 'pearl', name: 'Opal dust' },
  { id: 'liquid', name: 'Glass dust' },
  { id: 'mist', name: 'Mist' },
  { id: 'rain', name: 'Rain' },
]

export const PARTICLE_STYLES = availableVisuals(ALL_PARTICLE_STYLES, FOR_LATER_PARTICLE_IDS)

const PICKER_ORDER: readonly ParticleStyle[] = [
  'none',
  'sparks',
  'embers',
  'bloom',
  'sparkle',
  'pearl',
  'liquid',
  'rain',
  'mist',
]

export function isRainyParticle(id: string): boolean {
  return id === 'rain' || id === 'mist'
}

/** Rain and Mist stay on Rainy Study. Other scenes display them as Sparkle. */
export function displayParticle(id: ParticleStyle, themeId: string): ParticleStyle {
  if (themeId !== 'rainy-study' && isRainyParticle(id)) return 'sparkle'
  return id
}

export function pickerStyles(themeId: string): readonly ParticleStyleInfo[] {
  const rainy = themeId === 'rainy-study'
  const picked: ParticleStyleInfo[] = []
  for (const id of PICKER_ORDER) {
    if (!rainy && isRainyParticle(id)) continue
    const style = PARTICLE_STYLES.find((item) => item.id === id)
    if (style) picked.push(style)
  }
  return picked
}
