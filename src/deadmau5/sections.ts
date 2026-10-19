// Practice sections for deadmau5 "Strobe" (the sample "Untitled in G# minor").
// Bars are inclusive and 1-based. One bar is 2 seconds at 120 BPM in 4/4,
// the same bar the song guide uses. Edit this list to change the loops.
//
// The ending section runs through bar 241. The guide's loopEndBar (221) only
// marks the chord-loop highlight inside the ending, so it is not the loop.

import { untitledGSharpMinor } from '../songGuide/untitledGSharpMinor'

export const STROBE_SAMPLE_ID = untitledGSharpMinor.id
export const DEADMAU5_SECTION_KEY = 'midee.deadmau5Section'
export const SECONDS_PER_BAR = untitledGSharpMinor.secondsPerBar
export const BAR_COUNT = untitledGSharpMinor.barCount

export interface PracticeSection {
  id: string
  name: string
  startBar: number
  endBar: number
  color: string
}

export const STROBE_SECTIONS: readonly PracticeSection[] = [
  { id: 'intro', name: 'Intro', startBar: 1, endBar: 10, color: '#94a3b8' },
  { id: 'melody', name: 'Melody', startBar: 11, endBar: 26, color: '#38bdf8' },
  {
    id: 'moving',
    name: 'Melody, moving left hand',
    startBar: 27,
    endBar: 43,
    color: '#818cf8',
  },
  { id: 'octaves', name: 'Octave build-up', startBar: 44, endBar: 61, color: '#fbbf24' },
  { id: 'intro-2', name: 'Intro again', startBar: 62, endBar: 71, color: '#94a3b8' },
  { id: 'melody-2', name: 'Melody again', startBar: 72, endBar: 87, color: '#38bdf8' },
  {
    id: 'moving-2',
    name: 'Moving left hand again',
    startBar: 88,
    endBar: 104,
    color: '#818cf8',
  },
  {
    id: 'octaves-2',
    name: 'Octave build-up again',
    startBar: 105,
    endBar: 121,
    color: '#fbbf24',
  },
  { id: 'rocking', name: 'Rocking pattern', startBar: 122, endBar: 158, color: '#34d399' },
  {
    id: 'rocking-2',
    name: 'Rocking pattern continues',
    startBar: 159,
    endBar: 178,
    color: '#2dd4bf',
  },
  { id: 'link', name: 'Link', startBar: 179, endBar: 188, color: '#fb7185' },
  { id: 'climax', name: 'Climax', startBar: 189, endBar: 213, color: '#f97316' },
  { id: 'ending', name: 'Ending', startBar: 214, endBar: 241, color: '#e879f9' },
]

export interface PracticePick {
  ids: string[]
  startBar: number
  endBar: number
  active: boolean
}

export function barStartTime(bar: number): number {
  return (bar - 1) * SECONDS_PER_BAR
}

export function barEndTime(bar: number): number {
  return bar * SECONDS_PER_BAR
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

export function sectionById(id: string): PracticeSection | null {
  return STROBE_SECTIONS.find((section) => section.id === id) ?? null
}

export function clampBars(startBar: number, endBar: number): { startBar: number; endBar: number } {
  const start = Math.max(1, Math.min(BAR_COUNT - 1, Math.round(startBar)))
  const end = Math.max(start + 1, Math.min(BAR_COUNT, Math.round(endBar)))
  return { startBar: start, endBar: end }
}

export function sectionsOverlapping(startBar: number, endBar: number): PracticeSection[] {
  return STROBE_SECTIONS.filter(
    (section) => section.startBar <= endBar && section.endBar >= startBar,
  )
}

// Ids must be neighbours in the section list. The span is the first bar of
// the earliest section through the last bar of the latest.
export function spanForIds(ids: readonly string[]): {
  ids: string[]
  startBar: number
  endBar: number
} | null {
  if (ids.length === 0) return null
  const indexes = ids.map((id) => STROBE_SECTIONS.findIndex((section) => section.id === id))
  if (indexes.some((index) => index < 0)) return null
  const sorted = [...indexes].sort((a, b) => a - b)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1]! + 1) return null
  }
  const first = STROBE_SECTIONS[sorted[0]!]!
  const last = STROBE_SECTIONS[sorted[sorted.length - 1]!]!
  return {
    ids: sorted.map((index) => STROBE_SECTIONS[index]!.id),
    startBar: first.startBar,
    endBar: last.endBar,
  }
}

