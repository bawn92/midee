import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'

// A ROLI Piano M at its factory octave sends middle C (MIDI 60) as its lowest
// key. ROLI calls that note C3; this app calls it C4. The simulated input
// below is that device: one note-on, no hardware.

const NOTE_SCRIPT = `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
w, h = im.size
y = h - 12
left = None
right = None
for x in range(w):
    r, g, b = im.getpixel((x, y))
    if r + g + b > 180:
        if left is None:
            left = x
        right = x
if left is None or right is None:
    print('? 0 0')
    raise SystemExit
# 52 white keys, A0 through C8, share the keyboard width evenly. Detecting
# runs mis-names a key when a glow closes the gap between two whites.
n = 52
span = right - left + 1
key_w = span / n
seq = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
def name(i):
    if i == 0:
        return 'A0'
    if i == 1:
        return 'B0'
    k = i - 2
    return f"{seq[k % 7]}{1 + k // 7}"
best = None
best_count = -1
for i in range(n):
    a = int(left + i * key_w)
    b = int(left + (i + 1) * key_w)
    count = 0
    for yy in range(h - 180, h - 4, 2):
        for x in range(a, b, 2):
            r, g, bl = im.getpixel((x, yy))
            if r > 220 and r > g + 40 and r > bl + 80:
                count += 1
    if count > best_count:
        best_count = count
        best = name(i)
print(f"{best} {best_count} {n}")
`

async function litKey(page: Page): Promise<{ name: string; score: number; whites: number }> {
  const png = await page.screenshot({ type: 'png' })
  const dir = mkdtempSync(join(tmpdir(), 'midi-key-'))
  const path = join(dir, 'shot.png')
  writeFileSync(path, png)
  const out = execFileSync('python3', ['-c', NOTE_SCRIPT, path], { encoding: 'utf8' }).trim()
  const [name, score, whites] = out.split(' ')
  return { name: name ?? '', score: Number(score), whites: Number(whites) }
}

async function sendMidi(page: Page, pitch: number, down: boolean): Promise<void> {
  await page.evaluate(
    ({ pitch, down }) => {
      const input = (window as unknown as { __pianoM?: { onmidimessage: ((ev: unknown) => void) | null } })
        .__pianoM
      if (!input?.onmidimessage) throw new Error('MIDI input is not bound')
      const status = down ? 0x90 : 0x80
      input.onmidimessage({ data: new Uint8Array([status, pitch, down ? 100 : 0]), timeStamp: performance.now() })
    },
    { pitch, down },
  )
}

test('uncalibrated Piano M lowest key lands on the window, and calibration replaces it', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'midee.keyboardRange',
      JSON.stringify({
        start: 60,
        size: 24,
        followMidi: false,
        controllerLow: 48,
        calibrated: false,
        fitToRange: true,
      }),
    )
    const input = {
      id: 'piano-m',
      name: 'ROLI Piano M',
      state: 'connected' as const,
      connection: 'open' as const,
      onmidimessage: null as ((ev: { data: Uint8Array; timeStamp: number }) => void) | null,
      onstatechange: null,
    }
    const access = {
      inputs: new Map([[input.id, input]]),
      outputs: new Map(),
      sysexEnabled: false,
      onstatechange: null,
    }
    navigator.requestMIDIAccess = async () => access as unknown as MIDIAccess
    ;(window as unknown as { __pianoM: typeof input }).__pianoM = input
  })

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await page.locator('#home-live').click()
  await expect(page.locator('#kbd-range-cal-badge')).toHaveText('Not calibrated')
  await expect(page.locator('.kbd-range-notes')).toHaveText('C4–B5')

  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as { __pianoM?: { onmidimessage: unknown } }).__pianoM?.onmidimessage)))
    .toBe(true)

  // Factory lowest key is MIDI 60. An old saved anchor of MIDI 48 would light C5.
  await sendMidi(page, 60, true)
  await expect.poll(async () => (await litKey(page)).name).toBe('C4')
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/midi_uncalibrated_c4.png' })
  await sendMidi(page, 60, false)

  await page.locator('#kbd-range-oct-up').click()
  await expect(page.locator('.kbd-range-notes')).toHaveText('C5–B6')
  await sendMidi(page, 60, true)
  await expect.poll(async () => (await litKey(page)).name).toBe('C5')
  await sendMidi(page, 60, false)

  await page.locator('#kbd-range-calibrate-bar').click()
  await sendMidi(page, 48, true)
  await expect(page.locator('#kbd-range-cal-badge')).toHaveText('Calibrated C3')
  await expect.poll(async () => (await litKey(page)).name).toBe('C5')
  await sendMidi(page, 48, false)

  // The calibrated low key is C3, so the next key up is C4 on the hardware
  // and C6 in a window that starts at C5.
  await sendMidi(page, 60, true)
  await expect.poll(async () => (await litKey(page)).name).toBe('C6')
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/midi_calibrated_c6.png' })
})
