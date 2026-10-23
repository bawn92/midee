import type { Application, Ticker } from 'pixi.js'
import {
  Container,
  FillGradient,
  Graphics,
  RenderTexture,
  Sprite,
  Text,
  Texture,
  TilingSprite,
} from 'pixi.js'
import { isBlackKey, MIDI_MAX, MIDI_MIN } from '../core/midi/types'
import { shimmerStrength, whiteKeyColumn } from '../ui/liveEntrance'
import { paintPrefs } from '../ui/paint'
import { readCssColor } from './cssColor'
import { highwayKeyCaption, paintHighwayBlackKeys, paintHighwayKeyBed } from './highwayNotes'
import {
  type HandStops,
  handStops,
  IVORY_MID_STOP,
  type KeyPaint,
  paintBlackKeys,
  paintCase,
  paintWhiteKeys,
} from './keyboardLook'
import { KBD, keyFrame, whiteKeyCount } from './keyboardMetrics'
import { keyboardPalette } from './keyboardStyle'
import { keyRect } from './keyGeometry'
import { screenNoteColor } from './noteColor'
import { rangeLayerAlpha, rangeOverlay } from './rangeOverlay'
import { keyboardMaterial } from './scenes'
import { liveNoteColor, type Theme } from './theme'
import type { Viewport } from './viewport'

function handGradient(stops: HandStops): FillGradient {
  return new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    textureSpace: 'local',
    textureSize: 16,
    colorStops: [
      { offset: 0, color: stops.top },
      { offset: IVORY_MID_STOP, color: stops.mid },
      { offset: 1, color: stops.toe },
    ],
  })
}

function collectKeys(
  positions: Map<number, { x: number; width: number }>,
  keyboardHeight: number,
  black: boolean,
): KeyPaint[] {
  const keys: KeyPaint[] = []
  for (let p = MIDI_MIN; p <= MIDI_MAX; p++) {
    if (isBlackKey(p) !== black) continue
    const pos = positions.get(p)
    if (!pos) continue
    const rect = keyRect(p, pos, keyboardHeight)
    keys.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h })
  }
  return keys
}

// The static keyboard base is split into two RenderTextures — a white-keys
// sprite and a black-keys sprite — with the active-key overlay sandwiched
// between them. This lets a pressed white key's color be naturally clipped
// by any black keys sitting on top: the overlay draws on top of the white
// sprite, and the black sprite renders on top of the overlay, covering the
// occluded portions for free via z-order. No masks, no polygon math.
//
// Z-order (bottom → top):
//   1. whiteSprite       — bg + whites + depth + ivory wash + noise
//   2. whiteActiveLayer  — per-frame: tinted overlay for pressed white keys
//   3. blackSprite       — blacks + bevels + rails
//   4. blackActiveLayer  — per-frame: tinted overlay for pressed black keys

// One 96×96 greyscale noise tile is enough — it tiles imperceptibly
// across 88 keys. Cached at module scope so theme rebuilds don't
// re-roll the RNG (would cause visible shimmer across theme cycles).
let ivoryNoiseCanvas: HTMLCanvasElement | null = null
function getIvoryNoiseCanvas(): HTMLCanvasElement {
  if (ivoryNoiseCanvas) return ivoryNoiseCanvas
  const size = 96
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    // Bias brightness high so the grain reads as "ivory", not "static".
    // Alpha is ~8% — subtle but visible on close look.
    const v = 200 + Math.random() * 55
    img.data[i] = v
    img.data[i + 1] = v
    img.data[i + 2] = v
    img.data[i + 3] = 20
  }
  ctx.putImageData(img, 0, 0)
  ivoryNoiseCanvas = c
  return c
}

export class KeyboardRenderer {
  readonly container: Container

  // Static baked layers
  private caseSprite: Sprite | null = null
  private caseTexture: Texture | null = null
  private whiteSprite: Sprite | null = null
  private whiteTexture: Texture | null = null
  private blackSprite: Sprite | null = null
  private blackTexture: Texture | null = null

  // Per-frame active overlays — one per key colour (white vs black) so we
  // can insert the black sprite between them for automatic clipping.
  private whiteActiveLayer: Graphics
  private blackActiveLayer: Graphics

  // Persistent practice-mode hint layers. White-key hints sit below the baked
  // black-key sprite so black keys naturally occlude neighboring white halos;
  // black-key hints sit above the black sprite. This mirrors the active-key
  // z-stack and avoids masks.
  private whitePracticeHintLayer: Graphics
  private blackPracticeHintLayer: Graphics
  private practiceSignature = ''
  private practicePulsePhase = 0
  private practiceTickerHandler: ((ticker: Ticker) => void) | null = null
  private practicePending: ReadonlySet<number> | null = null
  private practiceAccepted: ReadonlySet<number> | null = null

