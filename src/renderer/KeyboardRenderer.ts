import type { Application, Ticker } from 'pixi.js'
import { Container, Graphics, RenderTexture, Sprite, Text, Texture, TilingSprite } from 'pixi.js'
import { isBlackKey, MIDI_MAX, MIDI_MIN } from '../core/midi/types'
import { shimmerStrength, whiteKeyColumn } from '../ui/liveEntrance'
import { paintPrefs } from '../ui/paint'
import { readCssColor } from './cssColor'
import { KBD, keyFrame, whiteKeyCount } from './keyboardMetrics'
import { type KeyboardPalette, keyboardHighlightAlpha, keyboardPalette } from './keyboardStyle'
import { keyRect } from './keyGeometry'
import { rangeLayerAlpha, rangeOverlay } from './rangeOverlay'
import { keyboardMaterial } from './scenes'
import { liveNoteColor, type Theme } from './theme'
import type { Viewport } from './viewport'

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

function cssHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

function mixHex(a: number, b: number, amount: number): string {
  const ar = (a >> 16) & 0xff
  const ag = (a >> 8) & 0xff
  const ab = a & 0xff
  const br = (b >> 16) & 0xff
  const bg = (b >> 8) & 0xff
  const bb = b & 0xff
  const ch = (from: number, to: number) => Math.round(from + (to - from) * amount)
  return `rgb(${ch(ar, br)} ${ch(ag, bg)} ${ch(ab, bb)})`
}

// Case, grain, felt and the top highlight. Keys are drawn on top, inset by
// the cheeks, so the rounded corners stay the wood.
function paintCase(
  canvas: HTMLCanvasElement,
  palette: KeyboardPalette,
  frame: ReturnType<typeof keyFrame>,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  const r = Math.min(frame.caseR, h / 2, w / 2)
  ctx.beginPath()
  ctx.moveTo(0, r)
  ctx.arcTo(0, 0, r, 0, r)
  ctx.lineTo(w - r, 0)
  ctx.arcTo(w, 0, w, r, r)
  ctx.lineTo(w, h)
  ctx.lineTo(0, h)
  ctx.closePath()
  ctx.fillStyle = cssHex(palette.caseDark)
  ctx.fill()
  if (!palette.hairline) {
    const fade = ctx.createLinearGradient(0, 0, 0, h)
    fade.addColorStop(0, cssHex(palette.caseLight))
    fade.addColorStop(1, mixHex(palette.caseLight, palette.caseDark, 0.85))
    ctx.fillStyle = fade
    ctx.fill()
  }
  if (palette.grain > 0) {
    ctx.save()
    ctx.clip()
    ctx.globalAlpha = palette.grain
    ctx.translate(w / 2, h / 2)
    ctx.rotate((-2.3 * Math.PI) / 180)
    ctx.translate(-w / 2, -h / 2)
    const grain = ctx.createLinearGradient(0, 0, w, 0)
    for (let i = 0; i <= 24; i++) {
      const alpha = i % 3 === 0 ? 0.18 : i % 2 === 1 ? 0.04 : 0.1
      grain.addColorStop(i / 24, `rgba(0,0,0,${alpha})`)
    }
    ctx.fillStyle = grain
    ctx.fillRect(-h, -h, w + h * 2, h * 3)
    ctx.restore()
  }
  if (palette.lacquer) {
    const lacquer = ctx.createLinearGradient(0, 0, 0, 40 * frame.v)
    lacquer.addColorStop(0, 'rgba(255,255,255,0.22)')
    lacquer.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = lacquer
    ctx.fillRect(0, 0, w, 40 * frame.v)
  }
  if (!palette.hairline) {
    const hi = Math.max(1, frame.v)
    ctx.fillStyle = cssHex(palette.highlight)
    ctx.globalAlpha = keyboardHighlightAlpha(palette.id)
    ctx.fillRect(0, hi, w, hi)
    ctx.globalAlpha = 1
  }
  const feltH = Math.max(palette.hairline ? 1 : frame.v, palette.feltPx * frame.v)
  ctx.fillStyle = cssHex(palette.felt)
  ctx.fillRect(
    frame.cheek,
    palette.hairline ? frame.feltY : frame.feltY,
    w - frame.cheek * 2,
    feltH,
  )
  if (palette.led) {
    const stripH = Math.max(2, 6 * frame.v)
    const stripY = 18 * frame.v
    ctx.fillStyle = cssHex(palette.strip)
    ctx.beginPath()
    ctx.roundRect(frame.cheek, stripY, w - frame.cheek * 2, stripH, stripH / 2)
    ctx.fill()
  }
}

