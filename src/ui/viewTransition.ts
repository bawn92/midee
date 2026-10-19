// Calm transitions between Home and Play, and between Play, Live, and Learn.
// Motion is transform and opacity only. The canvas render loop and the audio
// clock are left alone: a key pressed during a transition still sounds.

import {
  LIVE_IN_END_MS,
  LIVE_LIFT_MS,
  LIVE_OUT_MS,
  LIVE_OVERSHOOT_PX,
  LIVE_RISE_EASE,
  LIVE_RISE_MS,
  LIVE_STAGGER_MS,
} from './liveEntrance'

export const VIEW_EASE = 'cubic-bezier(0.2, 0, 0, 1)'
export const VIEW_MS = 360
export const VIEW_REDUCED_MS = 120
export const STAGGER_MS = 40
export const SLIDE_PX = 8
export const KEYBOARD_RISE_PX = 8
export const ROLL_RISE_PX = 16

const PLAY_MODES = new Set(['play', 'live', 'learn'])

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

type ViewTransitionHandle = { finished: Promise<void> }

export function prefersReducedMotion(): boolean {
  if (typeof matchMedia !== 'function') return false
  return matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function isModeCrossfade(from: string, to: string): boolean {
  return from !== to && PLAY_MODES.has(from) && PLAY_MODES.has(to)
}

// The card grows toward the middle of the roll, then dissolves into the view.
export function songSettleBox(start: Box, viewport: { width: number; height: number }): Box {
  const width = Math.min(Math.max(start.width * 1.7, 280), viewport.width * 0.46)
  const height = Math.min(Math.max(start.height * 1.45, 160), viewport.height * 0.34)
  const x = (viewport.width - width) / 2
  const keyboard = Math.min(viewport.height * 0.28, 240)
  const rollMid = (viewport.height - keyboard) * 0.42
  const y = Math.max(88, rollMid - height / 2)
  return { x, y, width, height }
}

// Place the ghost at the end box, then this transform parks it on the card.
// Animating the transform to none is the grow. Left and top do not animate.
export function flipTransform(start: Box, end: Box): string {
  const sx = start.width / end.width
  const sy = start.height / end.height
  const dx = start.x - end.x
  const dy = start.y - end.y
  return `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`
}

export function installViewMotion(root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--vt-ease', VIEW_EASE)
  root.style.setProperty('--vt-ms', `${VIEW_MS}ms`)
  root.style.setProperty('--vt-reduced', `${VIEW_REDUCED_MS}ms`)
  root.style.setProperty('--vt-stagger', `${STAGGER_MS}ms`)
  root.style.setProperty('--vt-slide', `${SLIDE_PX}px`)
  root.style.setProperty('--vt-keys', `${KEYBOARD_RISE_PX}px`)
  root.style.setProperty('--vt-roll', `${ROLL_RISE_PX}px`)
  root.style.setProperty('--vt-live-lift', `${LIVE_LIFT_MS}ms`)
  root.style.setProperty('--vt-live-stagger', `${LIVE_STAGGER_MS}ms`)
  root.style.setProperty('--vt-live-rise', `${LIVE_RISE_MS}ms`)
  root.style.setProperty('--vt-live-ease', LIVE_RISE_EASE)
  root.style.setProperty('--vt-live-overshoot', `${LIVE_OVERSHOOT_PX}px`)
}

if (typeof document !== 'undefined') installViewMotion()

function viewport(): { width: number; height: number } {
  return {
    width: window.innerWidth || 1440,
    height: window.innerHeight || 900,
  }
}

// A microtask lets Solid flush before the new snapshot. Waiting on a frame
// never returns: rendering is paused until this update settles.
function afterUpdate(): Promise<void> {
  return Promise.resolve()
}

type ScopedHost = HTMLElement & {
  startViewTransition?: (update: () => void | Promise<void>) => ViewTransitionHandle
}

// Document-level view transitions snapshot the whole page, which blanks the
// live keyboard and freezes falling notes. Scoping the transition to the song
// card leaves the canvas painting underneath.
function scopedTransition(
  el: HTMLElement,
): ((update: () => void | Promise<void>) => ViewTransitionHandle) | null {
  const start = (el as ScopedHost).startViewTransition
  return typeof start === 'function' ? start.bind(el) : null
}

function clearMotionNodes(): void {
  document.querySelectorAll('.vt-roll-veil, .vt-song-ghost, .vt-song-target').forEach((el) => {
    el.remove()
  })
}

let clearTimer = 0
let motionGen = 0
let preserveRoll = false
const leaving = new Map<HTMLElement, number>()

// Header switches among Play, Live, and Learn keep the clock and the roll.
// The mode shell consumes this once while it mounts.
export function consumePreserveRoll(): boolean {
  const keep = preserveRoll
  preserveRoll = false
  return keep
}

function dropLeavingViews(): void {
  for (const [el, timer] of leaving) {
    window.clearTimeout(timer)
    el.remove()
  }
  leaving.clear()
}

function beginMotion(): number {
  window.clearTimeout(clearTimer)
  // A newer transition replaces whatever was still fading out.
  dropLeavingViews()
  motionGen += 1
  return motionGen
}

// The outgoing surface fades, ignores pointers immediately, and leaves the
// document when that fade ends. A newer transition removes it first.
export function retireModeView(el: HTMLElement): void {
  el.classList.add('mode-view--leave')
  el.setAttribute('inert', '')
  el.setAttribute('aria-hidden', 'true')
  const previous = leaving.get(el)
  if (previous) window.clearTimeout(previous)
  const ms = (prefersReducedMotion() ? VIEW_REDUCED_MS : VIEW_MS) + 80
  const timer = window.setTimeout(() => {
    leaving.delete(el)
    if (el.isConnected && el.classList.contains('mode-view--leave')) el.remove()
  }, ms)
  leaving.set(el, timer)
  el.addEventListener(
    'animationend',
    (event) => {
      if (event.target !== el) return
      window.clearTimeout(leaving.get(el))
      leaving.delete(el)
      if (el.isConnected && el.classList.contains('mode-view--leave')) el.remove()
    },
    { once: true },
  )
}

function scheduleClear(gen: number, ms: number, finish: () => void): void {
  clearTimer = window.setTimeout(() => {
    if (gen !== motionGen) return
    finish()
  }, ms)
}

function mountRollVeil(): void {
  const host = document.getElementById('app') ?? document.body
  const veil = document.createElement('div')
  veil.className = 'vt-roll-veil'
  veil.setAttribute('aria-hidden', 'true')
  host.appendChild(veil)
}

// Opening a song from Home. `apply` hides the home surface; it runs immediately
// so the click is never waiting on the animation.
export function settleSongIntoPlay(apply: () => void): void {
  const reduced = prefersReducedMotion()
  const card = document.querySelector<HTMLElement>('.sample-card.is-vt-source')
  const rect = card?.getBoundingClientRect()
  const hasRect = !!rect && rect.width > 0 && rect.height > 0
  const gen = beginMotion()
  clearMotionNodes()
  document.documentElement.dataset.vt = reduced ? 'reduced' : 'enter'
  mountRollVeil()

  let settled = false
  const finish = (): void => {
    if (settled || gen !== motionGen) return
    settled = true
    window.clearTimeout(clearTimer)
    clearMotionNodes()
    card?.style.removeProperty('view-transition-name')
    card?.classList.remove('is-vt-source')
    delete document.documentElement.dataset.vtApi
    const vt = document.documentElement.dataset.vt
    if (vt === 'enter' || vt === 'reduced') delete document.documentElement.dataset.vt
  }

  const scope = !reduced && hasRect && card ? scopedTransition(card) : null
  if (scope && card && rect) {
    const ghost = mountSongGhost(card, rect)
    const run = scopedTransition(ghost)
    if (run) {
      let ran = false
      try {
        const vt = run(() => {
          ran = true
          placeSongGhost(ghost, songSettleBox(rect, viewport()))
          ghost.style.opacity = '0'
          apply()
          return afterUpdate()
        })
        void vt.finished.finally(finish)
        scheduleClear(gen, VIEW_MS + 160, finish)
        return
      } catch {
        ghost.remove()
        if (!ran) apply()
        scheduleClear(gen, VIEW_MS + 80, finish)
        return
      }
    }
    ghost.remove()
  }

  if (!reduced && hasRect && card && rect) mountFlipGhost(rect, card)
  apply()
  scheduleClear(gen, (reduced ? VIEW_REDUCED_MS : VIEW_MS) + 80, finish)
}

function mountSongGhost(card: HTMLElement, start: Box): HTMLElement {
  const ghost = card.cloneNode(true)
  const el = ghost instanceof HTMLElement ? ghost : document.createElement('div')
  el.classList.add('vt-song-ghost')
  el.classList.remove('is-vt-source')
  el.removeAttribute('id')
  el.setAttribute('aria-hidden', 'true')
  el.style.left = `${start.x}px`
  el.style.top = `${start.y}px`
  el.style.width = `${start.width}px`
  el.style.height = `${start.height}px`
  el.style.opacity = '1'
  document.body.appendChild(el)
  return el
}

function placeSongGhost(ghost: HTMLElement, end: Box): void {
  ghost.style.left = `${end.x}px`
  ghost.style.top = `${end.y}px`
  ghost.style.width = `${end.width}px`
  ghost.style.height = `${end.height}px`
}

function mountFlipGhost(start: Box, card: HTMLElement): void {
  const end = songSettleBox(start, viewport())
  const ghost = card.cloneNode(true)
  if (!(ghost instanceof HTMLElement)) return
  ghost.classList.add('vt-song-ghost')
  ghost.classList.remove('is-vt-source')
  ghost.removeAttribute('id')
  ghost.style.left = `${end.x}px`
  ghost.style.top = `${end.y}px`
  ghost.style.width = `${end.width}px`
  ghost.style.height = `${end.height}px`
  ghost.style.transformOrigin = 'top left'
  ghost.style.transform = flipTransform(start, end)
  ghost.style.opacity = '1'
  document.body.appendChild(ghost)
  void ghost.offsetWidth
  ghost.style.transition =
    'transform var(--vt-ms, 360ms) var(--vt-ease, cubic-bezier(0.2, 0, 0, 1)), opacity var(--vt-ms, 360ms) var(--vt-ease, cubic-bezier(0.2, 0, 0, 1))'
  ghost.style.transform = 'none'
  ghost.style.opacity = '0'
}

// Header switch among Play, Live, and Learn. Panels crossfade; the canvas is
// not snapshotted, so falling notes keep their place.
export function crossfadeModes(apply: () => void): void {
  preserveRoll = true
  const reduced = prefersReducedMotion()
  const gen = beginMotion()
  document.documentElement.dataset.vt = reduced ? 'reduced' : 'mode'
  let settled = false
  const finish = (): void => {
    if (settled || gen !== motionGen) return
    settled = true
    window.clearTimeout(clearTimer)
    delete document.documentElement.dataset.vtApi
    const vt = document.documentElement.dataset.vt
    if (vt === 'mode' || vt === 'reduced') delete document.documentElement.dataset.vt
  }

  // Mode panels and the header pill animate in CSS, on the live elements.
  // A snapshot of the overlay would freeze the pill slide.
  apply()
  scheduleClear(gen, reduced ? VIEW_REDUCED_MS + 40 : VIEW_MS + 80, finish)
}

// A zero-size sentinel is the only thing the View Transitions API snapshots.
// Scoping the transition to the home surface (or the document) would freeze
// the keyboard canvas, so a key pressed mid-rise could not light. The copy
// itself moves with CSS. The sentinel is the API path; CSS is the fallback
// when startViewTransition is missing.
// The home surface is opacity 1 for the lift. Removing data-vt would otherwise
// transition it back through the 450ms hide. Hold it hidden for two frames.
function parkHiddenDropzone(): void {
  const root = document.documentElement
  root.classList.add('vt-live-hold')
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.remove('vt-live-hold')
    })
  })
}