  // Playable-window highlight. Defaults to the whole piano, which draws nothing.
  // Saturation sits under the dim wash; pressed keys outside the range are
  // lifted back above both so the hand tint stays readable.
  private rangeSatLayer: Graphics
  private rangeLayer: Graphics
  private pressLiftLayer: Graphics
  private pressedPitches = new Map<number, number>()
  private caseLayer: Graphics
  private shadowLayer: Graphics
  private lampLayer: Graphics
  private shimmerLayer: Graphics
  private keyLabels: Text[] = []
  private playStart = MIDI_MIN
  private playEnd = MIDI_MAX
  private glideStart: number | null = null
  private glideEnd: number | null = null
  private shimmerMs: number | null = null
  private rangeSignature = ''

  // Snapshot of the last-drawn pitch→color map as a single signature string.
  // If nothing changed we skip the clear + redraw entirely (common during
  // sustained chords and idle frames).
  private lastSignature = ''
  private activeLayerDirty = true
  // Signature of the last baked-texture inputs (size + key positions + theme
  // colors). Used to short-circuit build() when nothing that affects the
  // baked RenderTextures has actually changed — skips a texture destroy/
  // recreate that would otherwise stall the GPU on every theme re-apply.
  private lastBuildSignature = ''

  constructor(
    private app: Application,
    private theme: Theme,
  ) {
    this.container = new Container()
    this.container.label = 'keyboard'

    this.whiteActiveLayer = new Graphics()
    this.whiteActiveLayer.label = 'keyboard-active-white'
    this.blackActiveLayer = new Graphics()
    this.blackActiveLayer.label = 'keyboard-active-black'
    this.whitePracticeHintLayer = new Graphics()
    this.whitePracticeHintLayer.label = 'keyboard-practice-hint-white'
    this.blackPracticeHintLayer = new Graphics()
    this.blackPracticeHintLayer.label = 'keyboard-practice-hint-black'
    this.rangeSatLayer = new Graphics()
    this.rangeSatLayer.label = 'keyboard-range-sat'
    this.rangeSatLayer.blendMode = 'saturation'
    this.rangeLayer = new Graphics()
    this.rangeLayer.label = 'keyboard-range'
    this.pressLiftLayer = new Graphics()
    this.pressLiftLayer.label = 'keyboard-range-press'
    this.caseLayer = new Graphics()
    this.caseLayer.label = 'keyboard-case'
    this.shadowLayer = new Graphics()
    this.shadowLayer.label = 'keyboard-shadow'
    this.shadowLayer.eventMode = 'none'
    this.shadowLayer.alpha = 0
    this.lampLayer = new Graphics()
    this.lampLayer.label = 'keyboard-lamp'
    this.lampLayer.eventMode = 'none'
    this.lampLayer.alpha = 0
    this.shimmerLayer = new Graphics()
    this.shimmerLayer.label = 'keyboard-shimmer'
    this.shimmerLayer.eventMode = 'none'
    // Order matters: white hints/active must sit above the white sprite but
    // below the black sprite. Black hints/active sit above the black sprite.
    // The range wash sits above every key so the playable window reads on
    // both white and black keys. The press lift is last, so a key outside
    // the range keeps its hand tint above the dim. The shimmer sits above
    // that wash and skips any key that is actually pressed. Sprites are
    // inserted by build(). The shadow stays behind the case.
    this.container.addChild(this.shadowLayer)
    this.container.addChild(this.whitePracticeHintLayer)
    this.container.addChild(this.whiteActiveLayer)
    this.container.addChild(this.blackPracticeHintLayer)
    this.container.addChild(this.blackActiveLayer)
    this.container.addChild(this.caseLayer)
    this.container.addChild(this.rangeSatLayer)
    this.container.addChild(this.rangeLayer)
    this.container.addChild(this.pressLiftLayer)
    this.container.addChild(this.lampLayer)
    this.container.addChild(this.shimmerLayer)
  }

