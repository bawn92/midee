import { expect, type Page, test } from '@playwright/test'

const C3_MID = Buffer.from([
  0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x00, 0x60, 0x4d, 0x54,
  0x72, 0x6b, 0x00, 0x00, 0x00, 0x1b, 0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, 0x00, 0xff, 0x58,
  0x04, 0x04, 0x02, 0x18, 0x08, 0x00, 0x90, 0x30, 0x64, 0x83, 0x00, 0x80, 0x30, 0x00, 0x00, 0xff,
  0x2f, 0x00,
])

const RANGE_24 = JSON.stringify({
  start: 48,
  size: 24,
  followMidi: false,
  controllerLow: null,
  calibrated: false,
  fitToRange: true,
})

const RANGE_48 = JSON.stringify({
  start: 36,
  size: 48,
  followMidi: false,
  controllerLow: null,
  calibrated: false,
  fitToRange: true,
})

function installMidi(name: string, manufacturer: string, range: string): string {
  return `(() => {
    localStorage.setItem('midee.keyboardRange', ${JSON.stringify(range)})
    localStorage.setItem('midee.kbdRangeExpanded', '1')
    const input = {
      id: 'keys',
      name: ${JSON.stringify(name)},
      manufacturer: ${JSON.stringify(manufacturer)},
      state: 'connected',
      connection: 'open',
      onmidimessage: null,
    }
    const output = {
      id: 'keys-out',
      name: ${JSON.stringify(name)},
      manufacturer: ${JSON.stringify(manufacturer)},
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
    window.__midiInput = input
  })()`
}

async function openPiece(page: Page): Promise<void> {
  await page.goto('/start')
  await page.locator('#midi-input').setInputFiles({
    name: 'c3.mid',
    mimeType: 'audio/midi',
    buffer: C3_MID,
  })
  await expect(page.locator('#hud-play')).toBeVisible({ timeout: 30_000 })
}

test('Piano M guide, board segments, and range diagram', async ({ page }) => {
  await page.addInitScript(installMidi('ROLI Piano M', 'ROLI', RANGE_24))
  await page.setViewportSize({ width: 1280, height: 800 })
  await openPiece(page)

  const guide = page.locator('#piano-m-guide')
  await expect(guide).toBeVisible()
  await expect(guide).toContainText('How many Piano Ms are snapped together?')
  await expect(guide).toContainText('One cyan key marks the USB board')
  await expect(guide).toContainText('does not cycle light modes')
  await page.screenshot({
    path: '/opt/cursor/artifacts/screenshots/piano_m_guide.png',
  })

  await page.evaluate(() => {
    const input = (window as unknown as { __midiInput: { onmidimessage: ((e: Event) => void) | null } })
      .__midiInput
    input.onmidimessage?.({
      data: new Uint8Array([0x90, 84, 100]),
      timeStamp: performance.now(),
    } as MIDIMessageEvent)
  })
  await expect(guide).toContainText('second Piano M')
  await page.screenshot({
    path: '/opt/cursor/artifacts/screenshots/piano_m_suggest.png',
  })

  await guide.getByRole('button', { name: 'Switch to 48' }).click()
  await guide.getByRole('button', { name: 'Dismiss' }).click()
  await expect(guide).toBeHidden()
  const rangeLabel = page.locator('#kbd-range-label')
  if ((await rangeLabel.getAttribute('aria-expanded')) === 'true') await rangeLabel.click()
  await expect(page.locator('.kbd-range-board')).toHaveCount(2)
  await expect(page.locator('#kbd-range-band')).toBeVisible()
  await page.screenshot({
    path: '/opt/cursor/artifacts/screenshots/piano_m_boards.png',
  })

  if ((await rangeLabel.getAttribute('aria-expanded')) !== 'true') await rangeLabel.click()
  await expect(page.locator('.kbd-range-boards-mini-board')).toHaveCount(2)
  await page.screenshot({
    path: '/opt/cursor/artifacts/screenshots/piano_m_range_card.png',
  })
  await page.locator('#ts-customize').click()
  await page.getByText('Setup help').click()
  await page.getByRole('button', { name: 'Piano M setup' }).click()
  await expect(guide).toBeVisible()
  await page.locator('#ts-appearance-panel .panel-close-btn').click()
  if ((await rangeLabel.getAttribute('aria-expanded')) === 'true') await rangeLabel.click()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(guide).toBeVisible()
  await page.screenshot({
    path: '/opt/cursor/artifacts/screenshots/piano_m_guide_mobile.png',
  })
})

test('other keyboards do not show Piano M boards or the guide', async ({ page }) => {
  await page.addInitScript(installMidi('Roland FP-30', 'Roland', RANGE_48))
  await page.setViewportSize({ width: 1280, height: 800 })
  await openPiece(page)
  await expect(page.locator('#piano-m-guide')).toHaveCount(0)
  await expect(page.locator('.kbd-range-board')).toHaveCount(0)
  await expect(page.locator('.kbd-range-boards-mini')).toHaveCount(0)
  await page.locator('#ts-customize').click()
  await page.getByText('Setup help').click()
  await expect(page.getByRole('button', { name: 'Piano M setup' })).toHaveCount(0)
  await page.locator('#ts-appearance-panel .panel-close-btn').click()
  await expect(page.locator('#kbd-range-band')).toBeVisible()
  await page.screenshot({
    path: '/opt/cursor/artifacts/screenshots/piano_m_absent.png',
  })
})
