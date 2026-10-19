import { describe, expect, it } from 'vitest'
import { placeFloating, type Rect } from './placeFloating'

const viewport = { width: 1440, height: 900 }
const strip: Rect = { top: 10, left: 0, width: 1440, height: 52 }
const transport: Rect = { top: 72, left: 370, width: 700, height: 84 }
const keyboard: Rect = { top: 700, left: 0, width: 1440, height: 200 }

describe('placeFloating', () => {
  it('drops a header tip below the transport instead of under it', () => {
    const placed = placeFloating(
      { top: 18, left: 640, width: 80, height: 36 },
      { width: 72, height: 28 },
      viewport,
      [strip, transport, keyboard],
    )
    expect(placed.side).toBe('below')
    expect(placed.top).toBeGreaterThanOrEqual(transport.top + transport.height)
    expect(placed.left).toBeGreaterThan(8)
    expect(placed.left + 72).toBeLessThan(viewport.width)
  })

  it('drops a transport tip below the pill, clear of the header', () => {
    const placed = placeFloating(
      { top: 90, left: 400, width: 48, height: 48 },
      { width: 88, height: 28 },
      viewport,
      [strip, transport, keyboard],
    )
    expect(placed.side).toBe('below')
    expect(placed.top).toBeGreaterThan(strip.top + strip.height)
    expect(placed.top).toBeGreaterThanOrEqual(transport.top + transport.height)
  })

  it('shifts a tip in from the right edge of the viewport', () => {
    const placed = placeFloating(
      { top: 200, left: 1380, width: 40, height: 32 },
      { width: 160, height: 28 },
      viewport,
      [],
    )
    expect(placed.side).toBe('below')
    expect(placed.left + 160).toBeLessThanOrEqual(viewport.width - 8)
    expect(placed.left).toBeGreaterThanOrEqual(8)
  })

  it('flips above a control that sits on the keyboard', () => {
    const placed = placeFloating(
      { top: 660, left: 200, width: 40, height: 32 },
      { width: 80, height: 28 },
      viewport,
      [strip, transport, keyboard],
    )
    expect(placed.side).toBe('above')
    expect(placed.top + 28).toBeLessThanOrEqual(660)
    expect(placed.top).toBeGreaterThanOrEqual(transport.top + transport.height)
  })
})
