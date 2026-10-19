import { createClerkClient, verifyToken } from '@clerk/backend'
import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

export type ClubSql = NeonQueryFunction<false, false>

export function clubDb(): ClubSql | null {
  const url = process.env.DATABASE_URL
  if (!url) return null
  return neon(url)
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export function unavailable(): Response {
  return json({ error: 'unavailable' }, 503)
}

export interface ClubIdentity {
  userId: string
  displayName: string
  avatarUrl: string | null
}

export async function identityFrom(
  request: Request,
): Promise<ClubIdentity | 'missing-key' | 'unauthorized'> {
  const secret = process.env.CLERK_SECRET_KEY
  if (!secret) return 'missing-key'
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
  if (!token) return 'unauthorized'
  try {
    const claims = await verifyToken(token, { secretKey: secret })
    const userId = claims.sub
    if (!userId) return 'unauthorized'
    const clerk = createClerkClient({ secretKey: secret })
    const user = await clerk.users.getUser(userId)
    const displayName = (user.fullName || user.username || 'Player').slice(0, 32)
    const image = user.imageUrl
    const avatarUrl = typeof image === 'string' && image.startsWith('https://') ? image : null
    return { userId, displayName, avatarUrl }
  } catch {
    return 'unauthorized'
  }
}

export async function rows<T>(sql: ClubSql, text: string, params: unknown[]): Promise<T[]> {
  const result = await sql.query(text, params)
  return result as T[]
}
