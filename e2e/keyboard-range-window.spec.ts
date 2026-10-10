import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from '@playwright/test'

const FIXTURE_MID = fileURLToPath(new URL('../fixtures/multi-track.mid', import.meta.url))

// The on-screen piano stays 88 keys. The controller window is a highlight on
// those keys, draggable, and snapped to the layout for its size (C for 24).

async function readWindow(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return null
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') return null
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return null
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width }
    }
    const band = document.getElementById('kbd-range-band')
    const canvas = document.getElementById('pianoroll')
    return {
      notes: document.querySelector('.kbd-range-notes')?.textContent ?? '',
      bandHidden: band?.hasAttribute('hidden') ?? true,
      band: box(band),
      canvas: box(canvas),
      bar: box(document.querySelector('.kbd-range-bar')),
      hint: box(document.querySelector('#key-hint.kh--visible:not(.kh--collapsed) .kh-body')),
      hud: box(document.querySelector('#hud.hud--active, .float-hud.sr-hud:not(.float-hud--collapsed)')),
    }
  })
}

function overlaps(
  a: { left: number; top: number; right: number; bottom: number } | null,
  b: { left: number; top: number; right: number; bottom: number } | null,
): boolean {
  if (!a || !b) return false
  return a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5
}

test('24-key window highlights part of the full piano and snaps to C', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await page.locator('#home-live').click()
  await page.locator('#kbd-range-label').click()
  await page.locator('.kbd-range-preset', { hasText: /^24$/ }).click()
  await page.locator('#kbd-range-label').click()

  const placed = await readWindow(page)
  expect(placed.notes).toBe('C3–B4')
  expect(placed.bandHidden).toBe(false)
  expect(placed.canvas!.width).toBeGreaterThan(1200)
  const fraction = placed.band!.width / placed.canvas!.width
  expect(fraction).toBeGreaterThan(0.2)
  expect(fraction).toBeLessThan(0.35)
  expect(overlaps(placed.band, placed.bar)).toBe(false)
  expect(overlaps(placed.band, placed.hint)).toBe(false)

  // Keys under the highlight still hit the piano, so they can be played.
  // Only the drag handle takes the pointer.
  const hit = await page.evaluate(() => {
    const band = document.getElementById('kbd-range-band')!.getBoundingClientRect()
    const move = document.querySelector('.kbd-range-band-move')!.getBoundingClientRect()
    const name = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)
      return el?.id || el?.className || el?.tagName
    }
    return {
      handle: name(move.left + move.width / 2, move.top + 8),
      key: name(band.left + band.width / 2, band.bottom - 24),
    }
  })
  expect(hit.handle).toBe('kbd-range-band-move')
  expect(hit.key).toBe('pianoroll')

  await page.locator('#kbd-range-up').click()
  expect((await readWindow(page)).notes).toBe('C#3–C5')

  const move = page.locator('.kbd-range-band-move')
  const box = (await move.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 220, box.y + box.height / 2, { steps: 12 })
  await page.mouse.up()
  const dragged = (await readWindow(page)).notes
  expect(dragged.startsWith('C')).toBe(true)
  expect(dragged.includes('#')).toBe(false)
})

test('Play and Learn keep the highlight on the full keyboard', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'midee.keyboardRange',
      JSON.stringify({ start: 60, size: 24, followMidi: false, controllerLow: 48, calibrated: true }),
    )
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await page.locator('#midi-input').setInputFiles(FIXTURE_MID)
  await expect(page.locator('#hud-play')).toBeVisible()
  const play = await readWindow(page)
  expect(play.notes).toBe('C4–B5')
  expect(play.bandHidden).toBe(false)
  expect(play.canvas!.width).toBeGreaterThan(1200)
  expect(overlaps(play.band, play.bar)).toBe(false)
  expect(overlaps(play.band, play.hud)).toBe(false)

  await page.goto('/')
  await page.locator('#home-learn').click()
  await page.locator('.ex-card[data-category="sight-reading"]').click()
  await expect(page.locator('.float-hud.sr-hud')).toBeVisible()
  const learn = await readWindow(page)
  expect(learn.notes).toBe('C4–B5')
  expect(learn.bandHidden).toBe(false)
  expect(overlaps(learn.band, learn.bar)).toBe(false)
  expect(overlaps(learn.band, learn.hud)).toBe(false)
})
