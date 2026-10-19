// Keyboard style is independent of the scene. Ten role colours resolve per
// scene (Golden Hour / Rainy Study). KEYBOARDS.md is the source of the values.

export type KeyboardStyleId = 'walnut' | 'grand' | 'oak' | 'vintage' | 'synth' | 'flat'

export const KEYBOARD_STYLES: readonly KeyboardStyleId[] = [
  'walnut',
  'grand',
  'oak',
  'vintage',
  'synth',
  'flat',
]

export interface KeyboardPalette {
  id: KeyboardStyleId
  name: string
  caseLight: number
  caseDark: number
  ivory: number
  ivorySide: number
  ebony: number
  ebonySide: number
  felt: number
  strip: number
  gap: number
  highlight: number
  grain: number
  feltPx: number
  lacquer: boolean
  led: boolean
  shade: boolean
  hairline: boolean
  pressRh: number
  pressLh: number
  noteRh: number
  noteLh: number
}

const STORAGE_KEY = 'midee.keyboardStyle'

type SceneKey = 'golden-hour' | 'rainy-study'

interface Role {
  caseLight: number
  caseDark: number
  ivory: number
  ivorySide: number
  ebony: number
  ebonySide: number
  felt: number
  strip: number
  highlight: number
}

const hex = (value: string): number => Number.parseInt(value, 16)

const ROLES: Record<KeyboardStyleId, Record<SceneKey, Role>> = {
  walnut: {
    'golden-hour': {
      caseLight: hex('9A6640'),
      caseDark: hex('5E3B24'),
      ivory: hex('F6EBDA'),
      ivorySide: hex('DCCBB2'),
      ebony: hex('3E2A1F'),
      ebonySide: hex('2E1F17'),
      felt: hex('8E3B32'),
      strip: hex('8E3B32'),
      highlight: hex('FFE6C8'),
    },
    'rainy-study': {
      caseLight: hex('4A372C'),
      caseDark: hex('21170F'),
      ivory: hex('E9EEF2'),
      ivorySide: hex('C2CBD3'),
      ebony: hex('1C2026'),
      ebonySide: hex('12151A'),
      felt: hex('3E2A33'),
      strip: hex('3E2A33'),
      highlight: hex('FFE6C8'),
    },
  },
  grand: {
    'golden-hour': {
      caseLight: hex('3A3A40'),
      caseDark: hex('0E0E11'),
      ivory: hex('FBF8F2'),
      ivorySide: hex('D8D2C8'),
      ebony: hex('141416'),
      ebonySide: hex('0C0C0E'),
      felt: hex('7A1E22'),
      strip: hex('7A1E22'),
      highlight: hex('FFFFFF'),
    },
    'rainy-study': {
      caseLight: hex('343A44'),
      caseDark: hex('0B0E13'),
      ivory: hex('F2F5F8'),
      ivorySide: hex('C9D0D8'),
      ebony: hex('12151A'),
      ebonySide: hex('0A0C10'),
      felt: hex('5A1E2A'),
      strip: hex('5A1E2A'),
      highlight: hex('DCEBFF'),
    },
  },
  oak: {
    'golden-hour': {
      caseLight: hex('E3C9A0'),
      caseDark: hex('B8945F'),
      ivory: hex('FFFDF8'),
      ivorySide: hex('DDD5C8'),
      ebony: hex('3B3430'),
      ebonySide: hex('2A2522'),
      felt: hex('9AA38F'),
      strip: hex('9AA38F'),
      highlight: hex('FFE6C8'),
    },
    'rainy-study': {
      caseLight: hex('CFC2AE'),
      caseDark: hex('9C8C74'),
      ivory: hex('F4F6F8'),
      ivorySide: hex('CDD3D9'),
      ebony: hex('343638'),
      ebonySide: hex('242628'),
      felt: hex('8796A0'),
      strip: hex('8796A0'),
      highlight: hex('FFE6C8'),
    },
  },
  vintage: {
    'golden-hour': {
      caseLight: hex('7A5236'),
      caseDark: hex('3E2615'),
      ivory: hex('EADBB8'),
      ivorySide: hex('C4B08A'),
      ebony: hex('2B231D'),
      ebonySide: hex('1A1512'),
      felt: hex('8C2F2B'),
      strip: hex('8C2F2B'),
      highlight: hex('FFE6C8'),
    },
    'rainy-study': {
      caseLight: hex('5C4636'),
      caseDark: hex('2C2018'),
      ivory: hex('DDD6C4'),
      ivorySide: hex('B4AC98'),
      ebony: hex('26221F'),
      ebonySide: hex('161412'),
      felt: hex('6E2E36'),
      strip: hex('6E2E36'),
      highlight: hex('FFE6C8'),
    },
  },
  synth: {
    'golden-hour': {
      caseLight: hex('3A3D44'),
      caseDark: hex('1C1E22'),
      ivory: hex('E4E6E9'),
      ivorySide: hex('B9BDC3'),
      ebony: hex('25272C'),
      ebonySide: hex('16181C'),
      felt: hex('101113'),
      strip: hex('2C2F36'),
      highlight: hex('FFFFFF'),
    },
    'rainy-study': {
      caseLight: hex('353A42'),
      caseDark: hex('191C21'),
      ivory: hex('DDE2E7'),
      ivorySide: hex('AFB6BE'),
      ebony: hex('22252B'),
      ebonySide: hex('14161A'),
      felt: hex('101113'),
      strip: hex('2A2E36'),
      highlight: hex('DCEBFF'),
    },
  },
  flat: {
    'golden-hour': {
      caseLight: hex('F3EEE6'),
      caseDark: hex('F3EEE6'),
      ivory: hex('FFFFFF'),
      ivorySide: hex('FFFFFF'),
      ebony: hex('2E2A27'),
      ebonySide: hex('2E2A27'),
      felt: hex('D9D0C3'),
      strip: hex('D9D0C3'),
      highlight: hex('FFFFFF'),
    },
    'rainy-study': {
      caseLight: hex('E3E8EC'),
      caseDark: hex('E3E8EC'),
      ivory: hex('F7F9FB'),
      ivorySide: hex('F7F9FB'),
      ebony: hex('2A2F35'),
      ebonySide: hex('2A2F35'),
      felt: hex('C5CDD4'),
      strip: hex('C5CDD4'),
      highlight: hex('FFFFFF'),
    },
  },
}

