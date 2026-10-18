import { expect, test } from '@playwright/test'

// These visits have not started yet, so `/` is the hero.
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('landing hero', () => {
  test('first visit shows the hero, then Start playing opens Home', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.locator('#landing')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('see them bloom')
    await expect(page.locator('#home-open')).toBeHidden()

    await page.locator('#landing-start').click()
    await expect(page).toHaveURL(/\/start$/)
    await expect(page.locator('#home-open')).toBeVisible()
    await expect(page.locator('.home-title')).toHaveText('What shall we play?')
    await expect(page).toHaveTitle('Play notes, see them bloom')

    await page.goto('/')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('#landing')).toBeVisible()
    await expect(page.locator('#home-open')).toBeHidden()
    expect(await page.evaluate(() => localStorage.getItem('midee.started'))).toBe('1')
  })

  test('the header mark opens the hero and the home icon stays on Home', async ({ page }) => {
    await page.goto('/start')
    await expect(page.locator('#home-open')).toBeVisible()
    await expect(page.locator('#ts-brand')).toHaveAttribute('href', '/')

    await page.locator('#home-live').click()
    await expect(page.locator('#ts-brand')).toHaveAttribute('href', '/')
    await page.locator('#ts-home').click()
    await expect(page).toHaveURL(/\/start$/)
    await expect(page.locator('#home-open')).toBeVisible()

    await page.locator('#ts-brand').click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('#landing')).toBeVisible()
    await expect(page.locator('#home-open')).toBeHidden()
  })

  test('/welcome keeps the hero after the visitor has started', async ({ page }) => {
    await page.goto('/')
    await page.locator('#landing-start').click()
    await expect(page).toHaveURL(/\/start$/)
    await page.goto('/welcome')
    await expect(page.locator('#landing')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('see them bloom')
  })

  test('Plug in your keyboard opens the MIDI sheet', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await page.locator('#landing-plug').click()
    await expect(page).toHaveURL(/\/start\?connect=midi$/)
    const sheet = page.locator('#landing-midi')
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText(/Looking for MIDI|MIDI unavailable|MIDI is blocked/)
  })

  test('a deep link opens the MIDI sheet on Home', async ({ page }) => {
    await page.goto('/start?connect=midi')
    await expect(page.locator('#home-open')).toBeVisible()
    await expect(page.locator('#landing-midi')).toBeVisible()
    await expect(page.locator('#landing')).toHaveCount(0)
  })

  test('the hero stays beside the keyboard from 1024 through 1440', async ({ page }) => {
    for (const width of [1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/welcome')
      const copy = await page.locator('.landing-copy').boundingBox()
      const art = await page.locator('.hero-art').boundingBox()
      expect(copy, `copy at ${width}`).toBeTruthy()
      expect(art, `art at ${width}`).toBeTruthy()
      expect(art!.x).toBeGreaterThan(copy!.x + copy!.width - 8)
      expect(art!.y).toBeLessThan(copy!.y + copy!.height)
    }
  })

  test('phone stacks the keyboard under the invitation', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('/welcome')
    const copy = await page.locator('.landing-copy').boundingBox()
    const art = await page.locator('.hero-art').boundingBox()
    expect(art!.y).toBeGreaterThan(copy!.y + 40)
    expect(art!.width).toBeLessThan(400)
  })
})
