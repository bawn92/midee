import { describe, expect, it } from 'vitest'
import {
  HIGHWAY_LANES,
  highwayDepth,
  highwayKeyCaption,
  highwayLaneColor,
  highwayPoint,
} from './highwayNotes'

describe('highway notes', () => {
  it('gives every pitch class its own lane colour', () => {
    expect(HIGHWAY_LANES).toHaveLength(12)
    expect(new Set(HIGHWAY_LANES).size).toBe(12)
    expect(highwayLaneColor(60)).toBe(HIGHWAY_LANES[0])
    expect(highwayLaneColor(65)).toBe(HIGHWAY_LANES[5])
    expect(highwayLaneColor(72)).toBe(highwayLaneColor(60))
  })

  it('names white keys by letter and black keys by flat', () => {
    expect(highwayKeyCaption(60)).toBe('C')
    expect(highwayKeyCaption(61)).toBe('Db')
    expect(highwayKeyCaption(64)).toBe('E')
    expect(highwayKeyCaption(63)).toBe('Eb')
    expect(highwayKeyCaption(70)).toBe('Bb')
  })

  it('lands a note on its key at the hit line and on the centre at the horizon', () => {
    const near = highwayPoint(100, highwayDepth(0, 8), 800, 500)
    expect(near).toEqual({ x: 100, y: 500 })
    const far = highwayPoint(100, highwayDepth(8, 8), 800, 500)
    expect(far.x).toBe(400)
    expect(far.y).toBeCloseTo(50)
    const mid = highwayDepth(4, 8)
    expect(mid).toBeGreaterThan(0.4)
    expect(mid).toBeLessThan(1)
  })
})
