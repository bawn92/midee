import { createMemo, createSignal, For, onMount, Show } from 'solid-js'
import { listRecents, type RecentMidi } from '../../core/recentMidi'
import { t } from '../../i18n'
import '../../styles/learn-drop.css'
import type { ExerciseCategory, ExerciseDescriptor } from '../core/Exercise'
import type { LearnState } from '../core/LearnState'
import type { LearnProgressStore } from '../core/progress'
import { ComingSoonCardView, ExerciseCardView } from '../ui/ExerciseCard'
import { createMountHandle } from '../ui/mountComponent'
import { StreakRowView } from '../ui/StreakRow'
import { CATALOG } from './catalog'
import { SHOW_LEARN_EXERCISES } from './flags'

// Looked up by ExerciseDescriptor.category. Returns the localised label —
// callers read it inline so locale flips swap labels without remount.
export function categoryLabel(cat: ExerciseCategory): string {
  switch (cat) {
    case 'play-along':
      return t('learn.category.playAlong')
    case 'sight-reading':
      return t('learn.category.sightReading')
    case 'ear-training':
      return t('learn.category.earTraining')
    case 'theory':
      return t('learn.category.theory')
    case 'technique':
      return t('learn.category.technique')
    case 'reflection':
      return t('learn.category.reflection')
  }
}

export interface LearnHubOptions {
  progress: LearnProgressStore
  // Reads `loadedMidi` for the Play-Along hero state — Learn has its own
  // MIDI store, independent of `AppStore`, so Play's currently-loaded piece
  // never bleeds into the hub CTA.
  learnState: LearnState
  // The hub delegates launching to the controller so it doesn't import the
  // runner directly. Kept as a thin handoff.
  launchExercise: (descriptor: ExerciseDescriptor) => void
  // Opens the unified MIDI picker (file + bundled samples). Sample selection
  // routes through the picker → LearnController.loadSample, which auto-launches
  // Play-Along, so the hub doesn't need a separate sample handler anymore.
  onOpenFilePicker: () => void
  // The drop zone loads a file straight into wait-mode play-along.
  onOpenFile: (file: File, source: 'drag' | 'picker') => void
  onOpenRecent: (recentId: string) => void
}

// Catalog ordering. Play-along is the Hero up top so it's NOT repeated in
// Explore. Ear-training (intervals) leads the rest — it's the only fully
// implemented secondary exercise; sight-read/theory/etc. fall in below as
// "coming soon" cards.
const CATEGORY_ORDER: ExerciseCategory[] = [
  'ear-training',
  'sight-reading',
  'theory',
  'technique',
  'reflection',
]

const CATEGORY_ICON: Record<ExerciseCategory, string> = {
  'play-along':
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16M12 6v10M17 8v6"/></svg>',
  'sight-reading':
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.4 21.2c-1.9 0-3.4-1.3-3.4-3 0-1.5 1.1-2.6 2.6-2.6 1.3 0 2.3.9 2.3 2.1 0 1-.7 1.8-1.7 1.8"/><path d="M11.6 18.6 10 8.9C9.6 6.4 10.4 3 12.4 2.8c1.4-.1 2.2 1.3 2.2 2.9 0 2.6-1.9 4.6-4 6.2-1.9 1.5-3.6 2.8-3.6 4.9 0 2 1.6 3.6 3.9 3.6"/></svg>',
  'ear-training':
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 18a5 5 0 0 1 0-10 3 3 0 1 1 6 0v10"/><path d="M14 14h4"/></svg>',
  theory:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/></svg>',
  technique:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l5-10 3 6 3-12 5 16"/></svg>',
  reflection:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
}

const ICON_PLAY =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M4 3 L13 8 L4 13 Z"/></svg>'
const ICON_UPLOAD =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 11V3M4.5 6.5L8 3l3.5 3.5M3 12v1.5A1.5 1.5 0 0 0 4.5 15h7A1.5 1.5 0 0 0 13 13.5V12"/></svg>'

function Hero(props: LearnHubOptions) {
  const featured = CATALOG.find((d) => d.id === 'play-along')
  if (!featured) return null
  const loaded = () => props.learnState.state.loadedMidi
  // Hide the category kicker when it would just repeat the title (e.g.
  // "Play along" hero card whose category is also "Play along") — show the
  // localised "Recommended" instead.
  const kicker = (): string => {
    const label = categoryLabel(featured.category)
    return label.toLowerCase() === featured.title.toLowerCase() ? t('learn.hub.recommended') : label
  }
  // The whole card is the affordance: upload a MIDI when none is loaded,
  // otherwise start the play-along with the loaded piece.
  const activate = (): void => {
    if (loaded()) props.launchExercise(featured)
    else props.onOpenFilePicker()
  }
  const actionLabel = (): string => {
    const midi = loaded()
    return midi ? t('learn.hub.startWith', { name: midi.name }) : t('learn.hub.uploadMidi')
  }
  // The card itself is the button — all-phrasing content (spans), so it's a
  // valid, fully-clickable, keyboard-accessible <button>. The corner icon is
  // the only affordance; aria-label carries the action for screen readers.
  return (
    <button
      class="hero-card hero-card--clickable"
      type="button"
      data-category={featured.category}
      aria-label={actionLabel()}
      onClick={activate}
    >
      <span
        class="hero-card__badge"
        aria-hidden="true"
        innerHTML={CATEGORY_ICON[featured.category]}
      />
      <span class="hero-card__body">
        <span class="hero-card__kicker">{kicker()}</span>
        <span class="hero-card__title">{featured.title}</span>
        <span class="hero-card__blurb">{featured.blurb}</span>
      </span>
      <span class="hero-card__actions">
        <span
          class="hero-card__cue-icon"
          aria-hidden="true"
          innerHTML={loaded() ? ICON_PLAY : ICON_UPLOAD}
        />
      </span>
    </button>
  )
}

