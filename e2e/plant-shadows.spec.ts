import { expect, type Page, test } from '@playwright/test'

// Plant shadows persist under midee.plantShadows and only paint in Golden Hour.

const KEY = 'midee.plantShadows'

async function openAppearance(page: Page): Promise<void> {
  const menu = page.locator('.ts-customize-menu')
  if (await menu.evaluate((el) => el.classList.contains('ts-popover--open')).catch(() => false)) {
    return
  }
  const trigger = page.locator('#ts-customize')
  await trigger.waitFor({ state: 'visible', timeout: 30_000 })
  await trigger.click()
  await expect(menu).toHaveClass(/ts-popover--open/, { timeout: 15_000 })
}

test('plant shadows persist and stay off outside Golden Hour', async ({ page }) => {
  await page.goto('/start')
  await expect(page.locator('html')).toHaveAttribute('data-plant-shadows', 'fern', {
    timeout: 30_000,
  })
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'golden-hour')

  await openAppearance(page)
  const olive = page.locator('#plant-shadows').getByRole('button', { name: 'Olive', exact: true })
  await olive.click()
  await expect(olive).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('html')).toHaveAttribute('data-plant-shadows', 'olive')
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe('olive')
  await expect(page.locator('#plant-shadows-note')).toHaveCount(0)

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-plant-shadows', 'olive', {
    timeout: 30_000,
  })
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe('olive')

  await openAppearance(page)
  await page.getByRole('button', { name: 'Rainy Study scene', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'rainy-study')
  await expect(page.locator('html')).toHaveAttribute('data-plant-shadows', 'off')
  await expect(page.locator('#plant-shadows-note')).toHaveText('Available in Golden Hour')
  await expect(olive).toBeDisabled()
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe('olive')
})
