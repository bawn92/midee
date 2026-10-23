import { expect, type Page, test } from '@playwright/test'

test.use({ viewport: { width: 1440, height: 900 } })

function vlq(n: number): number[] {
  const bytes = [n & 0x7f]
  let value = n >> 7
  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80)
    value >>= 7
  }
  return bytes
}

// A few seconds of short notes across the lane colours, plus a repeated C.
function highwayMid(): Buffer {
  const events: { tick: number; data: number[] }[] = [
    { tick: 0, data: [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20] },
    { tick: 0, data: [0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08] },
  ]
  const notes: [number, number, number][] = [
    [24, 67, 360],
    [96, 48, 40],
    [96, 55, 40],
    [96, 60, 40],
    [96, 64, 40],
    [96, 67, 40],
    [96, 72, 40],
    [96, 79, 40],
    [96, 84, 40],
    [170, 60, 28],
    [210, 60, 28],
    [250, 60, 28],
    [290, 60, 28],
    [340, 61, 32],
    [390, 70, 32],
  ]
  for (const [tick, pitch, dur] of notes) {
    events.push({ tick, data: [0x90, pitch, 96] })
    events.push({ tick: tick + dur, data: [0x80, pitch, 0] })
  }
  events.push({ tick: 720, data: [0xff, 0x2f, 0x00] })
  events.sort((a, b) => a.tick - b.tick || a.data[0]! - b.data[0]!)
  const body: number[] = []
  let prev = 0
  for (const event of events) {
    body.push(...vlq(event.tick - prev), ...event.data)
    prev = event.tick
  }
  const len = body.length
  return Buffer.from([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 0x60, 0x4d, 0x54, 0x72, 0x6b,
    (len >> 24) & 255,
    (len >> 16) & 255,
    (len >> 8) & 255,
    len & 255,
    ...body,
  ])
}

async function loadPiece(page: Page): Promise<void> {
  await page.goto('/start')
  await page.locator('#midi-input').setInputFiles({
    name: 'highway.mid',
    mimeType: 'audio/midi',
    buffer: highwayMid(),
  })
  await expect(page.locator('#hud-play')).toBeVisible({ timeout: 30_000 })
  const play = page.locator('#hud-play')
  if ((await play.getAttribute('data-playing')) === 'true') await play.click()
}

async function park(page: Page): Promise<void> {
  await page.locator('#hud-scrubber').evaluate((el) => {
    const input = el as HTMLInputElement
    input.value = '0.35'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)))
      }),
  )
  await page.evaluate(() => {
    const el = document.activeElement
    if (el instanceof HTMLElement) el.blur()
  })
  await page.mouse.move(8, 8)
}

test('Highway scene shows the perspective roll, icon row, and progress bar', async ({ page }) => {
  await loadPiece(page)
  await page.locator('#ts-customize').click()
  await expect(page.getByRole('button', { name: 'Highway scene' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Golden Hour Living Room scene' })).toBeVisible()
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/highway_picker.png' })
  await page.getByRole('button', { name: 'Highway scene' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'highway')
  await page.locator('#ts-appearance-panel .panel-close-btn').click()
  await park(page)
  await expect(page.locator('#hud-loop')).toHaveAttribute('data-highway', 'loop')
  await expect(page.locator('#ts-tracks')).toHaveAttribute('data-highway', 'notes')
  await expect(page.locator('#hud-metro')).toHaveAttribute('data-highway-label', 'OFF')
  await expect(page.locator('#hud-sound')).toHaveAttribute('data-highway', 'sound')
  await expect(page.locator('#hud-speed-val')).toHaveAttribute('data-highway', 'cascade')
  await expect(page.locator('#ts-instrument')).toHaveAttribute('data-highway', 'instrument')
  await expect(page.locator('#ts-customize')).toHaveAttribute('data-highway', 'effect')
  const boxes = await page.evaluate(() => {
    const box = (sel: string) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    }
    return {
      scrubber: box('#hud-scrubber'),
      hud: box('#hud'),
      loop: box('#hud-loop'),
      notes: box('#ts-tracks'),
    }
  })
  expect(boxes.scrubber?.y ?? 99).toBeLessThan(4)
  expect(boxes.scrubber?.h ?? 99).toBeLessThan(8)
  expect(boxes.loop?.y ?? 999).toBeLessThan(20)
  expect(boxes.notes?.y ?? 999).toBeLessThan(20)
  expect(boxes.hud?.h ?? 999).toBeLessThan(180)
  expect(boxes.hud?.y ?? 0).toBeGreaterThan(40)
  expect(boxes.hud?.y ?? 999).toBeLessThan(220)
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/highway_play.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/highway_narrow.png' })
})

test('Highway keeps the Piano M Board 1 and Board 2 overlay', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('midee.theme', 'highway')
    localStorage.setItem(
      'midee.keyboardRange',
      JSON.stringify({
        start: 36,
        size: 48,
        followMidi: false,
        controllerLow: null,
        calibrated: false,
        fitToRange: true,
      }),
    )
    localStorage.setItem('midee.kbdRangeExpanded', '1')
    const input = {
      id: 'keys',
      name: 'ROLI Piano M',
      manufacturer: 'ROLI',
      state: 'connected',
      connection: 'open',
      onmidimessage: null,
    }
    const output = {
      id: 'keys-out',
      name: 'ROLI Piano M',
      manufacturer: 'ROLI',
      state: 'connected',
      connection: 'open',
      send() {},
    }
    const access = {
      inputs: new Map([[input.id, input]]),
      outputs: new Map([[output.id, output]]),
      sysexEnabled: false,
      onstatechange: null,
    }
    navigator.requestMIDIAccess = async () => access
  })
  await loadPiece(page)
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'highway')
  await park(page)
  const guide = page.locator('#piano-m-guide')
  if (await guide.isVisible()) {
    const dismiss = guide.getByRole('button', { name: 'Dismiss' })
    if (await dismiss.isVisible()) await dismiss.click()
    else await guide.getByRole('button', { name: 'Switch to 48' }).click()
  }
  const rangeLabel = page.locator('#kbd-range-label')
  if ((await rangeLabel.getAttribute('aria-expanded')) === 'true') await rangeLabel.click()
  await expect(page.locator('.kbd-range-board')).toHaveCount(2)
  await expect(page.locator('.kbd-range-board-label').nth(0)).toHaveText('Board 1')
  await expect(page.locator('.kbd-range-board-label').nth(1)).toHaveText('Board 2')
  await page.mouse.move(8, 8)
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/highway_boards.png' })
})
