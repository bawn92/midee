import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { render } from 'solid-js/web'
import {
  getKeyboardRange,
  isControllerCalibrateArmed,
  PIANO_M_KEYS_PER_BOARD,
  resizeKeyboardRangeSnapped,
  setControllerCalibrateArmed,
  setKeyboardRange,
  subscribeControllerCalibrate,
  subscribeKeyboardRange,
} from '../core/keyboardRange'
import { t } from '../i18n'
import {
  dismissPianoMGuide,
  dismissPianoMSuggest,
  getPianoMGuide,
  isPianoMDetected,
  type PianoMBoards,
  rememberPianoMBoards,
  subscribePianoMDetected,
  subscribePianoMGuide,
} from '../midi/pianoM'
import { pulseRangeAdjust } from '../renderer/rangeOverlay'
import type { AppStore } from '../store/state'

const BOARD_CHOICES: readonly PianoMBoards[] = [1, 2, 3]

function applyBoards(boards: PianoMBoards): void {
  rememberPianoMBoards(boards)
  const next = resizeKeyboardRangeSnapped(getKeyboardRange(), boards * PIANO_M_KEYS_PER_BOARD)
  setKeyboardRange({ start: next.start, size: next.size })
  pulseRangeAdjust()
}

function PianoMGuideView(props: { store: AppStore }) {
  const [connected, setConnected] = createSignal(isPianoMDetected())
  const [guide, setGuide] = createSignal(getPianoMGuide())
  const [range, setRange] = createSignal(getKeyboardRange())
  const [armed, setArmed] = createSignal(isControllerCalibrateArmed())

  onMount(() => {
    const offDetect = subscribePianoMDetected(setConnected)
    const offGuide = subscribePianoMGuide(setGuide)
    const offRange = subscribeKeyboardRange(setRange)
    const offArm = subscribeControllerCalibrate(setArmed)
    onCleanup(() => {
      offDetect()
      offGuide()
      offRange()
      offArm()
    })
  })

  const playing = () => props.store.state.mode !== 'home'
  const selected = (): PianoMBoards | null => {
    const size = range().size
    if (size === 24 || size === 48 || size === 72) return (size / 24) as PianoMBoards
    return guide().boards
  }
  const showGuide = () => connected() && playing() && !guide().dismissed
  const showSuggest = () => connected() && playing() && guide().dismissed && guide().suggest

  return (
    <>
      <Show when={showGuide()}>
        <aside id="piano-m-guide" class="piano-m-guide" aria-label={t('pianoM.guide.title')}>
          <div class="piano-m-guide-card">
            <header class="piano-m-guide-head">
              <h2 class="piano-m-guide-title">{t('pianoM.guide.title')}</h2>
              <button
                type="button"
                class="piano-m-guide-dismiss"
                onClick={() => dismissPianoMGuide()}
              >
                {t('pianoM.guide.dismiss')}
              </button>
            </header>
            <fieldset class="piano-m-guide-choices" aria-label={t('pianoM.guide.title')}>
              <For each={BOARD_CHOICES}>
                {(boards) => (
                  <button
                    type="button"
                    class="piano-m-guide-choice"
                    aria-pressed={selected() === boards}
                    onClick={() => applyBoards(boards)}
                  >
                    <span class="piano-m-guide-choice-n">{boards}</span>
                    <span class="piano-m-guide-choice-keys">
                      {t('kbdRange.keyCount', { count: boards * PIANO_M_KEYS_PER_BOARD })}
                    </span>
                  </button>
                )}
              </For>
            </fieldset>
            <Show when={guide().suggest}>
              <div class="piano-m-guide-suggest" role="status">
                <p>{t('pianoM.guide.suggest')}</p>
                <div class="piano-m-guide-suggest-actions">
                  <button type="button" class="piano-m-guide-use" onClick={() => applyBoards(2)}>
                    {t('pianoM.guide.use48')}
                  </button>
                  <button
                    type="button"
                    class="piano-m-guide-later"
                    onClick={() => dismissPianoMSuggest()}
                  >
                    {t('pianoM.guide.notNow')}
                  </button>
                </div>
              </div>
            </Show>
            <p class="piano-m-guide-copy">{t('pianoM.guide.together')}</p>
            <p class="piano-m-guide-copy">{t('pianoM.guide.script')}</p>
            <a
              class="piano-m-guide-script"
              href={`${import.meta.env.BASE_URL}piano-m-theme-lights.littlefoot`}
              download="piano-m-theme-lights.littlefoot"
            >
              {t('keyLights.pianoMScript')}
            </a>
            <p class="piano-m-guide-copy">{t('pianoM.guide.cyan')}</p>
            <p class="piano-m-guide-copy">{t('pianoM.guide.power')}</p>
            <button
              type="button"
              class="piano-m-guide-cal"
              aria-pressed={armed()}
              onClick={() => setControllerCalibrateArmed(true)}
            >
              {armed() ? t('kbdRange.calibrateArmed') : t('kbdRange.calibrate')}
            </button>
          </div>
        </aside>
      </Show>
      <Show when={showSuggest()}>
        <aside
          id="piano-m-suggest"
          class="piano-m-guide piano-m-suggest"
          aria-label={t('pianoM.guide.suggest')}
        >
          <div class="piano-m-guide-card piano-m-suggest-card">
            <p>{t('pianoM.guide.suggest')}</p>
            <div class="piano-m-guide-suggest-actions">
              <button type="button" class="piano-m-guide-use" onClick={() => applyBoards(2)}>
                {t('pianoM.guide.use48')}
              </button>
              <button
                type="button"
                class="piano-m-guide-later"
                onClick={() => dismissPianoMSuggest()}
              >
                {t('pianoM.guide.notNow')}
              </button>
            </div>
          </div>
        </aside>
      </Show>
    </>
  )
}

export class PianoMGuide {
  private disposeRoot: (() => void) | null = null
  private wrapper: HTMLDivElement | null = null

  constructor(container: HTMLElement, store: AppStore) {
    this.wrapper = document.createElement('div')
    this.wrapper.className = 'piano-m-guide-mount'
    container.appendChild(this.wrapper)
    this.disposeRoot = render(() => <PianoMGuideView store={store} />, this.wrapper)
  }

  dispose(): void {
    this.disposeRoot?.()
    this.disposeRoot = null
    this.wrapper?.remove()
    this.wrapper = null
  }
}
