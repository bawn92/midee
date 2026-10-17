import type { Theme, ThemeId } from '../theme'

// A scene is a place: palette, backdrop, keyboard material, note colours,
// and a bit of ambient decor. Add another file next to goldenHour.ts and
// register it in SCENES. The scene's theme id is what persistence stores,
// so the existing theme picker, key lights, and note renderer keep working.
export type KeyboardMaterial = 'flat' | 'upright-walnut'
export type SceneDecor = 'none' | 'window-leaf'

export interface Scene {
  id: string
  name: string
  themeId: ThemeId
  // Class toggled on <html> while this scene is showing. Its stylesheet
  // owns the chrome (transport, cards, type). The canvas reads `background`
  // and `keyboard` directly.
  className: string
  preview: string
  theme: Theme
  background: {
    top: string
    mid: string
    bottom: string
    decor: SceneDecor
  }
  keyboard: {
    material: KeyboardMaterial
    case: number
    caseLight: number
  }
}
