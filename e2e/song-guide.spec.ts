import { expect, test } from '@playwright/test'

// The bundled untitled piece opens a song guide: section, bar, chord loop,
// a clickable timeline, and finger numbers on the keys.

test.use({ viewport: { width: 1280, height: 900 } })

test('song guide follows the untitled piece and can loop a section', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/')

  const card = page.locator('[data-card-id="untitled-g-sharp-minor"]')
  await expect(card).toBeVisible()
  await expect(card.locator('.sample-card-title')).toHaveText('Untitled in G# minor')
  await card.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: '/opt/cursor/artifacts/screenshots/song-guide-home.png',
    fullPage: true,
  })
  await card.click()

  const guide = page.locator('[data-song-guide]')
  await expect(guide).toBeVisible({ timeout: 30_000 })
  await expect(guide.locator('.song-guide-name')).toHaveText('Untitled in G# minor')

  const play = page.locator('#hud-play')
  await expect(play).toBeVisible()
  await play.hover()
  if ((await play.getAttribute('data-playing')) === 'true') await play.click()

  const scrubber = page.locator('#hud-scrubber')
  await scrubber.evaluate((el) => {
    const input = el as HTMLInputElement
    input.value = '38'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })

  await expect(guide).toHaveAttribute('data-bar', '20')
  await expect(guide).toHaveAttribute('data-section', 'melody')
  await expect(guide.locator('.song-guide-chord-name')).toHaveText('E')
  await expect(guide.locator('.song-guide-chip--on')).toHaveText('E')
  await expect(guide.locator('.song-guide-step')).toContainText('1')

  await expect.poll(async () => page.locator('.song-guide-badge').count()).toBeGreaterThan(0)
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/song-guide-melody.png' })

  await guide.locator('.song-guide-more > summary').click()
  await guide.getByRole('button', { name: /Climax, bars 189/ }).click()
  await expect(guide.locator('.song-guide-looping')).toContainText('189')
  await expect(guide).toHaveAttribute('data-section', 'climax')
  await expect(guide.locator('.song-guide-chord-name')).toHaveText('E')

  await guide.locator('[data-tempo="80"]').click()
  await expect(guide.locator('[data-tempo="80"]')).toHaveClass(/song-guide-tempo--on/)

  const clean = guide.locator('.song-guide-clean button')
  await clean.click()
  await clean.click()
  await clean.click()
  await expect(guide.locator('.song-guide-ready')).toBeVisible()
  await play.hover()
  if ((await play.getAttribute('data-playing')) === 'true') await play.click()
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/song-guide-climax.png' })

  const guideBox = await guide.locator('.song-guide-card').boundingBox()
  const lowerBox = await page.locator('#lower-left').boundingBox()
  const hudBox = await page.locator('#hud').boundingBox()
  expect(guideBox).toBeTruthy()
  expect(lowerBox).toBeTruthy()
  expect(hudBox).toBeTruthy()
  if (guideBox && lowerBox && hudBox) {
    const overlaps = (a: typeof guideBox, b: typeof guideBox) =>
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
    expect(overlaps(guideBox, lowerBox)).toBe(false)
    expect(overlaps(guideBox, hudBox)).toBe(false)
  }

  await guide.locator('.song-guide-close').click()
  await expect(guide.locator('.song-guide-tab')).toBeVisible()
  await expect(page.locator('.song-guide-badge')).toHaveCount(0)
})
