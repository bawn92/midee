import { describe, expect, it } from 'vitest'
import {
  dynamicsCredit,
  type ExpectedNote,
  judgeDelta,
  type PlayedNote,
  paceFor,
  scoreTake,
} from './score'

function expectNote(pitch: number, time = 0, velocity = 80 / 127): ExpectedNote {
  return { pitch, time, velocity, reachable: true }
}

function play(pitch: number, time = 0, velocity = 80 / 127): PlayedNote {
  return { pitch, time, velocity }
}

describe('judgeDelta', () => {
  it('draws the perfect, good, and early/late windows on the closed edge', () => {
    expect(judgeDelta(0)).toEqual({ name: 'perfect', timing: 1 })
    expect(judgeDelta(50)).toEqual({ name: 'perfect', timing: 1 })
    expect(judgeDelta(-50)).toEqual({ name: 'perfect', timing: 1 })
    expect(judgeDelta(50.1)?.name).toBe('good')
    expect(judgeDelta(-50.1)?.name).toBe('good')
    expect(judgeDelta(120)).toEqual({ name: 'good', timing: 0.7 })
    expect(judgeDelta(-120)).toEqual({ name: 'good', timing: 0.7 })
    expect(judgeDelta(120.1)).toEqual({ name: 'late', timing: 0.4 })
    expect(judgeDelta(-120.1)).toEqual({ name: 'early', timing: 0.4 })
    expect(judgeDelta(200)).toEqual({ name: 'late', timing: 0.4 })
    expect(judgeDelta(-200)).toEqual({ name: 'early', timing: 0.4 })
    expect(judgeDelta(200.1)).toBeNull()
    expect(judgeDelta(-200.1)).toBeNull()
  })
})

describe('dynamicsCredit', () => {
  it('spends the credit across 40 MIDI velocity units', () => {
    expect(dynamicsCredit(0.5, 0.5)).toBe(1)
    expect(dynamicsCredit(80 / 127, 100 / 127)).toBeCloseTo(0.5, 10)
    expect(dynamicsCredit(80 / 127, 120 / 127)).toBe(0)
    expect(dynamicsCredit(80 / 127, 121 / 127)).toBe(0)
    expect(dynamicsCredit(80, 80)).toBe(1)
  })
})

