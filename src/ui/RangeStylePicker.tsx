import { createSignal, For, onCleanup, Show } from 'solid-js'
import { t } from '../i18n'
import {
  type RangeStyleId,
  rangeOverlay,
  setRangeOverlay,
  subscribeRangeOverlay,
} from '../renderer/rangeOverlay'
import { Toggle } from './kit/kit'

const STYLES: readonly RangeStyleId[] = ['dim', 'outline', 'strip', 'lanes']

export function RangeStylePicker(props: { compact?: boolean }) {
  const [prefs, setPrefs] = createSignal(rangeOverlay())
  onCleanup(subscribeRangeOverlay(() => setPrefs(rangeOverlay())))

  return (
    <div class="range-style-picker" classList={{ 'range-style-picker--compact': props.compact }}>
      <div class="range-style-row" role="radiogroup" aria-label={t('customize.range')}>
        <For each={STYLES}>
          {(id) => (
            <button
              class="range-style-chip"
              classList={{ 'range-style-chip--on': prefs().style === id }}
              type="button"
              aria-pressed={prefs().style === id}
              onClick={() => setRangeOverlay({ style: id })}
            >
              {t(`customize.range.${id}`)}
            </button>
          )}
        </For>
      </div>
      <Show when={!props.compact}>
        <div class="gh-field">
          <span class="gh-label">{t('customize.range.addonStrip')}</span>
          <Toggle
            label={t('customize.range.addonStrip')}
            pressed={prefs().addonStrip}
            onChange={(next) => setRangeOverlay({ addonStrip: next })}
          />
        </div>
        <div class="gh-field">
          <span class="gh-label">{t('customize.range.addonLanes')}</span>
          <Toggle
            label={t('customize.range.addonLanes')}
            pressed={prefs().addonLanes}
            onChange={(next) => setRangeOverlay({ addonLanes: next })}
          />
        </div>
        <div class="gh-field">
          <span class="gh-label">{t('customize.range.blur')}</span>
          <Toggle
            label={t('customize.range.blur')}
            pressed={prefs().blurWhileAdjusting}
            onChange={(next) => setRangeOverlay({ blurWhileAdjusting: next })}
          />
        </div>
      </Show>
    </div>
  )
}
