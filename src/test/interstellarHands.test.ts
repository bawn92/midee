import { describe, expect, it } from 'vitest'
import { noteHandOf } from '../core/midi/hands'
import { parseMidiFile } from '../core/midi/parser'
import { forEachBeatLine } from '../core/midi/tempoMap'
import { loadFixtureMidi } from './loadFixtureMidi'

// Real Type 1 file: a note-less conductor track carries 100 BPM and 3/4,
// then Right Hand (channel 0) and Left Hand (channel 1).
const FILE = 'Interstellar_Main_Theme_Pietschmann_Piano_RH_LH.mid'

describe('Interstellar main theme', () => {
  it('assigns both hands, 100 BPM, 3/4, and the file duration', async () => {
    const midi = await parseMidiFile(loadFixtureMidi(FILE), FILE)

    expect(midi.bpm).toBe(100)
    expect(midi.tempos[0]).toMatchObject({ time: 0, bpm: 100 })
    expect(midi.timeSignature).toEqual([3, 4])
    expect(midi.duration).toBeCloseTo(280.7975, 2)

    expect(midi.tracks).toHaveLength(2)
    const [right, left] = midi.tracks
    expect(right).toMatchObject({ name: 'Right Hand', channel: 0, hand: 'right', colorIndex: 0 })
    expect(left).toMatchObject({ name: 'Left Hand', channel: 1, hand: 'left', colorIndex: 1 })
    expect(right!.notes).toHaveLength(1328)
    expect(left!.notes).toHaveLength(726)

    const rightPitches = right!.notes.map((n) => n.pitch)
    const leftPitches = left!.notes.map((n) => n.pitch)
    expect(Math.min(...rightPitches)).toBe(47)
    expect(Math.max(...rightPitches)).toBe(100)
    expect(Math.min(...leftPitches)).toBe(29)
    expect(Math.max(...leftPitches)).toBe(83)

    // The old middle-C split painted these the other hand's colour.
    expect(right!.notes.some((n) => n.pitch < 60)).toBe(true)
    expect(left!.notes.some((n) => n.pitch >= 60)).toBe(true)
    expect(right!.notes.every((n) => noteHandOf(right, n.pitch) === 'right')).toBe(true)
    expect(left!.notes.every((n) => noteHandOf(left, n.pitch) === 'left')).toBe(true)

    const bars: number[] = []
    forEachBeatLine(midi, 0, 9, (time, isBar) => {
      if (isBar) bars.push(time)
    })
    expect(bars[0]).toBe(0)
    expect(bars[1]).toBeCloseTo(1.8, 5)
    expect(bars[2]).toBeCloseTo(3.6, 5)
    expect(bars[3]).toBeCloseTo(5.4, 5)
    expect(bars[4]).toBeCloseTo(7.2, 5)
  })
})
