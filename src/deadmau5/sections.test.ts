import { describe, expect, it } from 'vitest'
import { untitledGSharpMinor } from '../songGuide/untitledGSharpMinor'
import {
  BAR_COUNT,
  barEndTime,
  barStartTime,
  canonicalSectionQuery,
  DEADMAU5_SECTION_KEY,
  pickForBars,
  pickFromIds,
  resolvePractice,
  SECONDS_PER_BAR,
  selectionAfterClick,
  STROBE_SAMPLE_ID,
  STROBE_SECTIONS,
} from './sections'

describe('Strobe practice sections', () => {
  it('matches the song guide bar for bar, and ignores the ending chord-loop marker', () => {
    expect(STROBE_SAMPLE_ID).toBe(untitledGSharpMinor.id)
    expect(SECONDS_PER_BAR).toBe(untitledGSharpMinor.secondsPerBar)
    expect(BAR_COUNT).toBe(untitledGSharpMinor.barCount)
    expect(STROBE_SECTIONS.map((section) => section.id)).toEqual(
      untitledGSharpMinor.sections.map((section) => section.id),
    )
    for (const section of STROBE_SECTIONS) {
      const guide = untitledGSharpMinor.sections.find((item) => item.id === section.id)
      expect(guide).toMatchObject({
        name: section.name,
        startBar: section.startBar,
        endBar: section.endBar,
        color: section.color,
      })
      expect(barStartTime(section.startBar)).toBe((section.startBar - 1) * SECONDS_PER_BAR)
      expect(barEndTime(section.endBar)).toBe(section.endBar * SECONDS_PER_BAR)
    }
    const ending = STROBE_SECTIONS.find((section) => section.id === 'ending')
    expect(ending).toMatchObject({ startBar: 214, endBar: 241 })
    expect(untitledGSharpMinor.sections.find((section) => section.id === 'ending')?.loopEndBar).toBe(
      221,
    )
  })

  it('joins neighbouring sections and refuses a gap', () => {
    expect(pickFromIds(['intro', 'melody'])).toMatchObject({
      ids: ['intro', 'melody'],
      startBar: 1,
      endBar: 26,
    })
    expect(pickFromIds(['melody', 'intro'])).toMatchObject({ ids: ['intro', 'melody'] })
    expect(pickFromIds(['intro', 'octaves'])).toBeNull()
    expect(pickFromIds(['nope'])).toBeNull()
  })

  it('grows the span when the clicked section is a neighbour', () => {
    expect(selectionAfterClick(['melody'], 'intro')).toEqual(['intro', 'melody'])
    expect(selectionAfterClick(['intro', 'melody'], 'moving')).toEqual(['intro', 'melody', 'moving'])
    expect(selectionAfterClick(['intro', 'melody'], 'climax')).toEqual(['climax'])
    expect(selectionAfterClick(['intro', 'melody', 'moving'], 'melody')).toEqual(['melody'])
  })

  it('fine-tunes bars without leaving the song', () => {
    expect(pickForBars(0, 999)).toMatchObject({ startBar: 1, endBar: BAR_COUNT })
    expect(pickForBars(12, 12)).toMatchObject({ startBar: 12, endBar: 13 })
    expect(resolvePractice('intro', '2-8')).toMatchObject({
      ids: ['intro'],
      startBar: 2,
      endBar: 8,
    })
    expect(canonicalSectionQuery('intro', null)).toEqual({ section: 'intro', bars: null })
    expect(canonicalSectionQuery('intro', '2-8')).toEqual({ section: 'intro', bars: '2-8' })
    expect(canonicalSectionQuery('nope', null)).toEqual({ section: null, bars: null })
    expect(DEADMAU5_SECTION_KEY).toBe('midee.deadmau5Section')
  })
})
