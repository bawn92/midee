import { Container, Graphics, type Renderer, Text } from 'pixi.js'
import { GlowFilter } from 'pixi-filters'
import { fingerKey, planFingering } from '../core/fingering'
import { getHandPractice } from '../core/handPractice'
import { getKeyboardRange, type KeyboardRangePrefs, placedPitch } from '../core/keyboardRange'
import { noteHandOf, noteMatchesHandOf } from '../core/midi/hands'
import { isBlackKey, MIDI_MAX, MIDI_MIN, type MidiNote, type MidiTrack } from '../core/midi/types'
import { paintPrefs } from '../ui/paint'
import {
  ACTIVE_NOTE_ALPHA,
  BakedGlow,
  GLOW_QUALITY,
  type GlowMode,
  glowSettings,
} from './bakedGlow'
import { createNoteMaterial } from './createNoteMaterial'
import { KBD } from './keyboardMetrics'
import type { NoteMaterial, NoteMaterialId } from './NoteMaterial'
import { NoteLabelLayer } from './noteLabels'
import { badgeDiameter, countOnsets, earliestFutureOnset, prefersReducedMotion } from './noteShape'
import { paintSceneNotes, type SceneNoteInput } from './sceneNotes'
import { sceneForTheme } from './scenes'
import { getTrackColor, type Theme } from './theme'
import { type Viewport, visibleNoteRange } from './viewport'

// One Graphics object per track — same-color draws are batched together.
// A separate glow container holds only the notes currently being struck,
// so the expensive GlowFilter only runs over a small subset each frame.
// Glow mode 'baked' (bakedGlow.ts, A/B switch) drops the filter and puts
// pre-baked halo sprites under the same struck-note overlay instead.

const PRACTICE_INACTIVE_ALPHA_SCALE = 0.3

export class NoteRenderer {
  readonly container: Container

  private trackGraphics = new Map<string, Graphics>()
  private glowContainer: Container
  private glowGraphics: Graphics
  private glowFilter: GlowFilter
  private bakedGlow: BakedGlow
  private glowMode: GlowMode = 'filter'
  // Pitch-class labels ("E", "F♯") on the bars — opt-in, sits above the glow
  // so the filter never blooms the text.
  private labels = new NoteLabelLayer()
  private material: NoteMaterial | null = null
  private materialId: NoteMaterialId | undefined
  private materialClip = new Graphics()
  private clipWidth = 0
  private clipHeight = 0
  // Octave-folded notes. A layer of its own so the mark stays visible when the
  // note body is drawn by a material mesh instead of the track Graphics.
  private foldGraphics = new Graphics()
  private fingerPlan = new Map<string, number>()
  private fingerStamp = ''
  private fingerLabels: Text[] = []
  private fingerUsed = 0
  private landing = new Graphics()
  private badgeGraphics = new Graphics()
  private bpm = 120

  // `renderer` is only used by the baked glow to render its halo textures.
  constructor(
    private theme: Theme,
    renderer: Renderer,
  ) {
    this.container = new Container()
    this.container.label = 'notes'
    this.materialClip.label = 'note-consumption-clip'
    this.materialClip.visible = false
    this.container.addChild(this.materialClip)

    this.glowContainer = new Container()
    this.glowContainer.label = 'note-glow'

    this.glowFilter = new GlowFilter({
      distance: theme.noteGlowDistance,
      outerStrength: theme.noteGlowStrength,
      innerStrength: 0,
      color: 0xffffff,
      quality: GLOW_QUALITY,
    })

    // Halo sprites (baked mode) sit under the struck-note overlay rects.
    this.bakedGlow = new BakedGlow(renderer)
    this.glowContainer.addChild(this.bakedGlow.container)
    this.glowGraphics = new Graphics()
    this.glowContainer.addChild(this.glowGraphics)
    this.applyGlowMode(glowSettings().mode)
    this.foldGraphics.label = 'note-fold'
    this.landing.label = 'note-landing'
    this.badgeGraphics.label = 'note-badges'
    this.container.addChild(this.glowContainer)
    this.container.addChild(this.landing)
    this.container.addChild(this.foldGraphics)
    this.container.addChild(this.badgeGraphics)
    this.container.addChild(this.labels.container)
    this.updateTheme(theme)
  }

