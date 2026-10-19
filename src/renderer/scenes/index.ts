import { applySceneFavicon } from './favicon'
import { goldenHourScene } from './goldenHour'
import { rainyStudyScene } from './rainyStudy'
import type { KeyboardMaterial, Scene } from './types'

export { goldenHourScene, goldenHourTheme } from './goldenHour'
export { rainyStudyScene, rainyStudyTheme } from './rainyStudy'
export type { KeyboardMaterial, Scene, SceneDecor } from './types'

// Places. Each scene's `token` selects its colour file via data-scene.
export const SCENES: readonly Scene[] = [goldenHourScene, rainyStudyScene]

const BY_THEME = new Map(SCENES.map((scene) => [scene.themeId, scene]))

export function sceneForTheme(themeId: string): Scene | null {
  return BY_THEME.get(themeId as Scene['themeId']) ?? null
}

export function keyboardMaterial(themeId: string): KeyboardMaterial {
  return sceneForTheme(themeId)?.keyboard.material ?? 'flat'
}

// The class is the scene's whole document presentation. Clearing it returns
// the classic dark chrome owned by :root.
export function applySceneClass(themeId: string): void {
  const root = document.documentElement
  for (const scene of SCENES) root.classList.remove(scene.className)
  const scene = sceneForTheme(themeId)
  if (scene) {
    root.classList.add(scene.className)
    root.dataset.scene = scene.token
  } else {
    delete root.dataset.scene
  }
  applySceneFavicon(scene?.token)
}
