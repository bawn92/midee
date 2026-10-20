import { Application, Graphics, Sprite, Texture, type Ticker } from 'pixi.js'
import type { MasterClock } from '../core/clock/MasterClock'
import { getHandPractice, noteHand } from '../core/handPractice'
import { getKeyboardRange, placedPitch } from '../core/keyboardRange'
import { noteHandOf, noteMatchesHandOf } from '../core/midi/hands'
import type { MidiFile } from '../core/midi/types'
import type { LiveNoteStore } from '../midi/LiveNoteStore'
import { glideRange, LiveMotionClock } from '../ui/liveEntrance'
import { paintPrefs } from '../ui/paint'
import { BeatGrid } from './BeatGrid'
import { readCssColor } from './cssColor'
import { type EmitCadence, scheduleEmissions } from './emitSchedule'
import { EmberMistStrike } from './forLater/EmberMistStrike'
import { ENABLE_FOR_LATER_VISUALS } from './forLater/visuals'
import { KeyboardRenderer } from './KeyboardRenderer'
import { keyFrame, proportionalKeyboardHeight, whiteKeyCount } from './keyboardMetrics'
import { subscribeKeyboardStyle } from './keyboardStyle'
import { LiveNoteRenderer } from './LiveNoteRenderer'
import { makeMaterialAtmosphere } from './materialAtmosphere'
import { NoteRenderer } from './NoteRenderer'
import { type ParticleStyle, ParticleSystem } from './ParticleSystem'
import { PlantShadowField } from './plantShadowField'
import {
  type PlantShadowBudget,
  plantShadowId,
  plantShadowsActive,
  readPlantShadowBudget,
  stepPlantBudget,
  subscribePlantShadow,
} from './plantShadows'
import { layersAnimating, type RenderContext, type RenderLayer } from './RenderLayer'
import { rangeLayerAlpha, rangePhaseAnimating, subscribeRangeOverlay } from './rangeOverlay'
import { sceneForTheme } from './scenes'
import {
  type AfterHoursState,
  createAfterHoursState,
  exciteAfterHours,
  halfBarIndex,
  paintAfterHours,
  stepAfterHours,
  subscribeStrobe,
} from './scenes/afterHoursShow'
import { paintSceneBackdrop } from './scenes/backdrop'
import { goldenHourTheme } from './scenes/goldenHour'
import { getTrackColor, liveNoteColor, type Theme } from './theme'
import { Viewport, visibleNoteRange } from './viewport'

// Must match the `--keyboard-h` value in main.css :root and the reset value
// in KeyboardResizer.onDoubleClick — all three describe the same default,
// and drift between them shows up as a gap under the resize handle on first
// load (before any saved preference or user drag has synced the CSS var).
const DEFAULT_KEYBOARD_HEIGHT = 120
export const KEYBOARD_HEIGHT_MIN = 80
// Raised from 220 so portrait phones can host a substantial keyboard —
// a 220px cap on an 844px-tall iPhone only gives 26% of the screen to the
// keys. Desktop users rarely drag above ~200px, so this is purely headroom.
export const KEYBOARD_HEIGHT_MAX = 480

// Fresh-load keyboard size, viewport-aware. Portrait phones get ~20% of
// viewport so keys feel playable without dominating; landscape phones get
// a proportionally *smaller* keyboard (~24% capped at 110px) because the
// viewport is short and the HUD + top-strip + falling-notes area all
// compete for the same vertical space. Desktop keeps the 120px default.
function computeInitialKeyboardHeight(): number {
  if (typeof window === 'undefined' || !window.matchMedia) return DEFAULT_KEYBOARD_HEIGHT
  const isCoarse = window.matchMedia('(pointer: coarse)').matches
  const scene = typeof document !== 'undefined' && Boolean(document.documentElement.dataset.scene)
  if (!isCoarse) {
    if (!scene) return DEFAULT_KEYBOARD_HEIGHT
    const vh = window.innerHeight || 800
    return Math.min(220, Math.max(160, Math.round(vh * 0.22)))
  }
  const vh = window.innerHeight || 800
  const isPortrait = window.matchMedia('(orientation: portrait)').matches
  if (isPortrait) {
    return Math.min(KEYBOARD_HEIGHT_MAX, Math.max(140, Math.round(vh * 0.2)))
  }
  // Landscape mobile: short viewport (~390px on iPhone). Keep the keyboard
  // small so the HUD + roll area still have room.
  return Math.min(120, Math.max(88, Math.round(vh * 0.24)))
}

// Same formula as KeyboardResizer.viewportBounds — duplicated here so the
// renderer can re-clamp on rotation without reaching into UI-layer code.
// Max is 45% of viewport height: on a 390px landscape phone that gives a
// 176px cap, rescuing rotation from portrait where the keyboard would
// otherwise dominate over half the screen.
function viewportKeyboardBounds(): { min: number; max: number } {
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900
  const min = Math.max(KEYBOARD_HEIGHT_MIN, Math.round(vh * 0.18))
  const max = Math.min(KEYBOARD_HEIGHT_MAX, Math.round(vh * 0.45))
  if (min >= max) return { min: KEYBOARD_HEIGHT_MIN, max: KEYBOARD_HEIGHT_MAX }
  return { min, max }
}
const DEFAULT_PIXELS_PER_SECOND = 200

// Sustained emission cadence for held notes. Initial burst fires on note-on
// (full preset count); subsequent tiny puffs emit every `SUSTAIN_INTERVAL_SEC`
// while the key stays held. Puff density is per-style (see ParticleSystem).
const SUSTAIN_INITIAL_DELAY_SEC = 0.18
const SUSTAIN_INTERVAL_SEC = 0.14
const SUSTAIN_CADENCE: EmitCadence = {
  initialDelaySec: SUSTAIN_INITIAL_DELAY_SEC,
  intervalSec: SUSTAIN_INTERVAL_SEC,
}

// Consecutive non-animating ticks rendered before the ticker stops itself.
// The grace window absorbs bursts (scrub gestures, rapid note on/off) so we
// don't thrash stop/start, and guarantees the final state is presented before
// the loop goes quiet. ~0.25 s at 120 Hz, ~0.5 s at 60 Hz — the render work in
// that window is negligible next to an always-on loop.
const IDLE_GRACE_FRAMES = 30

export class PianoRollRenderer {
  private app!: Application
  private viewport!: Viewport
  private noteRenderer!: NoteRenderer
  private keyboardRenderer!: KeyboardRenderer
  private liveNoteRenderer!: LiveNoteRenderer
  private particles!: ParticleSystem
  private beatGrid!: BeatGrid
  private nowLineGraphics!: Graphics
  private backgroundGraphics!: Graphics
  private rangeLaneGraphics!: Graphics
  private playStart = 21
  private playEnd = 108
  private liveClock = new LiveMotionClock()
  private liveRoll: number | null = null
  private liveRange: { start: number; end: number } | null = null
  private mistStrike: EmberMistStrike | null = null
  private materialAtmosphere: Sprite | null = null
  private atmosphereThemeId: string | null = null
  private sceneBackdrop: Sprite | null = null
  private sceneBackdropKey = ''
  private afterCanvas: HTMLCanvasElement | null = null
  private afterState: AfterHoursState | null = null
  private afterHeld = new Set<number>()
  private afterLastPaint = -1
  private afterUnsub: (() => void) | null = null
  private plantField: PlantShadowField | null = null
  private plantSprite: Sprite | null = null
  private plantGlowSprite: Sprite | null = null
  private plantUnsub: (() => void) | null = null
  private plantMotionQuery: MediaQueryList | null = null
  private plantReduced = false
  private plantLastPaint = -1
  private plantStressed = false
  private plantCalmMs = 0
  private plantPaintNow = true
  private plantBudgetNow: PlantShadowBudget | null = null

  private midi: MidiFile | null = null
  private liveNoteStore: LiveNoteStore | null = null
  private loopNoteStore: LiveNoteStore | null = null
  private visibleTrackIds = new Set<string>()
  private practiceFocusTrackIds: Set<string> | null = null
  private theme: Theme = goldenHourTheme
  private pixelsPerSecond = DEFAULT_PIXELS_PER_SECOND
  private keyboardHeight = DEFAULT_KEYBOARD_HEIGHT
  private lastRenderTime = 0

