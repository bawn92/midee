import { type Hand, noteMatchesHand } from '../core/handPractice'
import { type KeyboardRangePrefs, placedPitch } from '../core/keyboardRange'
import { isBlackKey } from '../core/midi/types'
import type { FingerMark, FingerRule, GuideSnapshot, SongGuide } from './types'

export interface GuideNote {
  pitch: number
  time: number
  duration: number
}

export function barAt(time: number, secondsPerBar: number): number {
  if (!Number.isFinite(time) || time <= 0) return 1
  return Math.floor(time / secondsPerBar) + 1
}

export function barStart(bar: number, secondsPerBar: number): number {
  return Math.max(0, (bar - 1) * secondsPerBar)
}

export function snapshot(guide: SongGuide, bar: number): GuideSnapshot {
  const section = guide.sections.find((s) => bar >= s.startBar && bar <= s.endBar) ?? null
  const step = section?.stepId ? (guide.steps.find((s) => s.id === section.stepId) ?? null) : null
  const chord = chordAt(guide, bar)
  const loopActive =
    section?.loopId && bar <= (section.loopEndBar ?? section.endBar) ? section.loopId : undefined
  const loopDef = loopActive ? guide.loops.find((l) => l.id === loopActive) : undefined
  const loop =
    loopDef && chord
      ? { chords: loopDef.chords, index: loopIndex(loopDef.chords, loopDef.anchorBar, bar, chord) }
      : null
  const pattern = patternAt(guide, bar)
  const statement = statementAt(guide, bar)
  const fact = guide.facts.find((f) => bar >= f.startBar && bar <= f.endBar)?.text ?? null
  const warning =
    guide.warnings.find((w) => w.kind === 'jump' && bar >= w.startBar - w.lead && bar <= w.endBar)
      ?.text ?? null
  const endurance =
    guide.warnings.find(
      (w) => w.kind === 'endurance' && bar >= w.startBar - w.lead && bar <= w.endBar,
    )?.text ?? null
  return { bar, section, step, chord, loop, pattern, statement, fact, warning, endurance }
}

export function chordAt(guide: SongGuide, bar: number): string | null {
  const span = guide.chords.find((c) => bar >= c.startBar && bar <= c.endBar)
  return span?.name || null
}

function loopIndex(chords: readonly string[], anchor: number, bar: number, chord: string): number {
  const len = chords.length
  const i = (((bar - anchor) % len) + len) % len
  if (chords[i] === chord) return i
  const byName = chords.indexOf(chord)
  return byName >= 0 ? byName : i
}

function patternAt(
  guide: SongGuide,
  bar: number,
): { label: string; n: number; total: number } | null {
  const pattern = guide.patterns.find((p) => bar >= p.startBar && bar <= p.endBar)
  if (!pattern || pattern.period < 1) return null
  const total = Math.ceil((pattern.endBar - pattern.startBar + 1) / pattern.period)
  const n = Math.floor((bar - pattern.startBar) / pattern.period) + 1
  return { label: pattern.label, n, total }
}

function statementAt(
  guide: SongGuide,
  bar: number,
): { label: string; n: number; total: number } | null {
  for (const statement of guide.statements) {
    const index = statement.ranges.findIndex((r) => bar >= r.startBar && bar <= r.endBar)
    if (index >= 0) {
      return { label: statement.label, n: index + 1, total: statement.ranges.length }
    }
  }
  return null
}

export interface FingerContext {
  transpose: number
  range: KeyboardRangePrefs
  hand: Hand
  /** How far ahead a not-yet-sounding note still shows its finger. */
  lookahead?: number
}

// Fingers for notes that are sounding or about to be played. The number is
// chosen from the written pitch; the key it sits on follows transpose and
// Fit to your range, and the other practice hand is left blank.
export function fingersAt(
  guide: SongGuide,
  notes: readonly GuideNote[],
  time: number,
  ctx: FingerContext,
): FingerMark[] {
  const lookahead = ctx.lookahead ?? 1
  const soon = notes.filter((n) => n.time <= time + lookahead && n.time + n.duration > time - 0.02)
  const marks: FingerMark[] = []
  const seen = new Set<number>()
  for (const note of soon) {
    const sounding = note.pitch + ctx.transpose
    if (!noteMatchesHand(sounding, ctx.hand)) continue
    const placed = placedPitch(sounding, ctx.range)
    if (!placed) continue
    if (seen.has(placed.pitch)) continue
    const cluster = soon.filter((n) => Math.abs(n.time - note.time) <= 0.06)
    const prev = previousPitch(notes, note)
    const resolved = fingerFor(
      guide,
      barAt(note.time, guide.secondsPerBar),
      note.pitch,
      cluster,
      prev,
    )
    if (!resolved) continue
    seen.add(placed.pitch)
    marks.push({
      drawPitch: placed.pitch,
      sourcePitch: note.pitch,
      finger: resolved.finger,
      hand: resolved.hand,
    })
  }
  marks.sort((a, b) => a.drawPitch - b.drawPitch)
  return marks
}

