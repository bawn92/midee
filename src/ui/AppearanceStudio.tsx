import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { t } from '../i18n'
import {
  KEYBOARD_STYLES,
  type KeyboardStyleId,
  keyboardPalette,
  keyboardStyleId,
  keyboardStyleName,
  setKeyboardStyle,
  subscribeKeyboardStyle,
} from '../renderer/keyboardStyle'
import {
  PLANT_SHADOWS,
  type PlantShadowId,
  plantShadowId,
  setPlantShadow,
  subscribePlantShadow,
} from '../renderer/plantShadows'
import { Segmented, Slider, Toggle } from './kit/kit'
import { paintPrefs, setPaintPrefs, subscribePaint } from './paint'
import { RangeStylePicker } from './RangeStylePicker'

function cssHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

function KeyboardStylePicker() {
  const [id, setId] = createSignal<KeyboardStyleId>(keyboardStyleId())
  const [scene, setScene] = createSignal(document.documentElement.dataset.scene ?? 'golden-hour')
  onCleanup(subscribeKeyboardStyle(setId))
  onMount(() => {
    const mo = new MutationObserver(() => {
      setScene(document.documentElement.dataset.scene ?? 'golden-hour')
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-scene'] })
    onCleanup(() => mo.disconnect())
  })

  return (
    <div class="kbd-style-grid" role="radiogroup" aria-label={t('customize.style')}>
      <For each={KEYBOARD_STYLES}>
        {(style) => {
          const pal = () => keyboardPalette(scene(), style)
          return (
            <button
              class="kbd-style-card"
              classList={{ 'kbd-style-card--on': id() === style }}
              type="button"
              aria-pressed={id() === style}
              aria-label={keyboardStyleName(style)}
              onClick={() => setKeyboardStyle(style)}
            >
              <span
                class="kbd-style-swatch"
                aria-hidden="true"
                style={{ background: cssHex(pal().caseDark) }}
              >
                <i style={{ background: cssHex(pal().ivory) }} />
                <i style={{ background: cssHex(pal().ebony) }} />
                <i style={{ background: cssHex(pal().ivory) }} />
                <i style={{ background: cssHex(pal().ivory) }} />
              </span>
              <span class="kbd-style-name">{t(`customize.style.${style}`)}</span>
            </button>
          )
        }}
      </For>
    </div>
  )
}

function PlantShadowPicker() {
  const [id, setId] = createSignal<PlantShadowId>(plantShadowId())
  const [scene, setScene] = createSignal(document.documentElement.dataset.scene ?? 'golden-hour')
  onCleanup(subscribePlantShadow(setId))
  onMount(() => {
    const mo = new MutationObserver(() => {
      setScene(document.documentElement.dataset.scene ?? 'golden-hour')
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-scene'] })
    onCleanup(() => mo.disconnect())
  })
  const available = () => scene() === 'golden-hour'

  return (
    <div
      class="plant-shadow-picker"
      id="plant-shadows"
      data-available={available() ? 'true' : 'false'}
    >
      <p class="gh-overline">{t('customize.plants')}</p>
      <div
        class="plant-shadow-grid"
        role="radiogroup"
        aria-label={t('customize.plants')}
        aria-disabled={!available()}
      >
        <For each={PLANT_SHADOWS}>
          {(plant) => (
            <button
              class="plant-shadow-chip"
              classList={{ 'plant-shadow-chip--on': id() === plant }}
              type="button"
              aria-pressed={id() === plant}
              disabled={!available()}
              onClick={() => setPlantShadow(plant)}
            >
              {t(`customize.plants.${plant}`)}
            </button>
          )}
        </For>
      </div>
      <Show when={!available()}>
        <p class="plant-shadow-note" id="plant-shadows-note">
          {t('customize.plants.goldenOnly')}
        </p>
      </Show>
    </div>
  )
}

export function AppearanceStudio(props: {
  volume: () => number
  onVolume?: ((value: number) => void) | undefined
  rollSpeed: () => number
  onRollSpeed?: ((seconds: number) => void) | undefined
  metroOn: () => boolean
  onMetro?: (() => void) | undefined
}) {
  const [paint, setPaint] = createSignal(paintPrefs())
  const [volume, setVolume] = createSignal(props.volume())
  const [roll, setRoll] = createSignal(props.rollSpeed())
  const [metro, setMetro] = createSignal(props.metroOn())
  onCleanup(subscribePaint(() => setPaint(paintPrefs())))

  return (
    <div class="gh-studio">
      <p class="gh-overline">{t('customize.notes')}</p>
      <div class="gh-field">
        <span class="gh-label">{t('customize.colorBy')}</span>
        <Segmented
          ariaLabel={t('customize.colorBy')}
          value={paint().colorBy}
          options={[
            { id: 'hand' as const, label: t('customize.hand') },
            { id: 'finger' as const, label: t('customize.finger') },
          ]}
          onChange={(id) => setPaintPrefs({ colorBy: id })}
        />
      </div>
      <div class="gh-field">
        <span class="gh-label">{t('customize.noteStyle')}</span>
        <Segmented
          ariaLabel={t('customize.noteStyle')}
          value={paint().noteLook}
          options={[
            { id: 'soft' as const, label: t('customize.soft') },
            { id: 'flat' as const, label: t('customize.flat') },
          ]}
          onChange={(id) => setPaintPrefs({ noteLook: id })}
        />
      </div>

      <p class="gh-overline">{t('customize.style')}</p>
      <KeyboardStylePicker />

      <RangeStylePicker />

      <PlantShadowPicker />

      <p class="gh-overline">{t('customize.keyboard')}</p>
      <div class="gh-field">
        <span class="gh-label">{t('customize.keyLabels')}</span>
        <Toggle
          label={t('customize.keyLabels')}
          pressed={paint().keyLabels}
          onChange={(next) => setPaintPrefs({ keyLabels: next })}
        />
      </div>

      <p class="gh-overline">{t('customize.motion')}</p>
      <div class="gh-field">
        <span class="gh-label">{t('customize.calm')}</span>
        <Toggle
          label={t('customize.calm')}
          pressed={paint().calm}
          onChange={(next) => setPaintPrefs({ calm: next })}
        />
      </div>
      <div class="gh-field">
        <span class="gh-label">{t('customize.rollSpeed')}</span>
        <span class="gh-label">{roll().toFixed(1)}s</span>
      </div>
      <Slider
        min={0.5}
        max={2}
        step={0.1}
        value={roll()}
        label={t('customize.rollSpeed')}
        onInput={(value) => {
          setRoll(value)
          props.onRollSpeed?.(value)
        }}
      />

      <p class="gh-overline">{t('customize.sound')}</p>
      <div class="gh-field">
        <span class="gh-label">{t('customize.volume')}</span>
        <span class="gh-label">{Math.round(volume() * 100)}%</span>
      </div>
      <Slider
        min={0}
        max={1}
        step={0.02}
        value={volume()}
        label={t('customize.volume')}
        onInput={(value) => {
          setVolume(value)
          props.onVolume?.(value)
        }}
      />
      <div class="gh-field">
        <span class="gh-label">{t('customize.metronome')}</span>
        <Toggle
          label={t('customize.metronome')}
          pressed={metro()}
          onChange={() => {
            setMetro((on) => !on)
            props.onMetro?.()
          }}
        />
      </div>
    </div>
  )
}
