import { expect, type Page, test } from '@playwright/test'

// One note, MIDI 48 (C3), held for two seconds at 120 bpm. Format 0.
const C3_MID = Buffer.from([
  0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x00, 0x60, 0x4d, 0x54,
  0x72, 0x6b, 0x00, 0x00, 0x00, 0x1b, 0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, 0x00, 0xff, 0x58,
  0x04, 0x04, 0x02, 0x18, 0x08, 0x00, 0x90, 0x30, 0x64, 0x83, 0x00, 0x80, 0x30, 0x00, 0x00, 0xff,
  0x2f, 0x00,
])

async function openAppearance(page: Page): Promise<void> {
  const menu = page.locator('.ts-customize-menu')
  if ((await menu.getAttribute('class'))?.includes('ts-popover--open')) return
  const trigger = page.locator('#ts-customize')
  await trigger.hover({ force: true })
  await trigger.click()
  await expect(menu).toHaveClass(/ts-popover--open/)
}

test('Piano M lights the physical key for the sounding note', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'midee.keyboardRange',
      JSON.stringify({
        start: 48,
        size: 24,
        followMidi: false,
        controllerLow: null,
        calibrated: false,
        fitToRange: true,
      }),
    )
    localStorage.setItem(
      'midee.keyLights',
      JSON.stringify({ outputId: 'piano-m', channelMode: 'pianoM', channel: 1 }),
    )
    const sent: number[][] = []
    const output = {
      id: 'piano-m',
      name: 'ROLI Piano M',
      manufacturer: 'ROLI',
      state: 'connected' as const,
      connection: 'open' as const,
      send: (data: number[] | Uint8Array) => {
        sent.push(Array.from(data))
      },
    }
    const access = {
      inputs: new Map(),
      outputs: new Map([[output.id, output]]),
      sysexEnabled: false,
      onstatechange: null,
    }
    navigator.requestMIDIAccess = async () => access as unknown as MIDIAccess
    ;(window as unknown as { __midiSent: number[][] }).__midiSent = sent
  })

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/start')
  await page.locator('#midi-input').setInputFiles({
    name: 'c3.mid',
    mimeType: 'audio/midi',
    buffer: C3_MID,
  })
  await expect(page.locator('#hud-play')).toBeVisible({ timeout: 30_000 })

  await openAppearance(page)
  const colors = page.getByLabel('Colors')
  await expect(colors).toHaveValue('pianoM')
  await page.getByText('Setup help').click()
  await expect(page.getByText(/factory key handler/)).toBeVisible()
  await expect(page.getByText(/press both octave buttons to reset the octave/)).toBeVisible()
  await expect(page.getByText(/cyan/i)).toHaveCount(0)
  await expect(page.getByText(/Power\/Mode/)).toHaveCount(0)
  const script = page.getByRole('link', { name: /piano-m-theme-lights\.littlefoot/ })
  await expect(script).toBeVisible()
  await expect(script).toHaveAttribute('href', '/piano-m-theme-lights.littlefoot')
  await page.screenshot({
    path: '/opt/cursor/artifacts/screenshots/piano_m_key_lights.png',
    fullPage: false,
  })
  await page.locator('#ts-appearance-panel .panel-close-btn').click()

  await page.locator('#hud-play').click()
  const sent = () =>
    page.evaluate(() => (window as unknown as { __midiSent: number[][] }).__midiSent)
  // Golden Hour default: left #d9908f → 108,72,71 and right #e6a94f → 115,84,39.
  // CC 23 is the factory lowest key, MIDI 60. The palette goes out as one send.
  const goldenPalette = [
    0xbb, 23, 60, 0xbb, 20, 108, 0xbb, 21, 72, 0xbb, 22, 71, 0xbc, 20, 115, 0xbc, 21, 84, 0xbc,
    22, 39,
  ]
  await expect.poll(sent).toEqual(expect.arrayContaining([goldenPalette, [0x9b, 60, 100]]))

  await openAppearance(page)
  await page.getByRole('button', { name: 'Rainy Study scene', exact: true }).click()
  // Rainy Study: left #c4897a → 98,68,61 and right #7ba3b0 → 61,81,88.
  await expect.poll(sent).toEqual(
    expect.arrayContaining([
      [
        0xbb, 23, 60, 0xbb, 20, 98, 0xbb, 21, 68, 0xbb, 22, 61, 0xbc, 20, 61, 0xbc, 21, 81,
        0xbc, 22, 88,
      ],
    ]),
  )

  await page.locator('#ts-appearance-panel .panel-close-btn').click()
  await page.locator('#hud-play').click()
  await expect.poll(sent).toEqual(expect.arrayContaining([[0x8b, 60, 0]]))
})

test('two LUMI ports default to all boards and keep swap as an advanced control', async ({ page }) => {
  await page.addInitScript(() => {
    const log: { id: string; data: number[] }[] = []
    const output = (id: string) => ({
      id,
      name: 'LUMI Keys BLOCK',
      manufacturer: 'ROLI',
      state: 'connected' as const,
      connection: 'open' as const,
      send: (data: number[] | Uint8Array) => {
        log.push({ id, data: Array.from(data) })
      },
    })
    const access = {
      inputs: new Map(),
      outputs: new Map([
        ['lumi-a', output('lumi-a')],
        ['lumi-b', output('lumi-b')],
      ]),
      sysexEnabled: false,
      onstatechange: null,
    }
    navigator.requestMIDIAccess = async () => access as unknown as MIDIAccess
    ;(window as unknown as { __boardLog: typeof log }).__boardLog = log
  })

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/start')
  await page.locator('#midi-input').setInputFiles({
    name: 'c3.mid',
    mimeType: 'audio/midi',
    buffer: C3_MID,
  })
  await expect(page.locator('#hud-play')).toBeVisible({ timeout: 30_000 })
  await openAppearance(page)

  const device = page.getByLabel('Light device')
  await expect(device).toHaveValue('piano-m:all')
  await expect(device.locator('option:not([hidden])')).toHaveText([
    'Off',
    'All Piano M boards (2)',
    'Piano M board 1',
    'Piano M board 2',
  ])
  await expect(page.getByRole('button', { name: 'Set up your boards' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Identify' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Swap boards' })).toBeVisible()
  await page.screenshot({
    path: '/opt/cursor/artifacts/screenshots/piano_m_all_boards.png',
  })

  await page.getByRole('button', { name: 'Swap boards' }).click()
  await expect(device.locator('option[value="lumi-b"]')).toHaveText('Piano M board 1')
  await expect(device.locator('option[value="lumi-a"]')).toHaveText('Piano M board 2')
})
