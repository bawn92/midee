import { expect, type Page, test } from '@playwright/test'

const C3_MID = Buffer.from([
  0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x00, 0x60, 0x4d, 0x54,
  0x72, 0x6b, 0x00, 0x00, 0x00, 0x1b, 0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, 0x00, 0xff, 0x58,
  0x04, 0x04, 0x02, 0x18, 0x08, 0x00, 0x90, 0x30, 0x64, 0x83, 0x00, 0x80, 0x30, 0x00, 0x00, 0xff,
  0x2f, 0x00,
])

function installBoards(inputs: 1 | 2): string {
  return `(() => {
    localStorage.setItem('midee.keyboardRange', JSON.stringify({
      start: 36,
      size: 48,
      followMidi: false,
      controllerLow: null,
      calibrated: false,
      fitToRange: true,
    }))
    const make = (id) => ({
      id,
      name: 'LUMI Keys BLOCK',
      manufacturer: 'ROLI',
      state: 'connected',
      connection: 'open',
      onmidimessage: null,
      send() {},
    })
    const left = make('in-left')
    const right = make('in-right')
    const outLeft = make('out-left')
    const outRight = make('out-right')
    const inputMap = new Map([[left.id, left]])
    if (${inputs} === 2) inputMap.set(right.id, right)
    const access = {
      inputs: inputMap,
      outputs: new Map([[outLeft.id, outLeft], [outRight.id, outRight]]),
      sysexEnabled: false,
      onstatechange: null,
    }
    navigator.requestMIDIAccess = async () => access
    window.__lumi = { left, right }
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

async function press(page: Page, side: 'left' | 'right', note: number): Promise<void> {
  await page.evaluate(
    ({ side, note }) => {
      const input = (window as unknown as { __lumi: Record<string, { onmidimessage: ((e: Event) => void) | null }> }).__lumi[side]
      input.onmidimessage?.({
        data: new Uint8Array([0x90, note, 90]),
        timeStamp: performance.now(),
      } as MIDIMessageEvent)
    },
    { side, note },
  )
}

async function shot(page: Page, name: string): Promise<void> {
  const step = page.locator('#piano-m-setup')
  await step.scrollIntoViewIfNeeded()
  await step.screenshot({ path: `/opt/cursor/artifacts/screenshots/${name}.png` })
}

test('guided board setup assigns ports and lights', async ({ page }) => {
  await page.addInitScript(installBoards(2))
  await page.setViewportSize({ width: 1280, height: 900 })
  await openPiece(page)
  const setup = page.locator('#piano-m-setup')
  await expect(setup).toContainText('Press any key on your LEFT board.')
  await shot(page, 'piano_m_setup_left')

  await press(page, 'left', 62)
  await expect(setup).toContainText('Press any key on your RIGHT board.')
  await shot(page, 'piano_m_setup_right')

  await page.waitForTimeout(350)
  await press(page, 'right', 62)
  await expect(setup).toContainText('Play the lowest key on each board.')
  await expect(setup).toContainText('The right board now plays 24 semitones higher.')
  await shot(page, 'piano_m_setup_confirm')

  await page.waitForTimeout(350)
  await press(page, 'left', 60)
  await page.waitForTimeout(350)
  await press(page, 'right', 60)
  await expect(setup).toContainText('Left C4. Right C6.')
  await expect(setup).toContainText('ROLI calls these C3 and C5.')
  await shot(page, 'piano_m_setup_detected')

  await setup.getByRole('button', { name: 'Continue' }).click()
  await expect(setup).toContainText('Did the LEFT board light?')
  await shot(page, 'piano_m_setup_light_left')
  await setup.getByRole('button', { name: 'Both lit' }).click()
  await expect(setup).toContainText('Did the RIGHT board light?')
  await expect(setup).toContainText('Load the left file on the left board')
  await shot(page, 'piano_m_setup_light_right')
  await setup.getByRole('button', { name: 'Yes' }).click()
  await expect(setup.getByRole('status')).toContainText('All set')
  await shot(page, 'piano_m_setup_done')
})

test('clustered boards explain the shared port', async ({ page }) => {
  await page.addInitScript(installBoards(1))
  await page.setViewportSize({ width: 1280, height: 900 })
  await openPiece(page)
  const setup = page.locator('#piano-m-setup')
  await expect(setup).toContainText('Press any key on your LEFT board.')
  await press(page, 'left', 60)
  await page.waitForTimeout(350)
  await press(page, 'left', 60)
  await expect(setup).toContainText('clustered without an octave offset')
  await shot(page, 'piano_m_setup_cluster')
})
