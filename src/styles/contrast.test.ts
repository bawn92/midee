import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// WCAG AA for the scene text tokens. Normal text, including the 13px button
// label, needs 4.5:1. Golden Hour's secondary text and primary button are
// the pairs this change is responsible for. Other scenes are measured and
// the failures are locked below so a later edit cannot hide them.

const ROOT = resolve(import.meta.dirname, '.')

interface Pair {
  scene: string
  name: string
  fg: string
  bg: string
  ratio: number
}

function lin(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const raw = hex.replace('#', '')
  const value = Number.parseInt(raw, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg)
  const b = luminance(bg)
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  return (hi + 0.05) / (lo + 0.05)
}

function block(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(selector)
  if (start < 0) throw new Error(`missing ${selector}`)
  const open = css.indexOf('{', start)
  let depth = 0
  let end = open
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth += 1
    else if (css[i] === '}') {
      depth -= 1
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  const body = css.slice(open + 1, end)
  const vars: Record<string, string> = {}
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    const name = match[1]
    const color = match[2]
    if (name && color) vars[name] = color.toLowerCase()
  }
  return vars
}

function pairs(scene: string, vars: Record<string, string>): Pair[] {
  const text = ['--text-1', '--text-2', '--text-3']
  const backs = ['--bg-bottom', '--surface-solid']
  const rows: Pair[] = []
  for (const fg of text) {
    for (const bg of backs) {
      const fgHex = vars[fg]
      const bgHex = vars[bg]
      if (!fgHex || !bgHex) continue
      rows.push({
        scene,
        name: `${fg} on ${bg}`,
        fg: fgHex,
        bg: bgHex,
        ratio: contrast(fgHex, bgHex),
      })
    }
  }
  for (const fill of ['--accent', '--accent-hover', '--accent-press']) {
    const fgHex = vars['--text-on-accent']
    const bgHex = vars[fill]
    if (!fgHex || !bgHex) continue
    rows.push({
      scene,
      name: `--text-on-accent on ${fill}`,
      fg: fgHex,
      bg: bgHex,
      ratio: contrast(fgHex, bgHex),
    })
  }
  return rows
}

function scenes(): Pair[] {
  const tokens = block(readFileSync(resolve(ROOT, 'tokens.css'), 'utf8'), ':root {')
  const golden = block(
    readFileSync(resolve(ROOT, 'scenes/golden-hour.css'), 'utf8'),
    ':root[data-scene="golden-hour"]',
  )
  const rainy = block(
    readFileSync(resolve(ROOT, 'scenes/rainy-study.css'), 'utf8'),
    ':root[data-scene="rainy-study"]',
  )
  const after = block(
    readFileSync(resolve(ROOT, 'scenes/after-hours.css'), 'utf8'),
    ':root[data-scene="after-hours"]',
  )
  const night = block(
    readFileSync(resolve(ROOT, 'scenes/night.css'), 'utf8'),
    ':root[data-scene="night"]',
  )
  return [
    ...pairs('tokens', tokens),
    ...pairs('golden-hour', golden),
    ...pairs('rainy-study', rainy),
    ...pairs('after-hours', after),
    ...pairs('night', night),
  ]
}

const AA = 4.5

describe('scene contrast', () => {
  it('gives the Golden Hour button and card captions AA', () => {
    const golden = scenes().filter((pair) => pair.scene === 'golden-hour')
    const button = golden.filter((pair) => pair.name.startsWith('--text-on-accent'))
    const caption = golden.find((pair) => pair.name === '--text-3 on --surface-solid')
    expect(button.every((pair) => pair.ratio >= AA)).toBe(true)
    expect(caption?.ratio).toBeGreaterThanOrEqual(AA)
    expect(golden.find((pair) => pair.name === '--text-3 on --bg-bottom')?.fg).toBe('#7e604b')
  })

  it('keeps the Golden Hour button darker than the old fill', () => {
    const golden = block(
      readFileSync(resolve(ROOT, 'scenes/golden-hour.css'), 'utf8'),
      ':root[data-scene="golden-hour"]',
    )
    expect(golden['--text-3']).toBe('#7e604b')
    expect(golden['--accent']).toBe('#9c5f2b')
    expect(luminance(golden['--accent-hover'] ?? '#000')).toBeLessThan(
      luminance(golden['--accent'] ?? '#fff'),
    )
    expect(luminance(golden['--accent-press'] ?? '#000')).toBeLessThan(
      luminance(golden['--accent-hover'] ?? '#fff'),
    )
  })

  it('lists the pairs that still miss AA', () => {
    const failing = scenes()
      .filter((pair) => pair.scene !== 'tokens' && pair.ratio < AA)
      .map((pair) => `${pair.scene} ${pair.name} ${pair.ratio.toFixed(2)}`)
    expect(failing).toEqual([
      'golden-hour --text-2 on --bg-bottom 4.04',
      'golden-hour --text-3 on --bg-bottom 3.72',
      'rainy-study --text-2 on --bg-bottom 3.55',
      'rainy-study --text-3 on --bg-bottom 1.93',
      'rainy-study --text-3 on --surface-solid 2.69',
      'rainy-study --text-on-accent on --accent 3.55',
      'after-hours --text-3 on --bg-bottom 4.28',
      'after-hours --text-3 on --surface-solid 3.95',
    ])
  })
})
