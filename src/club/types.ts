import type { MidiFile } from '../core/midi/types'

// Local Club records. A later API can replace ClubStorage without changing
// the screens. Accounts, friends, and the month-close timezone are not here.

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

export interface NoteCounts {
  perfect: number
  good: number
  early: number
  late: number
  miss: number
  extra: number
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
  // Every entry written by this build lives on the device.
  local: true
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
