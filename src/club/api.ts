import type { LeaderboardEntry } from './types'

export interface RemoteMonth {
  id: string
  title: string
  pieceMidiUrl: string
  opensAt: string
  closesAt: string
  closed: boolean
}

export interface RemoteBoard {
  closed: boolean
  final: boolean
  entries: LeaderboardEntry[]
}

export type SubmitFailure =
  | 'unavailable'
  | 'unauthorized'
  | 'closed'
  | 'rate_limited'
  | 'rejected'
  | 'failed'

export type SubmitOutcome =
  | { ok: true; id: string; serverScore: number; rank: number; board: LeaderboardEntry[] }
  | { ok: false; error: SubmitFailure }

interface BoardRow {
  id?: unknown
  displayName?: unknown
  avatarUrl?: unknown
  score?: unknown
  createdAt?: unknown
}

function asRows(value: unknown, monthId: string): LeaderboardEntry[] {
  if (!Array.isArray(value)) return []
  const entries: LeaderboardEntry[] = []
  for (const row of value) {
    if (!row || typeof row !== 'object') continue
    const item = row as BoardRow
    if (typeof item.id !== 'string' || typeof item.displayName !== 'string') continue
    if (typeof item.score !== 'number') continue
    entries.push({
      id: item.id,
      monthId,
      displayName: item.displayName,
      score: item.score,
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      local: false,
      avatarUrl: typeof item.avatarUrl === 'string' ? item.avatarUrl : null,
    })
  }
  return entries
}

export async function fetchCurrentMonth(): Promise<RemoteMonth | null> {
  try {
    const response = await fetch('/api/club/month/current')
    if (!response.ok) return null
    const body = (await response.json()) as Partial<RemoteMonth>
    if (typeof body.id !== 'string' || typeof body.closed !== 'boolean') return null
    return {
      id: body.id,
      title: typeof body.title === 'string' ? body.title : '',
      pieceMidiUrl: typeof body.pieceMidiUrl === 'string' ? body.pieceMidiUrl : '',
      opensAt: typeof body.opensAt === 'string' ? body.opensAt : '',
      closesAt: typeof body.closesAt === 'string' ? body.closesAt : '',
      closed: body.closed,
    }
  } catch {
    return null
  }
}

export async function fetchLeaderboard(monthId: string): Promise<RemoteBoard | null> {
  try {
    const response = await fetch(`/api/club/leaderboard?month=${encodeURIComponent(monthId)}`)
    if (!response.ok) return null
    const body = (await response.json()) as { closed?: unknown; final?: unknown; entries?: unknown }
    return {
      closed: body.closed === true,
      final: body.final === true,
      entries: asRows(body.entries, monthId),
    }
  } catch {
    return null
  }
}

export async function fetchTake(id: string): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(`/api/club/attempts/${encodeURIComponent(id)}/take`)
    if (!response.ok) return null
    return await response.arrayBuffer()
  } catch {
    return null
  }
}

export async function submitAttempt(input: {
  token: string
  monthId: string
  clientScore: number
  speed: number
  takeMidi: string
}): Promise<SubmitOutcome> {
  try {
    const response = await fetch('/api/club/attempts', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        monthId: input.monthId,
        clientScore: input.clientScore,
        speed: input.speed,
        takeMidi: input.takeMidi,
      }),
    })
    if (response.status === 503) return { ok: false, error: 'unavailable' }
    if (response.status === 401) return { ok: false, error: 'unauthorized' }
    if (response.status === 403) return { ok: false, error: 'closed' }
    if (response.status === 429) return { ok: false, error: 'rate_limited' }
    if (!response.ok) return { ok: false, error: 'rejected' }
    const body = (await response.json()) as {
      id?: unknown
      serverScore?: unknown
      rank?: unknown
      board?: unknown
    }
    if (typeof body.id !== 'string' || typeof body.serverScore !== 'number') {
      return { ok: false, error: 'failed' }
    }
    return {
      ok: true,
      id: body.id,
      serverScore: body.serverScore,
      rank: typeof body.rank === 'number' ? body.rank : 1,
      board: asRows(body.board, input.monthId),
    }
  } catch {
    return { ok: false, error: 'failed' }
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const size = 0x8000
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size))
  }
  return btoa(binary)
}
