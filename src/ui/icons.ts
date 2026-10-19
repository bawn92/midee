// Single source of truth for inline SVG icons used across the UI.
// Each icon is a function that returns an HTML string at the given pixel size.
// Call sites use template-literal interpolation: `<span>${icons.play(16)}</span>`.
//
// Design notes:
// - All icons use `currentColor`, so colour comes from CSS.
// - Stroke-based icons share a consistent stroke-width (~2) by default.
// - If you need a stylistic variant, prefer adding a new icon rather than
//   parameterising — keeps call sites readable and grep-able.

type Size = number

const svgStroke = (size: Size, body: string, strokeWidth = 2, extra = ''): string =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`

const svgFilled = (size: Size, body: string, extra = ''): string =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" ${extra}>${body}</svg>`

export const icons = {
  play: (size: Size = 16): string => svgFilled(size, `<polygon points="6 3 20 12 6 21 6 3"/>`),

  plug: (size: Size = 16): string =>
    svgStroke(
      size,
      `<path d="M8 7v3"/><path d="M16 7v3"/><path d="M6 10h12v2a6 6 0 0 1-12 0v-2z"/><path d="M12 18v3"/>`,
      1.8,
    ),

  pause: (size: Size = 16): string =>
    svgFilled(
      size,
      `<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>`,
    ),

  skipBack: (size: Size = 15): string =>
    svgStroke(
      size,
      `<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/>`,
    ),

  skipForward: (size: Size = 15): string =>
    svgStroke(size, `<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>`),

  volume: (size: Size = 13): string =>
    svgStroke(
      size,
      `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>`,
    ),

  volumeMuted: (size: Size = 13): string =>
    svgStroke(
      size,
      `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="16" y1="9" x2="22" y2="15"/><line x1="22" y1="9" x2="16" y2="15"/>`,
    ),

  // Vertical scale, not magnification: this control changes note HEIGHT, so a
  // magnifier read as "zoom the canvas" and needed the tooltip to explain it.
  // A double-headed vertical arrow says "taller / shorter".
  zoom: (size: Size = 13): string =>
    svgStroke(
      size,
      `<line x1="12" y1="4" x2="12" y2="20"/><polyline points="8 8 12 4 16 8"/><polyline points="8 16 12 20 16 16"/>`,
    ),

  metronome: (size: Size = 13): string =>
    svgStroke(
      size,
      `<path d="M6 22 L10 3 H14 L18 22 Z"/><line x1="5" y1="17" x2="19" y2="17"/><line x1="12" y1="17" x2="17" y2="6"/>`,
    ),

  loop: (size: Size = 13): string =>
    svgStroke(
      size,
      `<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>`,
    ),

  undo: (size: Size = 13): string =>
    svgStroke(size, `<polyline points="3 7 3 13 9 13"/><path d="M3 13a9 9 0 1 0 3-7l-3 4"/>`),

  download: (size: Size = 13): string =>
    svgStroke(
      size,
      `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>`,
    ),

  upload: (size: Size = 14): string =>
    svgStroke(
      size,
      `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>`,
    ),

  close: (size: Size = 14): string =>
    svgStroke(size, `<line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/>`),

  check: (size: Size = 12): string => svgStroke(size, `<polyline points="20 6 9 17 4 12"/>`, 2.5),

  chevronDown: (size: Size = 11): string =>
    svgStroke(size, `<polyline points="6 9 12 15 18 9"/>`, 2.2, 'aria-hidden="true"'),

  more: (size: Size = 16): string =>
    svgFilled(
      size,
      `<circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>`,
    ),

  tracks: (size: Size = 14): string =>
    svgStroke(
      size,
      `<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>`,
    ),

  // Sustain pedal, front-on: stem over a foot plate. The foot carries a class
  // so CSS can fill it while the pedal is down.
  pedal: (size: Size = 14): string =>
    svgStroke(size, `<path d="M10 3h4v7h-4z"/><path class="ts-pedal-foot" d="M6 10h12l2 9H4z"/>`),
  midi: (size: Size = 14): string =>
    svgStroke(
      size,
      `<rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="14" x2="22" y2="14"/><line x1="7" y1="4"  x2="7"  y2="14"/><line x1="12" y1="4" x2="12" y2="14"/><line x1="17" y1="4" x2="17" y2="14"/><rect x="5"  y="4" width="3" height="6" rx="1" fill="currentColor" stroke="none"/><rect x="10" y="4" width="3" height="6" rx="1" fill="currentColor" stroke="none"/><rect x="15" y="4" width="3" height="6" rx="1" fill="currentColor" stroke="none"/>`,
    ),

  film: (size: Size = 26): string =>
    svgStroke(
      size,
      `<rect x="2" y="4" width="20" height="16" rx="2.5"/><line x1="2" y1="9"  x2="22" y2="9"/><line x1="2" y1="15" x2="22" y2="15"/><line x1="7" y1="4"  x2="7"  y2="20"/><line x1="17" y1="4" x2="17" y2="20"/>`,
      1.5,
    ),

  exportArrow: (size: Size = 13): string =>
    svgStroke(
      size,
      `<path d="M12 3v12"/><polyline points="7 8 12 3 17 8"/><rect x="3" y="15" width="18" height="6" rx="1.5"/>`,
    ),

  waveform: (size: Size = 26): string =>
    svgStroke(
      size,
      `<line x1="3" y1="12" x2="3" y2="12"/><line x1="7" y1="8" x2="7" y2="16"/><line x1="11" y1="4" x2="11" y2="20"/><line x1="15" y1="9" x2="15" y2="15"/><line x1="19" y1="6" x2="19" y2="18"/>`,
      1.8,
    ),

  timeline: (size: Size = 18): string =>
    svgStroke(
      size,
      `<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="10" x2="8" y2="20"/><line x1="14" y1="10" x2="14" y2="20"/>`,
    ),

  trash: (size: Size = 18): string =>
    svgStroke(
      size,
      `<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>`,
    ),

  pin: (size: Size = 12): string =>
    svgStroke(
      size,
      `<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14l-1.5-2V9a5.5 5.5 0 1 0-11 0v6L5 17z"/>`,
    ),

  grip: (size: Size = 10): string =>
    svgFilled(
      size,
      `<circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/>`,
      'aria-hidden="true"',
    ),

  instrument: (size: Size = 13): string =>
    svgFilled(
      size,
      `<path d="M9 3h6a1 1 0 0 1 1 1v14a3 3 0 1 1-2 0V9h-2v9a3 3 0 1 1-2 0V4a1 1 0 0 1 1-1z" opacity="0.9"/>`,
      'aria-hidden="true"',
    ),

  sparkles: (size: Size = 13): string =>
    svgFilled(
      size,
      `<path d="M12 3l1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3z"/><path d="M19 13l.7 2.2 2.3.8-2.3.8-.7 2.2-.7-2.2-2.3-.8 2.3-.8.7-2.2z" opacity="0.7"/><path d="M5 14l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.9z" opacity="0.55"/>`,
      'aria-hidden="true"',
    ),

  modePlay: (size: Size = 12): string =>
    `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="2" y="3.5" width="7" height="2.2" rx="0.8"/><rect x="2" y="7" width="12" height="2.2" rx="0.8"/><rect x="2" y="10.5" width="5" height="2.2" rx="0.8"/></svg>`,

  modeLive: (size: Size = 13): string =>
    `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 8h2l1.2-3.5L7 12l1.8-6 1.3 3 0.9-1.2H14"/></svg>`,

  modeClub: (size: Size = 13): string =>
    `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="5.2" cy="5.1" r="2"/><circle cx="10.7" cy="5.6" r="1.6"/><path d="M1.8 13.1c.35-2.15 1.85-3.3 3.5-3.3s3.15 1.15 3.5 3.3"/><path d="M8.7 10.2c.65-.45 1.5-.75 2.45-.75 1.45 0 2.55.85 2.9 2.55"/></svg>`,

  wordmark: (): string =>
    `<svg class="ts-home-mark" width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#F6E0C2"/><rect x="8" y="10" width="6" height="10" rx="3" fill="#D9908F"/><rect x="18" y="4" width="6" height="16" rx="3" fill="#E6A94F"/><rect x="6" y="22" width="20" height="6" rx="2" fill="#5E3B24"/></svg>`,

  home: (size: Size = 18): string =>
    svgStroke(
      size,
      `<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>`,
      1.8,
      'aria-hidden="true"',
    ),

  export: (size: Size = 12): string =>
    svgStroke(
      size,
      `<path d="M12 3v12"/><polyline points="7 8 12 3 17 8"/><rect x="3" y="15" width="18" height="6" rx="1.5"/>`,
    ),

  // Three stacked discs evoking chord-tone stacking on a staff.
  chord: (size: Size = 13): string =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">` +
    `<ellipse cx="9" cy="17" rx="4" ry="2.6"/>` +
    `<ellipse cx="13" cy="12" rx="4" ry="2.6" opacity="0.72"/>` +
    `<ellipse cx="17" cy="7" rx="4" ry="2.6" opacity="0.45"/>` +
    `</svg>`,

  // Tiny × glyph used by the keyboard-hint close button.
  smallClose: (size: Size = 9): string =>
    svgStroke(
      size,
      `<line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/>`,
      2.4,
    ),

  // Slider/fader glyph for the HUD reopener — reads as "controls".
  sliders: (size: Size = 14): string =>
    svgStroke(
      size,
      `<line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="16" x2="20" y2="16"/>` +
        `<circle cx="9" cy="8" r="2.2"/><circle cx="15" cy="16" r="2.2"/>`,
      1.9,
    ),

  // Artist's palette — the Appearance / customize trigger. Reads as
  // "theme & looks" far more clearly than a bare colour swatch.
  palette: (size: Size = 16): string =>
    svgStroke(
      size,
      `<circle cx="13.5" cy="6.5" r=".6"/><circle cx="17.5" cy="10.5" r=".6"/>` +
        `<circle cx="8.5" cy="7.5" r=".6"/><circle cx="6.5" cy="12.5" r=".6"/>` +
        `<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z"/>`,
      1.9,
    ),

  // Keycap glyph for the keyboard-hint reopener — reads as "keyboard help".
  keycap: (size: Size = 13): string =>
    svgStroke(
      size,
      `<rect x="3" y="6" width="18" height="12" rx="2.5"/>` +
        `<line x1="7" y1="10" x2="7.01" y2="10"/>` +
        `<line x1="11" y1="10" x2="11.01" y2="10"/>` +
        `<line x1="15" y1="10" x2="15.01" y2="10"/>` +
        `<line x1="7" y1="14" x2="17" y2="14"/>`,
      1.8,
    ),

  // Graduation cap silhouette doubling as a "study / practice" cue.
  practice: (size: Size = 14): string =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `<path d="M3 8.5 12 4l9 4.5-9 4.5L3 8.5z" fill="currentColor" stroke="none" opacity="0.85"/>` +
    `<path d="M7 11v4.5c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V11"/>` +
    `<path d="M21 8.5V14"/>` +
    `</svg>`,

  // Replay / loop-back — used by the intervals quiz to hear a question again.
  replay: (size: Size = 12): string =>
    svgStroke(
      size,
      `<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>`,
      1.8,
    ),

  // Forward chevron — used by the intervals quiz next/finish button.
  next: (size: Size = 12): string => svgStroke(size, `<polyline points="9 6 15 12 9 18"/>`, 1.8),
}

export type IconName = keyof typeof icons
