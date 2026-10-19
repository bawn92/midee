import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from '@playwright/test'

const MIDI = fileURLToPath(new URL('../fixtures/multi-track.mid', import.meta.url))
const SCENES = [
  { id: 'golden-hour', name: 'Golden Hour Living Room' },
  { id: 'rainy-study', name: 'Rainy Study' },
] as const

function watchRenderingErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (
      /shader.*(?:error|failed)|(?:error|failed).*shader|GL_INVALID|INVALID_OPERATION|linkProgram|WebGL.*error/i.test(
        message.text(),
      )
    ) {
      errors.push(message.text())
    }
  })
  return errors
}

async function openAppearance(page: Page): Promise<void> {
  const menu = page.locator('.ts-customize-menu')
  if ((await menu.getAttribute('class'))?.includes('ts-popover--open')) return
  const trigger = page.locator('#ts-customize')
  await trigger.hover({ force: true })
  await trigger.click()
  await expect(menu).toHaveClass(/ts-popover--open/)
}

async function closeAppearance(page: Page): Promise<void> {
  await page.locator('#ts-appearance-panel .panel-close-btn').click()
  await expect(page.locator('.ts-customize-menu')).not.toHaveClass(/ts-popover--open/)
}

async function selectScene(page: Page, name: string, id: string): Promise<void> {
  await openAppearance(page)
  const card = page.getByRole('button', { name: `${name} scene`, exact: true })
  await card.click()
  await expect(card).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => localStorage.getItem('midee.theme'))).toBe(id)
}

async function seek(page: Page, seconds: number): Promise<void> {
  await page.locator('#hud-scrubber').evaluate((element, target) => {
    const input = element as HTMLInputElement
    input.value = String(target)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, seconds)
}

async function togglePlayback(page: Page): Promise<void> {
  await page.locator('#hud-play').hover()
  await page.locator('#hud-play').click()
}

test('scenes render MIDI and restore the chosen scene', async ({ page }, testInfo) => {
  const errors = watchRenderingErrors(page)
  await page.goto('/start')
  await page.locator('#midi-input').setInputFiles(MIDI)
  await expect(page.locator('#hud-play')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(400)
  if ((await page.locator('#hud-play').getAttribute('data-playing')) === 'true') {
    await togglePlayback(page)
  }

  for (const scene of SCENES) {
    await seek(page, 0.2)
    await selectScene(page, scene.name, scene.id)
    await closeAppearance(page)
    await togglePlayback(page)
    await expect
      .poll(async () => Number(await page.locator('#hud-scrubber').inputValue()))
      .toBeGreaterThan(0.45)
    await togglePlayback(page)
    await testInfo.attach(`${scene.id}-scheduled`, {
      body: await page.locator('canvas').first().screenshot(),
      contentType: 'image/png',
    })
    expect(errors, `${scene.name} rendering errors`).toEqual([])
  }

  await page.reload()
  await page.locator('#home-live').click()
  await openAppearance(page)
  await expect(page.getByRole('button', { name: 'Rainy Study scene', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(errors).toEqual([])
})

test('Rainy Study survives a held chord across a mobile resize', async ({ page }, testInfo) => {
  const errors = watchRenderingErrors(page)
  await page.goto('/start')
  await page.locator('#home-live').click()
  await selectScene(page, 'Rainy Study', 'rainy-study')
  await closeAppearance(page)
  const tonic = page.locator('#ts-chord-readout .ts-chord-readout-tonic')
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.down('x')
  await expect(tonic).toHaveText('D')
  await page.waitForTimeout(250)
  for (const key of ['z', 'c', 'v', 'b', 'q', 'e', 't']) await page.keyboard.down(key)
  await page.waitForTimeout(200)
  await page.setViewportSize({ width: 390, height: 844 })
  await testInfo.attach('rainy-study-live-mobile', {
    body: await page.locator('canvas').first().screenshot(),
    contentType: 'image/png',
  })
  await page.setViewportSize({ width: 1280, height: 720 })
  for (const key of ['z', 'c', 'v', 'b', 'q', 'e', 't', 'x']) await page.keyboard.up(key)
  await expect(tonic).toHaveText('-')
  expect(errors).toEqual([])
})