  // Build or rebuild the static keyboard textures.
  // Call on init and whenever the canvas is resized.
  build(viewport: Viewport, yOffset: number): void {
    const { keyboardHeight, canvasWidth, pitchMin, pitchMax } = viewport.config
    const positions = viewport.getAllKeyPositions()
    this.viewport = viewport

    // Skip the destroy+re-bake when every input to the bake is unchanged. All
    // the baked pixels depend on: canvas width, keyboard height, the pitch
    // range (which determines key positions), and the three theme colours
    // that tint the white/black keys and gap. Hitting this cache path turns
    // a theme re-apply or redundant rebuildStaticLayers() into a no-op.
    const walnut = keyboardMaterial(this.theme.id) === 'upright-walnut'
    const highway = this.theme.id === 'highway'
    const palette = keyboardPalette(this.theme.id)
    const paint = paintPrefs()
    const sig =
      `${canvasWidth}x${keyboardHeight}|${pitchMin ?? 21}-${pitchMax ?? 108}|` +
      `${this.theme.whiteKey}.${this.theme.blackKey}.${this.theme.keyBorder}|` +
      `${highway ? 'highway' : walnut ? palette.id : 'flat'}|labels=${paint.keyLabels}|y=${yOffset}`
    if (sig === this.lastBuildSignature && this.whiteSprite && this.blackSprite) return
    this.lastBuildSignature = sig

    // Destroy previous textures/sprites to avoid memory leaks. destroy()
    // also removes the sprite from its parent container.
    this.caseTexture?.destroy(true)
    this.caseSprite?.destroy()
    this.whiteTexture?.destroy(true)
    this.whiteSprite?.destroy()
    this.blackTexture?.destroy(true)
    this.blackSprite?.destroy()
    this.caseTexture = null
    this.caseSprite = null

    const whites = whiteKeyCount(pitchMin ?? MIDI_MIN, pitchMax ?? MIDI_MAX)
    const frame = keyFrame(canvasWidth, whites, keyboardHeight)

    // ─── White bake ──────────────────────────────────────────────────
    // Walnut keys are a static canvas: ivory gradient, front face, specular.
    // The press overlay stays Graphics and only rebuilds when the chord changes.
    if (highway) {
      const whiteCanvas = document.createElement('canvas')
      whiteCanvas.width = Math.max(1, canvasWidth)
      whiteCanvas.height = Math.max(1, keyboardHeight)
      const whiteCtx = whiteCanvas.getContext('2d')
      const whites = []
      if (whiteCtx) {
        for (let p = MIDI_MIN; p <= MIDI_MAX; p++) {
          if (isBlackKey(p)) continue
          const pos = positions.get(p)
          if (!pos) continue
          whites.push(keyRect(p, pos, keyboardHeight))
        }
        paintHighwayKeyBed(whiteCtx, whiteCanvas.width, whiteCanvas.height, whites)
      }
      this.whiteTexture = Texture.from(whiteCanvas)
    } else if (walnut) {
      const caseCanvas = document.createElement('canvas')
      caseCanvas.width = Math.max(1, canvasWidth)
      caseCanvas.height = Math.max(1, keyboardHeight)
      paintCase(caseCanvas, palette, frame)
      this.caseTexture = Texture.from(caseCanvas)
      this.caseSprite = new Sprite(this.caseTexture)
      this.caseSprite.y = yOffset

      const whiteCanvas = document.createElement('canvas')
      whiteCanvas.width = caseCanvas.width
      whiteCanvas.height = caseCanvas.height
      const whiteCtx = whiteCanvas.getContext('2d')
      if (whiteCtx)
        paintWhiteKeys(whiteCtx, collectKeys(positions, keyboardHeight, false), palette, frame.v)
      this.whiteTexture = Texture.from(whiteCanvas)
    } else {
      const whiteBake = new Container()
      const bg = new Graphics()
      bg.rect(0, 0, canvasWidth, keyboardHeight).fill({ color: this.theme.blackKey })
      whiteBake.addChild(bg)

      const whiteLayer = new Graphics()
      for (let p = MIDI_MIN; p <= MIDI_MAX; p++) {
        if (isBlackKey(p)) continue
        const pos = positions.get(p)
        if (!pos) continue
        const { x, y, w, h } = keyRect(p, pos, keyboardHeight)
        const wRadius = 3
        whiteLayer.roundRect(x, y, w, h, wRadius).fill({ color: this.theme.whiteKey })
        whiteLayer.roundRect(x, y, w, h, wRadius).fill({ color: 0xfff1d8, alpha: 0.05 })
        whiteLayer.rect(x + wRadius, y, w - wRadius * 2, 1).fill({ color: 0xffffff, alpha: 0.35 })
        whiteLayer.rect(x + 1, y + 1, w - 2, 2).fill({ color: 0xffffff, alpha: 0.18 })
        whiteLayer.rect(x + 1, y + 3, w - 2, 2).fill({ color: 0xffffff, alpha: 0.08 })
        whiteLayer.rect(x + 1, y + h - 8, w - 2, 4).fill({ color: 0x6b4a2f, alpha: 0.05 })
        whiteLayer.rect(x + 1, y + h - 5, w - 2, 3).fill({ color: 0x000000, alpha: 0.07 })
        whiteLayer.rect(x + 1, y + h - 2, w - 2, 1).fill({ color: 0x000000, alpha: 0.18 })
        whiteLayer
          .rect(x + wRadius, y + h - 1, w - wRadius * 2, 1)
          .fill({ color: 0x000000, alpha: 0.3 })
      }
      whiteBake.addChild(whiteLayer)
      const noiseTex = Texture.from(getIvoryNoiseCanvas())
      const noise = new TilingSprite({
        texture: noiseTex,
        width: canvasWidth,
        height: keyboardHeight,
      })
      whiteBake.addChild(noise)
      const whiteTexture = RenderTexture.create({ width: canvasWidth, height: keyboardHeight })
      this.app.renderer.render({ container: whiteBake, target: whiteTexture })
      this.whiteTexture = whiteTexture
      whiteBake.destroy({ children: true })
      noiseTex.destroy(true)
    }

    // ─── Black bake ──────────────────────────────────────────────────
    if (highway) {
      const blackCanvas = document.createElement('canvas')
      blackCanvas.width = Math.max(1, canvasWidth)
      blackCanvas.height = Math.max(1, keyboardHeight)
      const blackCtx = blackCanvas.getContext('2d')
      const blacks = []
      if (blackCtx) {
        for (let p = MIDI_MIN; p <= MIDI_MAX; p++) {
          if (!isBlackKey(p)) continue
          const pos = positions.get(p)
          if (!pos) continue
          blacks.push(keyRect(p, pos, keyboardHeight))
        }
        paintHighwayBlackKeys(blackCtx, blackCanvas.width, blackCanvas.height, blacks)
      }
      this.blackTexture = Texture.from(blackCanvas)
    } else if (walnut) {
      const blackCanvas = document.createElement('canvas')
      blackCanvas.width = Math.max(1, canvasWidth)
      blackCanvas.height = Math.max(1, keyboardHeight)
      const blackCtx = blackCanvas.getContext('2d')
      if (blackCtx)
        paintBlackKeys(blackCtx, collectKeys(positions, keyboardHeight, true), palette, frame.v)
      this.blackTexture = Texture.from(blackCanvas)
    } else {
      const blackBake = new Container()
      const blackLayer = new Graphics()
      for (let p = MIDI_MIN; p <= MIDI_MAX; p++) {
        if (!isBlackKey(p)) continue
        const pos = positions.get(p)
        if (!pos) continue
        const { x, y, w, h, radius: bRadius } = keyRect(p, pos, keyboardHeight)
        blackLayer.roundRect(x, y, w, h, bRadius).fill({ color: this.theme.blackKey })
        blackLayer.rect(x + bRadius, y, w - bRadius * 2, 1).fill({ color: 0xffffff, alpha: 0.28 })
        blackLayer.rect(x + 1, y + 1, w - 2, 2).fill({ color: 0xffffff, alpha: 0.12 })
        blackLayer.rect(x + 1, y + h - 3, w - 2, 2).fill({ color: 0xffffff, alpha: 0.1 })
        blackLayer
          .rect(x + bRadius, y + h - 1, w - bRadius * 2, 1)
          .fill({ color: 0xffffff, alpha: 0.22 })
        const railY = y + bRadius
        const railH = h - bRadius * 2
        blackLayer.rect(x, railY, 1, railH).fill({ color: 0xffffff, alpha: 0.44 })
        blackLayer.rect(x + 1, railY, 1, railH).fill({ color: 0xffffff, alpha: 0.2 })
        blackLayer.rect(x + w - 1, railY, 1, railH).fill({ color: 0xffffff, alpha: 0.28 })
        blackLayer.rect(x + w - 2, railY, 1, railH).fill({ color: 0xffffff, alpha: 0.12 })
      }
      blackBake.addChild(blackLayer)
      const blackTexture = RenderTexture.create({ width: canvasWidth, height: keyboardHeight })
      this.app.renderer.render({ container: blackBake, target: blackTexture })
      this.blackTexture = blackTexture
      blackBake.destroy({ children: true })
    }

    // ─── Assemble the z-stack ────────────────────────────────────────
    // After the destroys above, the container holds only the four overlay
    // layers. Reinsert the sprites
    // at the correct indices so the final order is:
    //   whiteSprite, whitePracticeHintLayer, whiteActiveLayer,
    //   blackSprite, blackPracticeHintLayer, blackActiveLayer, rangeLayer
    this.whiteSprite = new Sprite(this.whiteTexture ?? Texture.EMPTY)
    this.whiteSprite.y = yOffset
    if (this.caseSprite) {
      this.caseSprite.y = yOffset
      this.container.addChild(this.caseSprite)
    }
    this.container.addChild(this.whiteSprite)

    this.blackSprite = new Sprite(this.blackTexture ?? Texture.EMPTY)
    this.blackSprite.y = yOffset
    this.container.addChild(this.blackSprite)

    this.whitePracticeHintLayer.y = yOffset
    this.whiteActiveLayer.y = yOffset
    this.blackPracticeHintLayer.y = yOffset
    this.blackActiveLayer.y = yOffset
    this.caseLayer.y = yOffset
    this.drawCase(canvasWidth, keyboardHeight, walnut)
    this.drawKeyLabels(positions, yOffset, keyboardHeight, walnut, highway)
    this.rangeSatLayer.y = yOffset
    this.rangeLayer.y = yOffset
    this.pressLiftLayer.y = yOffset
    this.paintArrivalLight(canvasWidth, keyboardHeight, yOffset)
    this.stackKeyboard()
    this.rangeSignature = ''
    // Force a redraw of the hint layer on the next setPracticeHints call —
    // the geometry depends on the freshly-built viewport.
    this.practiceSignature = ''
  }

