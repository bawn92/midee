import { mkdir } from 'node:fs/promises'
import { expect, type Page, type TestInfo, test } from '@playwright/test'

const SHOTS = '/opt/cursor/artifacts/club'

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  const path = `${SHOTS}/${name}.png`
  await page.screenshot({ path })
  await info.attach(name, { path, contentType: 'image/png' })
}

test('club records one local take and keeps the mode routes apart', async ({ page }, info) => {
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

  await page.goto('/club?view=loading')
  await expect(page.locator('[data-screen="loading"]')).toBeVisible()
  await expect(page.locator('#ts-mode-club')).toHaveAttribute('aria-selected', 'true')
  await shot(page, info, 'loading')

  await page.goto('/club')
  await expect(page).toHaveURL(/\/club$/)
  await expect(page.locator('#top-strip')).toHaveAttribute('data-mode', 'club')
  await expect(page.locator('[data-screen="landing"]')).toBeVisible()
  await expect(page.locator('#club-record-take')).toBeVisible()
  await expect(page.locator('#hud')).toBeHidden()
  await shot(page, info, 'landing')

  await page.locator('#club-open-board').click()
  await expect(page.locator('[data-screen="board"]')).toBeVisible()
  await expect(page.locator('.club-empty')).toBeVisible()
  await expect(page.locator('.club-local')).toContainText('this device')
  await shot(page, info, 'leaderboard-empty')
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.locator('[data-screen="landing"]')).toBeVisible()

  await page.locator('#ts-mode-learn').click()
  await expect(page).toHaveURL(/\/learn$/)
  await expect(page.locator('[data-learn-drop]')).toBeVisible()
  await expect(page.locator('[data-club]')).toHaveCount(0)

  await page.locator('#ts-mode-club').click()
  await expect(page).toHaveURL(/\/club$/)
  await expect(page.locator('[data-screen="landing"]')).toBeVisible()
  await expect(page.locator('[data-learn-drop]')).toHaveCount(0)

  await page.goto('/deadmau5')
  await expect(page.locator('[data-deadmau5-picker]')).toBeVisible()
  await page.locator('[data-deadmau5-section="intro"]').click()
  await expect(page).toHaveURL(/\/deadmau5\?section=intro/)
  await page.locator('#ts-mode-club').click()
  await expect(page).toHaveURL(/\/club$/)
  await expect(page.locator('[data-deadmau5-picker]')).toHaveCount(0)
  await expect(page.locator('[data-deadmau5-strip]')).toHaveCount(0)
  await expect(page.locator('[data-screen="landing"]')).toBeVisible()

  await page.locator('#club-record-take').click()
  await expect(page.locator('[data-screen="prerecord"]')).toBeVisible()
  await expect(page.locator('.club-blurb')).toContainText('100%')
  await shot(page, info, 'prerecord')

  await page.locator('#club-start').click()
  await expect(page.locator('[data-screen="countin"]')).toBeVisible()
  await shot(page, info, 'count-in')

  await expect(page.locator('[data-screen="recording"]')).toBeVisible({ timeout: 8_000 })
  await expect(page.locator('.club-progress span').first()).not.toHaveText('0:00', { timeout: 8_000 })
  await shot(page, info, 'recording')

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.club-hud')).toBeVisible()
  await shot(page, info, 'recording-phone')
  await page.setViewportSize({ width: 1440, height: 900 })

  await expect(page.locator('[data-screen="results"]')).toBeVisible({ timeout: 40_000 })
  await expect(page.locator('.club-score-big')).toBeVisible()
  await expect(page.locator('.club-local')).toHaveCount(0)
  await shot(page, info, 'results')

  await page.locator('#club-submit').click()
  await expect(page.locator('[data-screen="submit"]')).toBeVisible()
  await expect(page.locator('.club-local')).toContainText('this device')
  await shot(page, info, 'submit')

  await page.locator('#club-name').fill('Mara')
  await page.locator('#club-post').click()
  await expect(page.locator('[data-screen="rank"]')).toBeVisible()
  await expect(page.locator('.club-name')).toHaveText('Mara')
  await shot(page, info, 'rank')

  await page.locator('#club-see-board').click()
  await expect(page.locator('[data-screen="board"]')).toBeVisible()
  await expect(page.locator('.club-board-name')).toContainText('Mara')
  await expect(page.locator('.club-local')).toContainText('this device')
  await shot(page, info, 'leaderboard')

  const stored = await page.evaluate(() => ({
    attempts: localStorage.getItem('midee.club.attempts'),
    board: localStorage.getItem('midee.club.leaderboard'),
    name: localStorage.getItem('midee.club.name'),
  }))
  expect(stored.attempts).toContain('2026-10')
  expect(stored.board).toContain('Mara')
  expect(stored.board).toContain('"local":true')
  expect(stored.name).toBe('Mara')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => localStorage.setItem('midee.theme', 'night'))
  await page.goto('/club')
  await expect(page.locator('[data-screen="landing"]')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'night')
  await shot(page, info, 'landing-night')

  await page.setViewportSize({ width: 390, height: 844 })
  await shot(page, info, 'landing-phone')

  expect(errors).toEqual([])
})

