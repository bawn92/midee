/** Remote Club is on only when the Clerk publishable key is configured. */
export function clerkPublishableKey(): string | null {
  const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
  if (typeof key !== 'string') return null
  const trimmed = key.trim()
  if (!trimmed.startsWith('pk_')) return null
  return trimmed
}

export function isClubRemoteEnabled(): boolean {
  return clerkPublishableKey() !== null
}
