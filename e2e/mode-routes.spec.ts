import { mkdir } from 'node:fs/promises'
import { expect, type Page, type TestInfo, test } from '@playwright/test'

// Play, Live, and Learn each own the URL and the surface. A fast switch,
// including one that lands while the previous fade is still running, has to
// leave exactly one of those surfaces mounted.

const SHOTS = '/opt/cursor/artifacts/mode-routes'

type ModeName = 'play' | 'live' | 'learn'

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  const path = `${SHOTS}/${name}.png`
  await page.screenshot({ path })
  await info.attach(name, { path, contentType: 'image/png' })
}

async function settled(page: Page): Promise<void> {
  await expect(page.locator('.mode-view--leave')).toHaveCount(0)
  await page.waitForFunction(() => !document.documentElement.dataset.vt)
}

async function expectOnly(page: Page, mode: ModeName, popoverClosed = true): Promise<void> {
  await settled(page)
  await expect(page).toHaveURL(new RegExp(`/${mode}$`))
  await expect(page.locator('#top-strip')).toHaveAttribute('data-mode', mode)
  await expect(page.locator('#dropzone')).toHaveClass(/dz--hidden/)
  await expect(page.locator('#home-open')).toBeHidden()

  const canvasHidden = await page.evaluate(() => document.body.classList.contains('canvas-hidden'))
  if (mode === 'learn') {
    expect(canvasHidden).toBe(true)
    await expect(page.locator('#pianoroll')).toBeHidden()
    await expect(page.locator('.learn-host--hub:not(.learn-host--hidden)')).toBeVisible()
    await expect(page.locator('.learn-hub')).toBeVisible()
    await expect(page.locator('.learn-host--exercise:not(.learn-host--hidden)')).toHaveCount(0)
    await expect(page.locator('.learn-host')).toHaveCount(2)
    await expect(page.locator('#hud')).not.toHaveClass(/hud--active/)
    await expect(page.locator('#kbd-range')).toBeHidden()
    await expect(page.locator('[data-song-guide]')).toHaveCount(0)
  } else {
    expect(canvasHidden).toBe(false)
    await expect(page.locator('#pianoroll')).toBeVisible()
    await expect(page.locator('.learn-host')).toHaveCount(0)
    await expect(page.locator('.learn-hub')).toHaveCount(0)
    if (mode === 'play') await expect(page.locator('#hud')).toHaveClass(/hud--play/)
    if (mode === 'live') {
      await expect(page.locator('#hud')).toHaveClass(/hud--live/)
      await expect(page.locator('[data-song-guide]')).toHaveCount(0)
    }
  }

  if (popoverClosed) {
    await expect(page.locator('#kbd-range.kbd-range--open')).toHaveCount(0)
    await expect(page.locator('.ts-popover--open')).toHaveCount(0)
  }
}

test('mode routes stay on one surface through fast switches and history', async ({ page }, info) => {
  test.setTimeout(120_000)
  await mkdir(SHOTS, { recursive: true })
  const errors: string[] = []
  // Vite preview has no Vercel analytics route. The production host serves it.
  page.on('response', (res) => {
    if (res.status() < 400) return
    if (res.url().includes('/_vercel/insights/')) return
    errors.push(`${res.status()} ${res.url()}`)
  })
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    if (msg.text().startsWith('Failed to load resource:')) return
    errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/start')
  await page.locator('[data-card-id="untitled-g-sharp-minor"]').click()
  await expectOnly(page, 'play', false)
  await shot(page, info, '01-play')

  // Each click arrives while the previous fade (360ms) is still running.
  for (const mode of ['live', 'learn', 'live', 'play'] as const) {
    await page.locator(`#ts-mode-${mode}`).click()
    await page.waitForTimeout(50)
  }
  await expectOnly(page, 'play')
  await shot(page, info, '02-rapid-play')
  expect(errors, errors.join('\n')).toEqual([])

  const settledHops: ModeName[] = ['live', 'learn', 'live', 'play']
  for (const [index, mode] of settledHops.entries()) {
    if (mode === 'learn' && settledHops[index - 1] === 'live') {
      const opened = await page.locator('#kbd-range').evaluate((el) => {
        return el.classList.contains('kbd-range--open')
      })
      if (!opened) await page.locator('#kbd-range-label').click()
      await expect(page.locator('#kbd-range')).toHaveClass(/kbd-range--open/)
    }
    await page.locator(`#ts-mode-${mode}`).click()
    await expectOnly(page, mode)
    await shot(page, info, `03-settled-${index}-${mode}`)
    expect(errors, errors.join('\n')).toEqual([])
  }

  await page.goBack()
  await expectOnly(page, 'live')
  await shot(page, info, '04-back-live')

  await page.goBack()
  await expectOnly(page, 'learn')
  await shot(page, info, '05-back-learn')

  await page.goForward()
  await expectOnly(page, 'live')
  await shot(page, info, '06-forward-live')

  await page.goForward()
  await expectOnly(page, 'play')
  await shot(page, info, '07-forward-play')
  expect(errors, errors.join('\n')).toEqual([])

  await page.goto('/learn')
  await expectOnly(page, 'learn')
  await shot(page, info, '08-direct-learn')

  await page.goto('/live')
  await expectOnly(page, 'live')
  await shot(page, info, '09-direct-live')

  await page.goto('/')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('#landing')).toBeVisible()
  await expect(page.locator('.learn-host')).toHaveCount(0)
  await shot(page, info, '10-hero')
  expect(errors, errors.join('\n')).toEqual([])
})
