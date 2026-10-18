import { describe, expect, it } from 'vitest'
import { ALL_THEMES, DEFAULT_THEME_ID, THEMES } from '../theme'
import { applySceneClass, SCENES, sceneForTheme } from './index'

describe('scenes', () => {
  it('ships Golden Hour as a scene and the default theme', () => {
    expect(SCENES.map((scene) => scene.id)).toEqual(['golden-hour-living-room', 'rainy-study'])
    expect(DEFAULT_THEME_ID).toBe('golden-hour')
    expect(THEMES.some((theme) => theme.id === 'golden-hour')).toBe(true)
    expect(ALL_THEMES.at(-1)?.id).toBe('rainy-study')
  })

  it('paints the right hand honey and the left hand rose', () => {
    const scene = sceneForTheme('golden-hour')
    expect(scene?.keyboard.material).toBe('upright-walnut')
    expect(scene?.theme.trackColors[0]).toBe(0xe6a94f)
    expect(scene?.theme.trackColors[1]).toBe(0xd9908f)
    expect(scene?.token).toBe('golden-hour')
  })

  it('toggles only the active scene class and data-scene token', () => {
    applySceneClass('golden-hour')
    expect(document.documentElement.classList.contains('scene-golden-hour')).toBe(true)
    expect(document.documentElement.dataset.scene).toBe('golden-hour')
    applySceneClass('rainy-study')
    expect(document.documentElement.classList.contains('scene-golden-hour')).toBe(false)
    expect(document.documentElement.dataset.scene).toBe('rainy-study')
    applySceneClass('sunset')
    expect(document.documentElement.dataset.scene).toBeUndefined()
  })
})
