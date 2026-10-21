// Each snapped Piano M or LUMI board is its own Web MIDI output, often with
// the same name. The browser lists those ports in its own order. On a DNA
// chain that is usually the USB board first, then each board to the right.
// That order was not checked on hardware, so Identify and Swap let the
// player confirm it. The saved order is the left-to-right board index.

import { jsonPersisted } from '../core/persistence'
import { isPianoMPortName } from './pianoM'

export const PIANO_M_ALL_ID = 'piano-m:all'
export const PIANO_M_PORTS_KEY = 'midee.pianoMPorts'

export interface PianoMPortPrefs {
  order: string[]
  choseOutput: boolean
}

export interface PianoMPortInfo {
  id: string
  name: string
  manufacturer: string
}

const DEFAULT_PORTS: PianoMPortPrefs = { order: [], choseOutput: false }

function migratePorts(raw: unknown): PianoMPortPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PORTS, order: [] }
  const parsed = raw as Partial<PianoMPortPrefs>
  const order = Array.isArray(parsed.order)
    ? parsed.order.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : []
  return { order, choseOutput: parsed.choseOutput === true }
}

const persisted = jsonPersisted(PIANO_M_PORTS_KEY, { ...DEFAULT_PORTS, order: [] }, migratePorts)

let prefs: PianoMPortPrefs = persisted.load()

function commit(next: PianoMPortPrefs): PianoMPortPrefs {
  prefs = next
  persisted.save(prefs)
  return prefs
}

export function getPianoMPortPrefs(): PianoMPortPrefs {
  return prefs
}

export function reloadPianoMPorts(): PianoMPortPrefs {
  prefs = persisted.load()
  return prefs
}

export function resetPianoMPortsForTests(): void {
  prefs = { order: [], choseOutput: false }
  persisted.save(prefs)
}

export function markPianoMOutputChosen(): PianoMPortPrefs {
  if (prefs.choseOutput) return prefs
  return commit({ ...prefs, choseOutput: true })
}

function orderedIds(connectedIds: readonly string[], saved: readonly string[]): string[] {
  const seen = new Set<string>()
  const display: string[] = []
  for (const id of saved) {
    if (!connectedIds.includes(id) || seen.has(id)) continue
    seen.add(id)
    display.push(id)
  }
  for (const id of connectedIds) {
    if (seen.has(id)) continue
    seen.add(id)
    display.push(id)
  }
  return display
}

// Connected ids stay in the saved left-to-right order. New ids append in the
// order Web MIDI enumerated them. Unplugged ids stay in that order so a
// replug keeps a swap.
export function rememberPianoMPorts(connectedIds: readonly string[]): string[] {
  const seen = new Set<string>()
  const stored: string[] = []
  for (const id of prefs.order) {
    if (seen.has(id)) continue
    seen.add(id)
    stored.push(id)
  }
  for (const id of connectedIds) {
    if (seen.has(id)) continue
    seen.add(id)
    stored.push(id)
  }
  if (stored.join('\0') !== prefs.order.join('\0')) commit({ ...prefs, order: stored })
  return orderedIds(connectedIds, stored)
}

export function pianoMDisplayOrder(connectedIds: readonly string[]): string[] {
  return orderedIds(connectedIds, prefs.order)
}

export function swapPianoMPorts(connectedIds: readonly string[]): string[] {
  const current = pianoMDisplayOrder(connectedIds)
  const reversed = [...current].reverse()
  const vanished = prefs.order.filter((id) => !connectedIds.includes(id))
  commit({ ...prefs, order: [...reversed, ...vanished] })
  return reversed
}

export function pianoMPortsShareName(
  port: PianoMPortInfo,
  ports: readonly PianoMPortInfo[],
): boolean {
  if (!isPianoMPortName(port.name, port.manufacturer)) return false
  let count = 0
  for (const other of ports) {
    if (other.name !== port.name) continue
    if (!isPianoMPortName(other.name, other.manufacturer)) continue
    count += 1
    if (count >= 2) return true
  }
  return false
}