  // Called every frame — draws only the keys that are currently pressed, each
  // tinted with the color of the track/source it came from. Routes white and
  // black presses to separate Graphics layers so the black static sprite can
  // clip the white overlay by sitting on top of it in the z-stack.
  drawActiveKeys(activeByPitch: Map<number, number>, viewport: Viewport): void {
    const sig = this.signatureFor(activeByPitch)
    if (!this.activeLayerDirty && sig === this.lastSignature) return
    this.activeLayerDirty = false
    this.lastSignature = sig
    this.pressedPitches.clear()
    for (const [pitch, color] of activeByPitch) this.pressedPitches.set(pitch, color)
    this.whiteActiveLayer.clear()
    this.blackActiveLayer.clear()

    const { keyboardHeight } = viewport.config
    const positions = viewport.getAllKeyPositions()
    const fallback = liveNoteColor(this.theme)
    const walnut = keyboardMaterial(this.theme.id) === 'upright-walnut'
    const palette = keyboardPalette(this.theme.id)

    for (const [pitch, color] of activeByPitch) {
      const pos = positions.get(pitch)
      if (!pos) continue
      const tint = color || fallback
      const isBlack = isBlackKey(pitch)
      const layer = isBlack ? this.blackActiveLayer : this.whiteActiveLayer
      const { x, y, w, h, radius } = keyRect(pitch, pos, keyboardHeight)
      const left = tint === palette.noteLh || (tint !== palette.noteRh && pitch < 60)
      const fill = walnut
        ? this.handFill(left ? palette.noteLh : palette.noteRh, left)
        : { color: tint, alpha: 1 }
      this.fillKey(layer, x, y, w, h, palette.hairline ? 0 : radius, fill)
    }
  }

