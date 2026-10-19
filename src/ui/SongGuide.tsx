import { createSignal, For, Show } from 'solid-js'
import { render } from 'solid-js/web'
import type { MasterClock } from '../core/clock/MasterClock'
import { getHandPractice, subscribeHandPractice } from '../core/handPractice'
import { getKeyboardRange, subscribeKeyboardRange } from '../core/keyboardRange'
import { pitchToNoteName } from '../core/midi/types'
import { t } from '../i18n'
import { GUIDE_TEMPOS, guideForMidi, guideSpeed } from '../songGuide'
import { barAt, barStart, fingersAt, loopShouldWrap, snapshot } from '../songGuide/query'
import type { FingerMark, GuideSnapshot, SongGuide } from '../songGuide/types'
import type { AppStore } from '../store/state'
import { watch } from '../store/watch'
import { Chip, Dropdown } from './kit/kit'
import { CLOSE_MODE_POPOVERS } from './modeChrome'
import { paintPrefs, subscribePaint } from './paint'

const CLEAN_GOAL = 3
const DEFAULT_TEMPO = 120

interface SavedGuide {
  open: boolean
  tempo: number
  cleans: Record<string, number>
}

interface GuideView {
  guide: SongGuide
  snap: GuideSnapshot
  open: boolean
  looping: string | null
  tempo: number
  cleans: number
  fingerText: string
  side: boolean
}

function freshSaved(): SavedGuide {
  return { open: true, tempo: DEFAULT_TEMPO, cleans: {} }
}

function isGuideTempo(value: unknown): value is (typeof GUIDE_TEMPOS)[number] {
  return typeof value === 'number' && (GUIDE_TEMPOS as readonly number[]).includes(value)
}

function loadSaved(id: string): SavedGuide {
  try {
    const raw = localStorage.getItem(`midee.songGuide.${id}`)
    if (!raw) return freshSaved()
    const parsed = JSON.parse(raw) as Partial<SavedGuide>
    return {
      open: parsed.open !== false,
      tempo: isGuideTempo(parsed.tempo) ? parsed.tempo : DEFAULT_TEMPO,
      cleans: parsed.cleans && typeof parsed.cleans === 'object' ? parsed.cleans : {},
    }
  } catch {
    return freshSaved()
  }
}

function saveGuide(id: string, saved: SavedGuide): void {
  localStorage.setItem(`midee.songGuide.${id}`, JSON.stringify(saved))
}

