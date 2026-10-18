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
  await page.goto('/')
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
  await expect(page.getByText(/littlefoot/)).toBeVisible()
  const script = page.getByRole('link', { name: /piano-m-theme-lights\.littlefoot/ })
  await expect(script).toBeVisible()
  await expect(script).toHaveAttribute('href', '/piano-m-theme-lights.littlefoot')
  await page.screenshot({
    path: '/opt/cursor/artifacts/screenshots/piano_m_key_lights.png',
    fullPage: false,
  })
  await page.locator('#ts-customize').click()

  await page.locator('#hud-play').click()
  const sent = () =>
    page.evaluate(() => (window as unknown as { __midiSent: number[][] }).__midiSent)
  // Golden Hour default: left #d9908f → 108,72,71 and right #e6a94f → 115,84,39.
  // CC 23 is the factory lowest key, MIDI 60.
  const goldenPalette = [
    [0xbb, 23, 60],
    [0xbb, 20, 108],
    [0xbb, 21, 72],
    [0xbb, 22, 71],
    [0xbc, 20, 115],
    [0xbc, 21, 84],
    [0xbc, 22, 39],
  ]
  await expect.poll(sent).toEqual(expect.arrayContaining([...goldenPalette, [0x9b, 60, 100]]))

  await openAppearance(page)
  await page.getByRole('button', { name: 'Ocean theme', exact: true }).click()
  // Ocean: left #06b6d4 → 3,91,106 and right #38bdf8 → 28,94,124.
  await expect.poll(sent).toEqual(
    expect.arrayContaining([
      [0xbb, 20, 3],
      [0xbb, 21, 91],
      [0xbb, 22, 106],
      [0xbc, 20, 28],
      [0xbc, 21, 94],
      [0xbc, 22, 124],
    ]),
  )

  await page.locator('#hud-play').click()
  await expect.poll(sent).toEqual(expect.arrayContaining([[0x8b, 60, 0]]))
})
