import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildLeaves,
  DEFAULT_PLANT_SHADOW,
  leafPose,
  PLANT_SHADOW_KEY,
  plantShadowBudget,
  plantShadowId,
  plantShadowsActive,
  setPlantShadow,
  storedPlantShadow,
} from './plantShadows'

describe('plant shadows', () => {
  beforeEach(() => {
    localStorage.clear()
    setPlantShadow(DEFAULT_PLANT_SHADOW)
  })

  it('persists the choice under midee.plantShadows and defaults to fern', () => {
    expect(plantShadowId()).toBe('fern')
    expect(storedPlantShadow()).toBe('fern')
    setPlantShadow('olive')
    expect(localStorage.getItem(PLANT_SHADOW_KEY)).toBe('olive')
    expect(plantShadowId()).toBe('olive')
    expect(storedPlantShadow()).toBe('olive')
  })

  it('ignores an unknown stored id', () => {
    localStorage.setItem(PLANT_SHADOW_KEY, 'palm')
    expect(storedPlantShadow()).toBe('fern')
  })

  it('draws only in Golden Hour, and never when the setting is off', () => {
    expect(plantShadowsActive('golden-hour', 'fern')).toBe(true)
    expect(plantShadowsActive('golden-hour', 'mixed')).toBe(true)
    expect(plantShadowsActive('golden-hour', 'off')).toBe(false)
    expect(plantShadowsActive('rainy-study', 'fern')).toBe(false)
    expect(plantShadowsActive('after-hours', 'fern')).toBe(false)
    expect(plantShadowsActive('rainy-study', 'off')).toBe(false)
    expect(plantShadowsActive('sunset', 'fern')).toBe(false)
  })

  it('lowers the shadow buffer scale and density on phone or low-power machines', () => {
    expect(plantShadowBudget({ phone: false, cores: 8, memory: 8 })).toEqual({
      scale: 0.5,
      density: 1,
    })
    expect(plantShadowBudget({ phone: true, cores: 8, memory: 8 }).scale).toBeLessThan(0.5)
    expect(plantShadowBudget({ phone: true, cores: 8, memory: 8 }).density).toBeLessThan(1)
    expect(plantShadowBudget({ phone: false, cores: 2, memory: 8 }).scale).toBeLessThan(0.5)
    expect(plantShadowBudget({ phone: false, cores: 8, memory: 4 }).density).toBeLessThan(1)
    expect(plantShadowBudget({ phone: false, cores: 4, memory: 8 })).toEqual({
      scale: 0.5,
      density: 1,
    })
  })

  it('holds a static pose when sway is off', () => {
    const leaves = buildLeaves({ plant: 'fern', width: 1440, wall: 730, density: 1, seed: 11 })
    expect(leaves.length).toBe(9)
    const leaf = leaves[0]
    expect(leaf).toBeDefined()
    if (!leaf) return
    const parked = leafPose(leaf, 1.2, 0, 6, 1440)
    const later = leafPose(leaf, 9.5, 0, 6, 1440)
    expect(parked).toEqual(later)
    expect(parked.dx).toBe(0)
    expect(parked.ang).toBe(leaf.dir)
    const moving = leafPose(leaf, 4, 1, 6, 1440)
    const again = leafPose(leaf, 4, 1, 6, 1440)
    expect(moving).toEqual(again)
  })

  it('uses fewer leaves when density drops', () => {
    const full = buildLeaves({ plant: 'fern', width: 800, wall: 500, density: 1 })
    const light = buildLeaves({ plant: 'fern', width: 800, wall: 500, density: 0.65 })
    expect(light.length).toBeLessThan(full.length)
    expect(light.length).toBeGreaterThanOrEqual(2)
  })
})
