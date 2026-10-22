// What the player learned about a pair of Piano M boards. DNA often forwards
// one message to every block, and a factory reset leaves both boards sending
// the same notes. The setup flow records which input is the right board, and
// whether the lights need the left and right script files.

import { jsonPersisted } from '../core/persistence'

export const PIANO_M_SETUP_KEY = 'midee.pianoMSetup'

export type LightAnswer = 'yes' | 'swapped' | 'both' | 'none'
export type SetupStep =
  | 'left'
  | 'right'
  | 'cluster'
  | 'confirm'
  | 'light-left'
  | 'light-right'
  | 'done'

export interface BoardHit {
  portId: string
  portName: string
  note: number
}

export interface InputDecision {
  samePort: boolean
  inputOffset: 0 | 24
  alreadyOffset: boolean
  clusteredWithoutOffset: boolean
}

export interface PianoMSetupRecord {
  deviceKey: string
  leftInputId: string
  rightInputId: string
  leftOutputId: string
  rightOutputId: string
  leftNote: number
  rightNote: number
  confirmLeft: number | null
  confirmRight: number | null
  samePort: boolean
  inputOffset: 0 | 24
  leftLight: LightAnswer | null
  rightLight: LightAnswer | null
  lightResult: 'ports' | 'files' | 'unknown'
  completed: boolean
}

interface SetupFile {
  byDevice: Record<string, PianoMSetupRecord>
}

const EMPTY: SetupFile = { byDevice: {} }
const LIGHTS: readonly LightAnswer[] = ['yes', 'swapped', 'both', 'none']

function isLight(value: unknown): value is LightAnswer {
  return typeof value === 'string' && (LIGHTS as readonly string[]).includes(value)
}

function noteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 127
    ? value
    : null
}

function parseRecord(key: string, value: unknown): PianoMSetupRecord | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<PianoMSetupRecord>
  if (typeof raw.leftInputId !== 'string' || typeof raw.rightInputId !== 'string') return null
  const leftNote = noteOrNull(raw.leftNote)
  const rightNote = noteOrNull(raw.rightNote)
  if (leftNote === null || rightNote === null) return null
  return {
    deviceKey: key,
    leftInputId: raw.leftInputId,
    rightInputId: raw.rightInputId,
    leftOutputId: typeof raw.leftOutputId === 'string' ? raw.leftOutputId : '',
    rightOutputId: typeof raw.rightOutputId === 'string' ? raw.rightOutputId : '',
    leftNote,
    rightNote,
    confirmLeft: noteOrNull(raw.confirmLeft),
    confirmRight: noteOrNull(raw.confirmRight),
    samePort: raw.samePort === true,
    inputOffset: raw.inputOffset === 24 ? 24 : 0,
    leftLight: isLight(raw.leftLight) ? raw.leftLight : null,
    rightLight: isLight(raw.rightLight) ? raw.rightLight : null,
    lightResult:
      raw.lightResult === 'ports' || raw.lightResult === 'files' ? raw.lightResult : 'unknown',
    completed: raw.completed === true,
  }
}

function migrate(raw: unknown): SetupFile {
  if (!raw || typeof raw !== 'object') return { byDevice: {} }
  const byDevice = (raw as { byDevice?: unknown }).byDevice
  if (!byDevice || typeof byDevice !== 'object') return { byDevice: {} }
  const next: Record<string, PianoMSetupRecord> = {}
  for (const [key, value] of Object.entries(byDevice)) {
    const record = parseRecord(key, value)
    if (record) next[key] = record
  }
  return { byDevice: next }
}

const persisted = jsonPersisted(PIANO_M_SETUP_KEY, EMPTY, migrate)

let store: SetupFile = persisted.load()
let liveRightId = ''
let liveOffset: 0 | 24 = 0
const listeners = new Set<() => void>()

function commit(next: SetupFile): void {
  store = next
  persisted.save(store)
  for (const fn of listeners) fn()
}

export function pianoMDeviceKey(ids: readonly string[]): string {
  return [...new Set(ids.filter((id) => id.length > 0))].sort().join('|')
}

export function notesShareRange(left: number, right: number): boolean {
  return Math.abs(right - left) <= 11
}

export function notesAlreadyOffset(left: number, right: number): boolean {
  const delta = right - left
  return delta >= 20 && delta <= 28
}

export function decideInputOffset(left: BoardHit, right: BoardHit): InputDecision {
  const samePort = left.portId === right.portId
  const alreadyOffset = notesAlreadyOffset(left.note, right.note)
  const sameNotes = notesShareRange(left.note, right.note)
  if (samePort) {
    return {
      samePort: true,
      inputOffset: 0,
      alreadyOffset,
      clusteredWithoutOffset: sameNotes && !alreadyOffset,
    }
  }
  if (alreadyOffset) {
    return {
      samePort: false,
      inputOffset: 0,
      alreadyOffset: true,
      clusteredWithoutOffset: false,
    }
  }
  if (sameNotes) {
    return {
      samePort: false,
      inputOffset: 24,
      alreadyOffset: false,
      clusteredWithoutOffset: false,
    }
  }
  return { samePort: false, inputOffset: 0, alreadyOffset: false, clusteredWithoutOffset: false }
}

// The port we flashed is the other board. Left test: it was the right one,
// so that port moves to the end. Right test: it was the left one, so that
// port moves to the front.
export function orderAfterLightAnswer(
  order: readonly string[],
  sentPortId: string,
  answer: LightAnswer,
  side: 'left' | 'right',
): string[] {
  if (answer !== 'swapped' || sentPortId.length === 0 || sentPortId === 'piano-m:all') {
    return [...order]
  }
  const others = order.filter((id) => id !== sentPortId)
  if (others.length === 0) return [...order]
  return side === 'left' ? [...others, sentPortId] : [sentPortId, ...others]
}

export function lightResultFor(answers: readonly (LightAnswer | null)[]): 'ports' | 'files' {
  return answers.some((answer) => answer === 'both' || answer === 'none') ? 'files' : 'ports'
}

export function getPianoMSetup(deviceKey: string): PianoMSetupRecord | null {
  if (!deviceKey) return null
  return store.byDevice[deviceKey] ?? null
}

export function subscribePianoMSetup(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function applyLive(record: PianoMSetupRecord): void {
  if (!record.samePort && record.inputOffset === 24 && record.rightInputId) {
    liveRightId = record.rightInputId
    liveOffset = 24
    return
  }
  if (liveRightId === record.rightInputId || liveRightId === record.leftInputId) {
    liveRightId = ''
    liveOffset = 0
  }
}

export function savePianoMSetup(record: PianoMSetupRecord): PianoMSetupRecord {
  commit({ byDevice: { ...store.byDevice, [record.deviceKey]: record } })
  applyLive(record)
  return record
}

export function syncLiveInputOffset(inputIds: readonly string[]): void {
  const record = getPianoMSetup(pianoMDeviceKey(inputIds))
  if (!record) {
    liveRightId = ''
    liveOffset = 0
    return
  }
  applyLive(record)
}

export function applyPianoMInputPitch(portId: string, raw: number): number {
  const shift = liveOffset === 24 && portId === liveRightId ? 24 : 0
  return Math.max(0, Math.min(127, Math.round(raw) + shift))
}

export function reloadPianoMSetup(): SetupFile {
  store = persisted.load()
  liveRightId = ''
  liveOffset = 0
  return store
}

export function resetPianoMSetupForTests(): void {
  store = { byDevice: {} }
  persisted.save(store)
  liveRightId = ''
  liveOffset = 0
}
