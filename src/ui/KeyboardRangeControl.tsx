import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { render } from 'solid-js/web'
import {
  assumesFactoryControllerLow,
  DEFAULT_CONTROLLER_LOW,
  formatKeyboardRange,
  getKeyboardRange,
  isControllerCalibrateArmed,
  isFullPianoRange,
  jumpRangeToPitch,
  KEYBOARD_SIZE_MAX,
  KEYBOARD_SIZE_MIN,
  KEYBOARD_SIZE_PRESETS,
  moveRangeByGrab,
  pitchAtRatio,
  rangeEnd,
  resizeKeyboardRangeSnapped,
  resizeRangeFromEdge,
  setControllerCalibrateArmed,
  setKeyboardRange,
  shiftKeyboardRange,
  shiftKeyboardRangeBy,
  subscribeControllerCalibrate,
  subscribeKeyboardRange,
  withSnappedStart,
} from '../core/keyboardRange'
import { isBlackKey, MIDI_MAX, MIDI_MIN, pitchToNoteName } from '../core/midi/types'
import { t } from '../i18n'
import {
  keyboardFocusEnabled,
  setKeyboardFocusEnabled,
  subscribeKeyboardFocus,
} from '../renderer/keyboardFocus'
import {
  holdRangeAdjust,
  pulseRangeAdjust,
  rangeAdjusting,
  rangeGlassOpen,
  rangeOverlay,
  rangeSettleRemaining,
  releaseRangeAdjust,
  setRangePhase,
  subscribeRangeOverlay,
  wantsDim,
  wantsLanes,
  wantsOutline,
  wantsStrip,
} from '../renderer/rangeOverlay'
import type { AppStore } from '../store/state'
import { icons } from './icons'
import { Stepper, Toggle } from './kit/kit'
import { CLOSE_MODE_POPOVERS } from './modeChrome'

const RANGE_OPEN_KEY = 'midee.kbdRangeExpanded'

// open: the card. chip: the slim row. min: the round corner button.
type RangeDock = 'open' | 'chip' | 'min'

function loadRangeDock(): RangeDock {
  try {
    const raw = localStorage.getItem(RANGE_OPEN_KEY)
    if (raw === '1') return 'open'
    if (raw === '0') return 'chip'
    if (raw === 'min') return 'min'
  } catch {
    return 'chip'
  }
  // Once the controller is lined up, the card stays a chip until opened.
  if (getKeyboardRange().calibrated) return 'chip'
  return typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1000px)').matches
    ? 'open'
    : 'chip'
}

function saveRangeDock(dock: RangeDock): void {
  const raw = dock === 'open' ? '1' : dock === 'min' ? 'min' : '0'
  try {
    localStorage.setItem(RANGE_OPEN_KEY, raw)
  } catch {
    // Persistence is best-effort.
  }
}

// Floating control for the physical keyboard's reach. Shift by a semitone or
// an octave to match a controller's octave buttons, or open the panel to set
// the lowest key and how many keys it has. The choice is persisted by
// `keyboardRange` and read by the roll and by wait mode.

function canShift(start: number, size: number, semitones: number): boolean {
  return shiftKeyboardRange({ start, size }, semitones).start !== start
}

const PIANO_PITCHES = Array.from({ length: KEYBOARD_SIZE_MAX }, (_, i) => MIDI_MIN + i)

type RangeDrag = { mode: 'move' | 'start' | 'end'; grab: number; pointerId: number }

function windowStyle(start: number, size: number): { left: string; width: string } {
  return {
    left: `${((start - MIDI_MIN) / KEYBOARD_SIZE_MAX) * 100}%`,
    width: `${(size / KEYBOARD_SIZE_MAX) * 100}%`,
  }
}

function applySnappedSize(size: number): void {
  const next = resizeKeyboardRangeSnapped(getKeyboardRange(), size)
  setKeyboardRange({ start: next.start, size: next.size })
  pulseRangeAdjust()
}

function openRangeAppearance(): void {
  window.dispatchEvent(
    new CustomEvent('midee-open-appearance', { detail: { section: 'range-style' } }),
  )
}

function sceneNow(): boolean {
  return /(^|\s)scene-/.test(document.documentElement.className)
}

