import { describe, expect, it } from 'vitest'
import { keyboardPalette } from '../keyboardStyle'
import { ALL_THEMES, DEFAULT_THEME_ID, THEMES } from '../theme'
import { applySceneClass, SCENES, sceneForTheme } from './index'

describe('scenes', () => {
  it('ships Golden Hour as a scene and the default theme', () => {
    expect(SCENES.map((scene) => scene.id)).toEqual([
      'golden-hour-living-room',
      'rainy-study',
      'after-hours',
      'night',
    ])
    expect(DEFAULT_THEME_ID).toBe('golden-hour')
    expect(THEMES.some((theme) => theme.id === 'golden-hour')).toBe(true)
    expect(ALL_THEMES.at(-1)?.id).toBe('night')
  })

  it('paints After Hours cyan on the right hand and pink on the left', () => {
    const scene = sceneForTheme('after-hours')
    expect(scene?.name).toBe('After Hours')
    expect(scene?.theme.trackColors[0]).toBe(0x22e8ff)
    expect(scene?.theme.trackColors[1]).toBe(0xff3fa4)
    expect(scene?.theme.accent).toBe(0xc6ff3d)
    const synth = keyboardPalette('after-hours', 'synth')
    expect(synth.strip).toBe(0x22e8ff)
    expect(synth.felt).toBe(0x1a1221)
    expect(synth.noteRh).toBe(0x22e8ff)
    expect(synth.noteLh).toBe(0xff3fa4)
  })

  it('paints Night as a flat walnut room with muted hands', () => {
    const scene = sceneForTheme('night')
    expect(scene?.name).toBe('Night')
    expect(scene?.background.decor).toBe('none')
    expect(scene?.theme.noteGlowStrength).toBe(0)
    expect(scene?.theme.trackColors[0]).toBe(0xdda95e)
    expect(scene?.theme.trackColors[1]).toBe(0xd49395)
    expect(scene?.theme.accent).toBe(0xe2ae63)
    expect(scene?.theme.background).toBe(0x14151c)
    const walnut = keyboardPalette('night', 'walnut')
    expect(walnut.caseDark).toBe(0x3a291e)
    expect(walnut.caseLight).toBe(0x5a3f2d)
    expect(walnut.ivory).toBe(0xdcd4c6)
    expect(walnut.noteRh).toBe(0xdda95e)
    expect(walnut.noteLh).toBe(0xd49395)
    expect(walnut.gap).toBe(0x14110f)
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

  it('swaps favicon links with the scene and leaves the apple-touch icon', () => {
    const svg = iconLink('icon', '/icons/favicon.svg', 'image/svg+xml')
    const png16 = iconLink('icon', '/icons/favicon-16.png', 'image/png', '16x16')
    const png32 = iconLink('icon', '/icons/favicon-32.png', 'image/png', '32x32')
    const png96 = iconLink('icon', '/icons/favicon-96.png', 'image/png', '96x96')
    const apple = iconLink('apple-touch-icon', '/icons/apple-touch-icon.png', '', '180x180')
    applySceneClass('rainy-study')
    expect(svg.getAttribute('href')).toBe('/icons/rainy/favicon.svg')
    expect(png16.getAttribute('href')).toBe('/icons/rainy/favicon-16.png')
    expect(png32.getAttribute('href')).toBe('/icons/rainy/favicon-32.png')
    expect(png96.getAttribute('href')).toBe('/icons/rainy/favicon-96.png')
    expect(apple.getAttribute('href')).toBe('/icons/apple-touch-icon.png')
    applySceneClass('after-hours')
    expect(svg.getAttribute('href')).toBe('/icons/after-hours/favicon.svg')
    expect(png16.getAttribute('href')).toBe('/icons/after-hours/favicon-16.png')
    expect(png32.getAttribute('href')).toBe('/icons/after-hours/favicon-32.png')
    expect(apple.getAttribute('href')).toBe('/icons/apple-touch-icon.png')
    applySceneClass('night')
    expect(svg.getAttribute('href')).toBe('/icons/night/favicon.svg')
    expect(png16.getAttribute('href')).toBe('/icons/night/favicon-16.png')
    expect(png32.getAttribute('href')).toBe('/icons/night/favicon-32.png')
    expect(apple.getAttribute('href')).toBe('/icons/apple-touch-icon.png')
    applySceneClass('golden-hour')
    expect(svg.getAttribute('href')).toBe('/icons/favicon.svg')
    expect(png16.getAttribute('href')).toBe('/icons/favicon-16.png')
    applySceneClass('sunset')
    expect(svg.getAttribute('href')).toBe('/icons/favicon.svg')
    for (const el of [svg, png16, png32, png96, apple]) el.remove()
  })
})

function iconLink(rel: string, href: string, type: string, sizes?: string): HTMLLinkElement {
  const link = document.createElement('link')
  link.rel = rel
  link.href = href
  if (type) link.type = type
  if (sizes) link.setAttribute('sizes', sizes)
  document.head.appendChild(link)
  return link
}