export function SongGuidePanel(props: {
  view: () => GuideView
  onToggle: () => void
  onJump: (startBar: number, endBar: number) => void
  onClearLoop: () => void
  onTempo: (tempo: number) => void
  onClean: () => void
}) {
  const view = () => props.view()
  const snap = () => view().snap
  return (
    <aside
      class="song-guide"
      data-song-guide
      data-open={view().open ? 'true' : 'false'}
      data-bar={snap().bar}
      data-section={snap().section?.id ?? ''}
      classList={{ 'song-guide--open': view().open, 'song-guide--side': view().side }}
    >
      <Show
        when={view().open}
        fallback={
          <button type="button" class="song-guide-tab" onClick={() => props.onToggle()}>
            {t('songGuide.open')}
          </button>
        }
      >
        <div class="song-guide-card">
          <header class="song-guide-head">
            <div>
              <div class="song-guide-kicker">{t('songGuide.title')}</div>
              <div class="song-guide-name">{view().guide.title}</div>
            </div>
            <button type="button" class="song-guide-close" onClick={() => props.onToggle()}>
              {t('songGuide.hide')}
            </button>
          </header>

          <Dropdown
            label={snap().section?.name ?? t('songGuide.title')}
            value={snap().section?.id ?? ''}
            options={view().guide.sections.map((section) => ({
              id: section.id,
              label: section.name,
            }))}
            onChange={(id) => {
              const section = view().guide.sections.find((item) => item.id === id)
              if (section) props.onJump(section.startBar, section.endBar)
            }}
          />

          <div class="song-guide-now">
            <span class="song-guide-bar">{t('songGuide.bar', { n: snap().bar })}</span>
            <Show when={snap().section}>
              {(section) => (
                <span class="song-guide-section" style={{ color: section().color }}>
                  {section().name}
                </span>
              )}
            </Show>
            <Show when={snap().step}>
              {(step) => (
                <span class="song-guide-step">
                  {t('songGuide.step', { n: step().order, total: view().guide.steps.length })}
                </span>
              )}
            </Show>
          </div>

          <div class="song-guide-chord">
            <span class="song-guide-chord-name">{snap().chord ?? t('songGuide.rest')}</span>
            <Show when={snap().loop}>
              {(loop) => (
                <fieldset class="song-guide-loop">
                  <legend class="sr-visually-hidden">{t('songGuide.loopLabel')}</legend>
                  <For each={loop().chords}>
                    {(name, i) => (
                      <Chip
                        class="song-guide-chip"
                        current={i() === loop().index}
                        next={i() === loop().index + 1}
                      >
                        {name}
                      </Chip>
                    )}
                  </For>
                </fieldset>
              )}
            </Show>
          </div>

          <Show when={snap().statement}>
            {(statement) => (
              <p class="song-guide-meta">
                {t('songGuide.statement', {
                  label: statement().label,
                  n: statement().n,
                  total: statement().total,
                })}
              </p>
            )}
          </Show>
          <Show when={snap().pattern}>
            {(pattern) => (
              <p class="song-guide-meta">
                {t('songGuide.pattern', {
                  label: pattern().label,
                  n: pattern().n,
                  total: pattern().total,
                })}
              </p>
            )}
          </Show>
          <Show when={snap().fact}>{(fact) => <p class="song-guide-fact">{fact()}</p>}</Show>
          <Show when={snap().warning}>{(text) => <p class="song-guide-warn">{text()}</p>}</Show>
          <Show when={!snap().warning && snap().endurance}>
            {(text) => <p class="song-guide-endurance">{text()}</p>}
          </Show>
          <Show when={view().fingerText}>
            {(text) => (
              <p class="song-guide-fingers">
                <span>{t('songGuide.fingers')}</span> {text()}
              </p>
            )}
          </Show>

          <details class="song-guide-more">
            <summary>{t('songGuide.more')}</summary>
            <fieldset class="song-guide-map">
              <legend class="sr-visually-hidden">{t('songGuide.map')}</legend>
              <For each={view().guide.sections}>
                {(section) => (
                  <button
                    type="button"
                    class="song-guide-seg"
                    classList={{ 'song-guide-seg--on': snap().section?.id === section.id }}
                    style={{
                      'flex-grow': String(section.endBar - section.startBar + 1),
                      background: section.color,
                    }}
                    data-tip={`${section.name} · ${section.startBar}–${section.endBar}`}
                    aria-label={t('songGuide.sectionJump', {
                      name: section.name,
                      start: section.startBar,
                      end: section.endBar,
                    })}
                    onClick={() => props.onJump(section.startBar, section.endBar)}
                  />
                )}
              </For>
              <span
                class="song-guide-playhead"
                style={{ left: `${((snap().bar - 0.5) / view().guide.barCount) * 100}%` }}
              />
            </fieldset>
            <Show when={view().looping}>
              {(label) => (
                <button
                  type="button"
                  class="song-guide-looping"
                  onClick={() => props.onClearLoop()}
                >
                  {label()}
                </button>
              )}
            </Show>

            <section class="song-guide-learn">
              <h3>{t('songGuide.learn')}</h3>
              <ol>
                <For each={view().guide.steps}>
                  {(step) => (
                    <li classList={{ 'song-guide-learn--on': snap().step?.id === step.id }}>
                      <div class="song-guide-learn-title">
                        <span>
                          {step.order}. {step.title}
                        </span>
                      </div>
                      <p>{step.detail}</p>
                      <div class="song-guide-ranges">
                        <For each={step.ranges}>
                          {(range) => (
                            <button
                              type="button"
                              onClick={() => props.onJump(range.startBar, range.endBar)}
                            >
                              {range.label ?? `${range.startBar}–${range.endBar}`}
                            </button>
                          )}
                        </For>
                      </div>
                    </li>
                  )}
                </For>
              </ol>
              <div class="song-guide-tempo">
                <span>{t('songGuide.tempo')}</span>
                <div>
                  <For each={GUIDE_TEMPOS}>
                    {(tempo) => (
                      <button
                        type="button"
                        classList={{ 'song-guide-tempo--on': view().tempo === tempo }}
                        data-tempo={tempo}
                        onClick={() => props.onTempo(tempo)}
                      >
                        {tempo}
                      </button>
                    )}
                  </For>
                </div>
              </div>
              <div class="song-guide-clean">
                <button type="button" onClick={() => props.onClean()} disabled={!snap().step}>
                  {t('songGuide.clean')}
                </button>
                <span>{t('songGuide.cleans', { n: view().cleans, goal: CLEAN_GOAL })}</span>
              </div>
              <Show when={view().cleans >= CLEAN_GOAL && view().tempo < 120}>
                <p class="song-guide-ready">{t('songGuide.ready')}</p>
              </Show>
              <details class="song-guide-tips">
                <summary>{t('songGuide.tips')}</summary>
                <ul>
                  <For each={view().guide.tips}>{(tip) => <li>{tip}</li>}</For>
                </ul>
              </details>
            </section>
          </details>
        </div>
      </Show>
    </aside>
  )
}