export class KeyboardRenderer {
  readonly container: Container

  // Static baked layers
  private caseSprite: Sprite | null = null
  private caseTexture: Texture | null = null
  private whiteSprite: Sprite | null = null
  private whiteTexture: RenderTexture | null = null
  private blackSprite: Sprite | null = null
  private blackTexture: RenderTexture | null = null

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
    const palette = keyboardPalette(this.theme.id)
    const paint = paintPrefs()
    const sig =
      `${canvasWidth}x${keyboardHeight}|${pitchMin ?? 21}-${pitchMax ?? 108}|` +
      `${this.theme.whiteKey}.${this.theme.blackKey}.${this.theme.keyBorder}|` +
      `${walnut ? palette.id : 'flat'}|labels=${paint.keyLabels}|y=${yOffset}`
    if (sig === this.lastBuildSignature && this.whiteSprite && this.blackSprite) return
    this.lastBuildSignature = sig

    // Destroy previous textures/sprites to avoid memory leaks. destroy()
    // also removes the sprite from its parent container.
    this.caseTexture?.destroy(true)
    this.caseSprite?.destroy()
    this.whiteTexture?.destroy()
    this.whiteSprite?.destroy()
    this.blackTexture?.destroy()
    this.blackSprite?.destroy()
    this.caseTexture = null
    this.caseSprite = null

    const whites = whiteKeyCount(pitchMin ?? MIDI_MIN, pitchMax ?? MIDI_MAX)
    const frame = keyFrame(canvasWidth, whites, keyboardHeight)

    // ─── White bake ──────────────────────────────────────────────────
    const whiteBake = new Container()

    if (walnut) {
      const caseCanvas = document.createElement('canvas')
      caseCanvas.width = Math.max(1, canvasWidth)
      caseCanvas.height = Math.max(1, keyboardHeight)
      paintCase(caseCanvas, palette, frame)
      this.caseTexture = Texture.from(caseCanvas)
      this.caseSprite = new Sprite(this.caseTexture)
      this.caseSprite.y = yOffset
    } else {
      const bg = new Graphics()
      bg.rect(0, 0, canvasWidth, keyboardHeight).fill({ color: this.theme.blackKey })
      whiteBake.addChild(bg)
    }

    const whiteLayer = new Graphics()
    for (let p = MIDI_MIN; p <= MIDI_MAX; p++) {
      if (isBlackKey(p)) continue
      const pos = positions.get(p)
      if (!pos) continue
      const { x, y, w, h } = keyRect(p, pos, keyboardHeight)

      if (walnut) {
        this.drawWhiteKey(whiteLayer, x, y, w, h, frame.v, palette, false)
      } else {
        const wRadius = 3
        // Body
        whiteLayer.roundRect(x, y, w, h, wRadius).fill({ color: this.theme.whiteKey })

        // Ivory warmth wash — pure white keys read sterile; real ivory has a
        // cream undertone. A ~4% cream overlay shifts the whole material
        // toward "instrument" without tinting any one area obviously.
        whiteLayer.roundRect(x, y, w, h, wRadius).fill({ color: 0xfff1d8, alpha: 0.05 })

        // Top highlight — 4px, stacked rects simulate a soft gradient. Inset
        // by the corner radius so the highlight respects the key's rounded
        // corners and doesn't bleed into the seam between keys.
        whiteLayer.rect(x + wRadius, y, w - wRadius * 2, 1).fill({ color: 0xffffff, alpha: 0.35 })
        whiteLayer.rect(x + 1, y + 1, w - 2, 2).fill({ color: 0xffffff, alpha: 0.18 })
        whiteLayer.rect(x + 1, y + 3, w - 2, 2).fill({ color: 0xffffff, alpha: 0.08 })

        // Bottom shadow — 5px, three stacked rects fading into a strong 1px
        // edge line. Gives each key the "slightly dipped at the player's
        // edge" read you'd see on a real piano under stage lighting.
        whiteLayer.rect(x + 1, y + h - 8, w - 2, 4).fill({ color: 0x6b4a2f, alpha: 0.05 })
        whiteLayer.rect(x + 1, y + h - 5, w - 2, 3).fill({ color: 0x000000, alpha: 0.07 })
        whiteLayer.rect(x + 1, y + h - 2, w - 2, 1).fill({ color: 0x000000, alpha: 0.18 })
        whiteLayer
          .rect(x + wRadius, y + h - 1, w - wRadius * 2, 1)
          .fill({ color: 0x000000, alpha: 0.3 })
      }
    }
    whiteBake.addChild(whiteLayer)

