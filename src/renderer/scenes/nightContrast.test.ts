import { describe, expect, it } from 'vitest'

// Opaque pairs from the Night README. Cards and the transport use these:
// sample cards and the transport bar are text on glass, and the play button
// is on-accent on accent.

function channel(hex: string, shift: number): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const s = ((n >> shift) & 255) / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 16) + 0.7152 * channel(hex, 8) + 0.0722 * channel(hex, 0)
}

function contrast(a: string, b: string): number {
  const hi = Math.max(luminance(a), luminance(b))
  const lo = Math.min(luminance(a), luminance(b))
  return (hi + 0.05) / (lo + 0.05)
}

function blend(top: string, alpha: number, bottom: string): string {
  const t = Number.parseInt(top.slice(1), 16)
  const b = Number.parseInt(bottom.slice(1), 16)
  const mix = (shift: number) => {
    const value = ((t >> shift) & 255) * alpha + ((b >> shift) & 255) * (1 - alpha)
    return Math.round(value)
  }
  return `#${[16, 8, 0].map((shift) => mix(shift).toString(16).padStart(2, '0')).join('')}`
}

const GLASS = '#22232e'
const PAIRS: Array<[string, string, string, number, number]> = [
  ['primary on glass', '#f3eee7', GLASS, 13.5, 4.5],
  ['secondary on glass', '#bdb6ac', GLASS, 7.8, 4.5],
  ['tertiary on glass', '#9a938a', GLASS, 5.1, 4.5],
  ['tertiary on bg', '#9a938a', '#1c1d27', 5.5, 4.5],
  ['accent on glass', '#e2ae63', GLASS, 7.8, 4.5],
  ['on-accent on accent', '#1a1410', '#e2ae63', 9.1, 4.5],
  ['on-accent on note rh', '#1a1410', '#dda95e', 8.6, 4.5],
  ['on-accent on note lh', '#1a1410', '#d49395', 7.3, 4.5],
  ['success on glass', '#86cfa0', GLASS, 8.5, 4.5],
  ['warning on glass', '#e6bc66', GLASS, 8.7, 4.5],
  ['danger on glass', '#eb948e', GLASS, 6.8, 4.5],
  ['accent on accent-soft', '#e2ae63', '#3a3024', 6.4, 4.5],
  ['note rh on bg', '#dda95e', '#14151c', 8.6, 3],
  ['note lh on bg', '#d49395', '#14151c', 7.3, 3],
]

describe('Night contrast', () => {
  it.each(PAIRS)('%s stays at the README ratio', (_name, fg, bg, published, floor) => {
    const ratio = contrast(fg, bg)
    expect(ratio).toBeGreaterThanOrEqual(floor)
    expect(ratio).toBeCloseTo(published, 0)
  })

  it('keeps card and transport text above AA on the translucent glass', () => {
    for (const wall of ['#1c1d27', '#14151c']) {
      const card = blend(GLASS, 0.62, wall)
      expect(contrast('#f3eee7', card)).toBeGreaterThanOrEqual(4.5)
      expect(contrast('#bdb6ac', card)).toBeGreaterThanOrEqual(4.5)
      expect(contrast('#9a938a', card)).toBeGreaterThanOrEqual(4.5)
      expect(contrast('#e2ae63', card)).toBeGreaterThanOrEqual(4.5)
    }
    expect(contrast('#1a1410', '#e2ae63')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#1a1410', '#eabd7c')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#1a1410', '#cc9750')).toBeGreaterThanOrEqual(4.5)
  })
})
