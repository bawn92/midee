import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 1280, height: 800 } })

test('Golden Hour play view shows the living-room scene with a song loaded', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'midee.keyboardRange',
      JSON.stringify({
        start: 48,
        size: 37,
        followMidi: false,
        controllerLow: null,
        calibrated: false,
        fitToRange: true,
      }),
    )
  })
  await page.goto('/start')
  await page.locator('[data-card-id="untitled-g-sharp-minor"]').click()

  await expect(page.locator('[data-song-guide]')).toHaveCount(0)
  await expect(page.locator('html')).toHaveClass(/scene-golden-hour/)
  const play = page.locator('#hud-play')
  await expect(play).toBeVisible({ timeout: 30_000 })
  if ((await play.getAttribute('data-playing')) === 'true') await play.click()

  const scrubber = page.locator('#hud-scrubber')
  await scrubber.evaluate((el) => {
    const input = el as HTMLInputElement
    input.value = '38'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })

  const rangePanel = page.locator('#kbd-range-panel')
  if (!(await rangePanel.isVisible())) await page.locator('#kbd-range-label').click()
  await expect(rangePanel).toBeVisible()
  await expect(page.locator('#kbd-range-band')).toBeVisible()
  // The label's tooltip stays up while it is focused. Park the pointer
  // and blur so the shot shows the room, not the help text.
  await page.evaluate(() => {
    const el = document.activeElement
    if (el instanceof HTMLElement) el.blur()
  })
  await page.mouse.move(8, 8)

  const boxes = await page.evaluate(() => {
    const rect = (sel: string) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    }
    return {
      guide: rect('.song-guide-card'),
      range: rect('#kbd-range-panel'),
      bar: rect('.kbd-range-bar'),
      hud: rect('#hud'),
      strip: rect('#top-strip'),
    }
  })
  const overlap = (
    a: { x: number; y: number; w: number; h: number } | null,
    b: { x: number; y: number; w: number; h: number } | null,
  ) =>
    !!a &&
    !!b &&
    a.x < b.x + b.w - 1 &&
    a.x + a.w > b.x + 1 &&
    a.y < b.y + b.h - 1 &&
    a.y + a.h > b.y + 1
  expect(overlap(boxes.guide, boxes.range)).toBe(false)
  expect(overlap(boxes.guide, boxes.bar)).toBe(false)
  expect(overlap(boxes.guide, boxes.hud)).toBe(false)
  expect(overlap(boxes.range, boxes.hud)).toBe(false)
  expect(overlap(boxes.bar, boxes.hud)).toBe(false)
  expect(overlap(boxes.guide, boxes.strip)).toBe(false)
  expect(overlap(boxes.range, boxes.strip)).toBe(false)
  expect(overlap(boxes.bar, boxes.strip)).toBe(false)

  await page.screenshot({
    path: '/opt/cursor/artifacts/screenshots/golden-hour-play.png',
    fullPage: false,
  })
  await page.screenshot({
    path: '/opt/cursor/artifacts/screenshots/golden-hour-play-1280x800.png',
    fullPage: false,
  })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(() => {
    const el = document.activeElement
    if (el instanceof HTMLElement) el.blur()
  })
  await page.mouse.move(8, 8)
  await expect(page.locator('#kbd-range-band')).toBeVisible()
  await page.screenshot({
    path: '/opt/cursor/artifacts/screenshots/golden-hour-play-1440x900.png',
    fullPage: false,
  })

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.locator('#ts-customize').click()
  await expect(page.locator('#ts-appearance-panel')).toBeVisible()
  await page.screenshot({
    path: '/opt/cursor/artifacts/screenshots/golden-hour-appearance.png',
    fullPage: false,
  })
})
