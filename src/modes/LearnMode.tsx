import { onCleanup, onMount } from 'solid-js'
import { useApp } from '../store/AppCtx'
import type { LearnController } from './LearnController'

// Learn mode shell. LearnController is dynamic-imported on first entry —
// onMount awaits the chunk, then calls enter(). If the user navigates away
// before the chunk lands, the `cancelled` flag stops us from calling enter()
// against a controller no one's watching, and onCleanup is a no-op since
// `controller` is still null.
export function LearnMode() {
  const { ensureLearnController, services } = useApp()
  let controller: LearnController | null = null
  let cancelled = false
  onMount(() => {
    // Hide the shared roll before the Learn chunk arrives. Otherwise Live's
    // keyboard stays painted under the hub for the whole download.
    services.renderer.setVisible(false)
    void ensureLearnController().then((c) => {
      if (cancelled) {
        services.renderer.setVisible(true)
        return
      }
      controller = c
      controller.enter()
    })
  })
  onCleanup(() => {
    cancelled = true
    if (controller) controller.exit()
    else services.renderer.setVisible(true)
  })
  return null
}
