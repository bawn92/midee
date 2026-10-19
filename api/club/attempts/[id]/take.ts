import { clubDb, json, rows, unavailable } from '../../_lib'

export const runtime = 'nodejs'

interface TakeRow {
  midi: string
}

export async function GET(
  request: Request,
  context?: { params?: Promise<{ id?: string }> | { id?: string } },
): Promise<Response> {
  const sql = clubDb()
  if (!sql) return unavailable()
  const fromParams = context?.params ? await context.params : null
  const id = fromParams?.id || new URL(request.url).pathname.split('/').at(-2) || ''
  if (!/^[A-Za-z0-9-]{8,80}$/.test(id)) return json({ error: 'not_found' }, 404)
  try {
    const found = await rows<TakeRow>(
      sql,
      `SELECT encode(take_midi, 'base64') AS midi
       FROM attempts
       WHERE id = $1 AND is_official`,
      [id],
    )
    const midi = found[0]?.midi
    if (!midi) return json({ error: 'not_found' }, 404)
    const bytes = Uint8Array.from(atob(midi), (char) => char.charCodeAt(0))
    return new Response(bytes, {
      headers: {
        'content-type': 'audio/midi',
        'cache-control': 'public, max-age=3600',
      },
    })
  } catch {
    return unavailable()
  }
}
