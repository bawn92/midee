import { createSignal, For, onCleanup, Show } from 'solid-js'
import { t } from '../i18n'
import {
  type RangeStyleId,
  rangeOverlay,
  setRangeOverlay,
  subscribeRangeOverlay,
} from '../renderer/rangeOverlay'
import { icons } from './icons'
import { Toggle } from './kit/kit'

const STYLES: readonly RangeStyleId[] = ['dim', 'outline', 'strip', 'lanes']

export function RangeStylePicker() {
  const [prefs, setPrefs] = createSignal(rangeOverlay())
  onCleanup(subscribeRangeOverlay(() => setPrefs(rangeOverlay())))

  const stripIncluded = () => prefs().style === 'strip'
  const lanesIncluded = () => prefs().style === 'lanes'

  return (
    <div class="range-style-picker" data-section="range-style">
      <div class="range-style-head">
        <p class="gh-overline">{t('customize.range')}</p>
        <span class="range-style-current">{t(`customize.range.${prefs().style}`)}</span>
      </div>
      <div class="range-style-grid" role="radiogroup" aria-label={t('customize.range')}>
        <For each={STYLES}>
          {(id) => (
            <button
              class="range-style-card"
              classList={{ 'range-style-card--on': prefs().style === id }}
              type="button"
              aria-pressed={prefs().style === id}
              onClick={() => setRangeOverlay({ style: id })}
            >
              <span class="range-style-swatch" data-style={id} aria-hidden="true">
                <span class="range-style-swatch-lane" />
                <span class="range-style-swatch-dim range-style-swatch-dim--start" />
                <span class="range-style-swatch-dim range-style-swatch-dim--end" />
                <span class="range-style-swatch-frame" />
                <span class="range-style-swatch-strip" />
              </span>
              <span class="range-style-name">{t(`customize.range.${id}`)}</span>
              <Show when={prefs().style === id}>
                <span class="range-style-check" aria-hidden="true" innerHTML={icons.check(10)} />
              </Show>
            </button>
          )}
        </For>
      </div>

      <p class="gh-overline">{t('customize.range.addons')}</p>
      <div class="range-addon" classList={{ 'range-addon--included': stripIncluded() }}>
        <span class="range-addon-copy">
          <span class="range-addon-name">{t('customize.range.addonStrip')}</span>
          <span class="range-addon-sub">
            {stripIncluded() ? t('customize.range.included') : t('customize.range.addonStrip.sub')}
          </span>
        </span>
        <Toggle
          label={t('customize.range.addonStrip')}
          pressed={prefs().addonStrip}
          disabled={stripIncluded()}
          onChange={(next) => setRangeOverlay({ addonStrip: next })}
        />
      </div>
      <div class="range-addon" classList={{ 'range-addon--included': lanesIncluded() }}>
        <span class="range-addon-copy">
          <span class="range-addon-name">{t('customize.range.addonLanes')}</span>
          <span class="range-addon-sub">
            {lanesIncluded() ? t('customize.range.included') : t('customize.range.addonLanes.sub')}
          </span>
        </span>
        <Toggle
          label={t('customize.range.addonLanes')}
          pressed={prefs().addonLanes}
          disabled={lanesIncluded()}
          onChange={(next) => setRangeOverlay({ addonLanes: next })}
        />
      </div>
      <div class="range-addon">
        <span class="range-addon-copy">
          <span class="range-addon-name">{t('customize.range.blur')}</span>
          <span class="range-addon-sub">{t('customize.range.blur.sub')}</span>
        </span>
        <Toggle
          label={t('customize.range.blur')}
          pressed={prefs().blurWhileAdjusting}
          onChange={(next) => setRangeOverlay({ blurWhileAdjusting: next })}
        />
      </div>
    </div>
  )
}
