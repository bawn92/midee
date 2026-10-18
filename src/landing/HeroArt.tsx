import { createEffect, createSignal, For, onCleanup, onMount } from 'solid-js'
import { blackKeyAfter, frameAt, type HeroSize, layoutFor, PARKED_TIME_S } from './notes'

const PHONE_QUERY = '(max-width: 759px)'
const REDUCE_QUERY = '(prefers-reduced-motion: reduce)'

function breath(time: number): number {
  return 0.75 + 0.15 * Math.sin((time * Math.PI * 2) / 0.28)
}

export function HeroArt(props: { rush: boolean }) {
  const [size, setSize] = createSignal<HeroSize>(
    window.matchMedia(PHONE_QUERY).matches ? 'phone' : 'desktop',
  )
  const reduced = window.matchMedia(REDUCE_QUERY).matches
  let rush = false
  let notesHost: HTMLDivElement | undefined
  let glowEl: HTMLDivElement | undefined
  const keyLights: HTMLSpanElement[] = []

  createEffect(() => {
    rush = props.rush
  })

  onMount(() => {
    const phoneMq = window.matchMedia(PHONE_QUERY)
    const onPhone = (): void => {
      setSize(phoneMq.matches ? 'phone' : 'desktop')
    }
    phoneMq.addEventListener('change', onPhone)

    let raf = 0
    let last = performance.now()
    let elapsed = 3.6

    const paint = (time: number): void => {
      const host = notesHost
      if (!host) return
      const current = size()
      const layout = layoutFor(current)
      const frame = frameAt(time, current)
      const highwayPx = host.clientHeight || layout.highway
      const widthPx = host.clientWidth || 1
      const lanePx = widthPx / layout.lanes
      const children = host.children
      for (let i = 0; i < children.length; i++) {
        const el = children[i] as HTMLElement
        const note = frame.notes[i]
        if (!note?.visible) {
          el.style.opacity = '0'
          continue
        }
        const noteW = lanePx * 0.72
        const x = (note.lane + 0.5) * lanePx - noteW / 2
        const y = (note.y / layout.highway) * highwayPx
        el.style.opacity = note.opacity.toFixed(3)
        el.style.width = `${noteW}px`
        el.style.height = `${(note.height / layout.highway) * highwayPx}px`
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`
        el.dataset.hand = note.hand
      }
      for (let lane = 0; lane < layout.lanes; lane++) {
        const light = keyLights[lane]
        const spec = frame.lights[lane]
        if (!light || !spec) continue
        light.style.opacity = (spec.amount * 0.92).toFixed(3)
        light.dataset.hand = spec.hand
      }
      if (glowEl) {
        const pulse = reduced ? 0.7 : breath(time)
        glowEl.style.opacity = (frame.glow <= 0 ? 0 : pulse * frame.glow).toFixed(3)
      }
    }

    paint(reduced ? PARKED_TIME_S : elapsed)
    if (!reduced) {
      const loop = (now: number): void => {
        if (!document.hidden) {
          const dt = Math.min(0.05, (now - last) / 1000)
          elapsed += dt * (rush ? 3 : 1)
          paint(elapsed)
        }
        last = now
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    }

    onCleanup(() => {
      phoneMq.removeEventListener('change', onPhone)
      cancelAnimationFrame(raf)
    })
  })

  return (
    <div class="hero-art" aria-hidden="true" data-size={size()}>
      <div class="hero-highway" data-lanes={size() === 'phone' ? 10 : 14}>
        <div class="hero-notes" ref={notesHost}>
          <For each={Array.from({ length: size() === 'phone' ? 10 : 14 }, (_, i) => i)}>
            {() => <div class="hero-note" />}
          </For>
        </div>
        <div class="hero-glow" ref={glowEl} />
      </div>
      <div class="hero-kb">
        <div class="hero-kb-sheen" />
        <div class="hero-felt" />
        <div class="hero-whites">
          <For each={Array.from({ length: size() === 'phone' ? 10 : 14 }, (_, i) => i)}>
            {(lane) => (
              <div class="hero-white">
                <span class="hero-white-light" ref={(el) => (keyLights[lane] = el)} />
              </div>
            )}
          </For>
          <div class="hero-blacks">
            <For each={blackKeyAfter(size() === 'phone' ? 10 : 14)}>
              {(after) => (
                <span
                  class="hero-black"
                  style={{
                    left: `${((after + 1 - 0.29) / (size() === 'phone' ? 10 : 14)) * 100}%`,
                    width: `${(0.58 / (size() === 'phone' ? 10 : 14)) * 100}%`,
                  }}
                />
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  )
}
