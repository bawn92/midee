import { assessTake } from '../../shared/club/assess'
import { clubDb, identityFrom, json, rows, unavailable, type ClubSql } from './_lib'

export const runtime = 'nodejs'

interface MonthRow {
  id: string
  closes_at: string | Date
}

interface CountRow {
  n: number
}

interface IdRow {
  id: string
}

interface BoardRow {
  attempt_id: string
  user_id: string
  display_name: string
  avatar_url: string | null
  server_score: number
  created_at: string | Date
}

const MAX_BODY = 280 * 1024

function base64Bytes(value: string): Uint8Array | null {
  try {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
    return bytes
  } catch {
    return null
  }
}

async function boardFor(sql: ClubSql, monthId: string) {
  const found = await rows<BoardRow>(
    sql,
    `SELECT attempt_id, user_id, display_name, avatar_url, server_score, created_at
     FROM leaderboard
     WHERE month_id = $1
     ORDER BY server_score DESC, created_at ASC`,
    [monthId],
  )
  return found.map((row, index) => ({
    rank: index + 1,
    id: row.attempt_id,
    userId: row.user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    score: Number(row.server_score),
    createdAt: new Date(row.created_at).getTime(),
  }))
}

export async function POST(request: Request): Promise<Response> {
  const sql = clubDb()
  if (!sql) return unavailable()
  const identity = await identityFrom(request)
  if (identity === 'missing-key') return unavailable()
  if (identity === 'unauthorized') return json({ error: 'unauthorized' }, 401)

  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > MAX_BODY) return json({ error: 'too_large' }, 400)
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'bad_midi' }, 400)
  }
  if (!body || typeof body !== 'object') return json({ error: 'bad_midi' }, 400)
  const record = body as Record<string, unknown>
  const monthId = record.monthId
  const clientScore = record.clientScore
  const speed = record.speed
  const takeMidi = record.takeMidi
  if (typeof monthId !== 'string' || !/^\d{4}-\d{2}$/.test(monthId)) {
    return json({ error: 'bad_month' }, 400)
  }
  if (typeof clientScore !== 'number' || !Number.isFinite(clientScore)) {
    return json({ error: 'bad_midi' }, 400)
  }
  if (typeof speed !== 'number' || typeof takeMidi !== 'string') {
    return json({ error: 'bad_midi' }, 400)
  }
  if (takeMidi.length > MAX_BODY) return json({ error: 'too_large' }, 400)
  const bytes = base64Bytes(takeMidi)
  if (!bytes) return json({ error: 'bad_midi' }, 400)

  try {
    const months = await rows<MonthRow>(sql, `SELECT id, closes_at FROM months WHERE id = $1`, [monthId])
    const month = months[0]
    if (!month) return json({ error: 'bad_month' }, 404)
    const closesAt = new Date(month.closes_at)
    if (Date.now() >= closesAt.getTime()) return json({ error: 'closed' }, 403)

    const counts = await rows<CountRow>(
      sql,
      // Ten minutes, the same window as SUBMIT_WINDOW_MS.
      `SELECT count(*)::int AS n
       FROM submit_events
       WHERE user_id = $1 AND created_at > now() - interval '10 minutes'`,
      [identity.userId],
    )
    const submitsInWindow = Number(counts[0]?.n ?? 0)
    const assessed = assessTake({
      bytes,
      speed,
      monthId,
      now: new Date(),
      submitsInWindow,
      closesAt,
    })
    if (!assessed.ok) {
      const status = assessed.error === 'rate_limited' ? 429 : assessed.error === 'closed' ? 403 : 400
      return json({ error: assessed.error }, status)
    }

    await sql.query(`INSERT INTO submit_events (user_id) VALUES ($1)`, [identity.userId])
    await sql.query(
      `INSERT INTO profiles (user_id, display_name, avatar_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           avatar_url = EXCLUDED.avatar_url`,
      [identity.userId, identity.displayName, identity.avatarUrl],
    )

    const existing = await rows<IdRow>(
      sql,
      `SELECT id FROM attempts WHERE user_id = $1 AND month_id = $2 AND is_official`,
      [identity.userId, monthId],
    )
    const breakdown = JSON.stringify(assessed.result.breakdown)
    const storedScore = Math.max(0, Math.min(1000, Math.round(clientScore)))
    let id = existing[0]?.id
    const replaced = Boolean(id)
    if (id) {
      await sql.query(
        `UPDATE attempts
         SET take_midi = decode($2, 'base64'),
             client_score = $3,
             server_score = $4,
             breakdown = $5::jsonb,
             created_at = now()
         WHERE id = $1`,
        [id, takeMidi, storedScore, assessed.result.serverScore, breakdown],
      )
    } else {
      id = crypto.randomUUID()
      await sql.query(
        `INSERT INTO attempts (
           id, user_id, month_id, take_midi, client_score, server_score, breakdown, is_official
         )
         VALUES ($1, $2, $3, decode($4, 'base64'), $5, $6, $7::jsonb, TRUE)`,
        [id, identity.userId, monthId, takeMidi, storedScore, assessed.result.serverScore, breakdown],
      )
    }

    const board = await boardFor(sql, monthId)
    const rank = board.find((row) => row.id === id)?.rank ?? board.length
    return json({
      id,
      serverScore: assessed.result.serverScore,
      clientScore: storedScore,
      rank,
      replaced,
      board,
    })
  } catch {
    return unavailable()
  }
}
