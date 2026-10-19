import { mkdir } from 'node:fs/promises'
import { expect, type Page, type TestInfo, test } from '@playwright/test'

const SHOTS = '/opt/cursor/artifacts/deadmau5'

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  const path = `${SHOTS}/${name}.png`
  await page.screenshot({ path })
  await info.attach(name, { path, contentType: 'image/png' })
}

test('deadmau5 sections loop inside the play view', async ({ page }, info) => {
  test.setTimeout(120_000)
  await mkdir(SHOTS, { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    if (msg.text().startsWith('Failed to load resource:')) return
    errors.push(msg.text())
  })

  await page.addInitScript(() => {
    localStorage.setItem('midee.started', '1')
    localStorage.setItem('midee.kbdRangeExpanded', '0')
  })
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.goto('/deadmau5')
  await expect(page.locator('[data-deadmau5-picker]')).toBeVisible()
  await expect(page.locator('[data-deadmau5-section="intro"]')).toBeVisible()
  await expect(page.locator('[data-deadmau5-section="climax"]')).toBeVisible()
  await expect(page.locator('[data-deadmau5-section="ending"]')).toContainText('Ending')
  await shot(page, info, '01-section-picker')

  await page.locator('[data-deadmau5-section="intro"]').click()
  await expect(page).toHaveURL(/\/deadmau5\?section=intro$/)
  await expect(page.locator('#top-strip')).toHaveAttribute('data-mode', 'play')
  await expect(page.locator('[data-deadmau5-strip]')).toBeVisible()
  await expect(page.locator('[data-deadmau5-pass]')).toContainText('1')
  await expect(page.locator('#pianoroll')).toBeVisible()
  const guide = page.locator('.song-guide-close')
  if (await guide.isVisible()) await guide.click()
  await expect(page.locator('[data-deadmau5-phase="playing"]')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('#hud-time')).not.toHaveText('0:00', { timeout: 15_000 })
  await shot(page, info, '02-looping-intro')

  for (let i = 0; i < 8; i++) await page.locator('[data-deadmau5-bar="end-dec"]').click()
  await expect(page).toHaveURL(/bars=1-2/)
  await expect(page.locator('[data-deadmau5-pass]')).toContainText('2', { timeout: 15_000 })

  await page.locator('[data-deadmau5-chip="melody"]').click()
  await expect(page).toHaveURL(/section=intro(%2C|,)melody/)
  await expect(page.locator('[data-deadmau5-chip="intro"]')).toHaveClass(/is-on/)
  await expect(page.locator('[data-deadmau5-chip="melody"]')).toHaveClass(/is-on/)

  await page.locator('[data-deadmau5-bar="end-dec"]').click()
  await expect(page).toHaveURL(/bars=1-25/)

  await page.goto('/deadmau5?section=climax')
  await expect(page.locator('[data-deadmau5-strip]')).toBeVisible()
  await expect(page.locator('[data-deadmau5-chip="climax"]')).toHaveClass(/is-on/)
  await page.reload()
  await expect(page.locator('[data-deadmau5-chip="climax"]')).toHaveClass(/is-on/)
  await expect(page.locator('#top-strip')).toHaveAttribute('data-mode', 'play')

  await page.locator('[data-deadmau5-learn]').click()
  await expect(page.locator('#top-strip')).toHaveAttribute('data-mode', 'learn', { timeout: 20_000 })
  await expect(page).toHaveURL(/\/deadmau5\?section=climax/)
  await expect(page.locator('[data-deadmau5-strip]')).toBeVisible()
  await expect(page.locator('.learn-host--exercise:not(.learn-host--hidden)')).toBeVisible()

  expect(errors).toEqual([])
})