function fingerText(marks: readonly FingerMark[]): string {
  const side = (hand: 'left' | 'right', label: string) => {
    const bits = marks
      .filter((m) => m.hand === hand)
      .map((m) => `${pitchToNoteName(m.sourcePitch)} ${m.finger}`)
    return bits.length ? `${label} ${bits.join(' · ')}` : ''
  }
  return [side('right', t('songGuide.rh')), side('left', t('songGuide.lh'))]
    .filter(Boolean)
    .join('  ')
}

function SongGuideRoot(props: {
  view: () => GuideView | null
  onToggle: () => void
  onJump: (startBar: number, endBar: number) => void
  onClearLoop: () => void
  onTempo: (tempo: number) => void
  onClean: () => void
}) {
  return (
    <Show when={props.view()}>
      <SongGuidePanel
        view={() => props.view() as GuideView}
        onToggle={props.onToggle}
        onJump={props.onJump}
        onClearLoop={props.onClearLoop}
        onTempo={props.onTempo}
        onClean={props.onClean}
      />
    </Show>
  )
}

export class SongGuideController {
  private disposeRoot: (() => void) | null = null
  private host: HTMLDivElement
  private badges: HTMLDivElement
  private unsubs: Array<() => void> = []
  private guide: SongGuide | null = null
  private saved: SavedGuide = freshSaved()
  private loop: { start: number; end: number; label: string } | null = null
  private speedApplied = false
  private fingerKey = ''
  private fingerBucket = Number.NaN
  private fingerMarks: FingerMark[] = []
  private cachedNotesFor: unknown = null
  private cachedNotes: { pitch: number; time: number; duration: number }[] = []
  private viewKey = ''
  private ticking = false
  private readonly setView: (view: GuideView | null) => void