  // Two pooled Sets swapped each frame. Keys are packed `trackIndex * 128 + pitch`
  // so comparisons never allocate strings in the hot path.
  private prevActive = new Set<number>()
  private currActive = new Set<number>()
  // Map pitch → color so the keyboard overlay picks up each track's own hue
  // rather than a single accent. Last-write-wins when multiple tracks sound
  // the same pitch — acceptable; the rest of the visualization already does
  // the same.
  private activeKeyColors = new Map<number, number>()
  private exportMode = false

  // Next time (in seconds of clock-time) to emit a sustained trail-burst for
  // each active note. Held keys keep breathing out particles at this cadence;
  // entries get reaped when the note ends.
  private scheduledEmitNext = new Map<number, number>()
  private liveEmitNext = new Map<number, number>()
  // Per-frame scratch reused by the scheduled-MIDI emit pass: the keys eligible
  // to emit particles this frame and their burst geometry/color. Pooled to keep
  // the hot path allocation-free; cleared at the top of each frame.
  private emitEligible = new Set<number>()
  private emitGeom = new Map<
    number,
    { cx: number; w: number; color: number; velocity: number; hand: 'lh' | 'rh' }
  >()

  // Practice-mode hints (pitches that should glow on the keyboard as "play
  // these to advance"). `pending` is what's still required, `accepted` is what
  // the user has already pressed for the current step.
  private practiceHintPending: ReadonlySet<number> | null = null
  private practiceHintAccepted: ReadonlySet<number> | null = null

  // External RenderLayers (Learn-mode overlays, future sheet-music cursor,
  // etc.) kept sorted by `zIndex` ascending so a single forward iteration
  // draws them in the right order.
  private externalLayers: RenderLayer[] = []
  // Whether to draw the upward-floating live-note sprites. True in Play/Live
  // where the user expects their keypresses to animate up the roll; false
  // in Learn where the scheduled MIDI is what matters and user presses
  // should only manifest as a keyboard-key highlight.
  private liveNotesVisible = true

  // Idle-stop bookkeeping (see onTick). Unsub closures for the wake
  // subscriptions on the clock and the live/loop note stores.
  private idleFrames = 0
  private clockUnsub: (() => void) | null = null
  private liveStoreUnsub: (() => void) | null = null
  private loopStoreUnsub: (() => void) | null = null

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.app = new Application()

    await this.app.init({
      canvas,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: goldenHourTheme.background,
      antialias: true,
      // Cap the raster resolution at 2×: a dpr-3 phone would rasterize 2.25×
      // the pixels of 2× for no visible gain on falling rectangles, and the
      // fill-rate cost lands exactly on the devices least able to pay it.
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    })

    // Cap the render loop at 60fps on touch devices: most phone panels are
    // 60Hz anyway, and on 90/120Hz panels the battery cost of high-refresh
    // falling notes outweighs the smoothness gain. Desktop stays uncapped.
    if (window.matchMedia?.('(pointer: coarse)').matches) {
      this.app.ticker.maxFPS = 60
    }

    // Pick a viewport-appropriate initial keyboard height before building the
    // scene — otherwise the first paint uses the desktop 120px default even
    // on portrait phones, and a later resize would cause a flash.
    this.keyboardHeight = computeInitialKeyboardHeight()

    this.viewport = new Viewport({
      canvasWidth: this.app.screen.width,
      canvasHeight: this.app.screen.height,
      keyboardHeight: this.keyboardHeight,
      pixelsPerSecond: this.pixelsPerSecond,
    })

    // Keep the CSS --keyboard-h in lockstep with the JS-side height from the
    // very first paint — the resize handle + HUD positioning reads this var
    // and would otherwise drift until the first setKeyboardHeight() call.
    document.documentElement.style.setProperty('--keyboard-h', `${this.keyboardHeight}px`)

    this.buildScene()
    this.mountPlantShadows()
    this.afterUnsub = subscribeStrobe(() => this.wake())
    // handleResize calls resize() → rebuildStaticLayers() + renderStaticFrame(0),
    // so buildScene must not call rebuildStaticLayers itself.
    this.handleResize()

