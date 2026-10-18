import { expect, type Page, test } from '@playwright/test'

// The scene transport used to park a 4px scrubber on the pill's bottom edge.
// overflow:hidden then hid the track and left only a clipped thumb. This
// checks the honey bar and the elapsed/total labels stay inside the pill.

const WIDTHS = [1024, 1280, 1440, 390] as const

async function openPiece(page: Page): Promise<void> {
  await page.goto('/start')
  await page.locator('[data-card-id="untitled-g-sharp-minor"]').click()
  await expect(page.locator('#hud-play')).toBeVisible({ timeout: 30_000 })
}

async function expectProgressVisible(page: Page): Promise<void> {
  const scrubber = page.locator('#hud-scrubber')
  const elapsed = page.locator('#hud-time')
  const total = page.locator('#hud-duration')
  await expect(scrubber).toBeVisible()
  await expect(elapsed).toBeVisible()
  await expect(total).toBeVisible()
  await expect(elapsed).toHaveText(/\d+:\d{2}/)
  await expect(total).toHaveText(/\d+:\d{2}/)

  const boxes = await page.evaluate(() => {
    const hudEl = document.querySelector('#hud')
    const bar = document.querySelector('#hud-scrubber')
    const time = document.querySelector('#hud-time')
    if (!hudEl || !bar || !time) return null
    const hudBox = hudEl.getBoundingClientRect()
    const barBox = bar.getBoundingClientRect()
    const timeBox = time.getBoundingClientRect()
    const barStyle = getComputedStyle(bar)
    const track = getComputedStyle(bar, '::-webkit-slider-runnable-track')
    return {
      hud: { top: hudBox.top, bottom: hudBox.bottom, width: hudBox.width },
      bar: { top: barBox.top, bottom: barBox.bottom, width: barBox.width, height: barBox.height },
      time: { width: timeBox.width, height: timeBox.height },
      trackHeight: track.height,
      paint: `${barStyle.backgroundImage} ${barStyle.backgroundSize} ${track.backgroundImage}`,
    }
  })
  expect(boxes).not.toBeNull()
  expect(boxes!.bar.width).toBeGreaterThan(80)
  expect(boxes!.bar.height).toBeGreaterThanOrEqual(14)
  expect(boxes!.time.width).toBeGreaterThan(20)
  expect(boxes!.bar.top).toBeGreaterThanOrEqual(boxes!.hud.top - 1)
  expect(boxes!.bar.bottom).toBeLessThanOrEqual(boxes!.hud.bottom + 1)
  const paint = boxes!.paint.replace(/\s/g, '').toLowerCase()
  expect(paint).toContain('rgb(230,169,79)')
  expect(paint).toContain('6px')
}

async function clickPlay(page: Page): Promise<void> {
  const play = page.locator('#hud-play')
  await play.hover()
  await play.click()
}

test('play transport keeps a visible honey progress bar', async ({ page }) => {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width < 500 ? 800 : 900 })
    await openPiece(page)
    const play = page.locator('#hud-play')
    // Autoplay starts ~250ms after load. Settle on paused before measuring.
    await page.waitForTimeout(400)
    if ((await play.getAttribute('data-playing')) === 'true') {
      await clickPlay(page)
      await expect(play).toHaveAttribute('data-playing', 'false')
    }
    await expectProgressVisible(page)

    const scrubber = page.locator('#hud-scrubber')
    await scrubber.evaluate((el) => {
      const input = el as HTMLInputElement
      const next = Number(input.max) * 0.45
      input.value = String(next)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect(page.locator('#hud-duration')).not.toHaveText('0:00')
    await expect(page.locator('#hud-time')).not.toHaveText('0:00')
    const pct = await scrubber.evaluate((el) => el.style.getPropertyValue('--pct'))
    expect(Number.parseFloat(pct)).toBeCloseTo(45, 0)
    await expectProgressVisible(page)

    if ((await play.getAttribute('data-playing')) !== 'true') await clickPlay(page)
    await expect(play).toHaveAttribute('data-playing', 'true')
    await expectProgressVisible(page)
    await clickPlay(page)
    await expect(play).toHaveAttribute('data-playing', 'false')
  }
})
