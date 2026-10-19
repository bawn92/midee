import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  consumePreserveRoll,
  crossfadeModes,
  flipTransform,
  installViewMotion,
  isModeCrossfade,
  KEYBOARD_RISE_PX,
  prefersReducedMotion,
  ROLL_RISE_PX,
  retireModeView,
  SLIDE_PX,
  STAGGER_MS,
  settleSongIntoPlay,
  songSettleBox,
  VIEW_EASE,
  VIEW_MS,
  VIEW_REDUCED_MS,
} from './viewTransition'

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  document.documentElement.removeAttribute('data-vt')
  document.documentElement.removeAttribute('style')
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  consumePreserveRoll()
  installViewMotion()
})

describe('view transition timing', () => {
  it('stays inside the calm range and keeps a short reduced fade', () => {
    expect(VIEW_MS).toBeGreaterThanOrEqual(280)
    expect(VIEW_MS).toBeLessThanOrEqual(420)
    expect(VIEW_REDUCED_MS).toBe(120)
    expect(STAGGER_MS).toBe(40)
    expect(SLIDE_PX).toBeGreaterThanOrEqual(6)
    expect(SLIDE_PX).toBeLessThanOrEqual(8)
    expect(KEYBOARD_RISE_PX).toBeGreaterThan(0)
    expect(KEYBOARD_RISE_PX).toBeLessThanOrEqual(12)
    expect(ROLL_RISE_PX).toBeGreaterThan(KEYBOARD_RISE_PX)
    expect(VIEW_EASE).toBe('cubic-bezier(0.2, 0, 0, 1)')
  })

  it('writes the same durations onto the root', () => {
    installViewMotion()
    const style = document.documentElement.style
    expect(style.getPropertyValue('--vt-ms')).toBe('360ms')
    expect(style.getPropertyValue('--vt-reduced')).toBe('120ms')
    expect(style.getPropertyValue('--vt-stagger')).toBe('40ms')
    expect(style.getPropertyValue('--vt-slide')).toBe('8px')
    expect(style.getPropertyValue('--vt-ease')).toBe(VIEW_EASE)
  })
})

describe('isModeCrossfade', () => {
  it('crossfades only among Play, Live, and Learn', () => {
    expect(isModeCrossfade('play', 'live')).toBe(true)
    expect(isModeCrossfade('live', 'learn')).toBe(true)
    expect(isModeCrossfade('learn', 'play')).toBe(true)
    expect(isModeCrossfade('play', 'play')).toBe(false)
    expect(isModeCrossfade('home', 'play')).toBe(false)
    expect(isModeCrossfade('home', 'live')).toBe(false)
    expect(isModeCrossfade('play', 'home')).toBe(false)
  })
})

describe('song card grow', () => {
  it('settles a card into a larger box over the roll', () => {
    const start = { x: 40, y: 420, width: 220, height: 140 }
    const end = songSettleBox(start, { width: 1440, height: 900 })
    expect(end.width).toBeGreaterThan(start.width)
    expect(end.height).toBeGreaterThan(start.height)
    expect(end.x).toBeGreaterThan(0)
    expect(end.y).toBeGreaterThan(0)
    expect(end.y + end.height).toBeLessThan(900)
  })

  it('builds a transform that parks the end box on the card', () => {
    const start = { x: 40, y: 420, width: 220, height: 140 }
    const end = songSettleBox(start, { width: 1440, height: 900 })
    const transform = flipTransform(start, end)
    expect(transform).toContain('translate(')
    expect(transform).toContain('scale(')
    expect(transform).toContain(`${start.x - end.x}px`)
    expect(transform).toContain(`${start.y - end.y}px`)
  })
})

