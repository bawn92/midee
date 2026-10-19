import { Show } from 'solid-js'
import { Deadmau5Chrome } from './deadmau5/Deadmau5Chrome'
import { SHOW_FPS } from './env'
import { LandingGate } from './landing/LandingGate'
import { ModeSwitch } from './modes/ModeSwitch'
import { FpsOverlay } from './ui/FpsOverlay'

// Solid-owned root. Hosts <ModeSwitch/> (mode shells return null until
// T5–T8 fill them); <Portal/> + <Toast/> land with T17.
export function AppRoot() {
  return (
    <>
      <ModeSwitch />
      <LandingGate />
      <Deadmau5Chrome />
      <Show when={SHOW_FPS}>
        <FpsOverlay />
      </Show>
    </>
  )
}
