import { describe, expect, it } from 'vitest'
import { isBlackKey, MIDI_MAX, MIDI_MIN } from '../core/midi/types'
import {
  glideRange,
  LIVE_BUDGET_MS,
  LIVE_GLIDE_AT,
  LIVE_GLIDE_MS,
  LIVE_IN_END_MS,
  LIVE_LIFT_MS,
  LIVE_LIFT_PX,
  LIVE_OUT_MS,
  LIVE_OVERSHOOT_PX,
  LIVE_RISE_EASE,
  LIVE_RISE_MS,
  LIVE_ROLL_AT,
  LIVE_ROLL_MS,
  LIVE_SHIMMER_PEAK,
  LIVE_SHIMMER_STEP_MS,
  LIVE_STAGGER_MS,
  riseOffset,
  sampleLiveIn,
  sampleLiveOut,
  shimmerStrength,
  WHITE_KEY_COLUMNS,
  whiteKeyColumn,
} from './liveEntrance'

describe('live entrance budget', () => {
  it('keeps the lift, the rise, and the ripple inside 900ms', () => {
    expect(LIVE_LIFT_PX).toBe(12)
    expect(LIVE_LIFT_MS).toBe(260)
    expect(LIVE_STAGGER_MS).toBe(30)
    expect(LIVE_LIFT_MS + LIVE_STAGGER_MS * 3).toBeLessThan(LIVE_BUDGET_MS)
    expect(LIVE_RISE_MS).toBe(520)
    expect(LIVE_RISE_EASE).toBe('cubic-bezier(0.34, 1.3, 0.64, 1)')
    expect(LIVE_OVERSHOOT_PX).toBe(6)
    expect(LIVE_SHIMMER_STEP_MS).toBe(12)
    expect(LIVE_ROLL_AT).toBeGreaterThanOrEqual(LIVE_RISE_MS)
    expect(LIVE_ROLL_AT + LIVE_ROLL_MS).toBeLessThan(LIVE_BUDGET_MS)
    expect(LIVE_GLIDE_AT + LIVE_GLIDE_MS).toBeLessThan(LIVE_BUDGET_MS)
    expect(LIVE_IN_END_MS).toBeLessThan(LIVE_BUDGET_MS)
    expect(LIVE_OUT_MS).toBeLessThan(LIVE_BUDGET_MS)
    expect(WHITE_KEY_COLUMNS).toBe(52)
  })

  it('caps the rise overshoot at 6px and starts a keyboard-height below', () => {
    const height = 420
    expect(riseOffset(0, height)).toBeCloseTo(height, 0)
    expect(riseOffset(LIVE_RISE_MS, height)).toBeCloseTo(0, 0)
    let lowest = height
    for (let ms = 0; ms <= LIVE_RISE_MS; ms += 4) {
      lowest = Math.min(lowest, riseOffset(ms, height))
    }
    expect(lowest).toBeGreaterThanOrEqual(-LIVE_OVERSHOOT_PX - 0.05)
    expect(lowest).toBeLessThan(0)
  })

  it('ripples left to right, one column every 12ms, and skips a gap', () => {
    expect(whiteKeyColumn(MIDI_MIN)).toBe(0)
    expect(whiteKeyColumn(MIDI_MAX)).toBe(WHITE_KEY_COLUMNS - 1)
    const firstBlack = MIDI_MIN + 1
    expect(isBlackKey(firstBlack)).toBe(true)
    expect(whiteKeyColumn(firstBlack)).toBe(whiteKeyColumn(MIDI_MIN))
    expect(shimmerStrength(0, 0)).toBe(0)
    expect(shimmerStrength(200, 0)).toBeGreaterThan(0)
    expect(shimmerStrength(200, 0)).toBeLessThanOrEqual(LIVE_SHIMMER_PEAK)
    expect(shimmerStrength(200, 10)).toBe(0)
    const lastStart = 160 + (WHITE_KEY_COLUMNS - 1) * 12
    expect(shimmerStrength(lastStart + 40, WHITE_KEY_COLUMNS - 1)).toBeGreaterThan(0)
    expect(lastStart + 80).toBe(LIVE_IN_END_MS)
  })

  it('glides the highlight from the full piano onto the calibrated window', () => {
    expect(glideRange(0, 48, 72)).toEqual({ start: MIDI_MIN, end: MIDI_MAX })
    expect(glideRange(1, 48, 72)).toEqual({ start: 48, end: 72 })
    const mid = glideRange(0.5, 48, 72)
    expect(mid.start).toBeGreaterThan(MIDI_MIN)
    expect(mid.start).toBeLessThan(48)
    expect(mid.end).toBeLessThan(MIDI_MAX)
    expect(mid.end).toBeGreaterThan(72)
  })

  it('settles the entrance and holds the exit sink', () => {
    expect(sampleLiveIn(0, 180).rangeT).toBe(0)
    expect(sampleLiveIn(0, 180).roll).toBe(0)
    const entered = sampleLiveIn(LIVE_IN_END_MS, 180)
    expect(entered.done).toBe(true)
    expect(entered.keyboardY).toBe(0)
    expect(entered.light).toBe(1)
    expect(entered.roll).toBe(1)
    expect(entered.shimmerMs).toBeNull()
    const leaving = sampleLiveOut(0, 0, 180)
    expect(leaving.keyboardY).toBe(0)
    expect(leaving.roll).toBe(1)
    const gone = sampleLiveOut(LIVE_OUT_MS, 0, 180)
    expect(gone.done).toBe(true)
    expect(gone.keyboardY).toBe(180)
    expect(gone.light).toBe(0)
    expect(gone.roll).toBe(0)
  })
})
