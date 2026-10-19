import type { ClubAttempt, ClubStorage, LeaderboardEntry } from './types'

export const CLUB_ATTEMPTS_KEY = 'midee.club.attempts'
export const CLUB_BOARD_KEY = 'midee.club.leaderboard'
export const CLUB_NAME_KEY = 'midee.club.name'

function readList<T>(storage: Storage, key: string): T[] {
  try {
    const raw = storage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function writeList(storage: Storage, key: string, value: unknown[]): void {
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // Private mode still lets the player finish the take.
  }
}

export function sortBoard(entries: readonly LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => b.score - a.score || a.createdAt - b.createdAt)
}

/** Rank if `score` were posted beside `board`, 1-based. Ties keep the earlier post. */
export function previewPlace(
  score: number,
  createdAt: number,
  board: readonly LeaderboardEntry[],
): { rank: number; total: number } {
  const ahead = board.filter(
    (entry) => entry.score > score || (entry.score === score && entry.createdAt <= createdAt),
  ).length
  return { rank: ahead + 1, total: board.length + 1 }
}

export function placeOf(id: string, board: readonly LeaderboardEntry[]): number {
  const index = sortBoard(board).findIndex((entry) => entry.id === id)
  return index < 0 ? board.length + 1 : index + 1
}

export function bestScore(attempts: readonly ClubAttempt[]): number | null {
  let best: number | null = null
  for (const attempt of attempts) {
    if (best === null || attempt.score > best) best = attempt.score
  }
  return best
}

export function createClubStorage(storage: Storage): ClubStorage {
  return {
    listAttempts(monthId) {
      return readList<ClubAttempt>(storage, CLUB_ATTEMPTS_KEY).filter(
        (attempt) => attempt.monthId === monthId,
      )
    },
    saveAttempt(attempt) {
      const all = readList<ClubAttempt>(storage, CLUB_ATTEMPTS_KEY).filter(
        (item) => item.id !== attempt.id,
      )
      all.push(attempt)
      writeList(storage, CLUB_ATTEMPTS_KEY, all)
    },
    updateAttempt(attempt) {
      const all = readList<ClubAttempt>(storage, CLUB_ATTEMPTS_KEY)
      const index = all.findIndex((item) => item.id === attempt.id)
      if (index >= 0) all[index] = attempt
      else all.push(attempt)
      writeList(storage, CLUB_ATTEMPTS_KEY, all)
    },
    listBoard(monthId) {
      return sortBoard(
        readList<LeaderboardEntry>(storage, CLUB_BOARD_KEY).filter(
          (entry) => entry.monthId === monthId,
        ),
      )
    },
    submit(entry) {
      const all = readList<LeaderboardEntry>(storage, CLUB_BOARD_KEY).filter(
        (item) => item.id !== entry.id,
      )
      all.push({ ...entry, local: true })
      writeList(storage, CLUB_BOARD_KEY, all)
      return sortBoard(all.filter((item) => item.monthId === entry.monthId))
    },
    readName() {
      try {
        return storage.getItem(CLUB_NAME_KEY)?.trim() ?? ''
      } catch {
        return ''
      }
    },
    saveName(name) {
      try {
        storage.setItem(CLUB_NAME_KEY, name)
      } catch {
        // The post still shows the name for this visit.
      }
    },
  }
}

export function clubStorage(): ClubStorage {
  return createClubStorage(globalThis.localStorage)
}