  // One clipped key. White presses sit under the black-key sprite, so a
  // black key stays black where it overlaps. Rebuilt only when the chord changes.
  private fillKey(
    layer: Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
    fill: FillGradient | { color: number; alpha?: number },
  ): void {
    const r = Math.max(0, Math.min(radius, w / 2, h / 2))
    layer.moveTo(x, y)
    layer.lineTo(x + w, y)
    if (r < 0.5) {
      layer.lineTo(x + w, y + h)
      layer.lineTo(x, y + h)
    } else {
      layer.lineTo(x + w, y + h - r)
      layer.arcTo(x + w, y + h, x + w - r, y + h, r)
      layer.arcTo(x, y + h, x, y + h - r, r)
    }
    layer.closePath()
    layer.fill(fill)
  }

  private handFills = new Map<string, FillGradient>()

  private handFill(hand: number, left: boolean): FillGradient {
    const key = `${this.theme.id}:${hand}:${left ? 'l' : 'r'}`
    const cached = this.handFills.get(key)
    if (cached) return cached
    const stops = handStops(hand, left, this.theme.id)
    const fill = handGradient(stops)
    this.handFills.set(key, fill)
    return fill
  }

  updateTheme(theme: Theme): void {
    this.theme = theme
    for (const fill of this.handFills.values()) fill.destroy()
    this.handFills.clear()
    // Colors baked into the active-key fill changed — force a redraw.
    this.activeLayerDirty = true
    // Practice hint colours follow the active theme accent.
    this.practiceSignature = ''
    this.rangeSignature = ''
  }

  private drawKeyLabels(
    positions: Map<number, { x: number; width: number }>,
    yOffset: number,
    keyboardHeight: number,
    walnut: boolean,
    highway: boolean,
  ): void {
    for (const label of this.keyLabels) label.destroy()
    this.keyLabels = []
    if (highway) {
      this.drawHighwayLabels(positions, yOffset, keyboardHeight)
      return
    }
    if (!walnut || !paintPrefs().keyLabels) return
    for (const [pitch, pos] of positions) {
      if (pitch % 12 !== 0) continue
      const octave = Math.floor(pitch / 12) - 1
      const text = new Text({
        text: `C${octave}`,
        style: {
          fontFamily: 'Figtree, system-ui, sans-serif',
          fontSize: 11,
          fontWeight: '600',
          fill: 0x7e604b,
        },
      })
      const v = keyboardHeight / KBD.caseH
      text.anchor.set(0.5, 0.5)
      text.x = pos.x + pos.width / 2
      text.y = yOffset + (KBD.keysY + KBD.keysH * 0.82) * v
      text.style.fontSize = Math.max(8, 12 * (pos.width / KBD.pitch))
      this.container.addChild(text)
      this.keyLabels.push(text)
    }
  }

