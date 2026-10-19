import type { AppServices } from '../core/services'
import type { ComputerKeyboardInput } from '../midi/ComputerKeyboardInput'
import type { MidiInputManager } from '../midi/MidiInputManager'
import type { AppMode } from '../store/state'
import type { DropZone } from '../ui/DropZone'
import type { TrackPanel } from '../ui/TrackPanel'

// Dependency bag passed to `LearnController` at construction. When that
// class dissolves (T2b), this interface migrates to createApp closure
// parameters and disappears.
export interface ModeContext {
  services: AppServices
  overlay: HTMLElement
  trackPanel: TrackPanel
  dropzone: DropZone
  keyboardInput: ComputerKeyboardInput
  midiInput: MidiInputManager
  resetInteractionState: () => void
  openFilePicker: () => void
  primeInteractiveAudio: () => void
  // Push the currently-loaded Learn song into the global topbar. Pass `null`
  // to clear it (e.g., on `exit`). Implemented as a callback rather than a
  // direct Controls reference so the import graph stays one-way (modes
  // never reach into UI directly).
  setLearnFileName: (name: string | null) => void
  // Address of a `/learn/<id>` visit, consumed once when Learn mounts.
  takePendingLearnAddress?: () => string | null
  // The piece or exercise Learn is showing, so the URL can follow it.
  // `null` is a file with no public id. A miss falls back to the last sample.
  onLearnAddress?: (id: string | null) => void
  onLearnMiss?: (id: string) => void
}

// Live-mode entry options. Used by `setNextLiveOpts()` in LiveMode to
// influence the next mount's side effects (primeAudio=false when the
// transition is a quiet recovery rather than a user gesture).
export interface EnterOptions {
  primeAudio?: boolean
}

// Static per-mode flag. Callers that need to gate on "does the user's
// live playing get captured?" read from this table. Stays authoritative
// for all four modes.
export const MODE_CAPTURES_LIVE: Record<AppMode, boolean> = {
  home: true,
  play: true,
  live: true,
  learn: false,
}
