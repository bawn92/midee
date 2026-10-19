import { beforeEach, describe, expect, it } from 'vitest'
import {
  bestScore,
  CLUB_ATTEMPTS_KEY,
  CLUB_BOARD_KEY,
  CLUB_NAME_KEY,
  createClubStorage,
  placeOf,
  previewPlace,
} from './storage'
import type { ClubAttempt, LeaderboardEntry } from './types'

function attempt(score: number, id = `a-${score}`): ClubAttempt {
  return {
    id,
    monthId: '2026-10',
    score,
    accuracy: 1,
    counts: { perfect: 1, good: 0, early: 0, late: 0, miss: 0, extra: 0 },
    createdAt: score,
    displayName: 'Mara',
    submitted: false,
  }
}

function entry(score: number, createdAt: number, id = `e-${score}-${createdAt}`): LeaderboardEntry {
  return {
    id,
    monthId: '2026-10',
    displayName: 'Mara',
    score,
    createdAt,
    local: true,
  }
}

describe('club storage', () => {
  beforeEach(() => localStorage.clear())

  it('keeps attempts and the board under midee.club keys', () => {
    const store = createClubStorage(localStorage)
    store.saveAttempt(attempt(784))
    store.saveName('Mara')
    const board = store.submit(entry(784, 10, 'post-1'))
    expect(localStorage.getItem(CLUB_ATTEMPTS_KEY)).toContain('784')
    expect(localStorage.getItem(CLUB_BOARD_KEY)).toContain('post-1')
    expect(localStorage.getItem(CLUB_NAME_KEY)).toBe('Mara')
    expect(store.readName()).toBe('Mara')
    expect(board).toHaveLength(1)
    expect(board[0]?.local).toBe(true)
    expect(store.listAttempts('2026-10')).toHaveLength(1)
    expect(store.listAttempts('2026-11')).toHaveLength(0)
  })

  it('sorts the board by score and keeps an earlier tie ahead', () => {
    const store = createClubStorage(localStorage)
    store.submit(entry(700, 2, 'later-tie'))
    store.submit(entry(800, 3, 'high'))
    const board = store.submit(entry(700, 1, 'earlier-tie'))
    expect(board.map((row) => row.id)).toEqual(['high', 'earlier-tie', 'later-tie'])
    expect(placeOf('earlier-tie', board)).toBe(2)
    expect(
      previewPlace(
        700,
        1.5,
        board.filter((row) => row.id !== 'ghost'),
      ),
    ).toEqual({
      rank: 3,
      total: 4,
    })
  })

  it('remembers the best attempt and a corrupt payload as empty', () => {
    const store = createClubStorage(localStorage)
    store.saveAttempt(attempt(400))
    store.saveAttempt(attempt(812, 'best'))
    expect(bestScore(store.listAttempts('2026-10'))).toBe(812)
    localStorage.setItem(CLUB_ATTEMPTS_KEY, '{')
    expect(store.listAttempts('2026-10')).toEqual([])
  })

  it('marks an attempt submitted without dropping the others', () => {
    const store = createClubStorage(localStorage)
    const first = attempt(100, 'one')
    store.saveAttempt(first)
    store.saveAttempt(attempt(200, 'two'))
    store.updateAttempt({ ...first, submitted: true, displayName: 'Mara' })
    const saved = store.listAttempts('2026-10')
    expect(saved.find((item) => item.id === 'one')?.submitted).toBe(true)
    expect(saved.find((item) => item.id === 'two')?.submitted).toBe(false)
  })
})
