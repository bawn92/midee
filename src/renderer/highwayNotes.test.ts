import { describe, expect, it } from 'vitest'
import {
  HIGHWAY_DEPTH,
  HIGHWAY_LANES,
  HIGHWAY_TAIL_GAP,
  highwayDepth,
  highwayKeyCaption,
  highwayLaneColor,
  highwayPoint,
  highwayScale,
  highwayTailEnd,
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

  it('keeps a short floor, with the far end still most of the keyboard width', () => {
    const near = highwayPoint(100, highwayDepth(0, 8), 500, 400)
    expect(near).toEqual({ x: 100, y: 500 })
    const far = highwayPoint(0, 1, 500, 400)
    const farRight = highwayPoint(800, 1, 500, 400)
    const ratio = (farRight.x - far.x) / 800
    expect(ratio).toBeCloseTo(1 - HIGHWAY_DEPTH)
    expect(ratio).toBeGreaterThan(0.6)
    expect(ratio).toBeLessThan(0.75)
    expect(far.y).toBe(0)
    // The vanishing point is where the scale hits 0, above the screen.
    const vanishY = 500 * (1 - 1 / HIGHWAY_DEPTH)
    expect(vanishY).toBeLessThan(0)
    expect(highwayScale(0) - highwayScale(1)).toBeCloseTo(HIGHWAY_DEPTH)
    expect(highwayScale(0) - highwayScale(1)).toBeLessThan(0.4)
    const mid = highwayDepth(4, 8)
    expect(mid).toBeCloseTo(0.5)
  })

  it('lands the hit line on the key and starts the floor below the chrome', () => {
    const hit = highwayPoint(120, 0, 500, 400, 90)
    expect(hit).toEqual({ x: 120, y: 500 })
    const edge = highwayPoint(120, 1, 500, 400, 90)
    expect(edge.y).toBe(90)
    expect(edge.x).toBeCloseTo(400 + (120 - 400) * (1 - HIGHWAY_DEPTH))
  })

  it('draws a sustain tail and leaves a gap before the next note', () => {
    expect(highwayTailEnd(1, 0.05, null)).toBeNull()
    expect(highwayTailEnd(1, 0.8, null)).toBeCloseTo(1.8)
    expect(highwayTailEnd(1, 0.8, 1.5)).toBeCloseTo(1.5 - HIGHWAY_TAIL_GAP)
    // Held at the hit line: the tail is the time still left, and it burns down.
    expect(highwayTailEnd(-0.3, 0.8, null)).toBeCloseTo(0.5)
    expect(highwayTailEnd(-0.7, 0.8, null)).toBeNull()
    // A tail that would run into the next head is dropped rather than overlapped.
    expect(highwayTailEnd(1, 0.4, 1.2)).toBeNull()
  })
})