describe('settleSongIntoPlay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  function card(): HTMLElement {
    const el = document.createElement('button')
    el.className = 'sample-card is-vt-source'
    el.getBoundingClientRect = () =>
      ({
        x: 40,
        y: 400,
        width: 220,
        height: 140,
        top: 400,
        left: 40,
        right: 260,
        bottom: 540,
        toJSON() {
          return {}
        },
      }) as DOMRect
    document.body.appendChild(el)
    const app = document.createElement('main')
    app.id = 'app'
    document.body.appendChild(app)
    return el
  }

  it('hides home immediately and leaves the canvas clickable', () => {
    card()
    const apply = vi.fn()
    settleSongIntoPlay(apply)
    expect(apply).toHaveBeenCalledOnce()
    expect(document.documentElement.dataset.vt).toBe('enter')
    expect(document.querySelector('.vt-roll-veil')).not.toBeNull()
    const ghost = document.querySelector('.vt-song-ghost')
    expect(ghost).not.toBeNull()
    expect(ghost?.getAttribute('style') ?? '').toContain('opacity: 0')
    expect(document.getElementById('app')?.style.pointerEvents).toBe('')
  })

  it('morphs the song card with an element view transition and leaves the page live', () => {
    const el = card()
    const apply = vi.fn()
    const start = vi.fn((update: () => void) => {
      update()
      return { finished: Promise.resolve() }
    })
    const proto = HTMLElement.prototype as HTMLElement & {
      startViewTransition?: typeof start
    }
    proto.startViewTransition = start
    const docStart = vi.fn()
    ;(document as unknown as { startViewTransition?: typeof docStart }).startViewTransition =
      docStart
    settleSongIntoPlay(apply)
    expect(start).toHaveBeenCalledOnce()
    expect(docStart).not.toHaveBeenCalled()
    expect(apply).toHaveBeenCalledOnce()
    expect(el.isConnected).toBe(true)
    const ghost = document.querySelector('.vt-song-ghost')
    expect(ghost).not.toBeNull()
    expect(ghost?.getAttribute('style') ?? '').toContain('opacity: 0')
    delete proto.startViewTransition
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition
  })

  it('crossfades with opacity only when motion is reduced', () => {
    card()
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    )
    const start = vi.fn()
    ;(document as unknown as { startViewTransition?: typeof start }).startViewTransition = start
    const apply = vi.fn()
    expect(prefersReducedMotion()).toBe(true)
    settleSongIntoPlay(apply)
    expect(apply).toHaveBeenCalledOnce()
    expect(start).not.toHaveBeenCalled()
    expect(document.documentElement.dataset.vt).toBe('reduced')
    expect(document.querySelector('.vt-song-ghost')).toBeNull()
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition
  })
})

describe('crossfadeModes', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('applies the mode change immediately and keeps the roll mounted', () => {
    const apply = vi.fn()
    crossfadeModes(apply)
    expect(apply).toHaveBeenCalledOnce()
    expect(document.documentElement.dataset.vt).toBe('mode')
    expect(document.getElementById('pianoroll')).toBeNull()
  })

  it('does not snapshot the page when the document view transition API exists', () => {
    const apply = vi.fn()
    const start = vi.fn()
    ;(document as unknown as { startViewTransition?: typeof start }).startViewTransition = start
    crossfadeModes(apply)
    expect(start).not.toHaveBeenCalled()
    expect(apply).toHaveBeenCalledOnce()
    expect(document.documentElement.dataset.vt).toBe('mode')
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition
  })

  it('tells the arriving mode to keep the clock and the roll', () => {
    let kept = false
    crossfadeModes(() => {
      kept = consumePreserveRoll()
    })
    expect(kept).toBe(true)
    expect(consumePreserveRoll()).toBe(false)
  })

  it('retires the outgoing view after the fade and drops it if the switch retargets', () => {
    const hub = document.createElement('div')
    hub.className = 'learn-host learn-host--hub'
    document.body.appendChild(hub)
    crossfadeModes(() => {
      retireModeView(hub)
    })
    expect(hub.isConnected).toBe(true)
    expect(hub.classList.contains('mode-view--leave')).toBe(true)
    expect(hub.getAttribute('inert')).not.toBeNull()
    vi.advanceTimersByTime(VIEW_MS + 80)
    expect(hub.isConnected).toBe(false)

    const again = document.createElement('div')
    again.className = 'learn-host learn-host--hub'
    document.body.appendChild(again)
    crossfadeModes(() => {
      retireModeView(again)
    })
    expect(again.isConnected).toBe(true)
    crossfadeModes(() => {})
    expect(again.isConnected).toBe(false)
  })
})
