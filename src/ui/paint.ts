// Appearance choices that scenes share: how notes are coloured, how soft they
// look, which wood the case uses, and whether motion stays calm. Persisted
// separately from the theme id so Golden Hour and Rainy Study can both use them.

export type NoteColorBy = 'hand' | 'finger'
export type NoteLook = 'soft' | 'flat'
export type WoodId = 'walnut' | 'oak' | 'cream'

export interface PaintPrefs {
  colorBy: NoteColorBy
  noteLook: NoteLook
  wood: WoodId
  keyLabels: boolean
  calm: boolean
}

export const WOOD: Record<WoodId, { light: number; dark: number }> = {
  walnut: { light: 0x9a6640, dark: 0x5e3b24 },
  oak: { light: 0xc4a574, dark: 0x8a6a3e },
  cream: { light: 0xe7d3b8, dark: 0xc4a882 },
}

const KEY = 'midee.paint'
const listeners = new Set<() => void>()

const DEFAULTS: PaintPrefs = {
  colorBy: 'hand',
  noteLook: 'soft',
  wood: 'walnut',
  keyLabels: true,
  calm: true,
}

function read(): PaintPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<PaintPrefs>
    return {
      colorBy: parsed.colorBy === 'finger' ? 'finger' : 'hand',
      noteLook: parsed.noteLook === 'flat' ? 'flat' : 'soft',
      wood: parsed.wood === 'oak' || parsed.wood === 'cream' ? parsed.wood : 'walnut',
      keyLabels: parsed.keyLabels !== false,
      calm: parsed.calm !== false,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

let current = read()

export function paintPrefs(): PaintPrefs {
  return current
}

export function applyPaintDataset(prefs: PaintPrefs = current): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.colorBy = prefs.colorBy
  root.dataset.noteLook = prefs.noteLook
  root.dataset.wood = prefs.wood
  root.dataset.keyLabels = prefs.keyLabels ? 'on' : 'off'
  root.dataset.calm = prefs.calm ? 'on' : 'off'
}

export function setPaintPrefs(patch: Partial<PaintPrefs>): PaintPrefs {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // private mode
  }
  applyPaintDataset(current)
  for (const listener of listeners) listener()
  document.dispatchEvent(new CustomEvent('midee-paint'))
  return current
}

export function subscribePaint(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

applyPaintDataset()
