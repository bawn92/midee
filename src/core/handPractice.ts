// Which hand the player is practising, shared by Play, Live, and Learn so the
// transport control and the play-along HUD stay on the same setting.
//
// A note below middle C is the left hand; middle C and above is the right.
// That split matches the play-along track heuristic (average pitch 60) and
// also covers a single piano track whose notes belong to both hands.
// Persisted under `midee.handPractice`.

import { jsonPersisted } from './persistence'

export const HAND_PRACTICE_STORAGE_KEY = 'midee.handPractice'
export const HAND_SPLIT_PITCH = 60

export type Hand = 'left' | 'right' | 'both'

export interface HandPracticePrefs {
  hand: Hand
  // When one hand is selected, the other hand can still be heard or silenced.
  // Both-hands practice ignores this.
  otherHandAudible: boolean
}

const DEFAULT_PREFS: HandPracticePrefs = {
  hand: 'both',
  otherHandAudible: true,
}

export function noteHand(pitch: number): 'left' | 'right' {
  return pitch < HAND_SPLIT_PITCH ? 'left' : 'right'
}

export function noteMatchesHand(pitch: number, hand: Hand): boolean {
  return hand === 'both' || noteHand(pitch) === hand
}

function migrate(raw: unknown): HandPracticePrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PREFS }
  const o = raw as Record<string, unknown>
  const hand: Hand = o.hand === 'left' || o.hand === 'right' || o.hand === 'both' ? o.hand : 'both'
  return {
    hand,
    otherHandAudible: o.otherHandAudible !== false,
  }
}

const persisted = jsonPersisted<HandPracticePrefs>(
  HAND_PRACTICE_STORAGE_KEY,
  { ...DEFAULT_PREFS },
  migrate,
)

type Listener = (prefs: HandPracticePrefs) => void

let current: HandPracticePrefs = persisted.load()
const listeners = new Set<Listener>()

export function getHandPractice(): HandPracticePrefs {
  return current
}

export function subscribeHandPractice(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function setHandPractice(partial: Partial<HandPracticePrefs>): HandPracticePrefs {
  const next: HandPracticePrefs = {
    hand: partial.hand ?? current.hand,
    otherHandAudible: partial.otherHandAudible ?? current.otherHandAudible,
  }
  if (next.hand === current.hand && next.otherHandAudible === current.otherHandAudible) {
    return current
  }
  current = next
  persisted.save(current)
  for (const fn of listeners) fn(current)
  return current
}

export function reloadHandPractice(): HandPracticePrefs {
  current = persisted.load()
  return current
}