    let noiseTex: Texture | null = null
    if (!walnut) {
      noiseTex = Texture.from(getIvoryNoiseCanvas())
      const noise = new TilingSprite({
        texture: noiseTex,
        width: canvasWidth,
        height: keyboardHeight,
      })
      whiteBake.addChild(noise)
    }

    this.whiteTexture = RenderTexture.create({ width: canvasWidth, height: keyboardHeight })
    this.app.renderer.render({ container: whiteBake, target: this.whiteTexture })
    whiteBake.destroy({ children: true })
    noiseTex?.destroy(true)

    // ─── Black bake ──────────────────────────────────────────────────
    // Black keys + bevels + rails. Transparent background so the active
    // overlay below can show through inter-black-key gaps.
    const blackBake = new Container()
    const blackLayer = new Graphics()
    for (let p = MIDI_MIN; p <= MIDI_MAX; p++) {
      if (!isBlackKey(p)) continue
      const pos = positions.get(p)
      if (!pos) continue
      const { x, y, w, h, radius: bRadius } = keyRect(p, pos, keyboardHeight)

      if (walnut) {
        this.drawBlackKey(blackLayer, x, y, w, h, frame.v, palette, false)
      } else {
        // Body
        blackLayer.roundRect(x, y, w, h, bRadius).fill({ color: this.theme.blackKey })

        // Top bevel — hints at the rounded physical top of a real black key.
        blackLayer.rect(x + bRadius, y, w - bRadius * 2, 1).fill({ color: 0xffffff, alpha: 0.28 })
        blackLayer.rect(x + 1, y + 1, w - 2, 2).fill({ color: 0xffffff, alpha: 0.12 })

        // Bottom lip — where the finger rests on a physical piano. A thin
        // bright edge catches light and sells the 3D form cheaply.
        blackLayer.rect(x + 1, y + h - 3, w - 2, 2).fill({ color: 0xffffff, alpha: 0.1 })
        blackLayer
          .rect(x + bRadius, y + h - 1, w - bRadius * 2, 1)
          .fill({ color: 0xffffff, alpha: 0.22 })

        // Side-edge rails — reflective highlights along the left and right
        // edges, running the full length. Directional asymmetry (left
        // brighter than right) sells a light source from the upper-left.
        const railY = y + bRadius
        const railH = h - bRadius * 2
        // Left rail (toward the light source)
        blackLayer.rect(x, railY, 1, railH).fill({ color: 0xffffff, alpha: 0.44 })
        blackLayer.rect(x + 1, railY, 1, railH).fill({ color: 0xffffff, alpha: 0.2 })
        // Right rail (opposite side, dimmer)
        blackLayer.rect(x + w - 1, railY, 1, railH).fill({ color: 0xffffff, alpha: 0.28 })
        blackLayer.rect(x + w - 2, railY, 1, railH).fill({ color: 0xffffff, alpha: 0.12 })
      }
    }
    blackBake.addChild(blackLayer)

    this.blackTexture = RenderTexture.create({ width: canvasWidth, height: keyboardHeight })
    this.app.renderer.render({ container: blackBake, target: this.blackTexture })
    blackBake.destroy({ children: true })