  // 'filter': GlowFilter over the overlay rects. 'baked': no filter; halo
  // sprites under the same rects. Bakes are freed when leaving 'baked'.
  private applyGlowMode(mode: GlowMode): void {
    this.glowMode = mode
    this.glowContainer.filters = mode === 'filter' ? [this.glowFilter] : null
    this.bakedGlow.container.visible = mode === 'baked'
    if (mode === 'filter') this.bakedGlow.release()
  }

  setLabelsEnabled(on: boolean): void {
    this.labels.setEnabled(on)
  }

  setTempo(bpm: number): void {
    this.bpm = bpm > 0 ? bpm : 120
  }

  // Call once when tracks are loaded — sets up one Graphics per track
  setTracks(tracks: MidiTrack[]): void {
    this.fingerStamp = ''
    // Remove stale graphics
    const incomingIds = new Set(tracks.map((t) => t.id))
    for (const [id, g] of this.trackGraphics) {
      if (!incomingIds.has(id)) {
        this.container.removeChild(g)
        g.destroy()
        this.trackGraphics.delete(id)
      }
    }

    for (const track of tracks) {
      if (!this.trackGraphics.has(track.id)) {
        const g = new Graphics()
        g.label = `notes-${track.id}`
        // Insert before the glow container so glow renders on top.
        this.container.addChildAt(g, this.container.children.indexOf(this.glowContainer))
        this.trackGraphics.set(track.id, g)
      }
    }
  }

