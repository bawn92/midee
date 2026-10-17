import './goldenHour.css'
import { goldenHourScene } from './goldenHour'
import type { KeyboardMaterial, Scene } from './types'

export { goldenHourScene, goldenHourTheme } from './goldenHour'
export type { KeyboardMaterial, Scene, SceneDecor } from './types'

// First place. Later scenes append here and show up in the scene picker.
export const SCENES: readonly Scene[] = [goldenHourScene]

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
  if (scene) root.classList.add(scene.className)
}
