import { Midi } from '@tonejs/midi'
import { describe, expect, it } from 'vitest'
import { assessTake, encodeTake, MAX_TAKE_BYTES, officialExpected } from '../../shared/club/assess'
import { monthBounds, monthClosesAt, monthOpensAt } from '../../shared/club/calendar'
import { scoreTake } from '../../shared/club/score'

const OPEN = new Date('2026-10-15T19:00:00.000Z')

describe('club month close', () => {
  it('closes October at midnight Pacific as the last day ends', () => {
    expect(monthOpensAt(2026, 10).toISOString()).toBe('2026-10-01T07:00:00.000Z')
    expect(monthClosesAt(2026, 10).toISOString()).toBe('2026-11-01T07:00:00.000Z')
    expect(monthClosesAt(2026, 1).toISOString()).toBe('2026-02-01T08:00:00.000Z')
  })

  it('is open through the last evening and closed at the boundary', () => {
    const bounds = monthBounds('2026-10')
    expect(bounds).not.toBeNull()
    const closes = bounds?.closesAt ?? new Date(0)
    expect(
      assessTake({ bytes: encodeTake([]), speed: 1, now: new Date(closes.getTime() - 1) }).ok,
    ).toBe(true)
    const closed = assessTake({ bytes: encodeTake([]), speed: 1, now: closes })
    expect(closed.ok).toBe(false)
    if (!closed.ok) expect(closed.error).toBe('closed')
  })
})

describe('API scoring parity', () => {
  it('scores a fixture the same after the MIDI round trip', () => {
    const expected = officialExpected()
    const played = expected.map((note) => ({
      pitch: note.pitch,
      time: note.time,
      velocity: note.velocity,
    }))
    const client = scoreTake(expected, played)
    const server = assessTake({ bytes: encodeTake(played), speed: 1, now: OPEN })
    expect(server.ok).toBe(true)
    if (server.ok) expect(server.result.serverScore).toBe(client.score)
    expect(client.score).toBe(1000)
  })

  it('keeps a 30 ms early note on the same number', () => {
    const expected = officialExpected()
    const target = expected.find((note) => note.time > 0.5)
    expect(target).toBeTruthy()
    const played = [
      {
        pitch: target?.pitch ?? 60,
        time: (target?.time ?? 1) - 0.03,
        velocity: target?.velocity ?? 0.5,
      },
    ]
    const client = scoreTake(expected, played)
    const server = assessTake({ bytes: encodeTake(played), speed: 1, now: OPEN })
    expect(server.ok).toBe(true)
    if (server.ok) expect(server.result.serverScore).toBe(client.score)
  })

  it('rejects the wrong tempo, a packed chord, a late note, and a large file', () => {
    const fast = new Midi()
    fast.header.setTempo(140)
    fast.addTrack().addNote({ midi: 60, time: 0, duration: 0.2, velocity: 0.5 })
    const wrongSpeed = assessTake({ bytes: fast.toArray(), speed: 1, now: OPEN })
    expect(wrongSpeed.ok).toBe(false)
    if (!wrongSpeed.ok) expect(wrongSpeed.error).toBe('wrong_speed')

    const scaled = assessTake({ bytes: encodeTake([]), speed: 1.5, now: OPEN })
    expect(scaled.ok).toBe(false)
    if (!scaled.ok) expect(scaled.error).toBe('wrong_speed')

    const packed = assessTake({
      bytes: encodeTake(
        Array.from({ length: 17 }, (_, index) => ({
          pitch: 60 + (index % 12),
          time: 1,
          velocity: 0.5,
        })),
      ),
      speed: 1,
      now: OPEN,
    })
    expect(packed.ok).toBe(false)
    if (!packed.ok) expect(packed.error).toBe('impossible_timing')

    const late = new Midi()
    late.header.setTempo(72)
    late.addTrack().addNote({ midi: 60, time: 80, duration: 0.2, velocity: 0.5 })
    const impossible = assessTake({ bytes: late.toArray(), speed: 1, now: OPEN })
    expect(impossible.ok).toBe(false)
    if (!impossible.ok) expect(impossible.error).toBe('impossible_timing')

    const huge = assessTake({ bytes: new Uint8Array(MAX_TAKE_BYTES + 1), speed: 1, now: OPEN })
    expect(huge.ok).toBe(false)
    if (!huge.ok) expect(huge.error).toBe('too_large')
  })

  it('stops the sixth submission inside the window', () => {
    const limited = assessTake({ bytes: encodeTake([]), speed: 1, now: OPEN, submitsInWindow: 5 })
    expect(limited.ok).toBe(false)
    if (!limited.ok) expect(limited.error).toBe('rate_limited')
  })
})
