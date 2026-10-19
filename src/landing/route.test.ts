import { beforeEach, describe, expect, it } from 'vitest'
import { bootRoute, markStarted, parseRoute, readStarted, STARTED_KEY } from './route'

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

  it('maps /play, /live, and /learn onto those modes', () => {
    expect(parseRoute('/play', '', true)).toEqual({ kind: 'mode', mode: 'play' })
    expect(parseRoute('/live/', '?x=1', false)).toEqual({ kind: 'mode', mode: 'live' })
    expect(parseRoute('/learn', '', true)).toEqual({ kind: 'mode', mode: 'learn' })
    expect(parseRoute('/library', '', true)).toEqual({ kind: 'home', connectMidi: false })
  })

  it('stores the flag under midee.started', () => {
    expect(readStarted()).toBe(false)
    markStarted()
    expect(localStorage.getItem(STARTED_KEY)).toBe('1')
    expect(readStarted()).toBe(true)
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
      route: { kind: 'mode', mode: 'play' },
      replace: null,
    })
    expect(bootRoute('/live', '', '', false).replace).toBeNull()
    expect(bootRoute('/learn/', '', '', true).route).toEqual({ kind: 'mode', mode: 'learn' })
  })
})
