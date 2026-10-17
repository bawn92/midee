import { describe, expect, it } from 'vitest'
import { ALL_THEMES, DEFAULT_THEME_ID, THEMES } from '../theme'
import { applySceneClass, SCENES, sceneForTheme } from './index'

describe('scenes', () => {
  it('ships Golden Hour as a scene and the default theme', () => {
    expect(SCENES.map((scene) => scene.id)).toEqual(['golden-hour-living-room'])
    expect(DEFAULT_THEME_ID).toBe('golden-hour')
    expect(THEMES.some((theme) => theme.id === 'golden-hour')).toBe(true)
    expect(ALL_THEMES.at(-1)?.id).toBe('golden-hour')
  })

  it('paints the right hand honey and the left hand dusty rose', () => {
    const scene = sceneForTheme('golden-hour')
    expect(scene?.keyboard.material).toBe('upright-walnut')
    expect(scene?.theme.trackColors[0]).toBe(0xf0b95a)
    expect(scene?.theme.trackColors[1]).toBe(0xe8a0a0)
  })

  it('toggles only the active scene class on the document', () => {
    applySceneClass('golden-hour')
    expect(document.documentElement.classList.contains('scene-golden-hour')).toBe(true)
    applySceneClass('sunset')
    expect(document.documentElement.classList.contains('scene-golden-hour')).toBe(false)
  })
})
