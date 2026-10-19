import { beforeEach, describe, expect, it } from 'vitest'
import {
  bootRoute,
  deadmau5Href,
  LAST_SONG_KEY,
  markStarted,
  modeHref,
  parseRoute,
  readLastSong,
  readStarted,
  rememberLastSong,
  STARTED_KEY,
} from './route'

describe('landing routes', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('always shows the hero on /, including after the visitor has started', () => {
    expect(parseRoute('/', '', false)).toEqual({ kind: 'hero' })
    expect(parseRoute('/', '?lang=en', true)).toEqual({ kind: 'hero' })
    expect(parseRoute('/', '', true)).toEqual({ kind: 'hero' })
  })

  it('always shows the hero on /welcome', () => {
    expect(parseRoute('/welcome', '', true)).toEqual({ kind: 'hero' })
    expect(parseRoute('/welcome/', '?x=1', true)).toEqual({ kind: 'hero' })
  })

  it('opens the MIDI sheet from /start?connect=midi', () => {
    expect(parseRoute('/start', '?connect=midi', false)).toEqual({
      kind: 'home',
      connectMidi: true,
    })
    expect(parseRoute('/start/', '', true)).toEqual({ kind: 'home', connectMidi: false })
  })

  it('maps /play, /live, /learn, and /club onto those modes', () => {
    expect(parseRoute('/play', '', true)).toEqual({ kind: 'mode', mode: 'play', song: null })
    expect(parseRoute('/live/', '?x=1', false)).toEqual({ kind: 'mode', mode: 'live', song: null })
    expect(parseRoute('/learn', '', true)).toEqual({ kind: 'mode', mode: 'learn', song: null })
    expect(parseRoute('/club', '', true)).toEqual({ kind: 'mode', mode: 'club', song: null })
    expect(parseRoute('/club/sso-callback', '', true)).toEqual({
      kind: 'mode',
      mode: 'club',
      song: null,
    })
    expect(parseRoute('/club/', '?song=bach-prelude-c', false)).toEqual({
      kind: 'mode',
      mode: 'club',
      song: null,
    })
    expect(parseRoute('/library', '', true)).toEqual({ kind: 'home', connectMidi: false })
  })

  it('addresses a sample on /play and /learn', () => {
    expect(parseRoute('/play', '?song=bach-prelude-c', true)).toEqual({
      kind: 'mode',
      mode: 'play',
      song: 'bach-prelude-c',
    })
    expect(parseRoute('/learn/bach-prelude-c', '', true)).toEqual({
      kind: 'mode',
      mode: 'learn',
      song: 'bach-prelude-c',
    })
    expect(parseRoute('/learn', '?song=chopin-nocturne-op9-2', false)).toEqual({
      kind: 'mode',
      mode: 'learn',
      song: 'chopin-nocturne-op9-2',
    })
    expect(parseRoute('/live', '?song=bach-prelude-c', true)).toEqual({
      kind: 'mode',
      mode: 'live',
      song: null,
    })
  })

  it('reads the old /start mode links as the new routes', () => {
    expect(parseRoute('/start', '?mode=play&song=bach-prelude-c&lang=en', true)).toEqual({
      kind: 'mode',
      mode: 'play',
      song: 'bach-prelude-c',
    })
    expect(parseRoute('/start/live', '', false)).toEqual({
      kind: 'mode',
      mode: 'live',
      song: null,
    })
    expect(parseRoute('/start/learn/intervals', '?lang=en', true)).toEqual({
      kind: 'mode',
      mode: 'learn',
      song: 'intervals',
    })
  })

  it('stores the flag under midee.started and the last sample under midee.lastSong', () => {
    expect(readStarted()).toBe(false)
    markStarted()
    expect(localStorage.getItem(STARTED_KEY)).toBe('1')
    expect(readStarted()).toBe(true)
    expect(LAST_SONG_KEY).toBe('midee.lastSong')
    expect(readLastSong()).toBeNull()
    rememberLastSong('bach-prelude-c')
    expect(localStorage.getItem(LAST_SONG_KEY)).toBe('bach-prelude-c')
    expect(readLastSong()).toBe('bach-prelude-c')
  })

  it('keeps / and /welcome on the hero before paint', () => {
    expect(bootRoute('/', '?lang=en', '', true)).toEqual({
      route: { kind: 'hero' },
      replace: null,
    })
    expect(bootRoute('/', '', '', false).replace).toBeNull()
    expect(bootRoute('/welcome', '', '', true)).toEqual({
      route: { kind: 'hero' },
      replace: null,
    })
    expect(bootRoute('/start', '?connect=midi', '', true)).toEqual({
      route: { kind: 'home', connectMidi: true },
      replace: null,
    })
    expect(bootRoute('/play', '', '', true)).toEqual({
      route: { kind: 'mode', mode: 'play', song: null },
      replace: null,
    })
    expect(bootRoute('/live', '', '', false).replace).toBeNull()
    expect(bootRoute('/learn/', '', '', true).route).toEqual({
      kind: 'mode',
      mode: 'learn',
      song: null,
    })
  })

  it('replaces a legacy mode link with the canonical URL', () => {
    expect(bootRoute('/start', '?mode=live&lang=en', '#room', true)).toEqual({
      route: { kind: 'mode', mode: 'live', song: null },
      replace: '/live?lang=en#room',
    })
    expect(bootRoute('/start', '?mode=play&song=bach-prelude-c&lang=en', '', true).replace).toBe(
      '/play?lang=en&song=bach-prelude-c',
    )
    expect(bootRoute('/start/learn/bach-prelude-c', '?lang=en', '', false).replace).toBe(
      '/learn/bach-prelude-c?lang=en',
    )
    expect(bootRoute('/learn', '?song=bach-prelude-c', '', true).replace).toBe(
      '/learn/bach-prelude-c',
    )
    expect(bootRoute('/play', '?song=bach-prelude-c', '', true).replace).toBeNull()
  })

  it('builds a mode URL without leaking the other mode’s song', () => {
    expect(modeHref('play', 'bach-prelude-c', '?lang=en&mode=live&connect=midi', '#a')).toBe(
      '/play?lang=en&song=bach-prelude-c#a',
    )
    expect(modeHref('learn', 'bach-prelude-c', '?lang=en&song=other', '')).toBe(
      '/learn/bach-prelude-c?lang=en',
    )
    expect(modeHref('live', 'bach-prelude-c', '?song=bach-prelude-c&lang=en', '')).toBe(
      '/live?lang=en',
    )
    expect(modeHref('home', null, '?mode=play&connect=midi&lang=en', '')).toBe(
      '/start?connect=midi&lang=en',
    )
    expect(modeHref('club', 'bach-prelude-c', '?song=bach-prelude-c&lang=en', '#a')).toBe(
      '/club?lang=en#a',
    )
    expect(modeHref('club', null, '?section=intro&bars=1-10&lang=en', '')).toBe('/club?lang=en')
    expect(modeHref('live', null, '?section=intro&lang=en', '')).toBe('/live?lang=en')
    expect(bootRoute('/club', '?lang=en', '', true)).toEqual({
      route: { kind: 'mode', mode: 'club', song: null },
      replace: null,
    })
    expect(bootRoute('/start', '?mode=club&lang=en', '', true).replace).toBe('/club?lang=en')
  })

  it('opens /deadmau5 as the section page and keeps a valid section', () => {
    expect(parseRoute('/deadmau5', '', true)).toEqual({
      kind: 'deadmau5',
      section: null,
      bars: null,
    })
    expect(parseRoute('/deadmau5/', '?section=intro&lang=en', false)).toEqual({
      kind: 'deadmau5',
      section: 'intro',
      bars: null,
    })
    expect(parseRoute('/library', '', true)).toEqual({ kind: 'home', connectMidi: false })
    expect(bootRoute('/deadmau5', '?lang=en&section=intro', '#a', true)).toEqual({
      route: { kind: 'deadmau5', section: 'intro', bars: null },
      replace: null,
    })
    expect(bootRoute('/deadmau5', '?section=intro&lang=en', '#a', true).replace).toBe(
      '/deadmau5?lang=en&section=intro#a',
    )
    expect(bootRoute('/deadmau5', '?section=nope', '', true).replace).toBe('/deadmau5')
    expect(deadmau5Href('intro', '1-10', '?lang=en', '')).toBe('/deadmau5?lang=en&section=intro')
    expect(deadmau5Href('intro', '2-8', '?lang=en', '#x')).toBe(
      '/deadmau5?lang=en&section=intro&bars=2-8#x',
    )
  })
})
