import { identityFrom, json, unavailable } from './_lib'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  const identity = await identityFrom(request)
  if (identity === 'missing-key') return unavailable()
  if (identity === 'unauthorized') return json({ error: 'unauthorized' }, 401)
  return json(identity)
}
