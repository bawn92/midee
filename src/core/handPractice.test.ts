import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getHandPractice,
  HAND_PRACTICE_STORAGE_KEY,
  noteHand,
  noteMatchesHand,
  reloadHandPractice,
  setHandPractice,
  subscribeHandPractice,
} from './handPractice'

afterEach(() => {
  localStorage.removeItem(HAND_PRACTICE_STORAGE_KEY)
  reloadHandPractice()
})

describe('noteHand', () => {
  it('splits at middle C', () => {
    expect(noteHand(59)).toBe('left')
    expect(noteHand(60)).toBe('right')
    expect(noteMatchesHand(48, 'left')).toBe(true)
    expect(noteMatchesHand(48, 'right')).toBe(false)
    expect(noteMatchesHand(72, 'both')).toBe(true)
  })
})

describe('hand practice store', () => {
  it('starts on both hands, with the other hand still heard', () => {
    expect(getHandPractice()).toEqual({ hand: 'both', otherHandAudible: true })
  })

  it('persists a one-hand choice and a mute', () => {
    setHandPractice({ hand: 'left', otherHandAudible: false })
    expect(reloadHandPractice()).toEqual({ hand: 'left', otherHandAudible: false })
  })

  it('notifies on change and not on a no-op', () => {
    const fn = vi.fn()
    const off = subscribeHandPractice(fn)
    setHandPractice({ hand: 'right' })
    setHandPractice({ hand: 'right' })
    expect(fn).toHaveBeenCalledTimes(1)
    off()
  })
})