function KeyboardRangeView(props: { store: AppStore }) {
  const [dock, setDockState] = createSignal<RangeDock>(loadRangeDock())
  const open = () => dock() === 'open'
  const setDock = (next: RangeDock): void => {
    setDockState(next)
    saveRangeDock(next)
  }
  const [scene, setScene] = createSignal(sceneNow())
  const [focus, setFocus] = createSignal(keyboardFocusEnabled())
  const [armed, setArmed] = createSignal(isControllerCalibrateArmed())
  const [prefs, setPrefs] = createSignal(getKeyboardRange())
  const [overlay, setOverlay] = createSignal(rangeOverlay())
  let root!: HTMLDivElement
  let pickerEl!: HTMLDivElement
  let drag: RangeDrag | null = null

  onMount(() => {
    const off = subscribeKeyboardRange(setPrefs)
    const offArm = subscribeControllerCalibrate(setArmed)
    const offFocus = subscribeKeyboardFocus(setFocus)
    const offOverlay = subscribeRangeOverlay(() => setOverlay(rangeOverlay()))
    const onDoc = (e: PointerEvent): void => {
      if (!open()) return
      // The pinned card stays where the player left it, like the song guide.
      if (sceneNow() && window.matchMedia('(min-width: 1000px)').matches) return
      const target = e.target
      if (target instanceof Node && root.contains(target)) return
      setDock('chip')
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && open()) setDock('chip')
    }
    const onModeChange = (): void => {
      if (open()) setDock('chip')
    }
    // The detail panel opens upward. Keep it between the bar and the top
    // strip when the shortcuts card has already pushed the bar up.
    // A wide scene pins the card itself (top-right, panel below). Toggling
    // the beside layout from that spot flips the card between the two
    // corners every frame, so the bar never settles. Narrow scenes keep
    // the lower-left column, where beside is what keeps the panel on screen.
    const scenePinned = (): boolean =>
      sceneNow() && window.matchMedia('(min-width: 1000px)').matches
    const fitPanel = (): void => {
      setScene(scenePinned())
      const bar = root.querySelector('.kbd-range-bar')
      if (!bar) return
      if (scenePinned()) {
        root.classList.remove('kbd-range--beside')
        return
      }
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
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] })
    window.addEventListener('resize', fitPanel)
    document.addEventListener('pointerdown', onDoc, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener(CLOSE_MODE_POPOVERS, onModeChange)
    onCleanup(() => {
      off()
      offArm()
      offFocus()
      offOverlay()
      ro?.disconnect()
      mo.disconnect()
      window.removeEventListener('resize', fitPanel)
      document.removeEventListener('pointerdown', onDoc, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener(CLOSE_MODE_POPOVERS, onModeChange)
      endDrag()
    })
  })

  function ratioOf(e: PointerEvent): number {
    const rect = pickerEl.getBoundingClientRect()
    if (rect.width <= 0) return 0
    return (e.clientX - rect.left) / rect.width
  }

  function applyDrag(pitch: number): void {
    if (!drag) return
    const current = getKeyboardRange()
    const raw =
      drag.mode === 'start'
        ? resizeRangeFromEdge(current, 'start', pitch)
        : drag.mode === 'end'
          ? resizeRangeFromEdge(current, 'end', pitch)
          : moveRangeByGrab(current, pitch, drag.grab)
    const next = withSnappedStart(raw)
    setKeyboardRange({ start: next.start, size: next.size })
  }

  function onPickerMove(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.pointerId) return
    applyDrag(pitchAtRatio(ratioOf(e)))
  }

  function endDrag(e?: PointerEvent): void {
    if (e && drag && e.pointerId !== drag.pointerId) return
    drag = null
    pickerEl?.classList.remove('kbd-range-picker--dragging')
    pickerEl?.removeEventListener('pointermove', onPickerMove)
    pickerEl?.removeEventListener('pointerup', endDrag)
    pickerEl?.removeEventListener('pointercancel', endDrag)
  }

  function onPickerDown(e: PointerEvent): void {
    if (!pickerEl || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.preventDefault()
    pickerEl.querySelector<HTMLElement>('.kbd-range-window')?.focus({ preventScroll: true })
    const pitch = pitchAtRatio(ratioOf(e))
    const target = e.target
    const current = getKeyboardRange()
    let mode: RangeDrag['mode'] = 'move'
    let grab = pitch - current.start
    if (target instanceof Element && target.closest('.kbd-range-handle--start')) {
      mode = 'start'
    } else if (target instanceof Element && target.closest('.kbd-range-handle--end')) {
      mode = 'end'
    } else if (!(target instanceof Element && target.closest('.kbd-range-window'))) {
      const jumped = withSnappedStart(jumpRangeToPitch(current, pitch))
      setKeyboardRange({ start: jumped.start, size: jumped.size })
      grab = pitch - jumped.start
    }
    drag = { mode, grab, pointerId: e.pointerId }
    pickerEl.classList.add('kbd-range-picker--dragging')
    try {
      pickerEl.setPointerCapture(e.pointerId)
    } catch {
      // jsdom has no pointer capture; the listeners on the picker still see the drag.
    }
    pickerEl.addEventListener('pointermove', onPickerMove)
    pickerEl.addEventListener('pointerup', endDrag)
    pickerEl.addEventListener('pointercancel', endDrag)
  }

  function onWindowKey(e: KeyboardEvent): void {
    const size = range().size
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const step = e.shiftKey ? 12 : 1
      shiftKeyboardRangeBy(e.key === 'ArrowLeft' ? -step : step)
    } else if (e.key === 'Home') {
      setKeyboardRange({ start: MIDI_MIN, size })
    } else if (e.key === 'End') {
      setKeyboardRange({ start: MIDI_MAX - size + 1, size })
    } else {
      return
    }
    e.preventDefault()
    pulseRangeAdjust()
  }

  function onPanelPointerDown(): void {
    holdRangeAdjust()
    const up = () => {
      releaseRangeAdjust()
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  createEffect(() => {
    if (!armed()) return
    holdRangeAdjust()
    onCleanup(() => releaseRangeAdjust())
  })

  const range = () => prefs()
  const lowName = () => pitchToNoteName(range().start)
  const highName = () => pitchToNoteName(rangeEnd(range()))
  const calibrated = () => range().calibrated && range().controllerLow != null
  const calibrationLabel = () => {
    const low = range().controllerLow
    if (calibrated() && low != null) {
      return t('kbdRange.controllerLow', { note: pitchToNoteName(low) })
    }
    if (assumesFactoryControllerLow(range())) {
      return t('kbdRange.controllerUnset', {
        note: pitchToNoteName(DEFAULT_CONTROLLER_LOW),
      })
    }
    return t('kbdRange.controllerUnsetGeneric')
  }
  const badgeText = () => {
    const low = range().controllerLow
    if (range().calibrated && low != null) {
      return t('kbdRange.calibratedBadge', { note: pitchToNoteName(low) })
    }
    return t('kbdRange.notCalibrated')
  }

  return (
    <div
      id="kbd-range"
      ref={root}
      classList={{
        'kbd-range--hidden': props.store.state.mode === 'home',
        'kbd-range--open': open(),
        'kbd-range--min': dock() === 'min',
      }}
    >
      <button
        class="kbd-range-dock"
        id="kbd-range-dock"
        type="button"
        aria-label={t('kbdRange.restore')}
        aria-hidden={dock() === 'min' ? 'false' : 'true'}
        tabIndex={dock() === 'min' ? 0 : -1}
        data-tip={t('kbdRange.aria', {
          low: lowName(),
          high: highName(),
          count: range().size,
        })}
        onClick={() => setDock('chip')}
        innerHTML={icons.midi(16)}
      />
      <fieldset class="kbd-range-bar" aria-label={t('kbdRange.title')} inert={dock() === 'min'}>
        <button
          class="kbd-range-step"
          id="kbd-range-oct-down"
          type="button"
          aria-label={t('kbdRange.octaveDown')}
          data-tip={t('kbdRange.octaveDown')}
          disabled={!canShift(range().start, range().size, -12)}
          onClick={() => {
            shiftKeyboardRangeBy(-12)
            pulseRangeAdjust()
          }}
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
          onClick={() => {
            shiftKeyboardRangeBy(-1)
            pulseRangeAdjust()
          }}
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
          onClick={() => setDock(open() ? 'chip' : 'open')}
        >
          <span class="kbd-range-mark" aria-hidden="true" innerHTML={icons.midi(15)} />
          <span class="kbd-range-copy">
            <span class="kbd-range-kicker">
              <span>{t('kbdRange.title')}</span>
            </span>
            <span class="kbd-range-summary">
              <span class="kbd-range-notes">{formatKeyboardRange(range())}</span>
              <span class="kbd-range-count">
                {`· ${t('kbdRange.keyCount', { count: range().size })}`}
              </span>
            </span>
            <Show when={!isFullPianoRange(range())}>
              <span
                class="kbd-range-cal-badge"
                classList={{ 'is-set': calibrated() }}
                id="kbd-range-cal-badge"
                role="status"
                aria-label={calibrationLabel()}
                data-tip={badgeText()}
              >
                <span class="kbd-range-cal-text">{badgeText()}</span>
              </span>
            </Show>
          </span>
        </button>
        <div class="kbd-range-tools">
          <button
            class="kbd-range-minimise"
            id="kbd-range-minimise"
            type="button"
            aria-label={t('kbdRange.minimise')}
            data-tip={t('kbdRange.minimise')}
            onClick={() => setDock('min')}
          >
            <span aria-hidden="true">−</span>
          </button>
          <button
            class="kbd-range-collapse"
            id="kbd-range-collapse"
            type="button"
            aria-expanded={open()}
            aria-label={open() ? t('kbdRange.collapse') : t('kbdRange.minimise')}
            data-tip={open() ? t('kbdRange.collapse') : t('kbdRange.minimise')}
            onClick={() => setDock(open() ? 'chip' : 'min')}
          >
            <span class="kbd-range-chevron" aria-hidden="true" innerHTML={icons.chevronDown()} />
          </button>
        </div>
        <button
          class="kbd-range-step"
          id="kbd-range-up"
          type="button"
          aria-label={t('kbdRange.semitoneUp')}
          data-tip={t('kbdRange.semitoneUp')}
          disabled={!canShift(range().start, range().size, 1)}
          onClick={() => {
            shiftKeyboardRangeBy(1)
            pulseRangeAdjust()
          }}
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
          onClick={() => {
            shiftKeyboardRangeBy(12)
            pulseRangeAdjust()
          }}
        >
          +8va
        </button>
        <Show when={!isFullPianoRange(range()) && !range().calibrated}>
          <button
            class="kbd-range-step kbd-range-calibrate-bar"
            id="kbd-range-calibrate-bar"
            type="button"
            aria-pressed={armed()}
            data-tip={t('kbdRange.calibrateTip')}
            onClick={() => setControllerCalibrateArmed(true)}
          >
            {armed() ? t('kbdRange.calibrateArmedShort') : t('kbdRange.calibrateShort')}
          </button>
        </Show>
      </fieldset>

      <div
        id="kbd-range-panel"
        class="kbd-range-panel"
        role="dialog"
        aria-label={t('kbdRange.title')}
        onPointerDown={onPanelPointerDown}
      >
        <div class="kbd-range-scroll">
          <div class="kbd-range-face">
            <div class="kbd-range-ends">
              <div>
                <span class="gh-caption">{t('kbdRange.start')}</span>
                <Stepper
                  value={lowName()}
                  decLabel={t('kbdRange.semitoneDown')}
                  incLabel={t('kbdRange.semitoneUp')}
                  decDisabled={!canShift(range().start, range().size, -1)}
                  incDisabled={!canShift(range().start, range().size, 1)}
                  onDec={() => {
                    shiftKeyboardRangeBy(-1)
                    pulseRangeAdjust()
                  }}
                  onInc={() => {
                    shiftKeyboardRangeBy(1)
                    pulseRangeAdjust()
                  }}
                />
              </div>
              <span class="kbd-range-rail" aria-hidden="true" />
              <div>
                <span class="gh-caption">{t('kbdRange.end')}</span>
                <Stepper
                  value={highName()}
                  decLabel={t('kbdRange.highDown')}
                  incLabel={t('kbdRange.highUp')}
                  decDisabled={range().size <= KEYBOARD_SIZE_MIN}
                  incDisabled={range().size >= KEYBOARD_SIZE_MAX}
                  onDec={() => {
                    const next = resizeRangeFromEdge(range(), 'end', rangeEnd(range()) - 1)
                    setKeyboardRange({ start: next.start, size: next.size })
                    pulseRangeAdjust()
                  }}
                  onInc={() => {
                    const next = resizeRangeFromEdge(range(), 'end', rangeEnd(range()) + 1)
                    setKeyboardRange({ start: next.start, size: next.size })
                    pulseRangeAdjust()
                  }}
                />
              </div>
            </div>
            <div class="kbd-range-picker-wrap">
              <p class="kbd-range-picker-label" id="kbd-range-picker-label">
                {t('kbdRange.picker')}
              </p>
              <div class="kbd-range-picker" ref={pickerEl} onPointerDown={onPickerDown}>
                <For each={PIANO_PITCHES}>
                  {(pitch) => (
                    <span
                      class="kbd-range-key"
                      classList={{ 'kbd-range-key--black': isBlackKey(pitch) }}
                      style={{ left: `${((pitch - MIDI_MIN) / KEYBOARD_SIZE_MAX) * 100}%` }}
                      aria-hidden="true"
                    />
                  )}
                </For>
                <div
                  class="kbd-range-window"
                  role="slider"
                  tabIndex={0}
                  aria-labelledby="kbd-range-picker-label"
                  aria-orientation="horizontal"
                  aria-valuemin={MIDI_MIN}
                  aria-valuemax={MIDI_MAX - range().size + 1}
                  aria-valuenow={range().start}
                  aria-valuetext={formatKeyboardRange(range())}
                  style={windowStyle(range().start, range().size)}
                  onKeyDown={onWindowKey}
                >
                  <span class="kbd-range-handle kbd-range-handle--start" />
                  <span class="kbd-range-handle kbd-range-handle--end" />
                </div>
              </div>
            </div>
            <div class="gh-field kbd-range-fit-row">
              <span class="gh-label">{t('kbdRange.fit')}</span>
              <span class="kbd-range-fit-actions">
                <Toggle
                  id="kbd-range-fit"
                  label={t('kbdRange.fit')}
                  pressed={range().fitToRange}
                  onChange={(next) => {
                    setKeyboardRange({ fitToRange: next })
                    pulseRangeAdjust()
                  }}
                />
              </span>
            </div>
            <button type="button" class="kbd-range-style-row" onClick={openRangeAppearance}>
              <span class="kbd-range-style-copy">
                <span class="kbd-range-style-name">{t('customize.range')}</span>
                <span class="kbd-range-style-sub">
                  {t('customize.range.summary', {
                    style: t(`customize.range.${overlay().style}`),
                    blur: overlay().blurWhileAdjusting
                      ? t('customize.range.blurOn')
                      : t('customize.range.blurOff'),
                  })}
                </span>
              </span>
              <span
                class="kbd-range-style-chevron"
                aria-hidden="true"
                innerHTML={icons.chevronDown()}
              />
            </button>
          </div>

          <div class="kbd-range-sections">
            <section class="kbd-range-section">
              <h3 class="kbd-range-section-label">{t('kbdRange.calibrateSection')}</h3>
              <p class="kbd-range-hint">{t('kbdRange.calibrateHelp')}</p>
              <button
                type="button"
                id="kbd-range-calibrate"
                class="kbd-range-calibrate"
                aria-pressed={armed()}
                data-tip={t('kbdRange.calibrateTip')}
                onClick={() => setControllerCalibrateArmed(!armed())}
              >
                {armed() ? t('kbdRange.calibrateArmed') : t('kbdRange.calibrate')}
              </button>
              <p
                class="kbd-range-cal-status"
                classList={{ 'is-unset': !calibrated() }}
                id="kbd-range-cal-status"
              >
                {calibrationLabel()}
              </p>
            </section>

            <section class="kbd-range-section">
              <div class="kbd-range-section-head">
                <h3 class="kbd-range-section-label">{t('kbdRange.size')}</h3>
                <span class="kbd-range-stepper">
                  <button
                    type="button"
                    disabled={range().size <= KEYBOARD_SIZE_MIN}
                    onClick={() => applySnappedSize(range().size - 1)}
                  >
                    −
                  </button>
                  <span class="kbd-range-value">{range().size}</span>
                  <button
                    type="button"
                    disabled={range().size >= KEYBOARD_SIZE_MAX}
                    onClick={() => applySnappedSize(range().size + 1)}
                  >
                    +
                  </button>
                </span>
                <button
                  type="button"
                  id="kbd-view-all"
                  class="kbd-range-view"
                  aria-pressed={!focus()}
                  onClick={() => setKeyboardFocusEnabled(!focus())}
                >
                  {focus() ? t('kbdRange.allKeys') : t('kbdRange.focusKeys')}
                </button>
              </div>
              <fieldset class="kbd-range-presets" aria-label={t('kbdRange.presets')}>
                <For each={KEYBOARD_SIZE_PRESETS}>
                  {(size) => (
                    <button
                      type="button"
                      class="kbd-range-preset"
                      aria-pressed={range().size === size}
                      onClick={() => applySnappedSize(size)}
                    >
                      {size}
                    </button>
                  )}
                </For>
              </fieldset>
            </section>

            <section class="kbd-range-section">
              <h3 class="kbd-range-section-label">{t('kbdRange.outside')}</h3>
              <p class="kbd-range-hint">{t('kbdRange.outsideHelp')}</p>
              <div class="kbd-range-segment">
                <button
                  type="button"
                  class="kbd-range-follow"
                  id="kbd-range-follow"
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
            </section>
          </div>
        </div>
      </div>
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

export interface KeyBandRect {
  left: number
  top: number
  width: number
  height: number
}

export interface KeyboardRangeBandLayout {
  rect: (start: number, end: number) => KeyBandRect | null
  pitchAt: (clientX: number) => number
}

function KeyboardRangeBandView(props: { store: AppStore; layout: KeyboardRangeBandLayout }) {
  const [prefs, setPrefs] = createSignal(getKeyboardRange())
  const [overlay, setOverlay] = createSignal(rangeOverlay())
  const [box, setBox] = createSignal<KeyBandRect | null>(null)
  const [dragging, setDragging] = createSignal(false)
  const [glass, setGlass] = createSignal(false)
  const [adjusting, setAdjusting] = createSignal(false)
  const [motion, setMotion] = createSignal<'phase' | 'style'>('phase')
  let drag: RangeDrag | null = null
  let settleTimer = 0
  let styleKey = ''
  let bandHeld = false

  function syncAdjust(): void {
    window.clearTimeout(settleTimer)
    const open = rangeGlassOpen()
    setGlass(open)
    setAdjusting(rangeAdjusting())
    const wait = rangeSettleRemaining()
    if (wait > 0) settleTimer = window.setTimeout(syncAdjust, wait + 20)
  }

  createEffect(() => {
    const nextKey = `${overlay().style}|${overlay().addonStrip}|${overlay().addonLanes}`
    if (styleKey && styleKey !== nextKey && !rangeGlassOpen()) setMotion('style')
    styleKey = nextKey
    syncAdjust()
  })

  createEffect(() => {
    if (glass()) setMotion('phase')
    setRangePhase(glass() ? 'glass' : 'play')
  })

  function measure(): void {
    const range = getKeyboardRange()
    const hidden =
      props.store.state.mode === 'home' ||
      isFullPianoRange(range) ||
      document.body.classList.contains('canvas-hidden')
    setBox(hidden ? null : props.layout.rect(range.start, rangeEnd(range)))
  }

  function applyDrag(pitch: number): void {
    if (!drag) return
    const current = getKeyboardRange()
    const raw =
      drag.mode === 'start'
        ? resizeRangeFromEdge(current, 'start', pitch)
        : drag.mode === 'end'
          ? resizeRangeFromEdge(current, 'end', pitch)
          : moveRangeByGrab(current, pitch, drag.grab)
    const next = withSnappedStart(raw)
    setKeyboardRange({ start: next.start, size: next.size })
  }

  function onMove(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.pointerId) return
    applyDrag(props.layout.pitchAt(e.clientX))
  }

  function endDrag(e?: PointerEvent): void {
    if (e && drag && e.pointerId !== drag.pointerId) return
    drag = null
    setDragging(false)
    if (bandHeld) {
      bandHeld = false
      releaseRangeAdjust()
    }
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', endDrag)
    window.removeEventListener('pointercancel', endDrag)
  }

  function onDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    if (!bandHeld) {
      bandHeld = true
      holdRangeAdjust()
    }
    const current = getKeyboardRange()
    const pitch = props.layout.pitchAt(e.clientX)
    const target = e.target
    let mode: RangeDrag['mode'] = 'move'
    if (target instanceof Element && target.closest('.kbd-range-band-edge--start')) mode = 'start'
    else if (target instanceof Element && target.closest('.kbd-range-band-edge--end')) mode = 'end'
    drag = { mode, grab: pitch - current.start, pointerId: e.pointerId }
    setDragging(true)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
  }

  function onKey(e: KeyboardEvent): void {
    const size = prefs().size
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const step = e.shiftKey ? 12 : 1
      shiftKeyboardRangeBy(e.key === 'ArrowLeft' ? -step : step)
    } else if (e.key === 'Home') {
      setKeyboardRange({ start: MIDI_MIN, size })
    } else if (e.key === 'End') {
      setKeyboardRange({ start: MIDI_MAX - size + 1, size })
    } else {
      return
    }
    e.preventDefault()
    pulseRangeAdjust()
  }

  onMount(() => {
    const off = subscribeKeyboardRange(() => {
      setPrefs(getKeyboardRange())
      measure()
    })
    const offOverlay = subscribeRangeOverlay(() => {
      setOverlay(rangeOverlay())
      syncAdjust()
    })
    // Focus changes the key widths without changing the controller window,
    // so the glass has to be measured again after the roll updates.
    const offFocus = subscribeKeyboardFocus(() => {
      measure()
      requestAnimationFrame(measure)
    })
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(document.documentElement)
    const canvas = document.getElementById('pianoroll')
    if (canvas) ro?.observe(canvas)
    const mo = new MutationObserver(measure)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] })
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    window.addEventListener('resize', measure)
    onCleanup(() => {
      off()
      offOverlay()
      offFocus()
      window.clearTimeout(settleTimer)
      ro?.disconnect()
      mo.disconnect()
      window.removeEventListener('resize', measure)
      endDrag()
    })
  })

  createEffect(() => {
    props.store.state.mode
    prefs()
    measure()
  })

  const placed = () => box()

  return (
    <div
      id="kbd-range-band"
      hidden={placed() == null}
      classList={{
        'kbd-range-band--dragging': dragging(),
        'kbd-range-band--glass': glass(),
      }}
      data-phase={glass() ? 'glass' : 'play'}
      data-motion={motion()}
      data-style={overlay().style}
      data-dim={wantsDim(overlay()) ? 'on' : 'off'}
      data-outline={wantsOutline(overlay()) ? 'on' : 'off'}
      data-strip={wantsStrip(overlay()) ? 'on' : 'off'}
      data-lanes={wantsLanes(overlay()) ? 'on' : 'off'}
      data-handles={adjusting() ? 'on' : 'off'}
      data-adjust-outline={adjusting() && !overlay().blurWhileAdjusting ? 'on' : 'off'}
      style={
        placed()
          ? {
              left: `${placed()!.left}px`,
              top: `${placed()!.top}px`,
              width: `${placed()!.width}px`,
              height: `${placed()!.height}px`,
            }
          : undefined
      }
    >
      <div class="kbd-range-band-glass" />
      <div class="kbd-range-brackets" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div class="kbd-range-outline" aria-hidden="true" />
      <div class="kbd-range-strip" aria-hidden="true">
        <i class="kbd-range-cap kbd-range-cap--start" />
        <i class="kbd-range-cap kbd-range-cap--end" />
      </div>
      <div class="kbd-range-band-tip">{formatKeyboardRange(prefs())}</div>
      <div
        class="kbd-range-band-move"
        role="slider"
        tabIndex={0}
        aria-label={t('kbdRange.band')}
        aria-orientation="horizontal"
        aria-valuemin={MIDI_MIN}
        aria-valuemax={MIDI_MAX - prefs().size + 1}
        aria-valuenow={prefs().start}
        aria-valuetext={formatKeyboardRange(prefs())}
        onPointerDown={onDown}
        onKeyDown={onKey}
      >
        <i />
        <i />
        <i />
      </div>
      <div class="kbd-range-band-edge kbd-range-band-edge--start" onPointerDown={onDown}>
        <span class="kbd-range-handle" />
      </div>
      <div class="kbd-range-band-edge kbd-range-band-edge--end" onPointerDown={onDown}>
        <span class="kbd-range-handle" />
      </div>
    </div>
  )
}

export class KeyboardRangeBand {
  private disposeRoot: (() => void) | null = null
  private wrapper: HTMLDivElement | null = null

  constructor(container: HTMLElement, store: AppStore, layout: KeyboardRangeBandLayout) {
    // Own mount node: solid's render() dispose clears its container, and the
    // overlay holds the rest of the HUD.
    this.wrapper = document.createElement('div')
    this.wrapper.className = 'kbd-range-band-mount'
    container.appendChild(this.wrapper)
    this.disposeRoot = render(
      () => <KeyboardRangeBandView store={store} layout={layout} />,
      this.wrapper,
    )
  }

  dispose(): void {
    this.disposeRoot?.()
    this.disposeRoot = null
    this.wrapper?.remove()
    this.wrapper = null
  }
}
