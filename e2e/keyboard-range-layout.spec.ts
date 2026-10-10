import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from '@playwright/test'

// The keyboard-range bar and the Live shortcuts card both sit in the lower
// left. They must stay fully on screen and fully usable together, in every
// mode, including viewports where the card is tall and the HUD is wide.

const FIXTURE_MID = fileURLToPath(new URL('../fixtures/multi-track.mid', import.meta.url))

type Box = { left: number; top: number; right: number; bottom: number }

type Layout = {
  vw: number
  vh: number
  bar: Box | null
  hint: Box | null
  panel: Box | null
  hud: Box | null
  sr: Box | null
  strip: Box | null
}

function overlaps(a: Box | null, b: Box | null): boolean {
  if (!a || !b) return false
  return a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5
}

function insideViewport(box: Box, vw: number, vh: number): boolean {
  return box.left >= -1 && box.top >= -1 && box.right <= vw + 1 && box.bottom <= vh + 1
}

async function readLayout(page: Page): Promise<Layout> {
  return page.evaluate(() => {
    const box = (el: Element | null): Box | null => {
      if (!el) return null
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') return null
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return null
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    }
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      bar: box(document.querySelector('.kbd-range-bar')),
      hint: box(document.querySelector('#key-hint.kh--visible:not(.kh--collapsed) .kh-body')),
      panel: box(document.querySelector('#kbd-range-panel')),
      hud: box(document.querySelector('#hud.hud--active')),
      sr: box(document.querySelector('.float-hud.sr-hud:not(.float-hud--collapsed)')),
      strip: box(document.querySelector('#top-strip')),
    }
  })
}

function assertClear(layout: Layout, label: string): void {
  expect(layout.bar, `${label}: range bar`).not.toBeNull()
  const bar = layout.bar!
  expect(insideViewport(bar, layout.vw, layout.vh), `${label}: range bar on screen`).toBe(true)
  if (layout.hint) {
    expect(insideViewport(layout.hint, layout.vw, layout.vh), `${label}: shortcuts on screen`).toBe(
      true,
    )
    expect(overlaps(bar, layout.hint), `${label}: range overlaps shortcuts`).toBe(false)
    expect(bar.bottom, `${label}: range sits above shortcuts`).toBeLessThanOrEqual(
      layout.hint.top - 6,
    )
  }
  if (layout.panel) {
    expect(insideViewport(layout.panel, layout.vw, layout.vh), `${label}: range panel on screen`).toBe(
      true,
    )
    expect(overlaps(layout.panel, layout.hint), `${label}: panel overlaps shortcuts`).toBe(false)
    expect(overlaps(layout.panel, layout.bar), `${label}: panel overlaps range bar`).toBe(false)
    expect(overlaps(layout.panel, layout.hud), `${label}: panel overlaps HUD`).toBe(false)
    expect(overlaps(layout.panel, layout.sr), `${label}: panel overlaps learn HUD`).toBe(false)
  }
  expect(overlaps(bar, layout.hud), `${label}: range overlaps HUD`).toBe(false)
  expect(overlaps(bar, layout.sr), `${label}: range overlaps learn HUD`).toBe(false)
  expect(overlaps(bar, layout.strip), `${label}: range overlaps top strip`).toBe(false)
  expect(overlaps(layout.panel, layout.strip), `${label}: panel overlaps top strip`).toBe(false)
  expect(overlaps(layout.hint, layout.strip), `${label}: shortcuts overlap top strip`).toBe(false)
}

async function showShortcuts(page: Page): Promise<void> {
  // The card is a Live-only view. Adding the visible class checks the same
  // column layout in Play and Learn, where the product keeps it hidden.
  await page.evaluate(() => {
    const hint = document.getElementById('key-hint')
    if (!hint) return
    hint.classList.add('kh--visible')
    hint.classList.remove('kh--collapsed', 'kh--idle')
  })
}

async function openRangePanel(page: Page): Promise<void> {
  const panel = page.locator('#kbd-range-panel')
  if (await panel.isVisible()) return
  await page.locator('#kbd-range-label').click()
  await expect(panel).toBeVisible()
}

test.describe('keyboard range does not cover the shortcuts card', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('midee.keyHintHidden')
    })
  })

  for (const size of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 1100, height: 720 },
    { width: 900, height: 640 },
    { width: 800, height: 560 },
    { width: 700, height: 500 },
  ]) {
    test(`Live ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size)
      await page.goto('/')
      await page.locator('#home-live').click()
      await expect(page.locator('#key-hint.kh--visible .kh-body')).toBeVisible()
      await expect(page.locator('.kbd-range-bar')).toBeVisible()

      const closed = await readLayout(page)
      assertClear(closed, `live ${size.width}x${size.height}`)

      await openRangePanel(page)
      const opened = await readLayout(page)
      expect(opened.panel, 'range panel').not.toBeNull()
      assertClear(opened, `live panel ${size.width}x${size.height}`)
    })
  }

  test('Play keeps the range clear of the HUD and of a shortcuts card', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 700 })
    await page.goto('/')
    await page.locator('#midi-input').setInputFiles(FIXTURE_MID)
    await expect(page.locator('#hud-play')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.kbd-range-bar')).toBeVisible()
    await expect(page.locator('#key-hint.kh--visible')).toHaveCount(0)

    assertClear(await readLayout(page), 'play')

    await page.setViewportSize({ width: 800, height: 560 })
    assertClear(await readLayout(page), 'play short')

    await showShortcuts(page)
    await openRangePanel(page)
    const both = await readLayout(page)
    expect(both.hint, 'forced shortcuts card').not.toBeNull()
    assertClear(both, 'play with shortcuts')
  })

  test('Learn sight-reading keeps the range clear of the exercise HUD', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await page.locator('#home-learn').click()
    await page.locator('.ex-card[data-category="sight-reading"]').click()
    await expect(page.locator('.float-hud.sr-hud')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.kbd-range-bar')).toBeVisible()

    assertClear(await readLayout(page), 'learn')

    await page.setViewportSize({ width: 900, height: 600 })
    assertClear(await readLayout(page), 'learn narrow')

    await showShortcuts(page)
    await openRangePanel(page)
    const both = await readLayout(page)
    expect(both.hint, 'forced shortcuts card').not.toBeNull()
    assertClear(both, 'learn with shortcuts')
  })
})
