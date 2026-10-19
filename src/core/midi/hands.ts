// Which hand a track's notes belong to. Name first, then channel, and only
// then the middle-C pitch split. A note-less conductor track never reaches
// this list — the parser drops it before assigning hands or color slots.

import { type Hand, noteHand } from '../handPractice'
import type { TrackHand } from './types'

// Word characters only. "bright" and "rhythm" must not read as right hand,
// and "bassoon" must not read as left.
const RIGHT_NAME = /(?:^|[^a-z0-9])(?:right|rh|treble)(?![a-z0-9])/i
const LEFT_NAME = /(?:^|[^a-z0-9])(?:left|lh|bass)(?![a-z0-9])/i

export function handFromTrackName(name: string): 'left' | 'right' | null {
  const right = RIGHT_NAME.test(name)
  const left = LEFT_NAME.test(name)
  if (right === left) return null
  return right ? 'right' : 'left'
}

interface HandTrack {
  name: string
  channel: number
  isDrum: boolean
}

// One result per input track, drums included. Drums stay `split` and do not
// vote in the channel pair: a solo piano track on channel 0 stays split even
// when a drum track sits beside it.
export function assignTrackHands(tracks: readonly HandTrack[]): TrackHand[] {
  const hands: TrackHand[] = tracks.map(() => 'split')
  const musical = tracks
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => !track.isDrum)

  if (musical.length <= 1) {
    const only = musical[0]
    if (only) {
      const named = handFromTrackName(only.track.name)
      if (named) hands[only.index] = named
    }
    return hands
  }

  const namedOnChannel = new Map<number, 'left' | 'right' | 'conflict'>()
  for (const { track, index } of musical) {
    const named = handFromTrackName(track.name)
    if (!named) continue
    hands[index] = named
    const prev = namedOnChannel.get(track.channel)
    if (prev && prev !== named) namedOnChannel.set(track.channel, 'conflict')
    else if (!prev) namedOnChannel.set(track.channel, named)
  }

  const channels = new Set(musical.map(({ track }) => track.channel))
  const pair = channels.has(0) && channels.has(1)

  for (const { track, index } of musical) {
    if (hands[index] !== 'split') continue
    const fromName = namedOnChannel.get(track.channel)
    if (fromName === 'left' || fromName === 'right') {
      hands[index] = fromName
      continue
    }
    if (fromName === 'conflict') continue
    if (pair && track.channel === 0) hands[index] = 'right'
    else if (pair && track.channel === 1) hands[index] = 'left'
  }

  return hands
}

// Assigned tracks paint and practise every note as that hand, including a
// right-hand note below middle C. `split` and a missing field keep the pitch
// rule, which is what a single unnamed piano track needs.
export function noteHandOf(
  track: { hand?: TrackHand } | null | undefined,
  pitch: number,
): 'left' | 'right' {
  if (track?.hand === 'left' || track?.hand === 'right') return track.hand
  return noteHand(pitch)
}

export function noteMatchesHandOf(
  track: { hand?: TrackHand } | null | undefined,
  pitch: number,
  filter: Hand,
): boolean {
  return filter === 'both' || noteHandOf(track, pitch) === filter
}
