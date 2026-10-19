// Landing routes. `/` always shows the hero, including for a returning
// visitor. `/welcome` is the same hero. `/start` is Home. Play, Live, and
// Learn are `/play`, `/live`, and `/learn`. `midee.started` is still written
// when a CTA is pressed, a note is played, or a file is opened, and it no
// longer changes the route.

export const STARTED_KEY = 'midee.started'

export type LandingKind = 'desktop' | 'phone'

export type ModePath = 'play' | 'live' | 'learn'

const MODE_BY_PATH: Record<string, ModePath> = {
  '/play': 'play',
  '/live': 'live',
  '/learn': 'learn',
}

export interface HeroRoute {
  kind: 'hero'
}

export interface HomeRoute {
  kind: 'home'
  connectMidi: boolean
}

export interface ModeRoute {
  kind: 'mode'
  mode: ModePath
}

export type LandingRoute = HeroRoute | HomeRoute | ModeRoute

export function modePath(mode: ModePath): string {
  return `/${mode}`
}

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

export function parseRoute(pathname: string, search: string, _started: boolean): LandingRoute {
  const path = normalizePath(pathname)
  if (path === '/' || path === '/welcome') return { kind: 'hero' }
  const mode = MODE_BY_PATH[path]
  if (mode) return { kind: 'mode', mode }
  return { kind: 'home', connectMidi: new URLSearchParams(search).get('connect') === 'midi' }
}

// The inline script in index.html mirrors this. `/` stays the hero, so
// nothing is replaced before paint.
export function bootRoute(
  pathname: string,
  search: string,
  _hash: string,
  started: boolean,
): {
  route: LandingRoute
  replace: string | null
} {
  return { route: parseRoute(pathname, search, started), replace: null }
}
