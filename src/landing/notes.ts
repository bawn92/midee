// Seeded falling notes for the landing hero. One 12s loop, rose on the left
// hand and honey on the right. Positions are in pixels of the nominal
// highway so the view can scale them; the caller integrates time.

export type NoteHand = 'lh' | 'rh'
export type HeroSize = 'desktop' | 'phone'

export interface NoteSeed {
  lane: number
  hand: NoteHand
  height: number
  /** Seconds after the loop start when the note's top crosses y = 0. */
  enter: number
  /** Seconds the key stays fully lit after the note reaches the felt line. */
  hold: number
}

export interface HeroLayout {
  lanes: number
  highway: number
  speed: number
  loop: number
}

export interface PlacedNote {
  index: number
  lane: number
  hand: NoteHand
  y: number
  height: number
  opacity: number
  visible: boolean
}

export interface KeyLight {
  lane: number
  hand: NoteHand
  amount: number
}

export interface HeroFrame {
  notes: PlacedNote[]
  lights: KeyLight[]
  /** 0–1, before the glow's breath. 0 when nothing is landing. */
  glow: number
}

export const LOOP_S = 12
const FADE_IN_S = 0.08
const FADE_OUT_S = 0.3

export const DESKTOP_LAYOUT: HeroLayout = { lanes: 14, highway: 496, speed: 60, loop: LOOP_S }
export const PHONE_LAYOUT: HeroLayout = { lanes: 10, highway: 150, speed: 40, loop: LOOP_S }

// A parked frame with notes in flight and keys already lit (L-RM).
export const PARKED_TIME_S = 4.15

// Fourteen notes. Rose sits mostly on the left, with one rose key further
// right, matching the card the hero is drawn from.
const DESKTOP_NOTES: NoteSeed[] = [
  { lane: 1, hand: 'lh', height: 168, enter: 0.2, hold: 0.62 },
  { lane: 2, hand: 'rh', height: 210, enter: 6.4, hold: 0.7 },
  { lane: 3, hand: 'lh', height: 132, enter: 2.5, hold: 0.48 },
  { lane: 4, hand: 'rh', height: 96, enter: 8.6, hold: 0.4 },
  { lane: 5, hand: 'lh', height: 248, enter: 1.05, hold: 0.85 },
  { lane: 6, hand: 'rh', height: 150, enter: 5.1, hold: 0.55 },
  { lane: 7, hand: 'rh', height: 188, enter: 9.4, hold: 0.6 },
  { lane: 8, hand: 'lh', height: 78, enter: 3.35, hold: 0.36 },
  { lane: 9, hand: 'rh', height: 220, enter: 7.15, hold: 0.72 },
  { lane: 10, hand: 'rh', height: 280, enter: 0.55, hold: 0.9 },
  { lane: 11, hand: 'rh', height: 124, enter: 4.7, hold: 0.5 },
  { lane: 11, hand: 'lh', height: 96, enter: 10.4, hold: 0.42 },
  { lane: 12, hand: 'rh', height: 236, enter: 2.15, hold: 0.78 },
  { lane: 13, hand: 'rh', height: 154, enter: 8.05, hold: 0.52 },
]

const PHONE_NOTES: NoteSeed[] = DESKTOP_NOTES.slice(0, 10).map((note) => ({
  lane: Math.round((note.lane / 13) * 9),
  hand: note.hand,
  height: Math.max(36, Math.round(note.height * (PHONE_LAYOUT.highway / DESKTOP_LAYOUT.highway))),
  enter: note.enter,
  hold: note.hold,
}))

export function layoutFor(size: HeroSize): HeroLayout {
  return size === 'phone' ? PHONE_LAYOUT : DESKTOP_LAYOUT
}

export function notesFor(size: HeroSize): readonly NoteSeed[] {
  return size === 'phone' ? PHONE_NOTES : DESKTOP_NOTES
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

export function frameAt(time: number, size: HeroSize): HeroFrame {
  const layout = layoutFor(size)
  const seeds = notesFor(size)
  const amounts = new Array<number>(layout.lanes).fill(0)
  const hands: Array<NoteHand | null> = new Array(layout.lanes).fill(null)
  const notes: PlacedNote[] = []

  seeds.forEach((note, index) => {
    const cycle = mod(time - note.enter, layout.loop)
    const y = cycle * layout.speed - note.height
    const visible = y < layout.highway && y + note.height > 0
    const progress = clamp01((y + note.height) / layout.highway)
    notes.push({
      index,
      lane: note.lane,
      hand: note.hand,
      y,
      height: note.height,
      opacity: visible ? 0.55 + 0.45 * progress : 0,
      visible,
    })

    const since = cycle - layout.highway / layout.speed
    let amount = 0
    if (since >= 0 && since < note.hold + FADE_OUT_S) {
      if (since < FADE_IN_S) amount = since / FADE_IN_S
      else if (since < note.hold) amount = 1
      else amount = 1 - (since - note.hold) / FADE_OUT_S
    }
    const lane = note.lane
    if (amount > (amounts[lane] ?? 0)) {
      amounts[lane] = amount
      hands[lane] = note.hand
    }
  })

  const lights: KeyLight[] = amounts.map((amount, lane) => ({
    lane,
    hand: hands[lane] ?? 'rh',
    amount,
  }))
  const glow = amounts.reduce((max, n) => (n > max ? n : max), 0)
  return { notes, lights, glow }
}

/** White-key gaps that receive a black key, counting from C. */
export function blackKeyAfter(lanes: number): number[] {
  const slots: number[] = []
  for (let i = 0; i < lanes - 1; i++) {
    const degree = i % 7
    if (degree === 2 || degree === 6) continue
    slots.push(i)
  }
  return slots
}