export function pickFromIds(ids: readonly string[]): PracticePick | null {
  const span = spanForIds(ids)
  if (!span) return null
  return { ...span, active: true }
}

export function pickForBars(startBar: number, endBar: number): PracticePick {
  const bars = clampBars(startBar, endBar)
  const ids = sectionsOverlapping(bars.startBar, bars.endBar).map((section) => section.id)
  return { ids, ...bars, active: true }
}

// A click on the active span's neighbour grows it. Any other section
// replaces the span, which is how you switch without leaving the loop.
export function selectionAfterClick(currentIds: readonly string[], clicked: string): string[] {
  const hit = STROBE_SECTIONS.findIndex((section) => section.id === clicked)
  if (hit < 0) return [...currentIds]
  const indexes = currentIds
    .map((id) => STROBE_SECTIONS.findIndex((section) => section.id === id))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)
  if (indexes.length === 0) return [clicked]
  const first = indexes[0]!
  const last = indexes[indexes.length - 1]!
  if (hit === first - 1 || hit === last + 1) {
    return STROBE_SECTIONS.slice(Math.min(first, hit), Math.max(last, hit) + 1).map(
      (section) => section.id,
    )
  }
  return [clicked]
}

export function spanLabel(ids: readonly string[]): string {
  const sections = ids
    .map((id) => sectionById(id))
    .filter((section): section is PracticeSection => section !== null)
  if (sections.length === 0) return ''
  if (sections.length === 1) return sections[0]!.name
  return `${sections[0]!.name} – ${sections[sections.length - 1]!.name}`
}

function parseIdList(value: string | null): string[] | null {
  if (!value) return null
  const ids = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  return spanForIds(ids)?.ids ?? null
}

function parseBars(value: string | null): { startBar: number; endBar: number } | null {
  if (!value) return null
  const match = /^(\d+)\s*-\s*(\d+)$/.exec(value.trim())
  if (!match) return null
  return clampBars(Number(match[1]), Number(match[2]))
}

export function resolvePractice(section: string | null, bars: string | null): PracticePick | null {
  const ids = parseIdList(section)
  if (!ids) return null
  const parsed = parseBars(bars)
  if (!parsed) return pickFromIds(ids)
  const pick = pickForBars(parsed.startBar, parsed.endBar)
  // A bar tweak stays on the sections the address named when the range still
  // touches them. A range that has left those sections follows the bars.
  const named = new Set(ids)
  const still = pick.ids.some((id) => named.has(id))
  return still ? { ...pick, ids: pick.ids.length > 0 ? pick.ids : ids } : pick
}

// Canonical query values. `bars` is omitted when it is exactly the named
// sections, so the common address stays `?section=intro`.
export function canonicalSectionQuery(
  section: string | null,
  bars: string | null,
): { section: string | null; bars: string | null } {
  const pick = resolvePractice(section, bars)
  if (!pick) return { section: null, bars: null }
  const natural = spanForIds(pick.ids)
  const custom =
    !natural || natural.startBar !== pick.startBar || natural.endBar !== pick.endBar
  return {
    section: pick.ids.join(','),
    bars: custom ? `${pick.startBar}-${pick.endBar}` : null,
  }
}

export function practiceTimes(pick: Pick<PracticePick, 'startBar' | 'endBar'>): {
  start: number
  end: number
} {
  return { start: barStartTime(pick.startBar), end: barEndTime(pick.endBar) }
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function rememberDeadmau5(pick: Pick<PracticePick, 'ids' | 'startBar' | 'endBar'>): void {
  try {
    storage()?.setItem(
      DEADMAU5_SECTION_KEY,
      `${pick.ids.join(',')}|${pick.startBar}-${pick.endBar}`,
    )
  } catch {
    // The next visit can still open the section list.
  }
}

export function readDeadmau5(): PracticePick | null {
  try {
    const raw = storage()?.getItem(DEADMAU5_SECTION_KEY)
    if (!raw) return null
    const [section, bars] = raw.split('|')
    const pick = resolvePractice(section ?? null, bars ?? null)
    return pick ? { ...pick, active: false } : null
  } catch {
    return null
  }
}