test('club shared states render without a Clerk key', async ({ page }, info) => {
  test.setTimeout(90_000)
  await mkdir('/opt/cursor/artifacts/club-shared', { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  await page.addInitScript(() => {
    localStorage.setItem('midee.started', '1')
    localStorage.setItem('midee.kbdRangeExpanded', '0')
  })
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.goto('/club')
  await expect(page.locator('[data-screen="landing"]')).toBeVisible()
  await expect(page.locator('[data-auth="local"]')).toBeVisible()
  await expect(page.locator('#club-sign-in-google')).toHaveCount(0)

  await page.goto('/club?view=signed-out')
  await expect(page.locator('[data-screen="signed-out"]')).toBeVisible()
  await expect(page.locator('#club-sign-in-google')).toBeVisible()
  await expect(page.locator('#club-sign-in-apple')).toBeVisible()
  await expect(page.locator('#club-name')).toHaveCount(0)
  await page.screenshot({ path: '/opt/cursor/artifacts/club-shared/signed-out.png' })
  await info.attach('signed-out', {
    path: '/opt/cursor/artifacts/club-shared/signed-out.png',
    contentType: 'image/png',
  })

  await page.goto('/club?view=signed-in')
  await expect(page.locator('[data-screen="signed-in"]')).toBeVisible()
  await expect(page.locator('[data-auth="signed-in"]')).toBeVisible()
  await expect(page.getByText('Signed in as Mara Chen')).toBeVisible()
  await expect(page.locator('#club-post')).toBeVisible()
  await page.screenshot({ path: '/opt/cursor/artifacts/club-shared/signed-in.png' })
  await info.attach('signed-in', {
    path: '/opt/cursor/artifacts/club-shared/signed-in.png',
    contentType: 'image/png',
  })

  await page.goto('/club?view=leaderboard')
  await expect(page.locator('[data-screen="leaderboard"]')).toBeVisible()
  await expect(page.locator('.club-board--shared li')).toHaveCount(3)
  await expect(page.locator('.club-replay')).toHaveCount(3)
  await expect(page.locator('.club-avatar')).toHaveCount(3)
  await page.screenshot({ path: '/opt/cursor/artifacts/club-shared/leaderboard.png' })
  await info.attach('leaderboard', {
    path: '/opt/cursor/artifacts/club-shared/leaderboard.png',
    contentType: 'image/png',
  })

  await page.locator('#club-tab-friends').click()
  await expect(page.getByText('Friends are coming later.')).toBeVisible()
  await expect(page.locator('.club-board--shared')).toHaveCount(0)
  await page.screenshot({ path: '/opt/cursor/artifacts/club-shared/friends-empty.png' })

  expect(errors).toEqual([])
})