  // Letter on every white key, flat name on every black key. Drawn above the
  // cyan press so the caption stays readable on the lit key.
  private drawHighwayLabels(
    positions: Map<number, { x: number; width: number }>,
    yOffset: number,
    keyboardHeight: number,
  ): void {
    for (const [pitch, pos] of positions) {
      const black = isBlackKey(pitch)
      const rect = keyRect(pitch, pos, keyboardHeight)
      const caption = highwayKeyCaption(pitch)
      const fit = rect.w / (caption.length * 0.62)
      const size = Math.min(black ? 10 : 13, rect.w * (black ? 0.42 : 0.48), fit)
      if (size < 7) continue
      const text = new Text({
        text: caption,
        style: {
          fontFamily: 'Figtree, system-ui, sans-serif',
          fontSize: size,
          fontWeight: '600',
          fill: black ? 0xd5d5de : 0x6d6d78,
        },
      })
      text.anchor.set(0.5, 1)
      text.x = rect.x + rect.w / 2
      text.y = yOffset + rect.y + rect.h - (black ? 3 : 5)
      text.eventMode = 'none'
      this.keyLabels.push(text)
    }
  }

  // Inclusive MIDI pitches of the controller window. The full piano draws
  // no wash — every key is already in range.
  setPlayableRange(start: number, end: number): void {
    if (this.playStart === start && this.playEnd === end) return
    this.playStart = start
    this.playEnd = end
    this.rangeSignature = ''
  }

  // Visual window only. Null uses the real playable range. A press still
  // uses playStart/playEnd, so the glide cannot silence a key.
  setRangeGlide(start: number | null, end: number | null): void {
    if (this.glideStart === start && this.glideEnd === end) return
    this.glideStart = start
    this.glideEnd = end
    this.rangeSignature = ''
  }

  setArrivalLight(alpha: number): void {
    const next = Math.min(1, Math.max(0, alpha))
    this.shadowLayer.alpha = next
    this.lampLayer.alpha = next
  }

  setShimmerClock(elapsedMs: number | null): void {
    this.shimmerMs = elapsedMs
  }

  drawRange(viewport: Viewport): void {
    const { canvasWidth, keyboardHeight, pitchMin, pitchMax } = viewport.config
    const overlay = rangeOverlay()
    const playAlpha = rangeLayerAlpha('dim')
    const windowStart = this.glideStart ?? this.playStart
    const windowEnd = this.glideEnd ?? this.playEnd
    const sig =
      `${windowStart}-${windowEnd}|${canvasWidth}x${keyboardHeight}|` +
      `${pitchMin ?? MIDI_MIN}-${pitchMax ?? MIDI_MAX}|${this.theme.id}|` +
      `${overlay.style}|${overlay.addonStrip}|${overlay.addonLanes}|` +
      `${Math.round(playAlpha * 30)}|${this.lastSignature}`
    if (sig === this.rangeSignature) return
    this.rangeSignature = sig
    this.rangeSatLayer.clear()
    this.rangeLayer.clear()
    this.paintPressLift(viewport, playAlpha)

    const lo = pitchMin ?? MIDI_MIN
    const hi = pitchMax ?? MIDI_MAX
    if (playAlpha < 0.02) return
    if (windowStart <= lo && windowEnd >= hi) return

    const positions = viewport.getAllKeyPositions()
    const startPos = positions.get(windowStart)
    const endPos = positions.get(windowEnd)
    if (!startPos || !endPos) return
    const x0 = startPos.x
    const x1 = endPos.x + endPos.width
    const walnut = keyboardMaterial(this.theme.id) === 'upright-walnut'
    const frame = keyFrame(
      canvasWidth,
      whiteKeyCount(pitchMin ?? MIDI_MIN, pitchMax ?? MIDI_MAX),
      keyboardHeight,
    )
    const dim = readCssColor('--range-dim', { color: 0x2a1a0f, alpha: 0.4 })
    const y = walnut ? frame.keysY : 0
    const h = walnut ? frame.keysH : keyboardHeight
    const wash = (x: number, w: number) => {
      if (this.theme.id !== 'highway') {
        this.rangeSatLayer.rect(x, y, w, h).fill({ color: 0x808080, alpha: 0.4 * playAlpha })
      }
      this.rangeLayer.rect(x, y, w, h).fill({ color: dim.color, alpha: dim.alpha * playAlpha })
    }
    if (x0 > 0) wash(0, x0)
    if (x1 < canvasWidth) wash(x1, canvasWidth - x1)
  }

  // Hand tint for keys outside the window, drawn above the dim wash.
  private paintPressLift(viewport: Viewport, dimAlpha: number): void {
    this.pressLiftLayer.clear()
    if (dimAlpha < 0.02 || this.pressedPitches.size === 0) return
    const { keyboardHeight } = viewport.config
    const positions = viewport.getAllKeyPositions()
    const palette = keyboardPalette(this.theme.id)
    const walnut = keyboardMaterial(this.theme.id) === 'upright-walnut'
    const fallback = liveNoteColor(this.theme)
    for (const [pitch, color] of this.pressedPitches) {
      if (pitch >= this.playStart && pitch <= this.playEnd) continue
      const pos = positions.get(pitch)
      if (!pos) continue
      const tint = color || fallback
      const left = tint === palette.noteLh || (tint !== palette.noteRh && pitch < 60)
      const { x, y, w, h, radius } = keyRect(pitch, pos, keyboardHeight)
      const fill = walnut
        ? this.handFill(left ? palette.noteLh : palette.noteRh, left)
        : { color: tint, alpha: 1 }
      this.fillKey(this.pressLiftLayer, x, y, w, h, palette.hairline ? 0 : radius, fill)
    }
  }

