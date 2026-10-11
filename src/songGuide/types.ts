// A per-song practice guide. Times are in 1-based bars of `secondsPerBar`.
// Another piece gets a guide by adding a file and registering it — nothing
// in the player is specific to one song.

export interface ChordSpan {
  startBar: number
  endBar: number
  name: string
}

export interface ChordLoop {
  id: string
  chords: readonly string[]
  /** Bar where index 0 of `chords` falls. */
  anchorBar: number
}

export interface GuideSection {
  id: string
  name: string
  startBar: number
  endBar: number
  color: string
  loopId?: string
  /** Last bar the loop highlight applies. Defaults to the section end. */
  loopEndBar?: number
  stepId?: string
}

export interface GuideRange {
  startBar: number
  endBar: number
  label?: string
}

export interface LearnStep {
  id: string
  order: number
  title: string
  detail: string
  ranges: readonly GuideRange[]
}

export interface GuideFact {
  startBar: number
  endBar: number
  text: string
}

export interface GuideStatement {
  label: string
  ranges: readonly GuideRange[]
}

export interface GuidePattern {
  startBar: number
  endBar: number
  /** Bars in one repetition. */
  period: number
  label: string
}

export interface GuideWarning {
  startBar: number
  endBar: number
  /** How many bars early the warning appears. */
  lead: number
  text: string
  kind: 'jump' | 'endurance'
}

export interface FingerRule {
  startBar: number
  endBar: number
  /** Hand these pitch numbers belong to, when it is not the middle-C split. */
  hand?: 'left' | 'right'
  pitches?: Readonly<Record<number, number>>
  /** A different finger when the previous melody note was `prev`. */
  slide?: { prev: number; pitch: number; finger: number }
  /** Octave pair. Right hand: 1 on the bottom. Left hand: 5 on the bottom. */
  octaves?: 'rh' | 'lh'
  /** Low-to-high fingers for one simultaneous chord. */
  block?: { hand: 'left' | 'right'; fingers: readonly number[] }
}

export interface SongGuide {
  id: string
  title: string
  /** Seconds. Matched loosely so a re-export still attaches. */
  duration: number
  noteCount: number
  secondsPerBar: number
  barCount: number
  sections: readonly GuideSection[]
  steps: readonly LearnStep[]
  chords: readonly ChordSpan[]
  loops: readonly ChordLoop[]
  facts: readonly GuideFact[]
  statements: readonly GuideStatement[]
  patterns: readonly GuidePattern[]
  warnings: readonly GuideWarning[]
  fingerings: readonly FingerRule[]
  tips: readonly string[]
}

export interface GuideSnapshot {
  bar: number
  section: GuideSection | null
  step: LearnStep | null
  chord: string | null
  loop: { chords: readonly string[]; index: number } | null
  pattern: { label: string; n: number; total: number } | null
  statement: { label: string; n: number; total: number } | null
  fact: string | null
  warning: string | null
  endurance: string | null
}

export interface FingerMark {
  /** Key the number is drawn on (after transpose and fit). */
  drawPitch: number
  /** Written pitch the fingering was chosen for. */
  sourcePitch: number
  finger: number
  hand: 'left' | 'right'
}
