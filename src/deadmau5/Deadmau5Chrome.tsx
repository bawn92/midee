import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import { useApp } from '../store/AppCtx'
import { t } from '../i18n'
import { parseRoute } from '../landing/route'
import '../styles/deadmau5.css'
import {
  deadmau5Actions,
  practicePasses,
  practicePhase,
  practicePick,
} from './session'
import {
  BAR_COUNT,
  barEndTime,
  barStartTime,
  formatClock,
  readDeadmau5,
  spanLabel,
  STROBE_SECTIONS,
} from './sections'

function useRouteKind(): () => ReturnType<typeof parseRoute> {
  const [rev, setRev] = createSignal(0)
  onMount(() => {
    const bump = (): void => {
      setRev((n) => n + 1)
    }
    window.addEventListener('popstate', bump)
    window.addEventListener('midee-route', bump)
    onCleanup(() => {
      window.removeEventListener('popstate', bump)
      window.removeEventListener('midee-route', bump)
    })
  })
  return () => {
    rev()
    return parseRoute(location.pathname, location.search, true)
  }
}

export function Deadmau5Chrome() {
  const { store } = useApp()
  const route = useRouteKind()
  const saved = () => readDeadmau5()

  const showPicker = (): boolean => {
    const current = route()
    return current.kind === 'deadmau5' && !current.section
  }

  const showStrip = (): boolean => {
    const mode = store.state.mode
    return Boolean(practicePick()?.active) && (mode === 'play' || mode === 'learn')
  }

  return (
    <Portal>
      <Show when={showPicker()}>
        <Picker savedIds={saved()?.ids ?? []} />
      </Show>
      <Show when={showStrip()}>
        <Strip learnMode={store.state.mode === 'learn'} />
      </Show>
    </Portal>
  )
}

function Picker(props: { savedIds: readonly string[] }) {
  const play = (id: string): void => {
    deadmau5Actions()?.playIds([id])
  }
  return (
    <main class="dm-picker" data-deadmau5-picker>
      <div class="dm-picker-inner">
        <p class="dm-kicker">{t('deadmau5.kicker')}</p>
        <h1 class="dm-title">{t('deadmau5.title')}</h1>
        <p class="dm-subtitle">{t('deadmau5.subtitle')}</p>
        <ul class="dm-sections">
          <For each={STROBE_SECTIONS}>
            {(section) => (
              <li>
                <button
                  type="button"
                  class="dm-card"
                  classList={{ 'is-saved': props.savedIds.includes(section.id) }}
                  data-deadmau5-section={section.id}
                  style={{ '--dm-color': section.color }}
                  onClick={() => play(section.id)}
                >
                  <span class="dm-swatch" />
                  <span class="dm-card-name">{section.name}</span>
                  <span class="dm-card-meta">
                    {t('deadmau5.bars', { start: section.startBar, end: section.endBar })}
                    {' · '}
                    {formatClock(barStartTime(section.startBar))}–
                    {formatClock(barEndTime(section.endBar))}
                  </span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </div>
    </main>
  )
}

function Strip(props: { learnMode: boolean }) {
  const pick = () => practicePick()
  const nudge = (edge: 'start' | 'end', delta: number): void => {
    const current = pick()
    if (!current) return
    const start = edge === 'start' ? current.startBar + delta : current.startBar
    const end = edge === 'end' ? current.endBar + delta : current.endBar
    deadmau5Actions()?.setBars(start, end)
  }
  return (
    <div class="dm-strip" data-deadmau5-strip data-deadmau5-phase={practicePhase()}>
      <div class="dm-chips">
        <For each={STROBE_SECTIONS}>
          {(section) => (
            <button
              type="button"
              class="dm-chip"
              classList={{ 'is-on': pick()?.ids.includes(section.id) ?? false }}
              data-deadmau5-chip={section.id}
              style={{ '--dm-color': section.color }}
              onClick={() => deadmau5Actions()?.toggleId(section.id)}
            >
              <i />
              {section.name}
            </button>
          )}
        </For>
      </div>
      <div class="dm-meta">
        <Show when={practicePhase() === 'count-in'}>
          <span class="dm-phase">{t('deadmau5.countIn')}</span>
        </Show>
        <span class="dm-pass" data-deadmau5-pass>
          {t('deadmau5.passes', { n: practicePasses() })}
        </span>
        <span class="dm-phase">{spanLabel(pick()?.ids ?? [])}</span>
        <span class="dm-steps">
          <span class="dm-step">
            {t('deadmau5.startBar')}
            <button
              type="button"
              aria-label={t('deadmau5.startBar')}
              data-deadmau5-bar="start-dec"
              onClick={() => nudge('start', -1)}
            >
              −
            </button>
            <b>{pick()?.startBar}</b>
            <button
              type="button"
              aria-label={t('deadmau5.startBar')}
              data-deadmau5-bar="start-inc"
              disabled={pick() ? pick()!.startBar >= pick()!.endBar - 1 : true}
              onClick={() => nudge('start', 1)}
            >
              +
            </button>
          </span>
          <span class="dm-step">
            {t('deadmau5.endBar')}
            <button
              type="button"
              aria-label={t('deadmau5.endBar')}
              data-deadmau5-bar="end-dec"
              disabled={pick() ? pick()!.endBar <= pick()!.startBar + 1 : true}
              onClick={() => nudge('end', -1)}
            >
              −
            </button>
            <b>{pick()?.endBar}</b>
            <button
              type="button"
              aria-label={t('deadmau5.endBar')}
              data-deadmau5-bar="end-inc"
              disabled={pick() ? pick()!.endBar >= BAR_COUNT : true}
              onClick={() => nudge('end', 1)}
            >
              +
            </button>
          </span>
        </span>
        <Show when={!props.learnMode}>
          <button
            type="button"
            class="dm-text-btn is-accent"
            data-deadmau5-learn
            onClick={() => deadmau5Actions()?.enterLearn()}
          >
            {t('deadmau5.learn')}
          </button>
        </Show>
        <button type="button" class="dm-text-btn" data-deadmau5-all onClick={() => deadmau5Actions()?.openPicker()}>
          {t('deadmau5.all')}
        </button>
      </div>
    </div>
  )
}
