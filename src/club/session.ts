import type { Clerk } from '@clerk/clerk-js'
import { clerkPublishableKey } from './remote'

export interface ClubAccount {
  id: string
  displayName: string
  avatarUrl: string | null
  getToken: () => Promise<string | null>
}

let loading: Promise<Clerk | null> | null = null

export function loadClerk(): Promise<Clerk | null> {
  const key = clerkPublishableKey()
  if (!key) return Promise.resolve(null)
  if (!loading) {
    loading = import('@clerk/clerk-js')
      .then(async ({ Clerk }) => {
        const clerk = new Clerk(key)
        await clerk.load()
        return clerk
      })
      .catch(() => null)
  }
  return loading
}

export function accountFrom(clerk: Clerk): ClubAccount | null {
  const user = clerk.user
  if (!user) return null
  const image = user.imageUrl
  return {
    id: user.id,
    displayName: (user.fullName || user.username || 'Player').slice(0, 32),
    avatarUrl: typeof image === 'string' && image.startsWith('https://') ? image : null,
    getToken: async () => (await clerk.session?.getToken()) ?? null,
  }
}

export async function signInWith(strategy: 'oauth_google' | 'oauth_apple'): Promise<void> {
  const clerk = await loadClerk()
  const signIn = clerk?.client?.signIn
  if (!signIn) return
  await signIn.authenticateWithRedirect({
    strategy,
    redirectUrl: `${location.origin}/club/sso-callback`,
    redirectUrlComplete: `${location.origin}/club`,
  })
}

export async function finishClerkRedirect(): Promise<void> {
  if (!location.pathname.replace(/\/+$/, '').endsWith('/club/sso-callback')) return
  const clerk = await loadClerk()
  if (!clerk) return
  await clerk.handleRedirectCallback({})
}
