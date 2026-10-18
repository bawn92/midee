import { beforeEach, describe, expect, it } from 'vitest'
import { bootRoute, markStarted, parseRoute, readStarted, STARTED_KEY } from './route'

describe('landing routes', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows the hero on / until the visitor has started', () => {
    expect(parseRoute('/', '', false)).toEqual({ kind: 'hero' })
    expect(parseRoute('/', '', true)).toEqual({ kind: 'home', connectMidi: false })
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

  it('stores the flag under midee.started', () => {
    expect(readStarted()).toBe(false)
    markStarted()
    expect(localStorage.getItem(STARTED_KEY)).toBe('1')
    expect(readStarted()).toBe(true)
  })

  it('sends a returning / to /start before paint, keeping the query', () => {
    expect(bootRoute('/', '?lang=en', '', true)).toEqual({
      route: { kind: 'home', connectMidi: false },
      replace: '/start?lang=en',
    })
    expect(bootRoute('/', '', '', false).replace).toBeNull()
    expect(bootRoute('/welcome', '', '', true).replace).toBeNull()
  })
})