    window.addEventListener('resize', this.handleResize)
  }

  private buildScene(): void {
    const stage = this.app.stage

    // Layer order (bottom → top):
    // 1. background  2. beat-grid  3. notes  4. live-notes  5. now-line  6. keyboard  7. particles

    this.backgroundGraphics = new Graphics()
    this.backgroundGraphics.label = 'background'
    stage.addChild(this.backgroundGraphics)

    this.rangeLaneGraphics = new Graphics()
    this.rangeLaneGraphics.label = 'range-lanes'
    stage.addChild(this.rangeLaneGraphics)

    this.beatGrid = new BeatGrid()
    stage.addChild(this.beatGrid.graphics)

    this.noteRenderer = new NoteRenderer(this.theme, this.app.renderer)
    stage.addChild(this.noteRenderer.container)

    this.liveNoteRenderer = new LiveNoteRenderer(this.theme)
    stage.addChild(this.liveNoteRenderer.container)

    this.nowLineGraphics = new Graphics()
    this.nowLineGraphics.label = 'now-line'
    stage.addChild(this.nowLineGraphics)

    this.keyboardRenderer = new KeyboardRenderer(this.app, this.theme)
    subscribeKeyboardStyle(() => {
      this.keyboardRenderer.updateTheme(this.theme)
      this.rebuildStaticLayers()
      this.presentFrame()
    })
    subscribeRangeOverlay(() => this.wake())
    stage.addChild(this.keyboardRenderer.container)

    this.particles = new ParticleSystem()
    stage.addChild(this.particles.container)
  }

  // Redraw every layer whose contents don't change per frame: background, now-line,
  // keyboard texture. Follow with `renderStaticFrame()` if the current frame also
  // needs to be re-presented. External layers get rebuilt too so overlays that
  // cache viewport-derived geometry stay in sync.
  private rebuildStaticLayers(): void {
    this.drawBackground()
    this.drawNowLine()
    this.keyboardRenderer.build(this.viewport, this.viewport.rollHeight)
    this.particles.setViewport(this.viewport.config.canvasWidth, this.viewport.config.canvasHeight)
    this.rebuildExternalLayers()
    this.layoutPlantShadows()
  }

  private drawBackground(): void {
    const { canvasWidth, canvasHeight } = this.viewport.config
    const rollHeight = this.viewport.rollHeight
    const g = this.backgroundGraphics
    if (this.atmosphereThemeId !== this.theme.id) {
      this.materialAtmosphere?.destroy({ texture: true, textureSource: true })
      this.materialAtmosphere = null
      this.atmosphereThemeId = this.theme.id
    }
    if (this.theme.noteMaterial) {
      if (!this.materialAtmosphere) {
        this.materialAtmosphere = new Sprite(makeMaterialAtmosphere(this.theme))
        this.materialAtmosphere.label = 'material-atmosphere'
        this.app.stage.addChildAt(this.materialAtmosphere, 1)
      }
      this.materialAtmosphere.width = canvasWidth
      this.materialAtmosphere.height = Math.max(1, rollHeight)
    } else if (this.materialAtmosphere) {
      this.materialAtmosphere.destroy({ texture: true, textureSource: true })
      this.materialAtmosphere = null
    }
    g.clear()

    const scene = sceneForTheme(this.theme.id)
    if (scene) {
      this.syncSceneBackdrop(scene.themeId, canvasWidth, canvasHeight, rollHeight)
      const { pitchMin, pitchMax } = this.viewport.config
      const frame = keyFrame(
        canvasWidth,
        whiteKeyCount(pitchMin ?? 21, pitchMax ?? 108),
        this.keyboardHeight,
      )
      const positions = this.viewport.getAllKeyPositions()
      for (const [pitch, pos] of positions) {
        if (
          pitch % 12 === 1 ||
          pitch % 12 === 3 ||
          pitch % 12 === 6 ||
          pitch % 12 === 8 ||
          pitch % 12 === 10
        ) {
          continue
        }
        const laneC = pitch % 12 === 0
        const lane = readCssColor(laneC ? '--roll-lane-c' : '--roll-lane', {
          color: 0x7a4e2c,
          alpha: laneC ? 0.08 : 0.04,
        })
        g.rect(pos.x, 0, Math.max(1, frame.h), rollHeight)
        g.fill({ color: lane.color, alpha: lane.alpha })
      }
      const fade = readCssColor('--roll-fade', { color: 0xf6d6b4, alpha: 1 })
      const fadeH = Math.round(rollHeight * 0.15)
      for (let i = 0; i < 8; i++) {
        const t = i / 8
        g.rect(0, fadeH * t, canvasWidth, fadeH / 8)
        g.fill({ color: fade.color, alpha: (1 - t) * 0.22 * fade.alpha })
      }
    } else {
      this.clearSceneBackdrop()
      g.rect(0, 0, canvasWidth, canvasHeight)
      g.fill({ color: this.theme.background })
      for (let pitch = 24; pitch <= 108; pitch += 12) {
        const x = this.viewport.pitchToX(pitch)
        g.rect(x, 0, 1, rollHeight)
        g.fill({ color: 0xffffff, alpha: 0.025 })
      }
    }

    // The walnut case is the boundary. A stroke here reads as a second rail.
    if (!scene) {
      g.rect(0, rollHeight, canvasWidth, 1)
      g.fill({ color: this.theme.keyBorder, alpha: 1 })
    }
  }

  private syncSceneBackdrop(
    themeId: string,
    width: number,
    height: number,
    rollHeight: number,
  ): void {
    const scene = sceneForTheme(themeId)
    if (!scene) return
    const key = `${scene.id}:${width}x${height}`
    if (this.sceneBackdrop && this.sceneBackdropKey === key) {
      this.sceneBackdrop.width = width
      this.sceneBackdrop.height = height
      return
    }
    this.clearSceneBackdrop()
    const canvas = document.createElement('canvas')
    if (scene.token === 'after-hours') {
      canvas.width = Math.max(2, Math.min(width, 1100))
      canvas.height = Math.max(2, Math.min(height, 700))
      this.afterCanvas = canvas
      this.afterState = createAfterHoursState(canvas.width)
      this.afterHeld.clear()
      const ctx = canvas.getContext('2d')
      if (ctx && this.afterState) {
        paintAfterHours(
          ctx,
          canvas.width,
          canvas.height,
          this.afterState,
          rollHeight / Math.max(1, height),
          this.plantReduced,
        )
      }
    } else {
      paintSceneBackdrop(canvas, scene, Math.min(width, 1400), Math.min(height, 900))
    }
    const texture = Texture.from(canvas)
    this.sceneBackdrop = new Sprite(texture)
    this.sceneBackdrop.label = 'scene-backdrop'
    this.sceneBackdrop.eventMode = 'none'
    this.sceneBackdrop.width = width
    this.sceneBackdrop.height = height
    this.sceneBackdropKey = key
    this.app.stage.addChildAt(this.sceneBackdrop, 0)
  }

  private clearSceneBackdrop(): void {
    this.sceneBackdrop?.destroy({ texture: true, textureSource: true })
    this.sceneBackdrop = null
    this.sceneBackdropKey = ''
    this.afterCanvas = null
    this.afterState = null
    this.afterHeld.clear()
  }

  private afterHoursLive(): boolean {
    return (
      this.theme.id === 'after-hours' &&
      this.afterCanvas !== null &&
      !this.plantReduced &&
      !document.hidden &&
      !this.exportMode
    )
  }

  private stepAfterHoursRoom(dt: number, time: number, playing: boolean): void {
    const canvas = this.afterCanvas
    const state = this.afterState
    const sprite = this.sceneBackdrop
    if (!canvas || !state || !sprite || this.theme.id !== 'after-hours') return
    const now = performance.now()
    const bpm = this.midi?.bpm && this.midi.bpm > 0 ? this.midi.bpm : 120
    let beat = false
    if (playing) {
      const index = halfBarIndex(time, bpm)
      if (state.halfBar < 0) state.halfBar = index
      else if (index !== state.halfBar) {
        state.halfBar = index
        beat = true
      }
    }
    const width = Math.max(1, this.viewport.config.canvasWidth)
    const held = new Set<number>()
    const hits = []
    for (const pitch of this.activeKeyColors.keys()) {
      held.add(pitch)
      const fresh = !this.afterHeld.has(pitch)
      hits.push({
        u: this.viewport.pitchToX(pitch) / width,
        hand: pitch < 60 ? ('L' as const) : ('R' as const),
        v: fresh ? 1 : Math.min(0.35, dt * 4),
      })
    }
    this.afterHeld = held
    exciteAfterHours(state, hits)
    stepAfterHours(state, dt, now, { reduced: this.plantReduced, beat })
    if (!this.exportMode && now - this.afterLastPaint < 32 && state.flash < 0.05) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    paintAfterHours(
      ctx,
      canvas.width,
      canvas.height,
      state,
      this.viewport.rollHeight / Math.max(1, this.viewport.config.canvasHeight),
      this.plantReduced,
    )
    sprite.texture.source.update()
    this.afterLastPaint = now
  }

  private drawNowLine(): void {
    const g = this.nowLineGraphics
    g.clear()
    if (ENABLE_FOR_LATER_VISUALS && this.theme.noteMaterial === 'ember-mist') {
      if (!this.mistStrike) {
        this.mistStrike = new EmberMistStrike()
        this.app.stage.addChildAt(
          this.mistStrike.container,
          this.app.stage.children.indexOf(this.keyboardRenderer.container) + 1,
        )
      }
      return
    }
    this.mistStrike?.destroy()
    this.mistStrike = null
    const y = this.viewport.nowLineY
    const w = this.viewport.config.canvasWidth
    const glow = this.theme.nowLineGlow
    const warm = sceneForTheme(this.theme.id) !== null
    const lift = warm ? 3 : 1

    // Notes meet the case. A soft glow sits in the roll; the felt is the only line.
    if (warm) {
      if (this.theme.id === 'night') return
      const { pitchMin, pitchMax } = this.viewport.config
      const frame = keyFrame(w, whiteKeyCount(pitchMin ?? 21, pitchMax ?? 108), this.keyboardHeight)
      const x = frame.cheek
      const span = Math.max(1, w - frame.cheek * 2)
      const glowH = Math.max(8, 18 * frame.v)
      g.rect(x, y - glowH, span, glowH)
      g.fill({ color: glow, alpha: 0.2 })
      return
    }
    g.rect(0, y - 18, w, 18)
    g.fill({ color: glow, alpha: 0.02 * lift })
    g.rect(0, y - 8, w, 8)
    g.fill({ color: glow, alpha: 0.045 * lift })
    g.rect(0, y - 3, w, 3)
    g.fill({ color: glow, alpha: 0.08 * lift })
    g.rect(0, y, w, 1.5)
    g.fill({ color: this.theme.nowLine, alpha: this.theme.nowLineAlpha })
  }

  loadMidi(midi: MidiFile, atTime?: number): void {
    this.midi = midi
    this.visibleTrackIds = new Set(midi.tracks.map((t) => t.id))
    this.practiceFocusTrackIds = null
    this.noteRenderer.setTracks(midi.tracks)
    this.noteRenderer.setTempo(midi.bpm)
    if (atTime === undefined) {
      this.particles.clear()
      this.prevActive.clear()
      this.currActive.clear()
    }
    this.renderStaticFrame(atTime ?? 0)
  }

  clearMidi(): void {
    this.midi = null
    this.visibleTrackIds.clear()
    this.practiceFocusTrackIds = null
    this.noteRenderer.setTracks([])
    this.noteRenderer.clear()
    this.liveNoteRenderer.clear()
    this.particles.clear()
    this.prevActive.clear()
    this.currActive.clear()
    this.scheduledEmitNext.clear()
    this.liveEmitNext.clear()
    this.beatGrid.clear()
    this.renderStaticFrame(0)
  }

  setTrackVisible(trackId: string, visible: boolean): void {
    if (visible) this.visibleTrackIds.add(trackId)
    else this.visibleTrackIds.delete(trackId)
    // Repaint immediately — with the idle-stopped ticker there is no "next
    // frame" to pick the change up while paused.
    this.presentFrame()
  }

  setPracticeTrackFocus(trackIds: Iterable<string> | null): void {
    this.practiceFocusTrackIds = trackIds ? new Set(trackIds) : null
    if (this.midi) this.presentFrame()
  }

  setZoom(pixelsPerSecond: number): void {
    this.pixelsPerSecond = pixelsPerSecond
    // Key layout and keyboard texture are width-dependent, not zoom-dependent —
    // no need to rebuild them when only pixelsPerSecond changes. External layers
    // may cache timeOffsetToY-derived positions though, so notify them.
    this.viewport.update({ pixelsPerSecond })
    this.rebuildExternalLayers()
    this.presentFrame()
  }

  // Narrows or widens the visible pitch range immediately. Export framing
  // uses this so a capture never waits on a focus change.
  setPitchRange(min: number, max: number): void {
    this.viewport.update({ pitchMin: min, pitchMax: max })
    this.syncKeyboardProportion()
    this.rebuildStaticLayers()
  }

  // The logical piano stays 88 keys. This only changes how many of them are
  // on screen. Applied immediately: the render loop is often idle, and a
  // deferred ease would leave the full piano up until the next note.
  aimPitchRange(min: number, max: number): void {
    if (this.exportMode) return
    const curMin = this.viewport.config.pitchMin ?? 21
    const curMax = this.viewport.config.pitchMax ?? 108
    if (curMin === min && curMax === max) return
    this.setPitchRange(min, max)
    this.presentFrame()
  }

  // Default case height follows the 26px pitch. A saved drag still wins.
  private syncKeyboardProportion(): void {
    if (this.exportMode) return
    if (!sceneForTheme(this.theme.id)) return
    try {
      if (localStorage.getItem('midee.keyboardHeight')) return
    } catch {
      // Keep the proportional height when storage is blocked.
    }
    const { canvasWidth, pitchMin, pitchMax } = this.viewport.config
    const px = proportionalKeyboardHeight(
      canvasWidth,
      whiteKeyCount(pitchMin ?? 21, pitchMax ?? 108),
    )
    this.applyKeyboardHeight(px)
  }

  get pitchRange(): { min: number; max: number } {
    return {
      min: this.viewport.config.pitchMin ?? 21,
      max: this.viewport.config.pitchMax ?? 108,
    }
  }

  get currentPixelsPerSecond(): number {
    return this.pixelsPerSecond
  }

  // Pitch-class labels on the falling bars. Fades in/out on the next frames.
  setNoteLabels(on: boolean): void {
    this.noteRenderer.setLabelsEnabled(on)
  }

  setKeyboardHeight(px: number): void {
    if (!this.applyKeyboardHeight(px)) return
    this.rebuildStaticLayers()
    this.presentFrame()
  }

  // Clamp + commit a keyboard height without rebuilding or presenting, so a
  // caller that resizes anyway bakes the keyboard once. Returns whether it changed.
  private applyKeyboardHeight(px: number): boolean {
    const clamped = Math.max(KEYBOARD_HEIGHT_MIN, Math.min(KEYBOARD_HEIGHT_MAX, Math.round(px)))
    if (clamped === this.keyboardHeight) return false
    this.keyboardHeight = clamped
    this.viewport.update({ keyboardHeight: clamped })
    document.documentElement.style.setProperty('--keyboard-h', `${clamped}px`)
    return true
  }

  get currentKeyboardHeight(): number {
    return this.keyboardHeight
  }

  setParticleStyle(style: ParticleStyle): void {
    this.particles.setStyle(style)
  }

  setTheme(theme: Theme): void {
    this.theme = theme
    this.app.renderer.background.color = theme.background
    this.noteRenderer.updateTheme(theme)
    this.liveNoteRenderer.updateTheme(theme)
    this.keyboardRenderer.updateTheme(theme)
    this.particles.setScene(theme.id)
    // App theme selection applies the authored particle preset separately;
    // keeping that explicit also supports saved overrides and export settings.
    this.rebuildStaticLayers()
    this.presentFrame()
  }

  // Public reads of renderer internals for Learn-mode overlays that compute
  // their own geometry (celebration swell position, target-zone color).
  // Kept narrow — exercises shouldn't need more than these.
  get currentTheme(): Theme {
    return this.theme
  }
  get currentViewport(): Viewport {
    return this.viewport
  }

  attachClock(clock: MasterClock): void {
    this.app.ticker.add(this.onTick.bind(this, clock))
    // Every clock emission is a wake signal: play() ticks at frame rate, and
    // seek() emits synchronously even while paused — so scrubbing a paused
    // piece restarts the (possibly idle-stopped) ticker and repaints at the
    // new position before the loop idles out again.
    this.clockUnsub = clock.subscribe(() => this.wake())
  }

  // Restart the render loop after an idle stop. No-op while exporting —
  // the exporter owns the ticker via pauseAutoRender/resumeAutoRender and
  // drives frames manually.
  wake(): void {
    if (this.exportMode) return
    this.idleFrames = 0
    if (!this.app.ticker.started) this.app.ticker.start()
  }

  private onTick(clock: MasterClock, ticker: Ticker): void {
    if (this.exportMode) return
    const hasLive =
      (this.liveNoteStore?.hasRenderableNotes ?? false) ||
      (this.loopNoteStore?.hasRenderableNotes ?? false)
    // Anything that changes frame-to-frame without an external event: a
    // running clock (notes scroll), live/loop note trails (rise and decay),
    // in-flight particles, or external layers (animating unless they opt out
    // via `isAnimating()`).
    const animating =
      clock.playing ||
      hasLive ||
      this.particles.hasActive ||
      layersAnimating(this.externalLayers) ||
      rangePhaseAnimating() ||
      this.liveClock.active
    if (animating) {
      this.idleFrames = 0
      this.applyFrameBudget(ticker.deltaMS)
      this.renderFrame(clock.currentTime, ticker.deltaMS / 1000, clock.playing)
      return
    }
    // Shadows sway on a paused wall without rebuilding the note scene.
    // The ticker still presents the stage, so the updated texture shows.
    if (this.plantMoving()) {
      this.idleFrames = 0
      this.applyFrameBudget(ticker.deltaMS)
      this.stepPlantShadows()
      return
    }
    if (this.afterHoursLive()) {
      this.idleFrames = 0
      this.applyFrameBudget(ticker.deltaMS)
      this.stepAfterHoursRoom(ticker.deltaMS / 1000, clock.currentTime, false)
      return
    }
    // Static scene. Render through a short grace window so the settled state
    // is definitely presented, then stop the ticker entirely — a static
    // screen otherwise redraws identical pixels at display refresh rate
    // (~170 ms/s main-thread on a 120 Hz laptop; see
    // docs/IDLE_RENDER_LOOP_2026-07-02.md). Every mutation path either calls
    // wake() (clock emits, live-note store changes, layer adds) or presents
    // a frame manually (presentFrame / renderStaticFrame call sites).
    if (this.idleFrames < IDLE_GRACE_FRAMES) {
      this.idleFrames++
      if (this.midi) this.renderFrame(clock.currentTime, ticker.deltaMS / 1000, false)
      return
    }
    this.app.ticker.stop()
    if (document.documentElement.dataset.frameBudget) {
      delete document.documentElement.dataset.frameBudget
    }
  }

  // Drives rendering during video export. `emitParticles: true` so note-on
  // bursts appear in the captured output — the exporter steps time forward
  // monotonically from t=0, so prev/curr note tracking works just like live
  // playback. `present: false` runs only the CPU scene update without the
  // GPU submit — used by the bench harness to time update cost separately
  // from (environment-dependent) present cost.
  renderManualFrame(time: number, dt: number, present = true): void {
    if (!this.midi) return
    this.renderFrame(time, dt, true)
    if (present) this.app.renderer.render(this.app.stage)
  }

  renderStaticFrame(currentTime: number): void {
    this.renderFrame(currentTime, 0, false)
    this.app.renderer.render(this.app.stage)
  }

  // Re-present the scene at the last rendered playhead position. This is the
  // correct one-shot repaint for mutations that don't move time (zoom, theme,
  // resize, track visibility): rendering at t=0 instead only *looked* right
  // historically because the always-on ticker repainted at clock time one
  // frame later — with the idle-stopped ticker, a t=0 frame would stick.
  private presentFrame(): void {
    this.renderStaticFrame(this.lastRenderTime)
  }

  private renderFrame(currentTime: number, dt: number, emitParticles: boolean): void {
    this.stepLiveMotion()
    this.stepPlantShadows(this.exportMode)
    this.lastRenderTime = currentTime
    const curr = this.currActive
    const activeColors = this.activeKeyColors
    curr.clear()
    activeColors.clear()

    // ── Scheduled MIDI notes ──────────────────────────────────────────────
    // Single pass collects active pitches and emits note-on particle bursts.
    // `prev`/`curr` swap at the end — no per-frame Set or string allocations.
    if (this.midi) {
      const tracks = this.midi.tracks
      const prev = this.prevActive
      const nowLineY = this.viewport.nowLineY
      // Collect this frame's emit-eligible keys + their burst geometry, then let
      // the pure scheduler (emitSchedule.ts) decide onset vs sustain vs reap.
      const eligible = this.emitEligible
      const geom = this.emitGeom
      eligible.clear()
      geom.clear()
      // Don't light up the keyboard for scheduled notes when the clock is
      // paused at the very start of the timeline — nothing has actually
      // sounded yet. The classic case this guards against: opening a session
      // recording in file mode where the user held a key at recording start
      // (note.time === 0). Without this gate the keyboard would show that
      // key as pressed before the user has touched play.
      // Once playback has started or the playhead has moved past 0, the
      // normal "sounds now" rule applies — pausing mid-piece still shows
      // sustained notes correctly.
      const beforeFirstPlay = !emitParticles && currentTime === 0
      const rangePrefs = getKeyboardRange()
      const practiceHand = getHandPractice().hand

      for (let ti = 0; ti < tracks.length; ti++) {
        const track = tracks[ti]!
        if (!this.visibleTrackIds.has(track.id)) continue
        const practiceInactive =
          this.practiceFocusTrackIds !== null && !this.practiceFocusTrackIds.has(track.id)
        // Always compute the track color — we now use it for the keyboard
        // overlay too, not just particle bursts.
        const trackColor = getTrackColor(track, this.theme)
        const keyBase = ti * 128

        const [alo, ahi] = visibleNoteRange(track.notes, currentTime, currentTime)
        for (let ni = alo; ni < ahi; ni++) {
          const note = track.notes[ni]!
          const placement = track.isDrum ? null : placedPitch(note.pitch, rangePrefs)
          const sounding = placement?.pitch ?? note.pitch
          // No key to light up or burst from — see Viewport.hasKey.
          if (!this.viewport.hasKey(sounding)) continue
          const handDim = !track.isDrum && !noteMatchesHandOf(track, note.pitch, practiceHand)
          const dimmed = practiceInactive || handDim
          const handId = noteHandOf(track, note.pitch)
          const byHand = sceneForTheme(this.theme.id) !== null && paintPrefs().colorBy === 'hand'
          const litColor =
            byHand && !track.isDrum
              ? ((handId === 'left' ? this.theme.trackColors[1] : this.theme.trackColors[0]) ??
                trackColor)
              : trackColor

          const key = keyBase + sounding
          const awaitingPracticePress = this.practiceHintPending?.has(sounding) ?? false
          if (!dimmed && !awaitingPracticePress) {
            curr.add(key)
            if (!beforeFirstPlay) activeColors.set(sounding, litColor)
          }

          if (!emitParticles || dimmed || awaitingPracticePress) continue

          const w = this.viewport.pitchWidth(sounding)
          const cx = this.viewport.pitchToX(sounding) + w / 2
          eligible.add(key)
          geom.set(key, {
            cx,
            w,
            color: litColor,
            velocity: note.velocity,
            hand: handId === 'left' ? 'lh' : 'rh',
          })
        }
      }

      // Pure scheduler decides onset/sustain/reap and updates scheduledEmitNext;
      // here we only draw the resulting bursts using the captured geometry.
      const { emits } = scheduleEmissions({
        prev,
        curr,
        eligible,
        schedule: this.scheduledEmitNext,
        currentTime,
        cadence: SUSTAIN_CADENCE,
      })
      const hits: {
        x: number
        y: number
        keyWidth: number
        velocity: number
        hand: 'lh' | 'rh'
      }[] = []
      for (const { key, kind } of emits) {
        if (kind !== 'onset') continue
        const g = geom.get(key)
        if (!g) continue
        hits.push({
          x: g.cx,
          y: nowLineY,
          keyWidth: g.w,
          velocity: g.velocity,
          hand: g.hand,
        })
      }
      if (hits.length > 0) this.particles.queueHits(hits)

      this.beatGrid.draw(currentTime, this.midi, this.viewport, this.theme)
      this.noteRenderer.draw(
        tracks,
        currentTime,
        this.viewport,
        this.visibleTrackIds,
        this.practiceFocusTrackIds,
      )
    } else {
      this.noteRenderer.clear()
    }

    // Swap prev ↔ curr for next frame (prev's contents are now stale)
    const tmp = this.prevActive
    this.prevActive = this.currActive
    this.currActive = tmp

    // ── Live MIDI keyboard notes ──────────────────────────────────────────
    if (this.liveNoteStore) {
      const maxReleasedAge = this.viewport.nowLineY / this.viewport.config.pixelsPerSecond
      this.liveNoteStore.pruneInvisible(currentTime, maxReleasedAge)
      this.loopNoteStore?.pruneInvisible(currentTime, maxReleasedAge)

      const held = this.liveNoteStore.heldNotes
      const loopHeld = this.loopNoteStore?.heldNotes
      const liveColor = liveNoteColor(this.theme)
      const nowLineY = this.viewport.nowLineY

      for (const [pitch] of held) {
        activeColors.set(pitch, liveColor)
        if (!emitParticles) continue

        const nextAt = this.liveEmitNext.get(pitch)
        if (nextAt === undefined) {
          // First frame we see this held note — note-on was already bursted
          // synchronously via burstParticleAt. Schedule the first sustain puff.
          this.liveEmitNext.set(pitch, currentTime + SUSTAIN_INITIAL_DELAY_SEC)
        } else if (currentTime >= nextAt) {
          this.liveEmitNext.set(pitch, currentTime + SUSTAIN_INTERVAL_SEC)
          void nowLineY
          void liveColor
        }
      }

      // Loop-held notes still light up the keyboard but don't emit particles —
      // keeps the "me vs my loop" visual distinction clear. Use the live color
      // unless a live note is also active on the same pitch (already set).
      if (loopHeld) {
        for (const [pitch] of loopHeld) {
          if (!activeColors.has(pitch)) activeColors.set(pitch, liveColor)
        }
      }

      // Reap released notes.
      for (const pitch of this.liveEmitNext.keys()) {
        if (!held.has(pitch)) this.liveEmitNext.delete(pitch)
      }

      if (this.liveNotesVisible) {
        this.liveNoteRenderer.draw(
          this.liveNoteStore,
          this.loopNoteStore,
          currentTime,
          this.viewport,
        )
      } else {
        // Keyboard highlight (above) still uses `held` — we only suppress
        // the floating-up sprites. Learn mode uses this so user input
        // registers on the keyboard without polluting the piano roll.
        this.liveNoteRenderer.clear()
      }
    } else {
      this.liveNoteRenderer.clear()
      if (this.liveEmitNext.size > 0) this.liveEmitNext.clear()
    }

    this.stepAfterHoursRoom(dt, currentTime, emitParticles)
    this.keyboardRenderer.drawActiveKeys(activeColors, this.viewport)
    this.keyboardRenderer.drawShimmer(this.viewport)
    this.keyboardRenderer.drawRange(this.viewport)
    this.drawRangeLanes()
    this.applyLiveRollFade()
    this.particles.update(dt)
    this.mistStrike?.update(this.viewport, activeColors, currentTime)

    if (this.externalLayers.length > 0) {
      const ctx: RenderContext = {
        viewport: this.viewport,
        theme: this.theme,
        time: currentTime,
        dt,
      }
      for (const layer of this.externalLayers) layer.update?.(ctx)
    }
  }

  // Register an additive visual layer on top of the built-in scene. Layers are
  // drawn in `zIndex` order; callers are expected to pick a z that matches the
  // intended stacking (see RenderLayer for the conventional zones). Registering
  // the same layer twice is a no-op.
  addLayer(layer: RenderLayer): void {
    if (this.externalLayers.includes(layer)) return
    layer.mount(this.app.stage)
    this.externalLayers.push(layer)
    this.externalLayers.sort((a, b) => a.zIndex - b.zIndex)
    layer.rebuild?.(this.makeLayerCtx(0))
    // Re-present so a layer added while the clock is paused paints immediately,
    // and wake the ticker — layers animate per frame, so their presence keeps
    // the loop out of idle-stop until they're removed.
    this.presentFrame()
    this.wake()
  }

  removeLayer(layer: RenderLayer): void {
    const i = this.externalLayers.indexOf(layer)
    if (i < 0) return
    this.externalLayers.splice(i, 1)
    layer.unmount()
    this.presentFrame()
  }

  private makeLayerCtx(time: number): RenderContext {
    return { viewport: this.viewport, theme: this.theme, time, dt: 0 }
  }

  private rebuildExternalLayers(): void {
    if (this.externalLayers.length === 0) return
    const ctx = this.makeLayerCtx(0)
    for (const layer of this.externalLayers) layer.rebuild?.(ctx)
  }

  burstParticleAt(pitch: number, velocity = 1): void {
    if (!this.viewport.hasKey(pitch)) return
    const keyWidth = this.viewport.pitchWidth(pitch)
    this.particles.queueHits([
      {
        x: this.viewport.pitchToX(pitch) + keyWidth / 2,
        y: this.viewport.nowLineY,
        keyWidth,
        velocity,
        hand: noteHand(pitch) === 'left' ? 'lh' : 'rh',
      },
    ])
    this.wake()
  }

  setLiveNoteStore(store: LiveNoteStore): void {
    this.liveStoreUnsub?.()
    this.liveNoteStore = store
    // A press/release/reset can arrive while the ticker is idle-stopped
    // (e.g. first key tap on the home screen) — wake so the next frame
    // draws it, and so trails/particles keep animating afterwards.
    this.liveStoreUnsub = store.onChange(() => this.wake())
  }

  // Suppress (or restore) the upward-floating live-note sprites without
  // touching the keyboard-highlight path. A mode that wants the keyboard
  // to highlight presses without streaking notes up the roll (e.g. a
  // practice surface) flips this off on enter and restores on exit.
  setLiveNotesVisible(visible: boolean): void {
    if (this.liveNotesVisible === visible) return
    this.liveNotesVisible = visible
    if (!visible) this.liveNoteRenderer.clear()
    this.presentFrame()
  }

  // Hide/show the entire stage. Skips per-frame draw work (stage.visible=false
  // short-circuits child rendering in Pixi) and hides the underlying canvas so
  // nothing leaks through DOM layers above. The body class lets CSS hide
  // canvas-coupled chrome (e.g. the keyboard-resizer drag seam) in lockstep.
  // Layout is preserved.
  setVisible(visible: boolean): void {
    this.app.stage.visible = visible
    this.app.canvas.style.visibility = visible ? '' : 'hidden'
    document.body.classList.toggle('canvas-hidden', !visible)
    // Coming back from hidden (sheet-music exercise → roll), the ticker may
    // be idle-stopped with a stale backbuffer — present the current state.
    if (visible) this.presentFrame()
  }

  setLoopNoteStore(store: LiveNoteStore | null): void {
    this.loopStoreUnsub?.()
    this.loopStoreUnsub = null
    this.loopNoteStore = store
    if (store) this.loopStoreUnsub = store.onChange(() => this.wake())
  }

  // Pitch → track color map of every key currently lit on the on-screen
  // keyboard. Re-populated each frame in `renderFrame`, so callers (chord
  // overlay, MIDI exporter sidebars, etc.) can read it once per tick.
  get currentActivePitches(): ReadonlyMap<number, number> {
    return this.activeKeyColors
  }

  // Set of MIDI pitches a "play these next" hint should highlight on the
  // keyboard. The renderer overlays them with a soft pulse, distinct from the
  // press-state colour so the hint reads as guidance rather than playback.
  setPracticeHints(
    pending: ReadonlySet<number> | null,
    accepted: ReadonlySet<number> | null,
  ): void {
    this.practiceHintPending = pending && pending.size > 0 ? pending : null
    this.practiceHintAccepted = accepted && accepted.size > 0 ? accepted : null
    this.keyboardRenderer.setPracticeHints(this.practiceHintPending, this.practiceHintAccepted)
    // Paint once so the hint appears immediately — the ticker may be
    // idle-stopped (paused practice step), so there is no next tick to
    // rely on. Cheap and unconditional beats guessing the loop's state.
    this.presentFrame()
  }

  isTrackVisible(trackId: string): boolean {
    return this.visibleTrackIds.has(trackId)
  }

  pauseAutoRender(): void {
    this.exportMode = true
    this.app.ticker.stop()
    this.particles.clear()
    this.prevActive.clear()
    this.currActive.clear()
    this.liveNoteRenderer.clear()
  }

  resumeAutoRender(): void {
    this.exportMode = false
    // wake() rather than a bare ticker.start() so the idle countdown also
    // resets — the post-export scene then presents and idles out normally.
    this.wake()
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas as HTMLCanvasElement
  }

  // Highlight which keys the controller window covers. The pitch viewport
  // is owned by focus (aimPitchRange) and, during a capture, by export.
  setPlayableRange(start: number, end: number): void {
    this.playStart = start
    this.playEnd = end
    this.keyboardRenderer.setPlayableRange(start, end)
    if (!this.exportMode) this.presentFrame()
  }

  // Keyboard rises from below the fold. The canvas keeps painting, so a key
  // pressed while it settles still lights and the note still sounds.
  playLiveArrival(): void {
    if (this.exportMode) return
    this.liveClock.beginIn(performance.now(), this.keyboardHeight)
    this.stepLiveMotion()
    this.presentFrame()
    this.wake()
  }

  playLiveDeparture(): void {
    if (this.exportMode) return
    this.liveClock.beginOut(
      performance.now(),
      this.keyboardRenderer.container.y,
      this.keyboardHeight,
    )
    this.stepLiveMotion()
    this.presentFrame()
    this.wake()
  }

  // Snap back to a resting keyboard. Presents while the canvas is hidden so
  // the sunk frame cannot flash once Home covers it.
  finishLiveMotion(): void {
    this.liveClock.stop()
    this.liveRoll = null
    this.liveRange = null
    this.keyboardRenderer.container.y = 0
    this.keyboardRenderer.setArrivalLight(0)
    this.keyboardRenderer.setShimmerClock(null)
    this.keyboardRenderer.setRangeGlide(null, null)
    this.backgroundGraphics.alpha = 1
    this.nowLineGraphics.alpha = 1
    this.rangeLaneGraphics.alpha = 1
    const canvas = this.app.canvas as HTMLCanvasElement
    const previous = canvas.style.visibility
    canvas.style.visibility = 'hidden'
    this.presentFrame()
    canvas.style.visibility = previous
  }

  finishLiveArrival(): void {
    if (!this.liveClock.active) return
    this.liveClock.stop()
    this.liveRoll = null
    this.liveRange = null
    this.keyboardRenderer.container.y = 0
    this.keyboardRenderer.setArrivalLight(1)
    this.keyboardRenderer.setShimmerClock(null)
    this.keyboardRenderer.setRangeGlide(null, null)
    this.backgroundGraphics.alpha = 1
    this.nowLineGraphics.alpha = 1
    this.rangeLaneGraphics.alpha = 1
    if (!this.exportMode) this.presentFrame()
  }

  private stepLiveMotion(): void {
    if (!this.liveClock.active) return
    const frame = this.liveClock.sample(performance.now())
    this.keyboardRenderer.container.y = frame.keyboardY
    this.keyboardRenderer.setArrivalLight(frame.light)
    this.keyboardRenderer.setShimmerClock(frame.shimmerMs)
    this.liveRoll = frame.roll
    this.backgroundGraphics.alpha = frame.roll
    this.nowLineGraphics.alpha = frame.roll
    if (frame.rangeT === null) {
      this.liveRange = null
      this.keyboardRenderer.setRangeGlide(null, null)
    } else {
      const next = glideRange(frame.rangeT, this.playStart, this.playEnd)
      this.liveRange = next
      this.keyboardRenderer.setRangeGlide(next.start, next.end)
    }
    if (!frame.done || this.liveClock.kind !== 'in') return
    this.liveClock.stop()
    this.liveRoll = null
    this.liveRange = null
    this.keyboardRenderer.container.y = 0
    this.keyboardRenderer.setArrivalLight(1)
    this.keyboardRenderer.setShimmerClock(null)
    this.keyboardRenderer.setRangeGlide(null, null)
    this.backgroundGraphics.alpha = 1
    this.nowLineGraphics.alpha = 1
    this.rangeLaneGraphics.alpha = 1
  }

  // drawRangeLanes resets its own alpha. Re-apply the entrance fade after it,
  // and keep the hit line and lane wash on the same clock.
  private applyLiveRollFade(): void {
    const roll = this.liveRoll
    if (roll === null) return
    this.backgroundGraphics.alpha = roll
    this.nowLineGraphics.alpha = roll
    if (this.rangeLaneGraphics) this.rangeLaneGraphics.alpha *= roll
  }

  // Tinted highway above the playable window. 24 stepped bands of
  // --range-lane, 0 → 36% from the top of the roll down to the keys,
  // with --range-edge rails and a foot. Opacity lives on this layer.
  private drawRangeLanes(): void {
    const g = this.rangeLaneGraphics
    if (!g) return
    const alphaMul = rangeLayerAlpha('lanes')
    g.clear()
    g.alpha = 1
    if (alphaMul < 0.02) return
    const { pitchMin, pitchMax } = this.viewport.config
    const lo = pitchMin ?? 21
    const hi = pitchMax ?? 108
    const windowStart = this.liveRange?.start ?? this.playStart
    const windowEnd = this.liveRange?.end ?? this.playEnd
    if (windowStart <= lo && windowEnd >= hi) return
    const positions = this.viewport.getAllKeyPositions()
    const startPos = positions.get(windowStart)
    const endPos = positions.get(windowEnd)
    if (!startPos || !endPos) return
    const x0 = startPos.x
    const width = endPos.x + endPos.width - x0
    if (width < 2) return
    const rollHeight = this.viewport.rollHeight
    const lane = readCssColor('--range-lane', { color: 0xe6a94f, alpha: 1 })
    const edge = readCssColor('--range-edge', { color: 0xa65c28, alpha: 1 })
    const bands = 24
    const bandH = rollHeight / bands
    for (let i = 0; i < bands; i++) {
      const y = i * bandH
      const towardKeys = (i + 1) / bands
      g.rect(x0, y, width, bandH + 0.5)
      g.fill({ color: lane.color, alpha: towardKeys * 0.36 })
      const rail = (1 - i / bands) * 0.8
      g.rect(x0, y, 1.5, bandH + 0.5)
      g.fill({ color: edge.color, alpha: rail })
      g.rect(x0 + width - 1.5, y, 1.5, bandH + 0.5)
      g.fill({ color: edge.color, alpha: rail })
    }
    g.rect(x0, Math.max(0, rollHeight - 3), width, 3)
    g.fill({ color: edge.color, alpha: 0.8 })
    g.alpha = alphaMul
  }

  // Repaint note positions after fit-to-range or the practice hand changes.
  // The idle ticker may already be stopped, so this cannot wait for a tick.
  refreshPlacement(): void {
    if (!this.exportMode) this.presentFrame()
  }

  // Screen rect of the on-screen keys from `start` through `end`, inclusive.
  keyBandRect(
    start: number,
    end: number,
  ): { left: number; top: number; width: number; height: number } | null {
    if (!this.viewport.hasKey(start) || !this.viewport.hasKey(end)) return null
    const bounds = this.canvas.getBoundingClientRect()
    const { canvasWidth, canvasHeight } = this.viewport.config
    if (bounds.width < 2 || bounds.height < 2 || canvasWidth < 1 || canvasHeight < 1) return null
    const scaleX = bounds.width / canvasWidth
    const scaleY = bounds.height / canvasHeight
    const x0 = this.viewport.pitchToX(start) * scaleX
    const x1 = (this.viewport.pitchToX(end) + this.viewport.pitchWidth(end)) * scaleX
    const frame = keyFrame(
      canvasWidth,
      whiteKeyCount(this.viewport.config.pitchMin ?? 21, this.viewport.config.pitchMax ?? 108),
      this.keyboardHeight,
    )
    const glassTop = (canvasHeight - this.keyboardHeight + frame.glassTop) * scaleY
    return {
      left: bounds.left + x0,
      top: bounds.top + glassTop,
      width: Math.max(12, x1 - x0),
      height: Math.max(12, frame.glassH * scaleY),
    }
  }

  // Pitch under a client X, using the white-key row so a horizontal drag
  // moves monotonically across the piano.
  // Top of one key in client pixels, for overlays that number a key.
  keyClientBox(pitch: number): { x: number; y: number; width: number } | null {
    if (!this.viewport.hasKey(pitch)) return null
    const bounds = this.canvas.getBoundingClientRect()
    const { canvasWidth, canvasHeight } = this.viewport.config
    if (bounds.width < 2 || canvasHeight < 1) return null
    const scaleX = bounds.width / canvasWidth
    const scaleY = bounds.height / canvasHeight
    const x = this.viewport.pitchToX(pitch) * scaleX
    const width = this.viewport.pitchWidth(pitch) * scaleX
    const keyboardPx = this.keyboardHeight * scaleY
    return {
      x: bounds.left + x + width / 2,
      y: bounds.top + bounds.height - keyboardPx,
      width,
    }
  }

  pitchFromClientX(clientX: number): number {
    const bounds = this.canvas.getBoundingClientRect()
    if (bounds.width <= 0) return 21
    const x = ((clientX - bounds.left) / bounds.width) * this.viewport.config.canvasWidth
    const y = this.viewport.config.canvasHeight - 2
    return this.viewport.pitchAtPoint(x, y) ?? 21
  }

  // Convert a client-space (canvas) point into a MIDI pitch if it lands on a key.
  pitchAtClientPoint(clientX: number, clientY: number): number | null {
    const rect = this.app.canvas.getBoundingClientRect()
    return this.viewport.pitchAtPoint(clientX - rect.left, clientY - rect.top)
  }

  // Current backing-store size + render resolution. Used by the exporter to
  // snapshot state before swapping in a custom export resolution.
  get canvasSize(): { width: number; height: number; resolution: number } {
    return {
      width: this.app.canvas.width,
      height: this.app.canvas.height,
      resolution: this.app.renderer.resolution,
    }
  }

  // Public resize — lets the exporter target an exact pixel size independent
  // of the window. Pass `resolution = 1` when exporting so the canvas backing
  // store matches the requested output dimensions exactly.
  resize(width: number, height: number, resolution?: number): void {
    if (resolution !== undefined && resolution !== this.app.renderer.resolution) {
      this.app.renderer.resolution = resolution
    }
    this.app.renderer.resize(width, height)
    this.viewport.update({ canvasWidth: width, canvasHeight: height })
    this.syncKeyboardProportion()
    this.rebuildStaticLayers()
    // Present at the *current* playhead, not t=0 — a window resize while
    // paused mid-piece must not repaint the piece's start. (Under the old
    // always-on ticker the t=0 frame was overwritten a frame later; now it
    // would stick.)
    this.presentFrame()
  }

  // One frame of the piece at an export size, for the export dialog's
  // preview. Temporarily resizes the (hidden-behind-the-modal) canvas, draws
  // the frame, snapshots it, then restores everything synchronously in the
  // same task so the live canvas never presents the intermediate size.
  // Returns null while an export owns the canvas or nothing is loaded.
  // `width`/`height` are LOGICAL px; `resolution` (default 1) multiplies them
  // into the backing store exactly like a real export, so the preview shows the
  // format's true proportions rather than a shrunk layout.
  async renderPreview(o: {
    width: number
    height: number
    resolution?: number
    time: number
    pitchRange?: { min: number; max: number }
    pixelsPerSecond?: number
    maxWidth: number
  }): Promise<ImageBitmap | null> {
    if (!this.midi || this.exportMode) return null
    const { resolution } = this.canvasSize
    const range = this.pitchRange
    const pps = this.pixelsPerSecond
    const lastTime = this.lastRenderTime
    let pending: Promise<ImageBitmap> | null = null
    try {
      this.resize(o.width, o.height, o.resolution ?? 1)
      if (o.pitchRange) this.setPitchRange(o.pitchRange.min, o.pitchRange.max)
      if (o.pixelsPerSecond !== undefined) this.setZoom(o.pixelsPerSecond)
      this.renderStaticFrame(o.time)
      // createImageBitmap copies the canvas at call time; the restore below
      // runs before the promise settles.
      // Downscale from the BACKING STORE, not the logical size — a 4K preview
      // renders at 1920x1080 logical / resolution 2, and scaling by the logical
      // width would throw away half the pixels the modal asked for.
      const pixelW = this.canvas.width
      const pixelH = this.canvas.height
      const scale = Math.min(1, o.maxWidth / pixelW)
      pending = createImageBitmap(this.canvas, {
        resizeWidth: Math.max(1, Math.round(pixelW * scale)),
        resizeHeight: Math.max(1, Math.round(pixelH * scale)),
        resizeQuality: 'high',
      })
    } finally {
      if (o.pixelsPerSecond !== undefined) this.setZoom(pps)
      if (o.pitchRange) this.setPitchRange(range.min, range.max)
      this.fitToWindow(resolution)
      this.renderStaticFrame(lastTime)
    }
    return pending
  }

  private handleResize = (): void => {
    // Ignore viewport events during export — the exporter owns canvas size
    // until it restores it in its own finally block.
    if (this.exportMode) return
    this.fitToWindow()
  }

  private fitToWindow(resolution?: number): void {
    // Re-clamp keyboard height (rotation) before resize() so the keyboard
    // bakes once at the final height.
    const { min, max } = viewportKeyboardBounds()
    this.applyKeyboardHeight(Math.min(max, Math.max(min, this.keyboardHeight)))
    this.resize(window.innerWidth, window.innerHeight, resolution)
  }

  // Shadow buffer sits above the backdrop and under the lanes, notes, and
  // keyboard. Golden Hour only; Rainy Study and Off leave the sprites hidden.
  private mountPlantShadows(): void {
    this.plantReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    this.plantField = new PlantShadowField(() => {
      document.documentElement.dataset.plantReady = '1'
      this.onPlantSetting()
    })
    this.plantField.setReducedMotion(this.plantReduced)
    const id = plantShadowId()
    if (id !== 'off') this.plantField.setPlant(id)
    const shadow = new Sprite(Texture.from(this.plantField.shadow))
    shadow.label = 'plant-shadows'
    shadow.blendMode = 'multiply'
    shadow.eventMode = 'none'
    shadow.visible = false
    const glow = new Sprite(Texture.from(this.plantField.glow))
    glow.label = 'plant-glow'
    glow.blendMode = 'soft-light'
    glow.eventMode = 'none'
    glow.visible = false
    shadow.texture.source.autoGenerateMipmaps = false
    glow.texture.source.autoGenerateMipmaps = false
    this.plantSprite = shadow
    this.plantGlowSprite = glow
    // Under the notes until the backdrop exists; layout then pins them to it.
    this.app.stage.addChildAt(glow, 0)
    this.app.stage.addChildAt(shadow, 0)
    if (this.plantField.ready) {
      document.documentElement.dataset.plantReady = '1'
      this.onPlantSetting()
    }
    this.plantUnsub = subscribePlantShadow(this.onPlantSetting)
    this.plantMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    this.plantMotionQuery.addEventListener('change', this.onPlantMotion)
    document.addEventListener('visibilitychange', this.onPlantVisibility)
  }

  private onPlantSetting = (): void => {
    const id = plantShadowId()
    if (id !== 'off') this.plantField?.setPlant(id)
    this.plantLastPaint = -1
    this.layoutPlantShadows()
    this.stepPlantShadows(true)
    if (!this.exportMode) this.presentFrame()
    if (this.plantMoving()) this.wake()
  }

  private onPlantMotion = (event: MediaQueryListEvent): void => {
    this.plantReduced = event.matches
    this.plantLastPaint = -1
    this.plantField?.setReducedMotion(event.matches)
    this.stepPlantShadows(true)
    if (this.plantMoving()) this.wake()
    else if (!this.exportMode) this.presentFrame()
  }

  private onPlantVisibility = (): void => {
    if (!document.hidden && this.plantMoving()) this.wake()
  }

  private plantMoving(): boolean {
    return (
      this.plantSprite?.visible === true &&
      this.plantField?.ready === true &&
      !this.plantReduced &&
      !document.hidden &&
      !this.exportMode
    )
  }

  private layoutPlantShadows(): void {
    const field = this.plantField
    const shadow = this.plantSprite
    const glow = this.plantGlowSprite
    if (!field || !shadow || !glow) return
    const active = plantShadowsActive(this.theme.id)
    shadow.visible = active
    glow.visible = active
    document.documentElement.dataset.plantShadows = active ? plantShadowId() : 'off'
    if (!active) return
    field.setBudget(readPlantShadowBudget())
    const w = Math.max(1, this.viewport.config.canvasWidth)
    const h = Math.max(1, this.viewport.rollHeight)
    field.resize(w, h)
    shadow.position.set(0, 0)
    glow.position.set(0, 0)
    shadow.width = w
    glow.width = w
    shadow.height = h
    glow.height = h
    this.placePlantSprites()
  }

  private placePlantSprites(): void {
    const shadow = this.plantSprite
    const glow = this.plantGlowSprite
    const backdrop = this.sceneBackdrop
    if (!shadow || !glow || !backdrop) return
    const stage = this.app.stage
    const at = stage.getChildIndex(backdrop)
    stage.addChildAt(shadow, at + 1)
    stage.addChildAt(glow, stage.getChildIndex(shadow) + 1)
  }

  // A moving roll drops the frosted blur immediately. Frame time still
  // decides whether the plant layer waits and shrinks. Notes are unchanged.
  private applyFrameBudget(frameMs: number): void {
    const base = readPlantShadowBudget()
    const decision = stepPlantBudget(
      {
        nowMs: performance.now(),
        lastPaintMs: this.plantLastPaint,
        frameMs: Number.isFinite(frameMs) && frameMs > 0 ? frameMs : 16,
        stressed: this.plantStressed,
        calmMs: this.plantCalmMs,
      },
      base,
    )
    this.plantStressed = decision.stressed
    this.plantCalmMs = decision.calmMs
    this.plantPaintNow = decision.paint
    this.plantBudgetNow = decision.budget
    // The frosted cards sample this canvas. Leave the blur off for the whole
    // moving frame: waiting until a frame is already late means the upload
    // that stalls has already started.
    if (document.documentElement.dataset.frameBudget !== 'low') {
      document.documentElement.dataset.frameBudget = 'low'
    }
  }

  private stepPlantShadows(force = false): void {
    if (document.hidden && !this.exportMode) return
    const field = this.plantField
    const shadow = this.plantSprite
    const glow = this.plantGlowSprite
    if (!field || !shadow?.visible || !glow) return
    // A paused reduced-motion wall, and a healthy frame between shadow
    // paints, keeps the texture it already uploaded.
    if (!force && !this.exportMode && !this.plantPaintNow && this.plantLastPaint >= 0) return
    const budget = this.plantBudgetNow ?? readPlantShadowBudget()
    field.setBudget(budget)
    const w = Math.max(1, this.viewport.config.canvasWidth)
    const h = Math.max(1, this.viewport.rollHeight)
    const resized = field.resize(w, h)
    if (resized) {
      shadow.width = w
      glow.width = w
      shadow.height = h
      glow.height = h
    }
    // Matching the texture to the buffer clears the canvas, so resize first
    // and paint once into the final bitmap. Export frames stay on the parked pose.
    this.preparePlantTexture(shadow, field.shadow)
    this.preparePlantTexture(glow, field.glow)
    const now = performance.now()
    field.paint(now, this.exportMode || this.plantReduced)
    shadow.texture.source.update()
    glow.texture.source.update()
    this.plantLastPaint = now
    if (field.ready) document.documentElement.dataset.plantReady = '1'
  }

  private preparePlantTexture(sprite: Sprite, canvas: HTMLCanvasElement): void {
    const source = sprite.texture.source
    if (source.width === canvas.width && source.height === canvas.height) return
    source.resize(canvas.width, canvas.height)
  }

  destroy(): void {
    window.removeEventListener('resize', this.handleResize)
    this.plantUnsub?.()
    this.afterUnsub?.()
    this.plantMotionQuery?.removeEventListener('change', this.onPlantMotion)
    document.removeEventListener('visibilitychange', this.onPlantVisibility)
    this.clockUnsub?.()
    this.liveStoreUnsub?.()
    this.loopStoreUnsub?.()
    this.noteRenderer.destroy()
    this.liveNoteRenderer.destroy()
    this.materialAtmosphere?.destroy({ texture: true, textureSource: true })
    this.clearSceneBackdrop()
    this.particles.destroy()
    this.mistStrike?.destroy()
    this.app.destroy()
  }
}
