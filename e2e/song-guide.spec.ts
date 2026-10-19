import { expect, test } from '@playwright/test'

// The bundled untitled piece opens a song guide: section, bar, chord loop,
// and a clickable timeline. Finger numbers live on the notes, so the old
// key-top badge row stays empty.

test.use({ viewport: { width: 1280, height: 900 } })

test('song guide follows the untitled piece and can loop a section', async ({ page }) => {
  await page.goto('/start')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/start')

  const card = page.locator('[data-card-id="untitled-g-sharp-minor"]')
  await expect(card).toBeVisible()
  await expect(card.locator('.sample-card-title')).toHaveText('Untitled in G# minor')
  await card.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: '/opt/cursor/artifacts/screenshots/song-guide-home.png',
    fullPage: true,
  })
  await card.click()
  await expect(page.locator('#top-strip')).toHaveAttribute('data-mode', 'play', { timeout: 30_000 })
  await expect(page.locator('[data-song-guide]')).toHaveCount(0)

  // The guide stays on the section-loop page. A full-song span keeps the
  // scrubber free to move through the melody and the climax.
  await page.goto('/deadmau5?section=intro&bars=1-241')
  const guide = page.locator('[data-song-guide]')
  await expect(guide).toBeVisible({ timeout: 30_000 })
  await expect(guide.locator('.song-guide-name')).toHaveText('Untitled in G# minor')

  const play = page.locator('#hud-play')
  await expect(play).toBeVisible()
  await play.evaluate((el) => {
    if (el.getAttribute('data-playing') === 'true') (el as HTMLButtonElement).click()
  })

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

  await expect(page.locator('html')).toHaveAttribute('data-note-fingers', 'on')
  await expect(page.locator('.song-guide-badge')).toHaveCount(0)
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/song-guide-melody.png' })

  await guide.locator('.song-guide-more > summary').click()
  await guide.getByRole('button', { name: /Climax, bars 189/ }).click()
  await expect(guide.locator('.song-guide-looping')).toContainText('189')
  await expect(guide).toHaveAttribute('data-section', 'climax')
  await expect(guide.locator('.song-guide-chord-name')).toHaveText('E')
  // The jump starts playback. Hold the playhead so the clean-run count stays
  // on this step.
  await play.evaluate((el) => {
    if (el.getAttribute('data-playing') === 'true') (el as HTMLButtonElement).click()
  })

  await guide.locator('[data-tempo="80"]').click()
  await expect(guide.locator('[data-tempo="80"]')).toHaveClass(/song-guide-tempo--on/)

  const clean = guide.locator('.song-guide-clean button')
  await clean.click()
  await clean.click()
  await clean.click()
  await expect(guide.locator('.song-guide-ready')).toBeVisible()
  await play.evaluate((el) => {
    if (el.getAttribute('data-playing') === 'true') (el as HTMLButtonElement).click()
  })
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