  constructor(
    mount: HTMLElement,
    private readonly store: AppStore,
    private readonly clock: MasterClock,
    private readonly synth: { setSpeed(speed: number): void },
    private readonly keyBox: (pitch: number) => { x: number; y: number; width: number } | null,
  ) {
    this.host = document.createElement('div')
    this.host.className = 'song-guide-mount'
    mount.appendChild(this.host)
    this.badges = document.createElement('div')
    this.badges.className = 'song-guide-badges'
    mount.appendChild(this.badges)

    const [view, setView] = createSignal<GuideView | null>(null)
    this.setView = setView
    this.disposeRoot = render(
      () => (
        <SongGuideRoot
          view={view}
          onToggle={() => this.toggle()}
          onJump={(start, end) => {
            const guide = this.guide
            if (guide) this.armLoop(guide, start, end)
          }}
          onClearLoop={() => this.clearLoop()}
          onTempo={(tempo) => this.setTempo(tempo)}
          onClean={() => this.markClean(view()?.snap.step?.id ?? '')}
        />
      ),
      this.host,
    )

    this.unsubs.push(
      watch(
        () =>
          [this.store.state.mode, this.store.state.sourceMidi, this.store.state.transpose] as const,
        () => this.syncSong(),
      ),
      this.clock.subscribe(() => this.onTick()),
      subscribeKeyboardRange(() => {
        this.fingerBucket = Number.NaN
        this.onTick()
      }),
      subscribeHandPractice(() => {
        this.fingerBucket = Number.NaN
        this.onTick()
      }),
      subscribePaint(() => {
        this.fingerKey = ''
        this.renderBadges()
      }),
    )
    window.addEventListener(CLOSE_MODE_POPOVERS, this.onClosePopovers)
    this.syncSong()
  }

  private onClosePopovers = (): void => {
    if (!this.guide || !this.saved.open) return
    this.saved = { ...this.saved, open: false }
    saveGuide(this.guide.id, this.saved)
    this.restoreSpeed()
    this.viewKey = ''
    this.publish()
  }

  private visible(): boolean {
    // The guide belongs to the piece in Play. Live and Learn have their own
    // chrome, so a guide left open in Play must not ride along.
    return this.store.state.mode === 'play'
  }

  private syncSong(): void {
    const next = guideForMidi(this.store.state.sourceMidi)
    if (next?.id !== this.guide?.id) {
      this.clearLoop()
      this.restoreSpeed()
      this.guide = next
      this.saved = next ? loadSaved(next.id) : freshSaved()
      this.viewKey = ''
      this.fingerBucket = Number.NaN
      if (next && this.saved.open && this.saved.tempo !== DEFAULT_TEMPO) {
        this.applyTempo(this.saved.tempo)
      }
    }
    this.renderBadges()
    this.publish()
  }

  private onTick(): void {
    if (this.ticking) return
    this.ticking = true
    try {
      const guide = this.guide
      if (
        guide &&
        this.loop &&
        loopShouldWrap(this.clock.currentTime, this.loop, this.clock.playing)
      ) {
        this.clock.seek(this.loop.start)
      }
      this.renderBadges()
      this.publish()
    } finally {
      this.ticking = false
    }
  }

  private publish(): void {
    const guide = this.guide
    if (!guide || !this.visible()) {
      if (this.viewKey !== '') {
        this.viewKey = ''
        this.setView(null)
      }
      return
    }
    const bar = Math.min(barAt(this.clock.currentTime, guide.secondsPerBar), guide.barCount)
    const snap = snapshot(guide, bar)
    const stepId = snap.step?.id ?? ''
    const fingers = this.saved.open ? fingerText(this.marksNow(guide)) : ''
    const key = [
      guide.id,
      bar,
      this.saved.open,
      this.loop?.label ?? '',
      this.saved.tempo,
      this.saved.cleans[`${stepId}:${this.saved.tempo}`] ?? 0,
      fingers,
      this.store.state.mode,
    ].join('|')
    if (key === this.viewKey) return
    this.viewKey = key
    this.setView({
      guide,
      snap,
      open: this.saved.open,
      looping: this.loop?.label ?? null,
      tempo: this.saved.tempo,
      cleans: this.saved.cleans[`${stepId}:${this.saved.tempo}`] ?? 0,
      fingerText: fingers,
      side: this.store.state.mode === 'learn',
    })
  }

  private toggle(): void {
    if (!this.guide) return
    this.saved = { ...this.saved, open: !this.saved.open }
    this.fingerBucket = Number.NaN
    saveGuide(this.guide.id, this.saved)
    if (!this.saved.open) this.restoreSpeed()
    else if (this.saved.tempo !== DEFAULT_TEMPO) this.applyTempo(this.saved.tempo)
    this.renderBadges()
    this.publish()
  }

