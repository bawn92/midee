// Landing routes. `/` always shows the hero, including for a returning
// visitor. `/welcome` is the same hero. `/start` is Home. Play, Live, and
// Learn are `/play`, `/live`, and `/learn`. A sample is `/play?song=<id>`
// or `/learn/<id>`. `/deadmau5` practises Strobe section by section.
// `midee.started` is still written when a CTA is pressed, a note is played,
// or a file is opened, and it no longer changes the route.
// `midee.lastSong` remembers the last sample id for a refresh with no song.

import { canonicalSectionQuery } from '../deadmau5/sections'

export const STARTED_KEY = 'midee.started'
export const LAST_SONG_KEY = 'midee.lastSong'

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
  song: string | null
}

export interface Deadmau5Route {
  kind: 'deadmau5'
  section: string | null
  bars: string | null
}

export type LandingRoute = HeroRoute | HomeRoute | ModeRoute | Deadmau5Route

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

export function readLastSong(): string | null {
  try {
    const id = storage()?.getItem(LAST_SONG_KEY)?.trim()
    return id ? id : null
  } catch {
    return null
  }
}

export function rememberLastSong(id: string): void {
  try {
    storage()?.setItem(LAST_SONG_KEY, id)
  } catch {
    // A missing memory just means the next bare /play opens the picker.
  }
}

function readParams(search: string): URLSearchParams {
  const q = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(q)
}

function asMode(value: string | null | undefined): ModePath | null {
  if (value === 'play' || value === 'live' || value === 'learn') return value
  return null
}

function decodeSong(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const song = decodeURIComponent(value).trim()
    return song.length > 0 ? song : null
  } catch {
    return null
  }
}

function songParam(params: URLSearchParams): string | null {
  return decodeSong(params.get('song'))
}

// `/start?mode=play` and `/start/learn/<id>` are the old addresses.
function legacyMode(
  path: string,
  params: URLSearchParams,
): { mode: ModePath; song: string | null } | null {
  const match = /^\/start\/(play|live|learn)(?:\/([^/]+))?$/.exec(path)
  if (match) {
    const mode = asMode(match[1])
    if (!mode) return null
    const fromPath = match[2] ? decodeSong(match[2]) : null
    const song = mode === 'live' ? null : (fromPath ?? songParam(params))
    return { mode, song }
  }
  if (path !== '/start') return null
  const mode = asMode(params.get('mode'))
  if (!mode) return null
  return { mode, song: mode === 'live' ? null : songParam(params) }
}

export function parseRoute(pathname: string, search: string, _started: boolean): LandingRoute {
  const path = normalizePath(pathname)
  const params = readParams(search)
  if (path === '/' || path === '/welcome') return { kind: 'hero' }

  const mode = MODE_BY_PATH[path]
  if (mode) {
    const song = mode === 'play' || mode === 'learn' ? songParam(params) : null
    return { kind: 'mode', mode, song }
  }

  if (path.startsWith('/learn/')) {
    const rest = path.slice('/learn/'.length)
    if (rest && !rest.includes('/')) {
      return { kind: 'mode', mode: 'learn', song: decodeSong(rest) }
    }
  }

  const legacy = legacyMode(path, params)
  if (legacy) return { kind: 'mode', mode: legacy.mode, song: legacy.song }

  if (path === '/deadmau5') {
    return { kind: 'deadmau5', section: params.get('section'), bars: params.get('bars') }
  }

  return { kind: 'home', connectMidi: params.get('connect') === 'midi' }
}

// `/deadmau5` and `/deadmau5?section=intro`. A bad id drops back to the
// section list. `lang` and the hash ride along.
export function deadmau5Href(
  section: string | null,
  bars: string | null,
  search: string,
  hash: string,
): string {
  const canon = canonicalSectionQuery(section, bars)
  const params = readParams(search)
  params.delete('mode')
  params.delete('song')
  params.delete('connect')
  params.delete('section')
  params.delete('bars')
  if (canon.section) params.set('section', canon.section)
  if (canon.bars) params.set('bars', canon.bars)
  const q = params.toString()
  const hashPart = hash ? (hash.startsWith('#') ? hash : `#${hash}`) : ''
  return `/deadmau5${q ? `?${q}` : ''}${hashPart}`
}

// Canonical address for a mode. Play keeps the sample in the query. Learn
// keeps it in the path. `mode` and `song` are dropped from the leftover
// query; `connect` stays on Home only. `lang` and the hash ride along.
export function modeHref(
  mode: 'home' | ModePath,
  song: string | null,
  search: string,
  hash: string,
): string {
  const params = readParams(search)
  params.delete('mode')
  params.delete('song')
  if (mode !== 'home') params.delete('connect')
  let path = mode === 'home' ? '/start' : `/${mode}`
  if (mode === 'play' && song) params.set('song', song)
  if (mode === 'learn' && song) path = `/learn/${encodeURIComponent(song)}`
  const q = params.toString()
  const hashPart = hash ? (hash.startsWith('#') ? hash : `#${hash}`) : ''
  return `${path}${q ? `?${q}` : ''}${hashPart}`
}

// The inline script in index.html mirrors the hero check. A legacy mode
// address is replaced before paint so Back does not return to it.
export function bootRoute(
  pathname: string,
  search: string,
  hash: string,
  started: boolean,
): {
  route: LandingRoute
  replace: string | null
} {
  const route = parseRoute(pathname, search, started)
  if (route.kind === 'hero') return { route, replace: null }
  const next =
    route.kind === 'home'
      ? modeHref('home', null, search, hash)
      : route.kind === 'deadmau5'
        ? deadmau5Href(route.section, route.bars, search, hash)
        : modeHref(route.mode, route.song, search, hash)
  const current = `${normalizePath(pathname)}${search}${hash}`
  return { route, replace: current === next ? null : next }
}
