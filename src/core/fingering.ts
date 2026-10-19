import type { KeyboardRangePrefs } from './keyboardRange'
import { placedPitch } from './keyboardRange'
import { noteHandOf } from './midi/hands'
import { isBlackKey } from './midi/types'

// A costed fingering for one hand. Finger 1 is the thumb. Right-hand fingers
// rise as the pitch rises. Left-hand fingers rise as the pitch falls, so the
// thumb sits on the highest note. A thumb-under or finger-over is cheap only
// on a one- or two-semitone step between white keys. The pitches are the keys
// the hand actually plays, after the keyboard range has folded them.

export interface FingeringNote {
  pitch: number
  time: number
  duration: number
}

const FINGERS = [1, 2, 3, 4, 5] as const
const CHORD_GAP = 0.05

// Semitones from the thumb in a relaxed hand. A major scale's 1-2-3 group
// and the following 1-2-3-4-5 group both sit on this shape.
const ANCHOR = [0, 0, 2, 4, 5, 7] as const

interface Item {
  index: number
  pitch: number
  black: boolean
  time: number
  end: number
}

interface Event {
  time: number
  items: Item[]
}

interface State {
  fingers: number[]
  cost: number
  prev: number
}

interface Placed {
  pitch: number
  finger: number
  black: boolean
}

function combos(count: number): number[][] {
  const out: number[][] = []
  const walk = (start: number, acc: number[]): void => {
    if (acc.length === count) {
      out.push([...acc])
      return
    }
    for (let i = start; i < FINGERS.length; i++) {
      acc.push(FINGERS[i]!)
      walk(i + 1, acc)
      acc.pop()
    }
  }
  if (count >= 1 && count <= 5) walk(0, [])
  return out
}

function eventsOf(notes: readonly (FingeringNote & { black: boolean })[]): Event[] {
  const order = notes.map((_, index) => index).sort((a, b) => notes[a]!.time - notes[b]!.time)
  const events: Event[] = []
  for (const index of order) {
    const note = notes[index]!
    const item: Item = {
      index,
      pitch: note.pitch,
      black: note.black,
      time: note.time,
      end: note.time + note.duration,
    }
    const last = events[events.length - 1]
    if (!last || note.time - last.time > CHORD_GAP) {
      events.push({ time: note.time, items: [item] })
    } else {
      last.items.push(item)
    }
  }
  for (const event of events) event.items.sort((a, b) => a.pitch - b.pitch || a.index - b.index)
  return events
}

function uniquePitches(items: readonly Item[]): Item[] {
  const out: Item[] = []
  for (const item of items) {
    if (out.some((kept) => kept.pitch === item.pitch)) continue
    out.push(item)
  }
  return out
}

function position(pitch: number, finger: number): number {
  return pitch - (ANCHOR[finger] ?? 0)
}

function pace(dt: number): number {
  if (dt < 0.12) return 1.12
  return 1
}

// Cost of moving from one key to the next. `pitch` rises to the right.
function pairCost(from: Placed, to: Placed, dt: number): number {
  const dp = to.pitch - from.pitch
  const step = Math.abs(dp)
  const shift = Math.abs(position(to.pitch, to.finger) - position(from.pitch, from.finger))
  let cost = 0
  if (shift > 0 && shift <= 2) cost += shift * 0.22
  else if (shift > 2) cost += 0.44 + (shift - 2) * 0.62
  if (from.finger === to.finger && dp !== 0) cost += 0.9 + step * 0.22
  if (to.finger === 1 && to.black) cost += 2.2
  const naturalTuck = dp > 0 && from.finger === 3 && to.finger === 1 && step <= 2 && !to.black
  const naturalOver = dp < 0 && from.finger === 1 && to.finger === 3 && step <= 2 && !from.black
  if (naturalTuck || naturalOver) cost -= 1.15
  const withThePitch =
    dp === 0 || (dp > 0 && to.finger > from.finger) || (dp < 0 && to.finger < from.finger)
  // A finger moving against the pitch is a cross. Only the short tuck and the
  // matching finger-over are cheap; anything else means the hand turned over
  // when it could have stayed in position.
  if (from.finger !== to.finger && !withThePitch && !naturalTuck && !naturalOver) {
    cost += 1.35 + step * 0.15
  }
  return cost * pace(dt)
}

function shapeCost(items: readonly Item[], fingers: readonly number[]): number {
  const unique = uniquePitches(items)
  if (unique.length === 0) return 0
  const placed = unique.map((item) => {
    const at = items.findIndex((candidate) => candidate.pitch === item.pitch)
    return {
      pitch: item.pitch,
      finger: fingers[at] ?? 1,
      black: item.black,
    }
  })
  const origin = position(placed[0]!.pitch, placed[0]!.finger)
  let cost = (placed[0]!.finger - 1) * 0.04
  if (placed[0]!.finger === 1 && placed[0]!.black) cost += 2.2
  for (let i = 1; i < placed.length; i++) {
    const finger = placed[i]!.finger
    cost += (finger - 1) * 0.04
    cost += Math.abs(position(placed[i]!.pitch, finger) - origin) * 0.45
    if (finger === 1 && placed[i]!.black) cost += 2.2
  }
  return cost
}

