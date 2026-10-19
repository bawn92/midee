import type { NoteCounts } from '../../shared/club/score'
import type { MidiFile } from '../core/midi/types'

export type { NoteCounts }

// Practice takes stay on the device through ClubStorage. An official take
// is posted through the API when Clerk is configured.

export interface ClubMonth {
  id: string
  kickerKey: 'club.sample.kicker'
  closesKey: 'club.sample.closes'
  title: string
  composer: string
  bpm: number
  beatsPerBar: number
  midi: MidiFile
}

export interface ClubAttempt {
  id: string
  monthId: string
  score: number
  accuracy: number
  counts: NoteCounts
  createdAt: number
  displayName: string
  submitted: boolean
}

export interface LeaderboardEntry {
  id: string
  monthId: string
  displayName: string
  score: number
  createdAt: number
  /** True when the row was saved on this device. Official rows come from the API. */
  local: boolean
  avatarUrl: string | null
}

export interface ClubStorage {
  listAttempts(monthId: string): ClubAttempt[]
  saveAttempt(attempt: ClubAttempt): void
  updateAttempt(attempt: ClubAttempt): void
  listBoard(monthId: string): LeaderboardEntry[]
  submit(entry: LeaderboardEntry): LeaderboardEntry[]
  readName(): string
  saveName(name: string): void
}
