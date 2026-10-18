import { expect, type Page, test } from '@playwright/test'

// Scene selection + persistence. Classic theme ids and the old integer index
// are rewritten to Golden Hour. Rainy Study is the other shipping scene.

const THEME_KEY = 'midee.theme'
const LEGACY_KEY = 'midee.themeIndex'

const ACCENT = {
  'golden-hour': '#b9773a',
  'rainy-study': '#6e8494',
} as const

function accentVar(page: Page, name: '--accent' | '--accent-soft' | '--accent-glow') {
  return page.evaluate(
    (prop) => getComputedStyle(document.documentElement).getPropertyValue(prop).trim(),
    name,
  )
}

function storedThemeId(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), THEME_KEY)
}

function sceneCard(page: Page, name: string) {
  return page.getByRole('button', { name: `${name} scene`, exact: true })
}

async function gotoApp(page: Page): Promise<void> {
  await page.goto('/')
  expect(await page.evaluate(() => window.isSecureContext)).toBe(true)
  await page.locator('#ts-customize').waitFor({ state: 'visible', timeout: 30_000 })
}

async function leaveHomeScreen(page: Page): Promise<void> {
  const liveTile = page.locator('#home-live')
  await liveTile.waitFor({ state: 'visible', timeout: 30_000 })
  await liveTile.click()
  await expect(page.locator('#dropzone')).toHaveClass(/dz--hidden/, { timeout: 15_000 })
}

async function openCustomize(page: Page): Promise<void> {
  const menu = page.locator('.ts-customize-menu')
  if (await menu.evaluate((el) => el.classList.contains('ts-popover--open')).catch(() => false))
    return
  const trigger = page.locator('#ts-customize')
  await trigger.hover({ force: true })
  await trigger.click()
  await expect(menu).toHaveClass(/ts-popover--open/, { timeout: 15_000 })
}

async function selectScene(page: Page, name: string): Promise<void> {
  await openCustomize(page)
  const card = sceneCard(page, name)
  await card.waitFor({ state: 'visible', timeout: 15_000 })
  await card.click()
}

test.describe('Scene selection + persistence', () => {
  test('ships Golden Hour and Rainy Study, with no classic theme grid', async ({ page }) => {
    await gotoApp(page)
    await leaveHomeScreen(page)
    await openCustomize(page)
    await expect(page.locator('.customize-theme-tile')).toHaveCount(0)
    await expect(sceneCard(page, 'Golden Hour Living Room')).toHaveAttribute('aria-pressed', 'true')
    await expect(sceneCard(page, 'Rainy Study')).toBeVisible()
    for (const name of ['Sunset', 'Ocean', 'Neon', 'Opal', 'Liquid Glass']) {
      await expect(page.getByRole('button', { name: `${name} theme`, exact: true })).toHaveCount(0)
    }
    await expect(page.locator('.customize-particle-chip')).toHaveCount(7)
  })

  test('a saved classic theme is rewritten to Golden Hour', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('midee.theme', 'sunset')
      localStorage.setItem('midee.particle', 'mist')
    })
    await gotoApp(page)
    await expect.poll(() => accentVar(page, '--accent'), { timeout: 15_000 }).toBe(ACCENT['golden-hour'])
    expect(await storedThemeId(page)).toBe('golden-hour')
    await leaveHomeScreen(page)
    await openCustomize(page)
    await expect(sceneCard(page, 'Golden Hour Living Room')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Embers particles', exact: true })).toHaveClass(
      /--on/,
    )
  })

  test('a legacy theme index is rewritten to Golden Hour', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('midee.theme')
      localStorage.setItem('midee.themeIndex', '2')
    })
    await gotoApp(page)
    await expect.poll(() => accentVar(page, '--accent'), { timeout: 15_000 }).toBe(ACCENT['golden-hour'])
    expect(await storedThemeId(page)).toBe('golden-hour')
    await leaveHomeScreen(page)
    await openCustomize(page)
    await expect(sceneCard(page, 'Golden Hour Living Room')).toHaveAttribute('aria-pressed', 'true')
  })

  test('selecting Rainy Study applies its accent and persists the id', async ({ page }) => {
    await gotoApp(page)
    await leaveHomeScreen(page)
    await selectScene(page, 'Rainy Study')

    await expect.poll(() => accentVar(page, '--accent'), { timeout: 15_000 }).toBe(ACCENT['rainy-study'])
    expect(await accentVar(page, '--accent-soft')).toBe(`${ACCENT['rainy-study']}2e`)
    expect(await accentVar(page, '--accent-glow')).toBe(`${ACCENT['rainy-study']}66`)
    await expect(sceneCard(page, 'Rainy Study')).toHaveAttribute('aria-pressed', 'true')
    expect(await storedThemeId(page)).toBe('rainy-study')
  })

  test('reload restores Rainy Study', async ({ page }) => {
    await gotoApp(page)
    await leaveHomeScreen(page)
    await selectScene(page, 'Rainy Study')
    await expect.poll(() => storedThemeId(page), { timeout: 15_000 }).toBe('rainy-study')

    await page.reload()
    await page.locator('#ts-customize').waitFor({ state: 'visible', timeout: 30_000 })
    await expect
      .poll(() => accentVar(page, '--accent'), { timeout: 15_000 })
      .toBe(ACCENT['rainy-study'])

    await leaveHomeScreen(page)
    await openCustomize(page)
    await expect(sceneCard(page, 'Rainy Study')).toHaveAttribute('aria-pressed', 'true')
  })

  test('an invalid stored theme id falls back to Golden Hour and is rewritten', async ({ page }) => {
    await page.addInitScript(
      ([themeKey, legacyKey]) => {
        localStorage.setItem(themeKey as string, 'nope')
        localStorage.removeItem(legacyKey as string)
      },
      [THEME_KEY, LEGACY_KEY] as const,
    )

    await gotoApp(page)
    await expect
      .poll(() => accentVar(page, '--accent'), { timeout: 15_000 })
      .toBe(ACCENT['golden-hour'])
    expect(await storedThemeId(page)).toBe('golden-hour')

    await leaveHomeScreen(page)
    await openCustomize(page)
    await expect(sceneCard(page, 'Golden Hour Living Room')).toHaveAttribute('aria-pressed', 'true')
  })
})