    // ─── Assemble the z-stack ────────────────────────────────────────
    // After the destroys above, the container holds only the four overlay
    // layers. Reinsert the sprites
    // at the correct indices so the final order is:
    //   whiteSprite, whitePracticeHintLayer, whiteActiveLayer,
    //   blackSprite, blackPracticeHintLayer, blackActiveLayer, rangeLayer
    this.whiteSprite = new Sprite(this.whiteTexture)
    this.whiteSprite.y = yOffset
    const whiteIndex = this.caseSprite ? 1 : 0
    if (this.caseSprite) this.container.addChildAt(this.caseSprite, 0)
    this.container.addChildAt(this.whiteSprite, whiteIndex)

    this.blackSprite = new Sprite(this.blackTexture)
    this.blackSprite.y = yOffset
    // Case, white sprite, white hint, white active, then the black sprite.
    this.container.addChildAt(this.blackSprite, whiteIndex + 3)

    this.whitePracticeHintLayer.y = yOffset
    this.whiteActiveLayer.y = yOffset
    this.blackPracticeHintLayer.y = yOffset
    this.blackActiveLayer.y = yOffset
    this.caseLayer.y = yOffset
    this.drawCase(canvasWidth, keyboardHeight, walnut)
    this.drawKeyLabels(positions, yOffset, keyboardHeight, walnut)
    this.rangeSatLayer.y = yOffset
    this.rangeLayer.y = yOffset
    this.pressLiftLayer.y = yOffset
    this.container.addChildAt(this.shadowLayer, 0)
    this.paintArrivalLight(canvasWidth, keyboardHeight, yOffset)
    this.container.addChild(this.lampLayer)
    this.container.addChild(this.shimmerLayer)
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

    const { keyboardHeight, canvasWidth, pitchMin, pitchMax } = viewport.config
    const positions = viewport.getAllKeyPositions()
    const fallback = liveNoteColor(this.theme)
    const walnut = keyboardMaterial(this.theme.id) === 'upright-walnut'
    const palette = keyboardPalette(this.theme.id)
    const frame = keyFrame(
      canvasWidth,
      whiteKeyCount(pitchMin ?? MIDI_MIN, pitchMax ?? MIDI_MAX),
      keyboardHeight,
    )

    if (!walnut) {
      const halos: readonly [number, number][] = [
        [10, 0.05],
        [6, 0.1],
        [3, 0.18],
      ]
      for (const [pitch, color] of activeByPitch) {
        const pos = positions.get(pitch)
        if (!pos) continue
        const tint = color || fallback
        const isBlack = isBlackKey(pitch)
        const layer = isBlack ? this.blackActiveLayer : this.whiteActiveLayer
        const { x, y, w, h, radius } = keyRect(pitch, pos, keyboardHeight)
        for (const [expand, alpha] of halos) {
          layer.roundRect(x - expand, y - expand, w + expand * 2, h + expand * 2, radius + expand)
          layer.fill({ color: tint, alpha })
        }
        layer.roundRect(x, y, w, h, radius)
        layer.fill({ color: tint, alpha: isBlack ? 0.92 : 0.78 })
      }
      return
    }