  // The case is baked into its own sprite under the keys. This layer stays
  // empty so a theme swap can clear an older fallboard without a leftover.
  private drawCase(_canvasWidth: number, _keyboardHeight: number, _walnut: boolean): void {
    this.caseLayer.clear()
  }

  // White presses sit under the black-key sprite, so a lit white key cannot
  // paint over the ebony that overlaps it.
  private stackKeyboard(): void {
    const order = [
      this.shadowLayer,
      this.caseSprite,
      this.whiteSprite,
      this.whitePracticeHintLayer,
      this.whiteActiveLayer,
      this.blackSprite,
      this.blackPracticeHintLayer,
      this.blackActiveLayer,
      this.caseLayer,
      this.rangeSatLayer,
      this.rangeLayer,
      this.pressLiftLayer,
      ...this.keyLabels,
      this.lampLayer,
      this.shimmerLayer,
    ]
    for (const child of order) {
      if (child) this.container.addChild(child)
    }
  }

  // Contact shadow on the wall and a small pool of hand-coloured light.
  // Both travel with the keyboard container and fade in via setArrivalLight.
  private paintArrivalLight(canvasWidth: number, keyboardHeight: number, yOffset: number): void {
    this.shadowLayer.clear()
    this.lampLayer.clear()
    if (this.theme.id === 'highway') return
    const palette = keyboardPalette(this.theme.id)
    const shadowH = Math.max(12, Math.round(keyboardHeight * 0.16))
    for (let i = 0; i < 6; i++) {
      const t = i / 6
      this.shadowLayer
        .rect(0, yOffset - shadowH + (shadowH * i) / 6, canvasWidth, shadowH / 6 + 1)
        .fill({ color: palette.caseDark, alpha: 0.02 + t * 0.1 })
    }
    const cx = canvasWidth / 2
    const cy = yOffset + keyboardHeight * 0.34
    const pools: readonly [number, number, number][] = [
      [0.18, 0.2, 0.1],
      [0.28, 0.32, 0.06],
      [0.4, 0.46, 0.035],
    ]
    for (const [rx, ry, alpha] of pools) {
      this.lampLayer
        .ellipse(cx, cy, canvasWidth * rx, keyboardHeight * ry)
        .fill({ color: palette.noteRh, alpha })
      this.lampLayer
        .ellipse(
          cx,
          cy - keyboardHeight * 0.08,
          canvasWidth * rx * 0.72,
          keyboardHeight * ry * 0.55,
        )
        .fill({ color: palette.highlight, alpha: alpha * 0.8 })
    }
  }

  // Left-to-right wash in the scene's hand colours. A pressed key is left
  // alone so the real note light wins.
  drawShimmer(viewport: Viewport): void {
    this.shimmerLayer.clear()
    if (this.theme.id === 'highway') return
    const elapsed = this.shimmerMs
    if (elapsed === null) return
    const positions = viewport.getAllKeyPositions()
    const keyboardHeight = viewport.config.keyboardHeight
    const palette = keyboardPalette(this.theme.id)
    for (let pitch = MIDI_MIN; pitch <= MIDI_MAX; pitch++) {
      if (this.pressedPitches.has(pitch)) continue
      const alpha = shimmerStrength(elapsed, whiteKeyColumn(pitch))
      if (alpha < 0.01) continue
      const pos = positions.get(pitch)
      if (!pos) continue
      const rect = keyRect(pitch, pos, keyboardHeight)
      this.shimmerLayer
        .roundRect(rect.x, rect.y, rect.w, rect.h, rect.radius)
        .fill({ color: pitch < 60 ? palette.noteLh : palette.noteRh, alpha })
    }
  }

  // Public hook for the parent renderer to swap in the current practice-mode
  // hint. Pass `null` to clear. The pulse animation runs on a private ticker so
  // the hint breathes even on frames where the main render loop is idle (file
  // playback paused, no live notes pending).
  setPracticeHints(
    pending: ReadonlySet<number> | null,
    accepted: ReadonlySet<number> | null,
  ): void {
    this.practicePending = pending
    this.practiceAccepted = accepted
    const sig = this.hintSignature(pending, accepted)
    if (sig !== this.practiceSignature) {
      this.practiceSignature = sig
      this.drawPracticeHints()
    }

    const wantTicker = !!pending && pending.size > 0
    if (wantTicker && !this.practiceTickerHandler) {
      this.practiceTickerHandler = (ticker) => {
        // ticker.deltaTime is Pixi units (~1 per 16.6ms). Scale to a slow
        // pulse — about one full breath every 1.4 seconds.
        this.practicePulsePhase += ticker.deltaTime * 0.075
        this.drawPracticeHints()
      }
      this.app.ticker.add(this.practiceTickerHandler)
    } else if (!wantTicker && this.practiceTickerHandler) {
      this.app.ticker.remove(this.practiceTickerHandler)
      this.practiceTickerHandler = null
      this.practicePulsePhase = 0
      this.drawPracticeHints()
    }
  }