  // Called every frame from the main render loop.
  // Draws base notes and active-note glow in a single pass; accumulates the
  // glow-filter tint inline so no intermediate array is allocated per frame.
  draw(
    tracks: MidiTrack[],
    currentTime: number,
    viewport: Viewport,
    visibleTrackIds: Set<string>,
    practiceFocusTrackIds: ReadonlySet<string> | null,
  ): void {
    const { noteRadius } = this.theme
    const nowLineY = viewport.nowLineY
    this.fingerUsed = 0
    const { mode: glowMode, tint: glowTint } = glowSettings()
    if (glowMode !== this.glowMode) this.applyGlowMode(glowMode)
    const baked = glowMode === 'baked' ? this.bakedGlow : null
    baked?.begin(this.theme.noteGlowDistance, this.theme.noteGlowStrength, noteRadius)
    this.glowGraphics.clear()
    this.foldGraphics.clear()
    this.landing.clear()
    this.badgeGraphics.clear()
    if (
      this.material &&
      (this.clipWidth !== viewport.config.canvasWidth || this.clipHeight !== nowLineY)
    ) {
      this.clipWidth = viewport.config.canvasWidth
      this.clipHeight = nowLineY
      this.materialClip.clear().rect(0, 0, this.clipWidth, this.clipHeight).fill(0xffffff)
    }
    this.material?.setViewport?.(viewport.config.canvasWidth, viewport.rollHeight)
    this.material?.begin()
    const labels = this.labels.isActive ? this.labels : null
    labels?.begin()
    const rangePrefs = getKeyboardRange()
    this.ensureFingers(tracks, rangePrefs)
    const practiceHand = getHandPractice().hand

    let activeCount = 0
    let sumR = 0,
      sumG = 0,
      sumB = 0

    const visStart = currentTime - viewport.trailSeconds - 0.5
    const visEnd = currentTime + viewport.lookaheadSeconds + 0.5
    const sceneBatches = new Map<string, SceneNoteInput[]>()

    for (const track of tracks) {
      const g = this.trackGraphics.get(track.id)
      if (!g) continue

      g.clear()

      if (!visibleTrackIds.has(track.id)) continue

      const trackColor = getTrackColor(track, this.theme)
      const sceneNotes = sceneForTheme(this.theme.id) !== null
      const byHand = sceneNotes && paintPrefs().colorBy === 'hand'
      const soft = sceneNotes && this.theme.noteStyle === 'pill'
      const practiceInactive =
        practiceFocusTrackIds !== null && !practiceFocusTrackIds.has(track.id)

      const [lo, hi] = visibleNoteRange(track.notes, visStart, visEnd)
      for (let ni = lo; ni < hi; ni++) {
        const note = track.notes[ni]!
        const timeDelta = note.time - currentTime
        const noteBottom = Math.min(viewport.timeOffsetToY(timeDelta), nowLineY)
        const noteTop = viewport.timeOffsetToY(timeDelta + note.duration)
        if (noteTop >= nowLineY) continue
        const h = Math.max(noteBottom - noteTop, 3)
        const y = noteTop

        const placement = track.isDrum ? null : placedPitch(note.pitch, rangePrefs)
        const drawPitch = placement?.pitch ?? note.pitch
        const shifted = placement !== null && placement.octaves !== 0
        const hand = noteHandOf(track, note.pitch)
        const handDim =
          !track.isDrum &&
          practiceHand !== 'both' &&
          !noteMatchesHandOf(track, note.pitch, practiceHand)
        const dimmed = practiceInactive || handDim
        const noteColor = byHand
          ? hand === 'left'
            ? (this.theme.trackColors[1] ?? trackColor)
            : (this.theme.trackColors[0] ?? trackColor)
          : trackColor
        const colorR = (noteColor >> 16) & 0xff
        const colorG = (noteColor >> 8) & 0xff
        const colorB = noteColor & 0xff

        // Inside the piano but outside the keys this frame can draw: a narrow
        // marker on the near edge. A note folded into the window is drawn on
        // its new key instead.
        if (!viewport.hasKey(drawPitch)) {
          if (!shifted && note.pitch >= MIDI_MIN && note.pitch <= MIDI_MAX) {
            this.paintUnreachable(g, note.pitch, y, h, viewport, noteColor, dimmed)
          }
          continue
        }

        const x = viewport.pitchToX(drawPitch)
        const rawW = Math.max(viewport.pitchWidth(drawPitch), 2)
        const pill = soft
        const hScale = rawW / (isBlackKey(drawPitch) ? KBD.blackW : KBD.pitch)
        const inset = pill ? 4 * hScale : 0
        const w = Math.max(2, rawW - inset)
        const drawX = x + inset / 2
        const radius = pill ? Math.min(8 * hScale, w / 2, h / 2) : noteRadius

        // Scene notes are a flat fill. Velocity still shapes the audio.
        const alpha = pill
          ? dimmed
            ? 0.3
            : 1
          : (0.5 + note.velocity * 0.5) * (dimmed ? PRACTICE_INACTIVE_ALPHA_SCALE : 1)

        const active =
          !practiceInactive && note.time <= currentTime && note.time + note.duration > currentTime
        if (this.material) {
          this.material.place(
            x,
            y,
            w,
            // Preserve the complete material coordinate system as the note
            // crosses the keys. One shared roll mask consumes the surface;
            // shrinking it here would squeeze every texture and reflection.
            Math.max(note.duration * viewport.config.pixelsPerSecond, 3),
            noteColor,
            alpha,
            currentTime,
            note.time,
            note.pitch + note.time,
            active,
          )
        } else if (pill) {
          let batch = sceneBatches.get(track.id)
          if (!batch) {
            batch = []
            sceneBatches.set(track.id, batch)
          }
          batch.push({
            pitch: note.pitch,
            drawPitch,
            time: note.time,
            duration: note.duration,
            velocity: note.velocity,
            shifted,
            octaves: placement?.octaves ?? 0,
            dimmed,
            color: noteColor,
            hand,
            note,
          })
        } else {
          g.roundRect(drawX, y, w, h, noteRadius)
          g.fill({ color: noteColor, alpha })
        }

        if (!pill) {
          labels?.place(drawPitch, x, w, noteBottom, h, noteColor, alpha)
          if (shifted && placement) {
            this.paintShiftMark(x, y, w, h, placement.octaves, alpha, false)
          }
        }

        if (
          !this.material &&
          !pill &&
          !dimmed &&
          note.time <= currentTime &&
          note.time + note.duration >= currentTime
        ) {
          this.glowGraphics.roundRect(drawX, y, w, h, radius)
          this.glowGraphics.fill({ color: noteColor, alpha: ACTIVE_NOTE_ALPHA })
          baked?.add(drawX, y, w, h, noteColor)
          sumR += colorR
          sumG += colorG
          sumB += colorB
          activeCount++
        }
      }
    }

    this.paintSceneBatches(sceneBatches, viewport, nowLineY, currentTime, labels)

    labels?.end()
    for (let i = this.fingerUsed; i < this.fingerLabels.length; i++) {
      this.fingerLabels[i]!.visible = false
    }
    this.material?.end()
    this.raiseFoldMarks()

    if (activeCount > 0) {
      const avgColor =
        (Math.round(sumR / activeCount) << 16) |
        (Math.round(sumG / activeCount) << 8) |
        Math.round(sumB / activeCount)
      if (baked) baked.end(glowTint === 'average' ? avgColor : null)
      else this.glowFilter.color = avgColor
      this.glowContainer.visible = true
    } else {
      baked?.end(null)
      this.glowContainer.visible = false
    }
  }

