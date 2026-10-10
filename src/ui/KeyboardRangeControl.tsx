import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { render } from 'solid-js/web'
import {
  formatKeyboardRange,
  getKeyboardRange,
  isFullPianoRange,
  KEYBOARD_SIZE_MAX,
  KEYBOARD_SIZE_MIN,
  KEYBOARD_SIZE_PRESETS,
  rangeEnd,
  setKeyboardRange,
  shiftKeyboardRange,
  shiftKeyboardRangeBy,
  subscribeKeyboardRange,
} from '../core/keyboardRange'
import { MIDI_MIN, pitchToNoteName } from '../core/midi/types'
import { t } from '../i18n'
import type { AppStore } from '../store/state'

// Floating control for the physical keyboard's reach. Shift by a semitone or
// an octave to match a controller's octave buttons, or open the panel to set
// the lowest key and how many keys it has. The choice is persisted by
// `keyboardRange` and read by the roll and by wait mode.

function canShift(start: number, size: number, semitones: number): boolean {
  return shiftKeyboardRange({ start, size }, semitones).start !== start
}

function KeyboardRangeView(props: { store: AppStore }) {
  const [open, setOpen] = createSignal(false)
  const [prefs, setPrefs] = createSignal(getKeyboardRange())
  let root!: HTMLDivElement

  onMount(() => {
    const off = subscribeKeyboardRange(setPrefs)
    const onDoc = (e: PointerEvent): void => {
      if (!open()) return
      const target = e.target
      if (target instanceof Node && root.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    // The detail panel opens upward. Keep it between the bar and the top
    // strip when the shortcuts card has already pushed the bar up.
    const fitPanel = (): void => {
      const bar = root.querySelector('.kbd-range-bar')
      if (!bar) return
      // Leave a gap under the top strip, plus the 8px the panel sits above the bar.
      const strip = document.getElementById('top-strip')
      const limit = strip ? Math.ceil(strip.getBoundingClientRect().bottom) + 12 : 80
      const room = Math.round(bar.getBoundingClientRect().top - limit - 8)
      root.classList.toggle('kbd-range--beside', room < 200)
      root.style.setProperty('--kbd-range-room', `${Math.max(80, room)}px`)
    }
    fitPanel()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fitPanel)
    ro?.observe(document.documentElement)
    const dock = root.closest('#lower-left')
    if (dock) ro?.observe(dock)
    const mo = new MutationObserver(fitPanel)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
    window.addEventListener('resize', fitPanel)
    document.addEventListener('pointerdown', onDoc, true)
    document.addEventListener('keydown', onKey)
    onCleanup(() => {
      off()
      ro?.disconnect()
      mo.disconnect()
      window.removeEventListener('resize', fitPanel)
      document.removeEventListener('pointerdown', onDoc, true)
      document.removeEventListener('keydown', onKey)
    })
  })

  const range = () => prefs()
  const lowName = () => pitchToNoteName(range().start)
  const highName = () => pitchToNoteName(rangeEnd(range()))

  return (
    <div
      id="kbd-range"
      ref={root}
      classList={{
        'kbd-range--hidden': props.store.state.mode === 'home',
        'kbd-range--open': open(),
      }}
    >
      <fieldset class="kbd-range-bar" aria-label={t('kbdRange.title')}>
        <button
          class="kbd-range-step"
          id="kbd-range-oct-down"
          type="button"
          aria-label={t('kbdRange.octaveDown')}
          data-tip={t('kbdRange.octaveDown')}
          disabled={!canShift(range().start, range().size, -12)}
          onClick={() => shiftKeyboardRangeBy(-12)}
        >
          −8va
        </button>
        <button
          class="kbd-range-step"
          id="kbd-range-down"
          type="button"
          aria-label={t('kbdRange.semitoneDown')}
          data-tip={t('kbdRange.semitoneDown')}
          disabled={!canShift(range().start, range().size, -1)}
          onClick={() => shiftKeyboardRangeBy(-1)}
        >
          −
        </button>
        <button
          class="kbd-range-label"
          id="kbd-range-label"
          type="button"
          aria-expanded={open()}
          aria-controls="kbd-range-panel"
          aria-label={t('kbdRange.aria', {
            low: lowName(),
            high: highName(),
            count: range().size,
          })}
          data-tip={t('kbdRange.tip')}
          data-custom={isFullPianoRange(range()) ? undefined : ''}
          onClick={() => setOpen((v) => !v)}
        >
          <span class="kbd-range-notes">{formatKeyboardRange(range())}</span>
          <span class="kbd-range-count">{range().size}</span>
        </button>
        <button
          class="kbd-range-step"
          id="kbd-range-up"
          type="button"
          aria-label={t('kbdRange.semitoneUp')}
          data-tip={t('kbdRange.semitoneUp')}
          disabled={!canShift(range().start, range().size, 1)}
          onClick={() => shiftKeyboardRangeBy(1)}
        >
          +
        </button>
        <button
          class="kbd-range-step"
          id="kbd-range-oct-up"
          type="button"
          aria-label={t('kbdRange.octaveUp')}
          data-tip={t('kbdRange.octaveUp')}
          disabled={!canShift(range().start, range().size, 12)}
          onClick={() => shiftKeyboardRangeBy(12)}
        >
          +8va
        </button>
      </fieldset>

      <Show when={open()}>
        <div
          id="kbd-range-panel"
          class="kbd-range-panel"
          role="dialog"
          aria-label={t('kbdRange.title')}
        >
          <p class="kbd-range-hint">{t('kbdRange.tip')}</p>

          <div class="kbd-range-row">
            <span class="kbd-range-row-label">{t('kbdRange.start')}</span>
            <span class="kbd-range-stepper">
              <button
                type="button"
                aria-label={t('kbdRange.semitoneDown')}
                disabled={!canShift(range().start, range().size, -1)}
                onClick={() => shiftKeyboardRangeBy(-1)}
              >
                −
              </button>
              <span class="kbd-range-value">{lowName()}</span>
              <button
                type="button"
                aria-label={t('kbdRange.semitoneUp')}
                disabled={!canShift(range().start, range().size, 1)}
                onClick={() => shiftKeyboardRangeBy(1)}
              >
                +
              </button>
            </span>
          </div>

          <div class="kbd-range-row">
            <span class="kbd-range-row-label">{t('kbdRange.size')}</span>
            <span class="kbd-range-stepper">
              <button
                type="button"
                disabled={range().size <= KEYBOARD_SIZE_MIN}
                onClick={() => setKeyboardRange({ size: range().size - 1 })}
              >
                −
              </button>
              <span class="kbd-range-value">{range().size}</span>
              <button
                type="button"
                disabled={range().size >= KEYBOARD_SIZE_MAX}
                onClick={() => setKeyboardRange({ size: range().size + 1 })}
              >
                +
              </button>
            </span>
          </div>

          <fieldset class="kbd-range-presets" aria-label={t('kbdRange.presets')}>
            <For each={KEYBOARD_SIZE_PRESETS}>
              {(size) => (
                <button
                  type="button"
                  class="kbd-range-preset"
                  aria-pressed={range().size === size}
                  onClick={() => setKeyboardRange({ size })}
                >
                  {size}
                </button>
              )}
            </For>
          </fieldset>

          <button
            type="button"
            class="kbd-range-follow"
            aria-pressed={range().followMidi}
            data-tip={t('kbdRange.followTip')}
            onClick={() => setKeyboardRange({ followMidi: !range().followMidi })}
          >
            {t('kbdRange.follow')}
          </button>

          <button
            type="button"
            class="kbd-range-full"
            disabled={isFullPianoRange(range())}
            onClick={() => setKeyboardRange({ start: MIDI_MIN, size: KEYBOARD_SIZE_MAX })}
          >
            {t('kbdRange.full')}
          </button>
        </div>
      </Show>
    </div>
  )
}

export class KeyboardRangeControl {
  private disposeRoot: (() => void) | null = null
  private wrapper: HTMLDivElement | null = null

  constructor(
    container: HTMLElement,
    private store: AppStore,
  ) {
    this.wrapper = document.createElement('div')
    this.wrapper.className = 'kbd-range-mount'
    container.appendChild(this.wrapper)
    this.disposeRoot = render(() => <KeyboardRangeView store={this.store} />, this.wrapper)
  }

  dispose(): void {
    this.disposeRoot?.()
    this.disposeRoot = null
    this.wrapper?.remove()
    this.wrapper = null
  }
}