function liveSentinel(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  let el = document.getElementById('vt-live-sentinel')
  if (!el) {
    el = document.createElement('div')
    el.id = 'vt-live-sentinel'
    el.setAttribute('aria-hidden', 'true')
    document.body.appendChild(el)
  }
  return el
}

function runScoped(apply: () => void): boolean {
  const start = scopedTransition(liveSentinel() ?? document.documentElement)
  if (!start) return false
  let ran = false
  try {
    const running = start(() => {
      ran = true
      apply()
      return afterUpdate()
    })
    void running.finished.catch(() => {})
    return true
  } catch {
    return ran
  }
}

// Clicking Live. Home's copy lifts; Play and Learn keep the clock and hand
// their panels to the same lift. The keyboard rise itself is painted on the
// live canvas (see PianoRollRenderer.playLiveArrival) so a key still sounds.
export function enterLiveView(from: string, apply: () => void, onFinish?: () => void): void {
  const reduced = prefersReducedMotion()
  if (isModeCrossfade(from, 'live')) preserveRoll = true
  const gen = beginMotion()
  clearMotionNodes()
  document.documentElement.dataset.vt = reduced ? 'reduced' : 'live'
  let settled = false
  const finish = (): void => {
    if (settled || gen !== motionGen) return
    settled = true
    window.clearTimeout(clearTimer)
    delete document.documentElement.dataset.vtApi
    const vt = document.documentElement.dataset.vt
    if (vt === 'live') parkHiddenDropzone()
    if (vt === 'live' || vt === 'reduced') delete document.documentElement.dataset.vt
    onFinish?.()
  }
  const budget = reduced ? VIEW_REDUCED_MS : LIVE_IN_END_MS
  if (!reduced && runScoped(apply)) {
    scheduleClear(gen, budget + 40, finish)
    return
  }
  apply()
  scheduleClear(gen, budget + 40, finish)
}

// Live back to Home. The keyboard sinks on the canvas; the start copy rises.
export function leaveLiveView(apply: () => void, onFinish?: () => void): void {
  const reduced = prefersReducedMotion()
  const gen = beginMotion()
  clearMotionNodes()
  document.documentElement.dataset.vt = reduced ? 'reduced' : 'live-out'
  let settled = false
  const finish = (): void => {
    if (settled || gen !== motionGen) return
    settled = true
    window.clearTimeout(clearTimer)
    delete document.documentElement.dataset.vtApi
    const vt = document.documentElement.dataset.vt
    if (vt === 'live-out' || vt === 'reduced') delete document.documentElement.dataset.vt
    onFinish?.()
  }
  const budget = reduced ? VIEW_REDUCED_MS : LIVE_OUT_MS
  if (!reduced && runScoped(apply)) {
    scheduleClear(gen, budget + 40, finish)
    return
  }
  apply()
  scheduleClear(gen, budget + 40, finish)
}
