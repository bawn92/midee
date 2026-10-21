// ROLI Piano M and LUMI Keys share one USB MIDI port when boards are snapped
// together. Each board is 24 keys. Detection is the port name and manufacturer
// only — a Roland keyboard contains the letters "roli" and must stay quiet.

import {
  controllerKeyLow,
  DEFAULT_CONTROLLER_LOW,
  getKeyboardRange,
  PIANO_M_KEYS_PER_BOARD,
} from '../core/keyboardRange'
import { jsonPersisted } from '../core/persistence'

export const PIANO_M_GUIDE_KEY = 'midee.pianoMGuide'

export type PianoMBoards = 1 | 2 | 3

export interface PianoMGuidePrefs {
  boards: PianoMBoards | null
  dismissed: boolean
  suggest: boolean
  suggestDismissed: boolean
}

const DEFAULT_GUIDE: PianoMGuidePrefs = {
  boards: null,
  dismissed: false,
  suggest: false,
  suggestDismissed: false,
}

function isBoards(value: unknown): value is PianoMBoards {
  return value === 1 || value === 2 || value === 3
}

function migrateGuide(raw: unknown): PianoMGuidePrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_GUIDE }
  const parsed = raw as Partial<PianoMGuidePrefs>
  const suggestDismissed = parsed.suggestDismissed === true
  return {
    boards: isBoards(parsed.boards) ? parsed.boards : null,
    dismissed: parsed.dismissed === true,
    suggest: parsed.suggest === true && !suggestDismissed,
    suggestDismissed,
  }
}

const persisted = jsonPersisted(PIANO_M_GUIDE_KEY, { ...DEFAULT_GUIDE }, migrateGuide)

type GuideListener = (prefs: PianoMGuidePrefs) => void
type DetectListener = (detected: boolean) => void

let guide: PianoMGuidePrefs = persisted.load()
let detected = false
const guideListeners = new Set<GuideListener>()
const detectListeners = new Set<DetectListener>()

function commitGuide(next: PianoMGuidePrefs): PianoMGuidePrefs {
  if (
    next.boards === guide.boards &&
    next.dismissed === guide.dismissed &&
    next.suggest === guide.suggest &&
    next.suggestDismissed === guide.suggestDismissed
  ) {
    return guide
  }
  guide = next
  persisted.save(guide)
  for (const fn of guideListeners) fn(guide)
  return guide
}

export function isPianoMPortName(name: string, manufacturer = ''): boolean {
  const blob = `${name} ${manufacturer}`.toLowerCase()
  if (/\bpiano\s*m\b/.test(blob)) return true
  if (/\blumi\b/.test(blob)) return true
  // Whole word only. "Roland" shares the letters and is a different maker.
  return /\broli\b/.test(blob)
}

export function isPianoMDetected(): boolean {
  return detected
}

export function setPianoMDetected(next: boolean): void {
  if (next === detected) return
  detected = next
  for (const fn of detectListeners) fn(detected)
}

export function subscribePianoMDetected(fn: DetectListener): () => void {
  detectListeners.add(fn)
  return () => detectListeners.delete(fn)
}

export function getPianoMGuide(): PianoMGuidePrefs {
  return guide
}

export function subscribePianoMGuide(fn: GuideListener): () => void {
  guideListeners.add(fn)
  return () => guideListeners.delete(fn)
}

export function rememberPianoMBoards(boards: PianoMBoards): PianoMGuidePrefs {
  return commitGuide({
    ...guide,
    boards,
    suggest: boards >= 2 ? false : guide.suggest,
  })
}

export function dismissPianoMGuide(): PianoMGuidePrefs {
  return commitGuide({ ...guide, dismissed: true })
}

export function reopenPianoMGuide(): PianoMGuidePrefs {
  return commitGuide({ ...guide, dismissed: false, suggestDismissed: false })
}

export function dismissPianoMSuggest(): PianoMGuidePrefs {
  return commitGuide({ ...guide, suggest: false, suggestDismissed: true })
}

// A note at or above the first board's top key, while the window is still one
// board, means a second Piano M is snapped on. The caller decides whether to
// change the range. A dismissed suggestion stays quiet.
export function noticePianoMNote(pitch: number): void {
  if (!detected || !Number.isFinite(pitch)) return
  if (guide.suggestDismissed || guide.suggest) return
  if (guide.boards != null && guide.boards >= 2) return
  const range = getKeyboardRange()
  if (range.size >= 48) return
  if (range.size !== PIANO_M_KEYS_PER_BOARD && guide.boards !== 1) return
  const low = controllerKeyLow(range) ?? DEFAULT_CONTROLLER_LOW
  if (Math.round(pitch) < low + PIANO_M_KEYS_PER_BOARD) return
  commitGuide({ ...guide, suggest: true })
}

// 48 and 72 are two and three boards. Other sizes, and any keyboard that is
// not a Piano M, draw no board segments.
export function pianoMSegmentCount(size: number, connected: boolean): 0 | 2 | 3 {
  if (!connected) return 0
  if (size === 48) return 2
  if (size === 72) return 3
  return 0
}

export function reloadPianoMGuide(): PianoMGuidePrefs {
  guide = persisted.load()
  return guide
}

export function resetPianoMForTests(): void {
  detected = false
  guide = { ...DEFAULT_GUIDE }
  persisted.save(guide)
}
