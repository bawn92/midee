import { describe, expect, it } from 'vitest'
import { assignTrackHands, handFromTrackName, noteHandOf } from './hands'

describe('handFromTrackName', () => {
  it('matches right, RH, and treble without matching bright or rhythm', () => {
    expect(handFromTrackName('Right Hand')).toBe('right')
    expect(handFromTrackName('piano rh')).toBe('right')
    expect(handFromTrackName('Treble')).toBe('right')
    expect(handFromTrackName('bright melody')).toBeNull()
    expect(handFromTrackName('Rhythm')).toBeNull()
  })

  it('matches left, LH, and bass without matching bassoon', () => {
    expect(handFromTrackName('Left Hand')).toBe('left')
    expect(handFromTrackName('LH')).toBe('left')
    expect(handFromTrackName('Bass')).toBe('left')
    expect(handFromTrackName('Bassoon')).toBeNull()
  })

  it('treats a name that says both hands as ambiguous', () => {
    expect(handFromTrackName('Left and Right')).toBeNull()
  })
})

describe('assignTrackHands', () => {
  it('names first, and does not let channel 0 claim a solo piano track', () => {
    expect(assignTrackHands([{ name: 'Piano', channel: 0, isDrum: false }])).toEqual(['split'])
    expect(assignTrackHands([{ name: 'Right Hand', channel: 1, isDrum: false }])).toEqual(['right'])
  })

  it('uses channel 0/1 only when several tracks are unnamed', () => {
    expect(
      assignTrackHands([
        { name: 'Track 1', channel: 0, isDrum: false },
        { name: 'Track 2', channel: 1, isDrum: false },
      ]),
    ).toEqual(['right', 'left'])
  })

  it('lets a name override the channel, and shares that hand with an unnamed sibling', () => {
    expect(
      assignTrackHands([
        { name: 'Left Hand', channel: 0, isDrum: false },
        { name: 'Cue', channel: 0, isDrum: false },
        { name: 'Right Hand', channel: 1, isDrum: false },
      ]),
    ).toEqual(['left', 'left', 'right'])
  })

  it('ignores drums when deciding the channel pair', () => {
    expect(
      assignTrackHands([
        { name: 'Piano', channel: 0, isDrum: false },
        { name: 'Drums', channel: 9, isDrum: true },
      ]),
    ).toEqual(['split', 'split'])
  })
})

describe('noteHandOf', () => {
  it('keeps a low right-hand note on the right', () => {
    expect(noteHandOf({ hand: 'right' }, 47)).toBe('right')
    expect(noteHandOf({ hand: 'left' }, 72)).toBe('left')
    expect(noteHandOf({ hand: 'split' }, 59)).toBe('left')
    expect(noteHandOf({ hand: 'split' }, 60)).toBe('right')
    expect(noteHandOf(undefined, 59)).toBe('left')
  })
})