  private paintSceneBatches(
    batches: Map<string, SceneNoteInput[]>,
    viewport: Viewport,
    nowLineY: number,
    currentTime: number,
    labels: NoteLabelLayer | null,
  ): void {
    if (batches.size === 0) return
    const times: number[] = []
    for (const list of batches.values()) for (const note of list) times.push(note.time)
    const onset = earliestFutureOnset(times, currentTime)
    const dense = this.bpm > 160 || countOnsets(times, currentTime) > 10
    const pools = { used: 0 }
    const prefs = paintPrefs()
    const reduced = prefersReducedMotion()
    for (const [id, notes] of batches) {
      const g = this.trackGraphics.get(id)
      if (!g) continue
      paintSceneNotes({
        g,
        landing: this.landing,
        notes,
        viewport,
        nowLineY,
        currentTime,
        theme: this.theme,
        bpm: this.bpm,
        prefs,
        reduced,
        onset,
        dense,
        pools,
        onPlaced: (placed) => {
          labels?.place(
            placed.drawPitch,
            placed.x,
            placed.w,
            placed.bottom,
            placed.h,
            placed.color,
            placed.alpha,
          )
          if (placed.shifted) {
            this.paintShiftMark(
              placed.x,
              placed.y,
              placed.w,
              placed.h,
              placed.octaves,
              placed.alpha,
              true,
            )
          }
        },
        onFinger: (finger) => {
          this.paintFinger(
            finger.note,
            finger.x,
            finger.y,
            finger.w,
            finger.h,
            finger.alpha,
            finger.hand,
            finger.edge,
            prefs.noteHandShapes,
          )
        },
      })
    }
  }

  // Recomputed when the song or the key window changes. The number is for
  // the key under the badge, not the written pitch.
  private ensureFingers(tracks: readonly MidiTrack[], range: KeyboardRangePrefs): void {
    const stamp = `${range.start}:${range.size}:${range.fitToRange}:${tracks.map((track) => `${track.id}:${track.notes.length}`).join(',')}`
    if (stamp === this.fingerStamp) return
    this.fingerStamp = stamp
    this.fingerPlan = planFingering(tracks, range)
  }

  // Finger numbers sit inside the note, pinned to its lower edge, at least 12px.
  private paintFinger(
    note: MidiNote,
    x: number,
    y: number,
    w: number,
    h: number,
    alpha: number,
    hand: 'rh' | 'lh',
    edge: number,
    hands: boolean,
  ): void {
    if (h < 8 || alpha < 0.2) return
    const which = hand === 'lh' ? 'left' : 'right'
    const finger = this.fingerPlan.get(fingerKey(which, note))
    if (!finger) return
    const size = Math.max(14, badgeDiameter(w))
    const cx = x + w / 2
    // Pinned to the bottom edge. A short note lets the badge rise rather than
    // slip under the keyboard.
    const cy = y + h - size / 2 - 2
    if (hands) {
      if (hand === 'lh') {
        this.badgeGraphics.roundRect(cx - size / 2, cy - size / 2, size, size, 3.5)
      } else {
        this.badgeGraphics.circle(cx, cy, size / 2)
      }
      this.badgeGraphics.fill({ color: 0xfff8ee, alpha })
      if (hand === 'lh') {
        this.badgeGraphics.roundRect(cx - size / 2, cy - size / 2, size, size, 3.5)
      } else {
        this.badgeGraphics.circle(cx, cy, size / 2)
      }
      this.badgeGraphics.stroke({ color: edge, width: 1, alpha })
    }
    let label = this.fingerLabels[this.fingerUsed]
    if (!label) {
      label = new Text({
        text: '',
        style: {
          fontFamily: 'Nunito Sans, system-ui, sans-serif',
          fontWeight: '800',
          fill: 0xfff8ee,
        },
      })
      label.anchor.set(0.5, 0.5)
      this.container.addChild(label)
      this.fingerLabels.push(label)
    }
    label.visible = true
    label.text = String(finger)
    label.style.fontSize = 12
    label.style.fill = hands ? edge : 0xfff8ee
    label.alpha = alpha
    label.x = cx
    label.y = cy
    this.fingerUsed++
  }

