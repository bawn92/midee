import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js'
import { useApp } from '../store/AppCtx'
import { LandingHero } from './LandingHero'
import { MidiConnect } from './MidiConnect'
import { bootRoute, type LandingRoute, markStarted, normalizePath, readStarted } from './route'

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function readBoot(): LandingRoute {
  const started = readStarted()
  const boot = bootRoute(location.pathname, location.search, location.hash, started)
  if (boot.replace && location.pathname + location.search + location.hash !== boot.replace) {
    history.replaceState(null, '', boot.replace)
  }
  document.documentElement.dataset.route = boot.route.kind === 'hero' ? 'hero' : 'app'
  return boot.route
}

export function LandingGate() {
  const { store } = useApp()
  const [route, setRoute] = createSignal<LandingRoute>(readBoot())
  const [heroMounted, setHeroMounted] = createSignal(route().kind === 'hero')
  const [rush, setRush] = createSignal(false)
  const [deferSheet, setDeferSheet] = createSignal(false)
  let navToken = 0
  const timers: number[] = []

  const later = (ms: number, fn: () => void): void => {
    timers.push(window.setTimeout(fn, ms))
  }

  const clearTimers = (): void => {
    for (const id of timers) window.clearTimeout(id)
    timers.length = 0
  }

  const clearMotion = (): void => {
    document.documentElement.classList.remove('landing-leave', 'landing-enter', 'landing-cross')
    setRush(false)
    setDeferSheet(false)
  }

  const syncFromLocation = (): void => {
    clearTimers()
    clearMotion()
    const next = readBoot()
    setRoute(next)
    setHeroMounted(next.kind === 'hero')
  }

  onMount(() => {
    window.addEventListener('popstate', syncFromLocation)
    onCleanup(() => {
      window.removeEventListener('popstate', syncFromLocation)
      clearTimers()
      clearMotion()
    })
  })

  // A note or an opened file leaves Home while the hero is up. Drop the hero
  // instead of leaving it painted over Live or Play.
  createEffect(() => {
    if (store.state.mode === 'home') return
    if (!heroMounted()) return
    markStarted()
    clearTimers()
    clearMotion()
    const path = normalizePath(location.pathname)
    if (path === '/' || path === '/welcome') {
      history.replaceState(null, '', `/start${location.search}${location.hash}`)
    }
    document.documentElement.dataset.route = 'app'
    setRoute({ kind: 'home', connectMidi: false })
    setHeroMounted(false)
  })

  const leave = (connect: boolean): void => {
    markStarted()
    const token = ++navToken
    clearTimers()
    const url = connect ? '/start?connect=midi' : '/start'
    const commit = (): void => {
      if (token !== navToken) return
      history.pushState({ landing: 1 }, '', url)
      document.documentElement.dataset.route = 'app'
      setRoute({ kind: 'home', connectMidi: connect })
    }
    const finish = (): void => {
      if (token !== navToken) return
      setHeroMounted(false)
      clearMotion()
    }

    if (reducedMotion()) {
      document.documentElement.classList.add('landing-cross')
      later(150, () => {
        commit()
        finish()
      })
      return
    }

    if (connect) {
      setDeferSheet(true)
      document.documentElement.classList.add('landing-cross')
      later(200, commit)
      later(420, finish)
      return
    }

    setRush(true)
    document.documentElement.classList.add('landing-leave')
    later(450, () => {
      document.documentElement.classList.add('landing-enter')
      commit()
    })
    later(1000, finish)
  }

  const midiOpen = (): boolean => {
    const current = route()
    return current.kind === 'home' && current.connectMidi
  }

  const closeMidi = (): void => {
    const path = normalizePath(location.pathname)
    if (path === '/start') history.replaceState(null, '', '/start')
    setDeferSheet(false)
    setRoute({ kind: 'home', connectMidi: false })
  }

  return (
    <>
      <Show when={heroMounted()}>
        <LandingHero rush={rush()} onStart={() => leave(false)} onPlug={() => leave(true)} />
      </Show>
      <Show when={midiOpen()}>
        <MidiConnect defer={deferSheet()} onClose={closeMidi} />
      </Show>
    </>
  )
}
