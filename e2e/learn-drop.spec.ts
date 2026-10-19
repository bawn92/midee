import { readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, type Page, type TestInfo, test } from '@playwright/test'

const SHOTS = '/opt/cursor/artifacts/learn-drop'
const FIXTURE = fileURLToPath(new URL('../fixtures/multi-track.mid', import.meta.url))

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  const path = `${SHOTS}/${name}.png`
  await page.screenshot({ path })
  await info.attach(name, { path, contentType: 'image/png' })
}

test('learn is a midi drop zone and play has no song guide', async ({ page }, info) => {
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

  await page.goto('/learn')
  await expect(page.locator('[data-learn-drop]')).toBeVisible()
  await expect(page.locator('[data-learn-exercises="off"]')).toBeVisible()
  await expect(page.locator('.learn-drop__title')).toHaveText('Drop a MIDI file to learn it')
  await expect(page.locator('[data-learn-browse]')).toBeVisible()
  await expect(page.locator('.streak-row')).toBeVisible()
  await expect(page.locator('.hero-card')).toHaveCount(0)
  await expect(page.locator('.ex-card')).toHaveCount(0)
  await expect(page).toHaveURL(/\/learn$/)
  await shot(page, info, '01-learn-drop')

  await page.locator('[data-learn-drop]').evaluate((zone) => {
    const dt = new DataTransfer()
    dt.items.add(new File(['MThd'], 'strobe.mid', { type: 'audio/midi' }))
    const fire = (type: string) => {
      zone.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }))
    }
    fire('dragenter')
    fire('dragover')
  })
  await expect(page.locator('[data-learn-drop]')).toHaveAttribute('data-drag-over', 'true')
  await shot(page, info, '02-drag-over')

  const bytes = Array.from(readFileSync(FIXTURE))
  await page.locator('[data-learn-drop]').evaluate((zone, raw) => {
    const file = new File([new Uint8Array(raw)], 'multi-track.mid', { type: 'audio/midi' })
    const dt = new DataTransfer()
    dt.items.add(file)
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
  }, bytes)
  await expect(page.locator('.pa-hud')).toBeVisible({ timeout: 20_000 })
  await expect(page).toHaveURL(/\/learn$/)
  await expect(page.locator('#top-strip')).toHaveAttribute('data-mode', 'learn')

  await page.goto('/play?song=untitled-g-sharp-minor')
  await expect(page.locator('#top-strip')).toHaveAttribute('data-mode', 'play', { timeout: 30_000 })
  await expect(page.locator('#pianoroll')).toBeVisible()
  await expect(page.locator('#hud')).toBeVisible()
  await expect(page.locator('[data-song-guide]')).toHaveCount(0)
  await expect(page.locator('.song-guide-tab')).toHaveCount(0)
  const range = page.locator('#kbd-range-panel')
  if (await range.isVisible()) await page.locator('#kbd-range-label').click()
  await shot(page, info, '03-play-no-song-guide')

  expect(errors).toEqual([])
})