  private paintShiftMark(
    x: number,
    y: number,
    w: number,
    h: number,
    octaves: number,
    alpha: number,
    chevronOnly: boolean,
  ): void {
    const markAlpha = Math.min(1, alpha + 0.25)
    if (!chevronOnly) {
      this.foldGraphics.roundRect(x + 0.5, y + 0.5, Math.max(1, w - 1), Math.max(1, h - 1), 8)
      this.foldGraphics.stroke({ color: 0x7a5a44, width: 1.5, alpha: markAlpha * 0.9 })
    }
    if (h < 8 || w < 4) return
    const cx = x + w / 2
    const up = octaves > 0
    const tipY = up ? y + 2.5 : y + h - 2.5
    const baseY = tipY + (up ? 4.5 : -4.5)
    this.foldGraphics.poly([cx, tipY, cx - 2.6, baseY, cx + 2.6, baseY])
    this.foldGraphics.fill({ color: 0xfff6e4, alpha: markAlpha })
  }

  // The material mesh is inserted in front of the track graphics whenever the
  // theme changes. Park the octave marks just under the pitch labels so they
  // stay on top of either note body.
  private raiseFoldMarks(): void {
    const index = this.container.children.indexOf(this.labels.container)
    if (index >= 0) {
      this.container.addChildAt(this.landing, index)
      this.container.addChildAt(this.badgeGraphics, index)
      this.container.addChildAt(this.foldGraphics, index)
    }
    for (const label of this.fingerLabels) this.container.addChild(label)
  }

  // Out-of-range notes stay visible so the song doesn't appear to skip, but
  // they don't look like something to play: a slim pale marker pinned to the
  // edge the pitch fell off, fanned a few pixels so a cluster doesn't become
  // one blob. No glow, no label, no particle — those belong to real keys.
  private paintUnreachable(
    g: Graphics,
    pitch: number,
    y: number,
    h: number,
    viewport: Viewport,
    noteColor: number,
    practiceInactive: boolean,
  ): void {
    const min = viewport.config.pitchMin ?? MIDI_MIN
    const max = viewport.config.pitchMax ?? MIDI_MAX
    const below = pitch < min
    const distance = below ? min - pitch : pitch - max
    const slot = Math.min(Math.max(distance, 0), 4)
    const w = 6
    const canvasW = viewport.config.canvasWidth
    const x = below ? 3 + slot * 3 : canvasW - w - 3 - slot * 3
    const alpha = practiceInactive ? 0.12 : 0.55
    g.roundRect(x, y, w, h, 2)
    g.fill({ color: 0xc5c8dc, alpha: alpha * 0.55 })
    g.roundRect(x + 1, y, Math.max(2, w - 2), h, 2)
    g.fill({ color: noteColor, alpha })
  }

  updateTheme(theme: Theme): void {
    this.theme = theme
    if (theme.noteMaterial !== this.materialId) {
      this.material?.destroy()
      this.materialId = theme.noteMaterial
      this.material = theme.noteMaterial ? createNoteMaterial(theme.noteMaterial) : null
      if (this.material) {
        this.material.container.mask = this.materialClip
        this.container.addChildAt(
          this.material.container,
          this.container.children.indexOf(this.glowContainer),
        )
      }
      this.materialClip.visible = this.material !== null
    }
    // WebGL bakes distance into the shader; assigning the uniform alone only
    // changes padding. Recreate on radius changes so theme switching is real.
    if (this.glowFilter.distance !== theme.noteGlowDistance) {
      this.glowFilter.destroy()
      this.glowFilter = new GlowFilter({
        distance: theme.noteGlowDistance,
        outerStrength: theme.noteGlowStrength,
        innerStrength: 0,
        quality: GLOW_QUALITY,
      })
      if (this.glowMode === 'filter') this.glowContainer.filters = [this.glowFilter]
    }
    this.glowFilter.outerStrength = theme.noteGlowStrength
    // Baked halos re-bake themselves when the glow params change (begin()).
  }

  clear(): void {
    this.trackGraphics.forEach((g) => {
      g.clear()
    })
    this.glowGraphics.clear()
    this.foldGraphics.clear()
    this.landing.clear()
    this.badgeGraphics.clear()
    this.glowContainer.visible = false
    this.labels.clear()
    this.material?.clear()
  }

  destroy(): void {
    this.material?.destroy()
    this.glowFilter.destroy()
    this.bakedGlow.destroy()
    this.container.destroy({ children: true })
  }
}
