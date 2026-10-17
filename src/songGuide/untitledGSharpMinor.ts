import type { ChordSpan, SongGuide } from './types'

// Bars are 2 seconds at 120 BPM in 4/4, counted from the start of the file.
// The MIDI header's later meter changes do not match that pulse, so the guide
// keeps the player's bar (1 bar = 2 s). Chord names were read off the notes.

const CHORDS = `
1-10 G#m
11 C#m
12 E
13 G#m
14 C#m
15 F#
16-18 G#m
19 C#m
20-21 E
22 C#m
23 F#
24-26 G#m
27 C#m
28-29 E
30 C#m
31 F#
32-34 G#m
35 C#m
36-37 E
38 C#m
39 F#
40-43 G#m
44 C#m
45-46 E
47 G#m
48 C#m
49 F#
50 G#m
51 D#m
52 B
53 C#m
54-55 E
56 C#m
57 F#
58 B
59-71 G#m
72 C#m
73-74 E
75-76 C#m
77-79 G#m
80-81 C#m
82 E
83 C#m
84-85 F#
86-87 G#m
88-89 C#m
90 E
91 G#m
92 F#
93-96 G#m
97 C#m
98-99 E
100 C#m
101 F#
102-104 G#m
105 C#m
106-107 E
108 G#m
109 C#m
110 F#
111-112 G#m
113 E
114 C#m
115-116 E
117 C#m
118 F#
119-120 G#m
121 E
122-139 G#m
140 C#m
141-143 G#m
144 C#m
145-148 G#m
149 C#m
150-151 G#m
152-153 C#m
154-157 G#m
158-160 C#m
161-162 G#m
163-165 C#m
166 G#m
167 C#m
168 E
169 C#m
170 G#m
171 C#m
172 E
173 C#m
174 G#m
175 E
176-177 C#m
178-179 G#m
180 C#m
181 F#
182 D#m
184 G#m
185-186 C#m
187-188 G#m
189 E
190 C#m
191-192 G#m
193 E
194 C#m
195-196 G#m
197 E
198 C#m
199-200 G#m
201 E
202 C#m
203-204 G#m
205 E
206 C#m
207-208 G#m
209 E
210 C#m
211-213 G#m
214 E
215 C#m
216 F#
217 G#m
218 E
219 C#m
220 F#
221 G#m
222-224 C#m
225 G#m
226 C#m
227 E
228 C#m
229 G#m
230 C#m
231 E
232 C#m
233 G#m
234 E
235-236 C#m
237 B
238-241 G#m
`

function chords(spec: string): ChordSpan[] {
  const spans: ChordSpan[] = []
  for (const line of spec.trim().split('\n')) {
    const [range, name] = line.trim().split(/\s+/)
    if (!range || !name) continue
    const [start, end] = range.split('-')
    const startBar = Number(start)
    const endBar = end ? Number(end) : startBar
    spans.push({ startBar, endBar, name })
  }
  return spans
}

// Melody right hand: B4 1, D#5 2, E5 3, F#5 4, G#5 5. A#4 is 1, and the B4
// that follows it is 2 before the hand slides back.
const MELODY_RH: Record<number, number> = { 71: 1, 75: 2, 76: 3, 78: 4, 80: 5, 70: 1 }

// Moving left hand, low note 5 and high note 1: E3–B3, C#3–G#3, F#3–C#4.
const MOVING_LH: Record<number, number> = { 52: 5, 59: 1, 49: 5, 56: 1, 54: 5, 61: 1 }

// Rocking right hand: B3 1, C#4 2, D#4 3, F#4 4.
const ROCK_RH: Record<number, number> = { 59: 1, 61: 2, 63: 3, 66: 4 }

// Climax right hand G#4 B4 E5 G#5 = 1 2 3 5. Left hand E2 B2 E3 = 5 2 1.
const CLIMAX_RH: Record<number, number> = { 68: 1, 71: 2, 76: 3, 80: 5 }
const CLIMAX_LH: Record<number, number> = { 40: 5, 47: 2, 52: 1 }

const melodyFingers = (startBar: number, endBar: number) => ({
  startBar,
  endBar,
  hand: 'right' as const,
  pitches: MELODY_RH,
  slide: { prev: 70, pitch: 71, finger: 2 },
})

const movingFingers = (startBar: number, endBar: number) => ({
  startBar,
  endBar,
  hand: 'left' as const,
  pitches: MOVING_LH,
})

