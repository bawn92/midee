// Landing routes. `/` is the hero until the visitor has started; after that
// it is Home, decided before paint so the hero never flashes. `/welcome`
// always shows the hero. The flag lives under the existing `midee.*`
// prefix. It is set when a CTA is pressed, a note is played, or a file is
// opened — not on page view. `midee.theme` is written on the first read, so
// it cannot stand in for this flag.

export const STARTED_KEY = 'midee.started'

export type LandingKind = 'desktop' | 'phone'

export interface HeroRoute {
  kind: 'hero'
}

export interface HomeRoute {
  kind: 'home'
  connectMidi: boolean
}

export type LandingRoute = HeroRoute | HomeRoute

export function normalizePath(pathname: string): string {
  if (!pathname) return '/'
  const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return trimmed || '/'
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function readStarted(): boolean {
  try {
    return storage()?.getItem(STARTED_KEY) === '1'
  } catch {
    return false
  }
}

export function markStarted(): void {
  try {
    storage()?.setItem(STARTED_KEY, '1')
  } catch {
    // Private mode and blocked storage still let the visit continue.
  }
}

export function parseRoute(pathname: string, search: string, started: boolean): LandingRoute {
  const path = normalizePath(pathname)
  if (path === '/welcome') return { kind: 'hero' }
  if (path === '/' && !started) return { kind: 'hero' }
  return { kind: 'home', connectMidi: new URLSearchParams(search).get('connect') === 'midi' }
}

export function returningVisitorPath(search: string, hash: string): string {
  return `/start${search}${hash}`
}

// The inline script in index.html mirrors this. Keep the two in step: a
// returning visitor on `/` is replaced with `/start` before first paint.
export function bootRoute(
  pathname: string,
  search: string,
  hash: string,
  started: boolean,
): {
  route: LandingRoute
  replace: string | null
} {
  const path = normalizePath(pathname)
  if (path === '/' && started) {
    const replace = returningVisitorPath(search, hash)
    return { route: parseRoute('/start', search, true), replace }
  }
  return { route: parseRoute(pathname, search, started), replace: null }
}