    const drop = KBD.pressDrop * frame.v
    for (const [pitch, color] of activeByPitch) {
      const pos = positions.get(pitch)
      if (!pos) continue
      const tint = color || fallback
      const left = tint === palette.noteLh || (tint !== palette.noteRh && pitch < 60)
      const isBlack = isBlackKey(pitch)
      const layer = isBlack ? this.blackActiveLayer : this.whiteActiveLayer
      const { x, y, w, h } = keyRect(pitch, pos, keyboardHeight)
      const hand = left ? palette.noteLh : palette.noteRh
      if (isBlack) {
        layer.rect(x, y, w, drop + 1).fill({ color: palette.ivory })
        this.drawBlackKey(layer, x, y + drop, w, Math.max(6, h - drop), frame.v, palette, true)
      } else {
        layer.rect(x, y, w, h).fill({ color: palette.caseDark })
        this.drawWhiteKey(layer, x, y + drop, w, Math.max(8, h - drop), frame.v, palette, true)
      }
      const topH = isBlack
        ? (KBD.blackTop / KBD.blackH) * (h - drop)
        : (KBD.whiteTopH / KBD.keysH) * (h - drop)
      layer.roundRect(x, y + drop, w, topH, isBlack ? 2 * frame.h : 0)
      layer.fill({ color: hand, alpha: 0.55 })
      const glow = 12 * frame.h
      layer.roundRect(x - glow / 4, y + drop, w + glow / 2, topH, 4)
      layer.fill({ color: hand, alpha: 0.08 })
      if (isBlack) {
        const barW = Math.max(2, w - 4 * frame.h)
        const barH = Math.max(1, 3 * frame.v)
        layer.roundRect(x + 2 * frame.h, y + drop + topH - 7 * frame.v, barW, barH, 1.5 * frame.h)
        layer.fill({ color: hand })
      } else {
        const barW = Math.max(2, w - 6 * frame.h)
        const barH = Math.max(1, 4 * frame.v)
        const bar = left ? palette.pressLh : palette.pressRh
        layer.roundRect(x + 3 * frame.h, y + drop + topH - 9 * frame.v, barW, barH, 2 * frame.h)
        layer.fill({ color: bar })
      }
      if (palette.led) {
        const stripH = Math.max(2, 6 * frame.v)
        const stripY = 18 * frame.v
        layer.roundRect(x, stripY, w, stripH, stripH / 2)
        layer.fill({ color: hand })
        layer.roundRect(x - 2, stripY - 2, w + 4, stripH + 4, stripH)
        layer.fill({ color: hand, alpha: 0.35 })
      }
    }
  }

  private drawWhiteKey(
    g: Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    v: number,
    palette: KeyboardPalette,
    pressed: boolean,
  ): void {
    const front = Math.min(h - 4, Math.max(1, (pressed ? 7 : KBD.whiteFront) * v))
    const topH = h - front
    const radius = Math.min(front / 2, (KBD.whiteFrontR / 25) * w)
    const side = palette.hairline ? palette.ivory : palette.ivorySide
    if (radius > 0.5) {
      g.roundRect(x, y + topH - radius, w, front + radius, radius).fill({ color: side })
    } else {
      g.rect(x, y + topH, w, front).fill({ color: side })
    }
    g.rect(x, y, w, topH).fill({ color: palette.ivory })
    if (palette.shade) {
      g.rect(x, y + topH * 0.72, w, topH * 0.28).fill({ color: palette.caseDark, alpha: 0.04 })
    }
  }

  private drawBlackKey(
    g: Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    v: number,
    palette: KeyboardPalette,
    pressed: boolean,
  ): void {
    const front = Math.min(h - 4, Math.max(1, (pressed ? 5 : KBD.blackFront) * v))
    const topH = h - front
    const topR = palette.hairline ? 0 : (KBD.blackTopR / KBD.blackW) * w
    const frontR = palette.hairline ? 0 : (KBD.blackFrontR / KBD.blackW) * w
    if (palette.shade) {
      g.roundRect(x, y + 3 * v, w, topH, topR).fill({ color: palette.ebonySide, alpha: 0.35 })
    }
    g.roundRect(x, y, w, topH, topR).fill({ color: palette.ebony })
    if (palette.shade) {
      g.rect(x + 1, y, Math.max(1, w - 2), Math.max(1, v)).fill({
        color: palette.highlight,
        alpha: 0.12,
      })
    }
    g.roundRect(x, y + topH, w, front, frontR).fill({ color: palette.ebonySide })
  }

  updateTheme(theme: Theme): void {
    this.theme = theme
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
  ): void {
    for (const label of this.keyLabels) label.destroy()
    this.keyLabels = []
    if (!walnut || !paintPrefs().keyLabels) return
    for (const [pitch, pos] of positions) {
      if (pitch % 12 !== 0) continue
      const octave = Math.floor(pitch / 12) - 1
      const text = new Text({
        text: `C${octave}`,
        style: {
          fontFamily: 'Nunito Sans, system-ui, sans-serif',
          fontSize: 11,
          fontWeight: '600',
          fill: 0xa4876f,
        },
      })
      const v = keyboardHeight / KBD.caseH
      text.anchor.set(0.5, 0.5)
      text.x = pos.x + pos.width / 2
      // Caption sits 8px above the front face (key-bed y 106 of 140).
      text.y = yOffset + KBD.keysY * v + 106 * v + 8 * v
      text.style.fontSize = Math.max(8, 12 * (pos.width / KBD.pitch))
      this.container.addChild(text)
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
      this.rangeSatLayer.rect(x, y, w, h).fill({ color: 0x808080, alpha: 0.4 * playAlpha })
      this.rangeLayer.rect(x, y, w, h).fill({ color: dim.color, alpha: dim.alpha * playAlpha })
    }
    if (x0 > 0) wash(0, x0)
    if (x1 < canvasWidth) wash(x1, canvasWidth - x1)
  }

  // Hand tint for keys outside the window, drawn above the dim wash.
  private paintPressLift(viewport: Viewport, dimAlpha: number): void {
    this.pressLiftLayer.clear()
    if (dimAlpha < 0.02 || this.pressedPitches.size === 0) return
    const { canvasWidth, keyboardHeight, pitchMin, pitchMax } = viewport.config
    const positions = viewport.getAllKeyPositions()
    const frame = keyFrame(
      canvasWidth,
      whiteKeyCount(pitchMin ?? MIDI_MIN, pitchMax ?? MIDI_MAX),
      keyboardHeight,
    )
    for (const [pitch, color] of this.pressedPitches) {
      if (pitch >= this.playStart && pitch <= this.playEnd) continue
      const pos = positions.get(pitch)
      if (!pos) continue
      const { x, y, w, h } = keyRect(pitch, pos, keyboardHeight)
      const black = isBlackKey(pitch)
      const topH = black ? (KBD.blackTop / KBD.blackH) * h : (KBD.whiteTopH / KBD.keysH) * h
      this.pressLiftLayer.roundRect(x, y, w, Math.max(1, topH), black ? 2 * frame.h : 0)
      this.pressLiftLayer.fill({ color: color || 0xffffff, alpha: 0.55 })
    }
  }

  // The case is baked into its own sprite under the keys. This layer stays
  // empty so a theme swap can clear an older fallboard without a leftover.
  private drawCase(_canvasWidth: number, _keyboardHeight: number, _walnut: boolean): void {
    this.caseLayer.clear()
  }

  // Contact shadow on the wall and a small pool of hand-coloured light.
  // Both travel with the keyboard container and fade in via setArrivalLight.
  private paintArrivalLight(canvasWidth: number, keyboardHeight: number, yOffset: number): void {
    this.shadowLayer.clear()
    this.lampLayer.clear()
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
      const dip = 2
      this.shimmerLayer
        .roundRect(rect.x, rect.y + dip, rect.w, Math.max(1, rect.h - dip), rect.radius)
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
    const tint = this.theme.accent
    const acceptedTint = 0x9ee7b8

    if (accepted) {
      for (const pitch of accepted) {
        const pos = positions.get(pitch)
        if (!pos) continue
        const layer = isBlackKey(pitch) ? this.blackPracticeHintLayer : this.whitePracticeHintLayer
        this.drawPracticeKey(layer, pitch, pos, kbHeight, acceptedTint, {
          bodyAlpha: isBlackKey(pitch) ? 0.36 : 0.25,
          stripAlpha: 0.58,
          haloScale: 0.55,
        })
      }
    }

    if (!pending) return
    for (const pitch of pending) {
      const pos = positions.get(pitch)
      if (!pos) continue
      const isBlack = isBlackKey(pitch)
      const layer = isBlack ? this.blackPracticeHintLayer : this.whitePracticeHintLayer
      this.drawPracticeKey(layer, pitch, pos, kbHeight, tint, {
        bodyAlpha: (isBlack ? 0.32 : 0.22) * pulse,
        stripAlpha: 0.55 * pulse,
        haloScale: pulse,
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

    const halos: readonly [number, number][] = [
      [12, 0.05 * opts.haloScale],
      [7, 0.1 * opts.haloScale],
      [3, 0.18 * opts.haloScale],
    ]
    for (const [expand, alpha] of halos) {
      layer.roundRect(x - expand, y - expand, w + expand * 2, h + expand * 2, radius + expand)
      layer.fill({ color: tint, alpha })
    }

    layer.roundRect(x, y, w, h, radius)
    layer.fill({ color: tint, alpha: opts.bodyAlpha })

    layer.rect(x + radius, y, w - radius * 2, 2)
    layer.fill({ color: tint, alpha: opts.stripAlpha })
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