  private armLoop(guide: SongGuide, startBar: number, endBar: number): void {
    const start = barStart(startBar, guide.secondsPerBar)
    const end = Math.min(guide.barCount * guide.secondsPerBar, endBar * guide.secondsPerBar)
    this.loop = {
      start,
      end,
      label: t('songGuide.looping', { start: startBar, end: endBar }),
    }
    this.clock.seek(start)
    if (this.store.state.mode === 'play' || this.store.state.mode === 'live') {
      this.clock.play()
      this.store.setState('status', 'playing')
    }
    this.publish()
  }

  private clearLoop(): void {
    this.loop = null
    this.publish()
  }

  private setTempo(tempo: number): void {
    if (!this.guide) return
    this.saved = { ...this.saved, tempo }
    saveGuide(this.guide.id, this.saved)
    this.applyTempo(tempo)
    this.publish()
  }

  private applyTempo(tempo: number): void {
    const speed = guideSpeed(tempo)
    if (Math.abs(this.clock.speed - speed) > 0.0001) this.clock.speed = speed
    this.synth.setSpeed(speed)
    this.speedApplied = Math.abs(speed - 1) > 0.0001
  }

  private restoreSpeed(): void {
    if (!this.speedApplied) return
    this.clock.speed = 1
    this.synth.setSpeed(1)
    this.speedApplied = false
  }

  private markClean(stepId: string): void {
    if (!this.guide || !stepId) return
    const key = `${stepId}:${this.saved.tempo}`
    const cleans = { ...this.saved.cleans, [key]: (this.saved.cleans[key] ?? 0) + 1 }
    this.saved = { ...this.saved, cleans }
    saveGuide(this.guide.id, this.saved)
    this.publish()
  }

  private marksNow(guide: SongGuide): FingerMark[] {
    if (!this.saved.open) return []
    const bucket = Math.floor(this.clock.currentTime * 8)
    if (bucket === this.fingerBucket) return this.fingerMarks
    this.fingerBucket = bucket
    const notes = this.guideNotes()
    this.fingerMarks = fingersAt(guide, notes, this.clock.currentTime, {
      transpose: this.store.state.transpose,
      range: getKeyboardRange(),
      hand: getHandPractice().hand,
    })
    return this.fingerMarks
  }

  private guideNotes(): { pitch: number; time: number; duration: number }[] {
    const midi = this.store.state.sourceMidi
    if (midi === this.cachedNotesFor) return this.cachedNotes
    this.cachedNotesFor = midi
    this.cachedNotes = midi
      ? midi.tracks.flatMap((track) =>
          track.isDrum
            ? []
            : track.notes.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration })),
        )
      : []
    return this.cachedNotes
  }

  private fingersOnNotes(): boolean {
    const scene = document.documentElement.dataset.scene
    const sceneNotes = scene === 'golden-hour' || scene === 'rainy-study'
    return sceneNotes && paintPrefs().noteFingerNumbers
  }

  private renderBadges(): void {
    const guide = this.guide
    const onNotes = this.fingersOnNotes()
    const marks = guide && this.visible() && !onNotes ? this.marksNow(guide) : []
    const key = onNotes ? 'on-notes' : marks.map((m) => `${m.drawPitch}:${m.finger}`).join('|')
    if (key === this.fingerKey) return
    this.fingerKey = key
    this.badges.replaceChildren()
    for (const mark of marks) {
      const box = this.keyBox(mark.drawPitch)
      if (!box || box.width < 8) continue
      const el = document.createElement('span')
      el.className = 'song-guide-badge'
      el.textContent = String(mark.finger)
      el.style.left = `${box.x}px`
      el.style.top = `${box.y + 8}px`
      this.badges.appendChild(el)
    }
  }

  dispose(): void {
    window.removeEventListener(CLOSE_MODE_POPOVERS, this.onClosePopovers)
    this.restoreSpeed()
    for (const off of this.unsubs) off()
    this.unsubs = []
    this.disposeRoot?.()
    this.disposeRoot = null
    this.host.remove()
    this.badges.remove()
  }
}