describe('scoreTake', () => {
  it('scores a perfect, matched-velocity note at 1000', () => {
    const result = scoreTake([expectNote(60)], [play(60)])
    expect(result.score).toBe(1000)
    expect(result.counts.perfect).toBe(1)
    expect(result.streak).toBe(1)
    expect(result.accuracy).toBe(1)
  })

  it('gives a miss the reached floor of 150', () => {
    const result = scoreTake([expectNote(60)], [])
    expect(result.score).toBe(150)
    expect(result.counts.miss).toBe(1)
    expect(result.notes[0]?.hit).toBe(0)
    expect(result.notes[0]?.timing).toBe(0)
    expect(result.notes[0]?.dynamics).toBe(0)
    expect(result.notes[0]?.reached).toBe(1)
    expect(result.streak).toBe(0)
  })

  it('weights a good note at 910 and an early or late note at 820 when velocity matches', () => {
    const good = scoreTake([expectNote(60)], [play(60, 0.12)])
    const early = scoreTake([expectNote(60)], [play(60, -0.2)])
    const late = scoreTake([expectNote(60)], [play(60, 0.2)])
    expect(good.score).toBe(910)
    expect(good.counts.good).toBe(1)
    expect(early.score).toBe(820)
    expect(early.counts.early).toBe(1)
    expect(early.notes[0]?.deltaMs).toBeCloseTo(-200, 5)
    expect(late.score).toBe(820)
    expect(late.counts.late).toBe(1)
    expect(late.notes[0]?.deltaMs).toBeCloseTo(200, 5)
  })

  it('drops only the dynamics share when velocity is 40 units off', () => {
    const result = scoreTake([expectNote(60, 0, 80 / 127)], [play(60, 0, 120 / 127)])
    expect(result.score).toBe(900)
    expect(result.notes[0]?.dynamics).toBe(0)
    expect(result.notes[0]?.hit).toBe(1)
  })

  it('keeps half the dynamics share at a 20-unit gap', () => {
    const result = scoreTake([expectNote(60, 0, 80 / 127)], [play(60, 0, 100 / 127)])
    expect(result.notes[0]?.dynamics).toBeCloseTo(0.5, 10)
    expect(result.score).toBe(950)
  })

  it('matches the closest same-pitch note and spends each played note once', () => {
    const expected = [expectNote(60, 0), expectNote(60, 0.05)]
    const result = scoreTake(expected, [play(60, 0.04)])
    expect(result.counts.perfect).toBe(1)
    expect(result.counts.miss).toBe(1)
    expect(result.notes.find((note) => note.time === 0.05)?.judgement).toBe('perfect')
    expect(result.notes.find((note) => note.time === 0)?.judgement).toBe('miss')
  })

  it('does not match a different pitch inside the window', () => {
    const result = scoreTake([expectNote(60)], [play(61)])
    expect(result.counts.miss).toBe(1)
    expect(result.counts.extra).toBe(1)
  })

  it('ignores a note past ±200 ms and counts it as extra', () => {
    const result = scoreTake([expectNote(60)], [play(60, 0.201)])
    expect(result.counts.miss).toBe(1)
    expect(result.counts.extra).toBe(1)
    expect(result.extraPenalty).toBe(100)
    expect(result.score).toBe(50)
  })

  it('charges half a note per extra, capped at 100', () => {
    const ten = Array.from({ length: 10 }, (_, i) => expectNote(60 + (i % 2), i))
    const played = ten.map((note) => play(note.pitch, note.time, note.velocity))
    played.push(play(72, 0))
    const oneExtra = scoreTake(ten, played)
    expect(oneExtra.extraPenalty).toBe(50)
    expect(oneExtra.score).toBe(950)

    const two = [expectNote(60, 0), expectNote(64, 1)]
    const extras = [play(60), play(64, 1), play(70), play(71), play(72)]
    const capped = scoreTake(two, extras)
    expect(capped.counts.extra).toBe(3)
    expect(capped.extraPenalty).toBe(100)
    expect(capped.score).toBe(900)
  })

  it('clamps an empty piece at 0 and does not invent a note value for extras', () => {
    const result = scoreTake([], [play(60), play(61)])
    expect(result.score).toBe(0)
    expect(result.extraPenalty).toBe(0)
    expect(result.counts.extra).toBe(2)
  })

  it('withholds reached credit from an unreachable note until it is judged, then scores it as a miss', () => {
    const note: ExpectedNote = { pitch: 60, time: 1, velocity: 0.6, reachable: false }
    const early = scoreTake([note], [play(60, 1)], 1)
    expect(early.judged).toBe(0)
    expect(early.score).toBe(0)
    const done = scoreTake([note], [play(60, 1)])
    expect(done.counts.miss).toBe(1)
    expect(done.counts.extra).toBe(1)
    expect(done.extraPenalty).toBe(100)
    expect(done.score).toBe(50)
  })

  it('leaves a note unjudged until its window closes', () => {
    const waiting = scoreTake([expectNote(60, 1)], [], 1)
    expect(waiting.judged).toBe(0)
    expect(waiting.score).toBe(0)
    const missed = scoreTake([expectNote(60, 1)], [], 1.2)
    expect(missed.counts.miss).toBe(1)
    expect(missed.score).toBe(150)
  })

  it('can award a hit before the miss deadline', () => {
    const result = scoreTake([expectNote(60, 1)], [play(60, 1.04)], 1.05)
    expect(result.counts.perfect).toBe(1)
    expect(result.score).toBe(1000)
  })

  it('treats streak as cosmetic: the same judgements score the same in either order', () => {
    const notes = [expectNote(60, 0), expectNote(64, 1)]
    const missThenHit = scoreTake(notes, [play(64, 1)])
    const hitThenMiss = scoreTake(notes, [play(60, 0)])
    expect(missThenHit.score).toBe(hitThenMiss.score)
    expect(missThenHit.streak).toBe(1)
    expect(hitThenMiss.streak).toBe(0)
    expect(missThenHit.score).toBe(575)
  })

  it('does not count in-progress extras before the take ends', () => {
    const live = scoreTake([expectNote(60, 1)], [play(72, 0)], 0.5)
    expect(live.counts.extra).toBe(0)
    const done = scoreTake([expectNote(60, 1)], [play(72, 0)])
    expect(done.counts.extra).toBe(1)
  })
})

describe('paceFor', () => {
  it('waits for the first judgement and rounds to the nearest 10', () => {
    expect(paceFor(0, 0, 48)).toBeNull()
    expect(paceFor(91, 1, 10)).toBe(910)
    expect(paceFor(333, 2, 10)).toBe(1670)
  })
})