function previousPitch(notes: readonly GuideNote[], note: GuideNote): number | null {
  let best: GuideNote | null = null
  for (const other of notes) {
    if (other.pitch === note.pitch) continue
    if (other.time >= note.time || note.time - other.time > 1.5) continue
    if (!best || other.time > best.time) best = other
  }
  return best?.pitch ?? null
}

export function fingerFor(
  guide: SongGuide,
  bar: number,
  pitch: number,
  cluster: readonly GuideNote[],
  prev: number | null,
): { finger: number; hand: 'left' | 'right' } | null {
  const rules = guide.fingerings.filter((r) => bar >= r.startBar && bar <= r.endBar)
  const handOf = (rule: FingerRule): 'left' | 'right' =>
    rule.hand ?? (pitch < 60 ? 'left' : 'right')
  for (const rule of rules) {
    if (rule.slide && prev === rule.slide.prev && pitch === rule.slide.pitch) {
      return { finger: rule.slide.finger, hand: handOf(rule) }
    }
  }
  for (const rule of rules) {
    const exact = rule.pitches?.[pitch]
    if (exact !== undefined) return { finger: exact, hand: handOf(rule) }
  }
  for (const rule of rules) {
    const block = blockFinger(rule, pitch, cluster)
    if (block !== null && rule.block) return { finger: block, hand: rule.block.hand }
  }
  for (const rule of rules) {
    const octave = octaveFinger(rule, pitch, cluster)
    if (octave !== null && rule.octaves) {
      return { finger: octave, hand: rule.octaves === 'rh' ? 'right' : 'left' }
    }
  }
  return null
}

function blockFinger(
  rule: FingerRule,
  pitch: number,
  cluster: readonly GuideNote[],
): number | null {
  if (!rule.block) return null
  const hand = rule.block.hand
  const mine = pitch < 60 ? 'left' : 'right'
  if (mine !== hand) return null
  const tones = [
    ...new Set(cluster.map((n) => n.pitch).filter((p) => (p < 60 ? 'left' : 'right') === hand)),
  ].sort((a, b) => a - b)
  const index = tones.indexOf(pitch)
  if (index < 0 || tones.length < 2) return null
  const fingers = rule.block.fingers
  if (tones.length === fingers.length) return fingers[index] ?? null
  if (index === 0) return fingers[0] ?? null
  if (index === tones.length - 1) return fingers[fingers.length - 1] ?? null
  const t = index / (tones.length - 1)
  return fingers[Math.round(t * (fingers.length - 1))] ?? null
}

function octaveFinger(
  rule: FingerRule,
  pitch: number,
  cluster: readonly GuideNote[],
): number | null {
  if (!rule.octaves) return null
  const partner = cluster.some(
    (n) =>
      n.pitch !== pitch && (Math.abs(n.pitch - pitch) === 12 || Math.abs(n.pitch - pitch) === 24),
  )
  if (!partner) return null
  const lowest = Math.min(
    pitch,
    ...cluster
      .map((n) => n.pitch)
      .filter((p) => Math.abs(p - pitch) === 12 || Math.abs(p - pitch) === 24 || p === pitch),
  )
  const isBottom = pitch === lowest
  const black = isBlackKey(isBottom ? pitch : pitch)
  if (rule.octaves === 'rh') {
    if (isBottom) return 1
    return isBlackKey(pitch) ? 4 : 5
  }
  if (isBottom) return black ? 4 : 5
  return 1
}

// True when playback has reached the end of an armed loop and should jump
// back. A paused clock does not wrap, so wait-mode holds stay put.
export function loopShouldWrap(
  time: number,
  loop: { start: number; end: number } | null,
  playing: boolean,
): boolean {
  if (!playing || !loop) return false
  return time >= loop.end - 0.01 && loop.end > loop.start
}
