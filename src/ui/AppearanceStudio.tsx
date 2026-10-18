import { createSignal, onCleanup } from 'solid-js'
import { t } from '../i18n'
import { Segmented, Slider, Toggle } from './kit/kit'
import { paintPrefs, setPaintPrefs, subscribePaint } from './paint'

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

      <p class="gh-overline">{t('customize.keyboard')}</p>
      <div class="gh-field">
        <span class="gh-label">{t('customize.wood')}</span>
        <Segmented
          ariaLabel={t('customize.wood')}
          value={paint().wood}
          options={[
            { id: 'walnut' as const, label: t('customize.walnut') },
            { id: 'oak' as const, label: t('customize.oak') },
            { id: 'cream' as const, label: t('customize.cream') },
          ]}
          onChange={(id) => setPaintPrefs({ wood: id })}
        />
      </div>
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