export const untitledGSharpMinor: SongGuide = {
  id: 'untitled-g-sharp-minor',
  title: 'Untitled in G# minor',
  duration: 483.12,
  noteCount: 3445,
  secondsPerBar: 2,
  barCount: 241,
  sections: [
    { id: 'intro', name: 'Intro', startBar: 1, endBar: 10, color: '#94a3b8', stepId: 'intro' },
    {
      id: 'melody',
      name: 'Melody',
      startBar: 11,
      endBar: 26,
      color: '#38bdf8',
      stepId: 'melody',
      loopId: 'melody',
    },
    {
      id: 'moving',
      name: 'Melody, moving left hand',
      startBar: 27,
      endBar: 43,
      color: '#818cf8',
      stepId: 'moving',
      loopId: 'melody',
    },
    {
      id: 'octaves',
      name: 'Octave build-up',
      startBar: 44,
      endBar: 61,
      color: '#fbbf24',
      stepId: 'octaves',
    },
    {
      id: 'intro-2',
      name: 'Intro again',
      startBar: 62,
      endBar: 71,
      color: '#94a3b8',
      stepId: 'intro',
    },
    {
      id: 'melody-2',
      name: 'Melody again',
      startBar: 72,
      endBar: 87,
      color: '#38bdf8',
      stepId: 'melody',
      loopId: 'melody',
    },
    {
      id: 'moving-2',
      name: 'Moving left hand again',
      startBar: 88,
      endBar: 104,
      color: '#818cf8',
      stepId: 'moving',
      loopId: 'melody',
    },
    {
      id: 'octaves-2',
      name: 'Octave build-up again',
      startBar: 105,
      endBar: 121,
      color: '#fbbf24',
      stepId: 'octaves',
    },
    {
      id: 'rocking',
      name: 'Rocking pattern',
      startBar: 122,
      endBar: 158,
      color: '#34d399',
      stepId: 'rocking',
    },
    {
      id: 'rocking-2',
      name: 'Rocking pattern continues',
      startBar: 159,
      endBar: 178,
      color: '#2dd4bf',
      stepId: 'rocking',
    },
    { id: 'link', name: 'Link', startBar: 179, endBar: 188, color: '#fb7185', stepId: 'octaves' },
    {
      id: 'climax',
      name: 'Climax',
      startBar: 189,
      endBar: 213,
      color: '#f97316',
      stepId: 'climax',
      loopId: 'climax',
    },
    {
      id: 'ending',
      name: 'Ending',
      startBar: 214,
      endBar: 241,
      color: '#e879f9',
      stepId: 'octaves',
      loopId: 'ending',
      loopEndBar: 221,
    },
  ],
  steps: [
    {
      id: 'melody',
      order: 1,
      title: 'Melody',
      detail: 'Bars 11–26, from 0:20. The tune comes back three more times, about 70 bars in all.',
      ranges: [{ startBar: 11, endBar: 26, label: 'Bars 11–26' }],
    },
    {
      id: 'intro',
      order: 2,
      title: 'Intro',
      detail: 'Bars 1–10. Steady quarter notes.',
      ranges: [{ startBar: 1, endBar: 10, label: 'Bars 1–10' }],
    },
    {
      id: 'moving',
      order: 3,
      title: 'Melody with a moving left hand',
      detail:
        'Bars 27–43, from 0:52. The left hand alternates the low and high note of each chord in eighths.',
      ranges: [{ startBar: 27, endBar: 43, label: 'Bars 27–43' }],
    },
    {
      id: 'rocking',
      order: 4,
      title: 'Rocking pattern',
      detail: 'Bars 122–158, from 4:02, then keep going through bar 178.',
      ranges: [
        { startBar: 122, endBar: 158, label: 'Bars 122–158' },
        { startBar: 159, endBar: 178, label: 'Bars 159–178' },
      ],
    },
    {
      id: 'climax',
      order: 5,
      title: 'Climax',
      detail:
        'Bars 189–213, from 6:16. Learn bars 193–196 first. The rest is the same four bars, sometimes up an octave.',
      ranges: [
        { startBar: 193, endBar: 196, label: 'Learn 193–196 first' },
        { startBar: 189, endBar: 213, label: 'Full climax' },
      ],
    },
    {
      id: 'octaves',
      order: 6,
      title: 'Octaves, ending, and the link',
      detail: 'Octave build-up bars 44–61, the ending bars 214–241, and the link bars 179–188.',
      ranges: [
        { startBar: 44, endBar: 61, label: 'Octave build-up' },
        { startBar: 214, endBar: 241, label: 'Ending' },
        { startBar: 179, endBar: 188, label: 'Link' },
      ],
    },
  ],
  chords: chords(CHORDS),
  loops: [
    {
      id: 'melody',
      chords: ['G#m', 'C#m', 'E', 'G#m', 'C#m', 'F#', 'G#m'],
      anchorBar: 18,
    },
    { id: 'climax', chords: ['E', 'C#m', 'G#m', 'G#m'], anchorBar: 189 },
    { id: 'ending', chords: ['E', 'C#m', 'F#', 'G#m'], anchorBar: 214 },
  ],
  facts: [
    {
      startBar: 62,
      endBar: 121,
      text: 'Replays bars 1–61, almost note for note.',
    },
  ],
  statements: [
    {
      label: 'Melody',
      ranges: [
        { startBar: 11, endBar: 26 },
        { startBar: 27, endBar: 43 },
        { startBar: 72, endBar: 87 },
        { startBar: 88, endBar: 104 },
      ],
    },
  ],
  patterns: [
    { startBar: 1, endBar: 9, period: 1, label: 'Pattern' },
    { startBar: 129, endBar: 136, period: 1, label: 'Pattern' },
    { startBar: 189, endBar: 212, period: 4, label: 'Pattern' },
  ],
  warnings: [
    {
      startBar: 56,
      endBar: 57,
      lead: 2,
      kind: 'jump',
      text: 'Big left-hand jump next. Play, freeze, move, then land quietly.',
    },
    {
      startBar: 117,
      endBar: 118,
      lead: 2,
      kind: 'jump',
      text: 'Same left-hand jump as bars 56–57. Play, freeze, move, land quietly.',
    },
    {
      startBar: 139,
      endBar: 142,
      lead: 2,
      kind: 'jump',
      text: 'Jump in the rocking pattern. Practise the jump on its own.',
    },
    {
      startBar: 200,
      endBar: 200,
      lead: 2,
      kind: 'jump',
      text: 'Left hand jumps about two octaves.',
    },
    {
      startBar: 208,
      endBar: 208,
      lead: 2,
      kind: 'jump',
      text: 'Left hand jumps about two octaves again.',
    },
    {
      startBar: 122,
      endBar: 178,
      lead: 0,
      kind: 'endurance',
      text: 'The rocking pattern does not let up. Keep the wrist loose.',
    },
    {
      startBar: 222,
      endBar: 237,
      lead: 2,
      kind: 'endurance',
      text: 'More than a minute without a break. Keep the wrist loose.',
    },
  ],
  fingerings: [
    melodyFingers(11, 26),
    melodyFingers(72, 87),
    movingFingers(27, 43),
    movingFingers(88, 104),
    { startBar: 44, endBar: 61, octaves: 'rh' },
    { startBar: 44, endBar: 61, octaves: 'lh' },
    { startBar: 105, endBar: 121, octaves: 'rh' },
    { startBar: 105, endBar: 121, octaves: 'lh' },
    { startBar: 122, endBar: 178, hand: 'right', pitches: ROCK_RH },
    { startBar: 122, endBar: 178, octaves: 'lh' },
    { startBar: 189, endBar: 213, hand: 'right', pitches: CLIMAX_RH },
    { startBar: 189, endBar: 213, hand: 'left', pitches: CLIMAX_LH },
    { startBar: 189, endBar: 213, octaves: 'lh' },
    { startBar: 214, endBar: 221, block: { hand: 'right', fingers: [1, 3, 5] } },
    { startBar: 214, endBar: 221, block: { hand: 'left', fingers: [1, 3, 5] } },
    { startBar: 222, endBar: 241, octaves: 'rh' },
    { startBar: 222, endBar: 241, octaves: 'lh' },
  ],
  tips: [
    'Work in four-bar chunks, hands separately, and overlap one bar when you join them.',
    'Say the chord names out loud.',
    'Count the pattern repeats.',
    'Start from any section. Play yesterday’s chunk from memory before you read it.',
    'The file has no dynamics.',
    'After three clean runs, step the tempo up: 60, 80, 100, 110, then 120.',
  ],
}
