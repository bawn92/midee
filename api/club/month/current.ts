import { currentMonthId, isMonthClosed, monthBounds } from '../../../shared/club/calendar'
import { PIECE_MIDI_URL, PIECE_TITLE, SAMPLE_MONTH_ID } from '../../../shared/club/piece'
import { clubDb, json, rows, unavailable } from '../_lib'

export const runtime = 'nodejs'

interface MonthRow {
  id: string
  title: string
  piece_midi_url: string
  opens_at: string | Date
  closes_at: string | Date
}

export async function GET(): Promise<Response> {
  const sql = clubDb()
  if (!sql) return unavailable()
  const id = currentMonthId()
  try {
    const found = await rows<MonthRow>(
      sql,
      `SELECT id, title, piece_midi_url, opens_at, closes_at FROM months WHERE id = $1`,
      [id],
    )
    const row = found[0]
    if (!row) {
      const bounds = monthBounds(SAMPLE_MONTH_ID)
      return json({
        id: SAMPLE_MONTH_ID,
        slug: SAMPLE_MONTH_ID,
        title: PIECE_TITLE,
        pieceMidiUrl: PIECE_MIDI_URL,
        opensAt: bounds?.opensAt.toISOString() ?? '',
        closesAt: bounds?.closesAt.toISOString() ?? '',
        closed: isMonthClosed(SAMPLE_MONTH_ID),
      })
    }
    const closesAt = new Date(row.closes_at)
    return json({
      id: row.id,
      slug: row.id,
      title: row.title,
      pieceMidiUrl: row.piece_midi_url,
      opensAt: new Date(row.opens_at).toISOString(),
      closesAt: closesAt.toISOString(),
      closed: Date.now() >= closesAt.getTime(),
    })
  } catch {
    return unavailable()
  }
}