function Grid(props: { launchExercise: (d: ExerciseDescriptor) => void }) {
  const byCategory = createMemo(() => {
    const map = new Map<ExerciseCategory, ExerciseDescriptor[]>()
    for (const d of CATALOG) {
      const list = map.get(d.category) ?? []
      list.push(d)
      map.set(d.category, list)
    }
    return map
  })
  return (
    <For each={CATEGORY_ORDER}>
      {(cat) => {
        const list = byCategory().get(cat) ?? []
        return (
          <Show
            when={list.length > 0}
            fallback={
              <ComingSoonCardView
                category={cat}
                label={categoryLabel(cat)}
                icon={CATEGORY_ICON[cat]}
              />
            }
          >
            <For each={list}>
              {(descriptor) => (
                <ExerciseCardView
                  descriptor={descriptor}
                  icon={CATEGORY_ICON[descriptor.category]}
                  onLaunch={(d) => props.launchExercise(d)}
                />
              )}
            </For>
          </Show>
        )
      }}
    </For>
  )
}

function isMidiFile(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.mid') || lower.endsWith('.midi')
}

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
}

function LearnDrop(props: LearnHubOptions) {
  let input!: HTMLInputElement
  let depth = 0
  let rejectTimer = 0
  const [over, setOver] = createSignal(false)
  const [reject, setReject] = createSignal(false)
  const [recents, setRecents] = createSignal<RecentMidi[]>([])

  onMount(() => {
    void listRecents().then(setRecents)
  })

  const clearReject = (): void => {
    window.clearTimeout(rejectTimer)
    setReject(false)
  }

  const onDragEnter = (e: DragEvent): void => {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth += 1
    clearReject()
    setOver(true)
  }
  const onDragOver = (e: DragEvent): void => {
    if (!hasFiles(e)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }
  const onDragLeave = (e: DragEvent): void => {
    if (!hasFiles(e)) return
    depth = Math.max(0, depth - 1)
    if (depth === 0) setOver(false)
  }
  const onDrop = (e: DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    depth = 0
    setOver(false)
    const file = e.dataTransfer?.files[0]
    if (file && isMidiFile(file.name)) {
      props.onOpenFile(file, 'drag')
      return
    }
    setReject(true)
    rejectTimer = window.setTimeout(() => setReject(false), 700)
  }

  return (
    <div class="learn-drop-stage">
      <section
        class="learn-drop"
        classList={{ 'is-over': over(), 'is-reject': reject() }}
        aria-label={t('learn.drop.title')}
        data-learn-drop
        data-drag-over={over() ? 'true' : 'false'}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <p class="learn-drop__title">{t('learn.drop.title')}</p>
        <p class="learn-drop__hint">{t('learn.drop.hint')}</p>
        <button
          type="button"
          class="learn-drop__browse"
          data-learn-browse
          onClick={() => input.click()}
        >
          {t('learn.drop.browse')}
        </button>
        <input
          ref={input}
          class="learn-drop__file"
          type="file"
          accept=".mid,.midi,audio/midi,audio/mid"
          data-learn-file
          onChange={() => {
            const file = input.files?.[0]
            if (file && isMidiFile(file.name)) props.onOpenFile(file, 'picker')
            input.value = ''
          }}
        />
      </section>
      <Show when={recents().length > 0}>
        <ul class="learn-drop__recents" data-learn-recents>
          <For each={recents()}>
            {(recent) => (
              <li>
                <button
                  type="button"
                  class="learn-drop__recent"
                  data-learn-recent={recent.id}
                  onClick={() => props.onOpenRecent(recent.id)}
                >
                  {recent.displayName}
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  )
}

function LearnHubView(props: LearnHubOptions) {
  return (
    <div class="learn-hub" data-learn-exercises={SHOW_LEARN_EXERCISES ? 'on' : 'off'}>
      <div class="learn-hub__glow" aria-hidden="true" />
      <header class="learn-hub__topbar">
        <div class="learn-hub__streak">
          <StreakRowView progress={props.progress} />
        </div>
      </header>
      <div class="learn-hub__scroll">
        <Show when={SHOW_LEARN_EXERCISES} fallback={<LearnDrop {...props} />}>
          <div class="learn-hub__inner">
            <div class="learn-hub__hero">
              <Hero {...props} />
            </div>
            <div class="learn-hub__grid-label">{t('learn.hub.explore')}</div>
            <div class="learn-hub__grid">
              <Grid launchExercise={props.launchExercise} />
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}

export const createLearnHub = () => createMountHandle(LearnHubView)