function expand(
  items: readonly Item[],
  unique: readonly Item[],
  fingers: readonly number[],
): number[] {
  return items.map((item) => {
    const at = unique.findIndex((kept) => kept.pitch === item.pitch)
    return fingers[at] ?? 1
  })
}

function spread(count: number): number[] {
  const fingers: number[] = []
  for (let i = 0; i < count; i++) {
    const finger = Math.round(1 + (i * 4) / Math.max(1, count - 1))
    fingers.push(Math.min(5, Math.max(fingers[i - 1] ?? 1, finger)))
  }
  return fingers
}

function legal(items: readonly Item[]): number[][] {
  const unique = uniquePitches(items)
  if (unique.length > 5) return [expand(items, unique, spread(unique.length))]
  return combos(unique.length).map((choice) => expand(items, unique, choice))
}

function stillHeld(prev: Item, prevFinger: number, next: Item, finger: number): boolean {
  return prevFinger === finger && prev.pitch !== next.pitch && prev.end > next.time + 0.02
}

function transition(
  prevItems: readonly Item[],
  prevFingers: readonly number[],
  nextItems: readonly Item[],
  nextFingers: readonly number[],
): number {
  let cost = 0
  for (let n = 0; n < nextItems.length; n++) {
    const next = nextItems[n]!
    const finger = nextFingers[n]!
    for (let p = 0; p < prevItems.length; p++) {
      if (stillHeld(prevItems[p]!, prevFingers[p]!, next, finger)) cost += 80
    }
    let link = 8
    for (let p = 0; p < prevItems.length; p++) {
      const prev = prevItems[p]!
      link = Math.min(
        link,
        pairCost(
          { pitch: prev.pitch, finger: prevFingers[p]!, black: prev.black },
          { pitch: next.pitch, finger, black: next.black },
          next.time - prev.time,
        ),
      )
    }
    cost += link
  }
  return cost
}

/** Finger for each input note. 0 means the note was left unassigned. */
export function fingerLine(notes: readonly FingeringNote[], hand: 'left' | 'right'): number[] {
  const result = notes.map(() => 0)
  if (notes.length === 0) return result
  const sign = hand === 'left' ? -1 : 1
  const virtual = notes.map((note) => ({
    pitch: note.pitch * sign,
    time: note.time,
    duration: note.duration,
    black: isBlackKey(Math.round(note.pitch)),
  }))
  const events = eventsOf(virtual)
  if (events.length === 0) return result
  const layers: State[][] = []
  for (let e = 0; e < events.length; e++) {
    const event = events[e]!
    const choices = legal(event.items)
    const layer: State[] = []
    for (const choice of choices) {
      const shaped = shapeCost(event.items, choice)
      let best = shaped
      let prev = -1
      if (e > 0) {
        best = Number.POSITIVE_INFINITY
        const before = layers[e - 1] ?? []
        for (let p = 0; p < before.length; p++) {
          const state = before[p]!
          const cost =
            state.cost +
            transition(events[e - 1]!.items, state.fingers, event.items, choice) +
            shaped * 0.35
          if (cost < best) {
            best = cost
            prev = p
          }
        }
      }
      layer.push({ fingers: choice, cost: best, prev })
    }
    layers.push(layer)
  }
  let cursor = 0
  const last = layers[layers.length - 1] ?? []
  for (let i = 1; i < last.length; i++) {
    if ((last[i]?.cost ?? Infinity) < (last[cursor]?.cost ?? Infinity)) cursor = i
  }
  for (let e = layers.length - 1; e >= 0; e--) {
    const state = layers[e]?.[cursor]
    if (!state) break
    const event = events[e]!
    for (let i = 0; i < event.items.length; i++) {
      result[event.items[i]!.index] = state.fingers[i] ?? 0
    }
    cursor = state.prev
  }
  return result
}

export interface FingerSource {
  hand?: 'left' | 'right' | 'split'
  isDrum?: boolean
  notes: readonly FingeringNote[]
}

export function fingerKey(hand: 'left' | 'right', note: { time: number; pitch: number }): string {
  return `${hand}:${note.time.toFixed(4)}:${note.pitch}`
}

// One finger per source note, keyed by hand, onset, and written pitch.
// The number is chosen on the key the range mapping plays.
export function planFingering(
  tracks: readonly FingerSource[],
  range: KeyboardRangePrefs,
): Map<string, number> {
  const grouped: Record<'left' | 'right', { key: string; note: FingeringNote }[]> = {
    left: [],
    right: [],
  }
  for (const track of tracks) {
    if (track.isDrum) continue
    for (const note of track.notes) {
      const hand = noteHandOf(track, note.pitch)
      const placed = placedPitch(note.pitch, range)
      if (!placed) continue
      grouped[hand].push({
        key: fingerKey(hand, note),
        note: { pitch: placed.pitch, time: note.time, duration: note.duration },
      })
    }
  }
  const plan = new Map<string, number>()
  for (const hand of ['left', 'right'] as const) {
    const rows = grouped[hand]
    const fingers = fingerLine(
      rows.map((row) => row.note),
      hand,
    )
    rows.forEach((row, index) => {
      const finger = fingers[index] ?? 0
      if (finger > 0) plan.set(row.key, finger)
    })
  }
  return plan
}
