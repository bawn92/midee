import { describe, expect, it } from 'vitest'
import { isClubRemoteEnabled } from './remote'

describe('club remote feature check', () => {
  it('stays off until a Clerk publishable key is set', () => {
    expect(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY).toBeUndefined()
    expect(isClubRemoteEnabled()).toBe(false)
  })
})