  private drawPracticeHints(): void {
    this.whitePracticeHintLayer.clear()
    this.blackPracticeHintLayer.clear()
    const pending = this.practicePending
    const accepted = this.practiceAccepted
    if ((!pending || pending.size === 0) && (!accepted || accepted.size === 0)) return
    const viewport = this.viewport
    if (!viewport) return
    const yOffset = this.whiteSprite?.y ?? 0
    const kbHeight = viewport.config.keyboardHeight
    if (kbHeight === 0) return

    // Pulse: 0..1 sine, normalised so even when the user has played part of
    // the chord the remaining keys keep a strong baseline glow.
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(this.practicePulsePhase))

    const positions = viewport.getAllKeyPositions()

    this.whitePracticeHintLayer.y = yOffset
    this.blackPracticeHintLayer.y = yOffset
    const highway = this.theme.id === 'highway'
    const hintColor = (pitch: number) =>
      screenNoteColor(
        this.theme,
        pitch,
        pitch < 60 ? 'left' : 'right',
        this.theme.trackColors[pitch < 60 ? 1 : 0] ?? this.theme.accent,
      )

    if (accepted) {
      for (const pitch of accepted) {
        const pos = positions.get(pitch)
        if (!pos) continue
        const layer = isBlackKey(pitch) ? this.blackPracticeHintLayer : this.whitePracticeHintLayer
        const acceptedTint = highway ? hintColor(pitch) : 0x9ee7b8
        this.drawPracticeKey(layer, pitch, pos, kbHeight, acceptedTint, {
          bodyAlpha: highway ? 0.72 : isBlackKey(pitch) ? 0.36 : 0.25,
          stripAlpha: highway ? 0 : 0.58,
          haloScale: highway ? 0 : 0.55,
        })
      }
    }

    if (!pending) return
    for (const pitch of pending) {
      const pos = positions.get(pitch)
      if (!pos) continue
      const isBlack = isBlackKey(pitch)
      const layer = isBlack ? this.blackPracticeHintLayer : this.whitePracticeHintLayer
      const tint = highway ? hintColor(pitch) : this.theme.accent
      this.drawPracticeKey(layer, pitch, pos, kbHeight, tint, {
        bodyAlpha: highway ? 1 : (isBlack ? 0.32 : 0.22) * pulse,
        stripAlpha: highway ? 0 : 0.55 * pulse,
        haloScale: highway ? 0 : pulse,
      })
    }
  }

  private drawPracticeKey(
    layer: Graphics,
    pitch: number,
    pos: { x: number; width: number },
    keyboardHeight: number,
    tint: number,
    opts: { bodyAlpha: number; stripAlpha: number; haloScale: number },
  ): void {
    const { x, y, w, h, radius } = keyRect(pitch, pos, keyboardHeight)

    if (opts.haloScale > 0) {
      const halos: readonly [number, number][] = [
        [12, 0.05 * opts.haloScale],
        [7, 0.1 * opts.haloScale],
        [3, 0.18 * opts.haloScale],
      ]
      for (const [expand, alpha] of halos) {
        layer.roundRect(x - expand, y - expand, w + expand * 2, h + expand * 2, radius + expand)
        layer.fill({ color: tint, alpha })
      }
    }

    layer.roundRect(x, y, w, h, radius)
    layer.fill({ color: tint, alpha: opts.bodyAlpha })

    if (opts.stripAlpha > 0) {
      layer.rect(x + radius, y, w - radius * 2, 2)
      layer.fill({ color: tint, alpha: opts.stripAlpha })
    }
  }

  private hintSignature(
    pending: ReadonlySet<number> | null,
    accepted: ReadonlySet<number> | null,
  ): string {
    const p = pending ? Array.from(pending).sort().join('.') : ''
    const a = accepted ? Array.from(accepted).sort().join('.') : ''
    return `${p}|${a}`
  }

  // Viewport of the current bake; practice hints read key layout from it.
  private viewport: Viewport | null = null

  // Cheap change-detection: concatenate sorted pitch:color pairs. The map is
  // small (≤ ~10 active pitches at once) so this is essentially free and
  // catches both pitch-change and color-change in one check.
  private signatureFor(activeByPitch: Map<number, number>): string {
    if (activeByPitch.size === 0) return ''
    const parts: string[] = []
    for (const [pitch, color] of activeByPitch) parts.push(`${pitch}:${color}`)
    parts.sort()
    return parts.join(',')
  }
}
