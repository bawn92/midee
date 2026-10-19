import { isMonthClosed } from '../../shared/club/calendar'
import { clubDb, json, rows, unavailable } from './_lib'

export const runtime = 'nodejs'

interface BoardRow {
  attempt_id: string
  display_name: string
  avatar_url: string | null
  server_score: number
  created_at: string | Date
}

function monthIdFrom(request: Request): string | null {
  const month = new URL(request.url).searchParams.get('month')
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null
  return month
}

export async function GET(request: Request): Promise<Response> {
  const sql = clubDb()
  if (!sql) return unavailable()
  const monthId = monthIdFrom(request)
  if (!monthId) return json({ error: 'bad_month' }, 400)
  try {
    const found = await rows<BoardRow>(
      sql,
      `SELECT attempt_id, display_name, avatar_url, server_score, created_at
       FROM leaderboard
       WHERE month_id = $1
       ORDER BY server_score DESC, created_at ASC`,
      [monthId],
    )
    const closed = isMonthClosed(monthId)
    return json({
      monthId,
      closed,
      // TODO(club-friends): this is the global board. A later phase adds a
      // friends filter for the signed-in player. The client shows an empty tab.
      final: closed,
      entries: found.map((row, index) => ({
        rank: index + 1,
        id: row.attempt_id,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        score: Number(row.server_score),
        createdAt: new Date(row.created_at).getTime(),
      })),
    })
  } catch {
    return unavailable()
  }
}