const AFTER_SYNTH: Role = {
  caseLight: hex('23252D'),
  caseDark: hex('0E0F13'),
  ivory: hex('E3E6EE'),
  ivorySide: hex('A3A8B5'),
  ebony: hex('17181D'),
  ebonySide: hex('0A0A0D'),
  felt: hex('1A1221'),
  strip: hex('22E8FF'),
  highlight: hex('F2FFFF'),
}

const AFTER_PRESS = {
  rh: hex('0AA3C2'),
  lh: hex('C41E7C'),
  noteRh: hex('22E8FF'),
  noteLh: hex('FF3FA4'),
}

const PRESS: Record<SceneKey, { rh: number; lh: number; noteRh: number; noteLh: number }> = {
  'golden-hour': {
    rh: hex('A86A1E'),
    lh: hex('9E5654'),
    noteRh: hex('E6A94F'),
    noteLh: hex('D9908F'),
  },
  'rainy-study': {
    rh: hex('1F7891'),
    lh: hex('5A4AAE'),
    noteRh: hex('7BA3B0'),
    noteLh: hex('C4897A'),
  },
}

const NAMES: Record<KeyboardStyleId, string> = {
  walnut: 'Walnut upright',
  grand: 'Concert grand',
  oak: 'Scandi oak',
  vintage: 'Vintage ivory',
  synth: 'Synth matte',
  flat: 'Minimal flat',
}

const DECOR: Record<
  KeyboardStyleId,
  {
    grain: number
    feltPx: number
    lacquer: boolean
    led: boolean
    shade: boolean
    hairline: boolean
  }
> = {
  walnut: { grain: 0.6, feltPx: 6, lacquer: false, led: false, shade: true, hairline: false },
  grand: { grain: 0, feltPx: 6, lacquer: true, led: false, shade: true, hairline: false },
  oak: { grain: 0.35, feltPx: 6, lacquer: false, led: false, shade: true, hairline: false },
  vintage: { grain: 0.8, feltPx: 9, lacquer: false, led: false, shade: true, hairline: false },
  synth: { grain: 0, feltPx: 6, lacquer: false, led: true, shade: true, hairline: false },
  flat: { grain: 0, feltPx: 1, lacquer: false, led: false, shade: false, hairline: true },
}

const listeners = new Set<(id: KeyboardStyleId) => void>()
let current: KeyboardStyleId = readStored()

function readStored(): KeyboardStyleId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && (KEYBOARD_STYLES as readonly string[]).includes(raw)) return raw as KeyboardStyleId
  } catch {
    // Private mode can reject the read. Walnut is the default either way.
  }
  return 'walnut'
}

export function keyboardStyleId(): KeyboardStyleId {
  return current
}

export function setKeyboardStyle(id: KeyboardStyleId): void {
  if (current === id) return
  current = id
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // The in-memory style still applies for this visit.
  }
  publishKeyboardStyle()
  for (const fn of listeners) fn(id)
}

function publishKeyboardStyle(): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.keyboard = current
}

publishKeyboardStyle()

export function subscribeKeyboardStyle(fn: (id: KeyboardStyleId) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function keyboardPalette(themeId: string, id: KeyboardStyleId = current): KeyboardPalette {
  const after = themeId === 'after-hours'
  const scene: SceneKey = themeId === 'rainy-study' ? 'rainy-study' : 'golden-hour'
  const rainy = ROLES[id]['rainy-study']
  const role = after ? (id === 'synth' ? AFTER_SYNTH : rainy) : ROLES[id][scene]
  const decor = DECOR[id]
  const press = after ? AFTER_PRESS : PRESS[scene]
  return {
    id,
    name: NAMES[id],
    ...role,
    gap: role.caseDark,
    grain: decor.grain,
    feltPx: decor.feltPx,
    lacquer: decor.lacquer,
    led: decor.led,
    shade: decor.shade,
    hairline: decor.hairline,
    pressRh: press.rh,
    pressLh: press.lh,
    noteRh: press.noteRh,
    noteLh: press.noteLh,
  }
}

export function keyboardHighlightAlpha(id: KeyboardStyleId): number {
  return id === 'grand' ? 0.28 : 0.25
}

export function keyboardStyleName(id: KeyboardStyleId): string {
  return NAMES[id]
}
