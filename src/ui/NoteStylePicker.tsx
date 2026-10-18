import { createSignal, For, onCleanup } from 'solid-js'
import { t } from '../i18n'
import { NOTE_SHAPES, type NoteShapeId } from '../renderer/noteShape'
import { icons } from './icons'
import { Toggle } from './kit/kit'
import { paintPrefs, setPaintPrefs, subscribePaint } from './paint'

export function NoteStylePicker() {
  const [prefs, setPrefs] = createSignal(paintPrefs())
  onCleanup(subscribePaint(() => setPrefs(paintPrefs())))

  const select = (id: NoteShapeId) => setPaintPrefs({ noteStyle: id })

  return (
    <div class="note-shape-picker" id="note-style" data-section="note-style">
      <div class="note-shape-head">
        <p class="gh-overline">{t('customize.noteShapes')}</p>
        <span class="note-shape-current">{t(`customize.noteShapes.${prefs().noteStyle}`)}</span>
      </div>
      <div class="note-shape-grid" role="radiogroup" aria-label={t('customize.noteShapes')}>
        <For each={NOTE_SHAPES}>
          {(id) => (
            <button
              class="note-shape-card"
              classList={{ 'note-shape-card--on': prefs().noteStyle === id }}
              type="button"
              aria-pressed={prefs().noteStyle === id}
              onClick={() => select(id)}
            >
              <span class="note-shape-swatch" data-shape={id} aria-hidden="true">
                <i />
                <i />
              </span>
              <span class="note-shape-name">{t(`customize.noteShapes.${id}`)}</span>
              {prefs().noteStyle === id ? (
                <span class="note-shape-check" aria-hidden="true" innerHTML={icons.check(10)} />
              ) : null}
            </button>
          )}
        </For>
      </div>
      <p class="note-shape-desc" id="note-style-desc">
        {t(`customize.noteShapes.desc.${prefs().noteStyle}`)}
      </p>
      <div class="note-shape-toggle">
        <span class="note-shape-toggle-copy">
          <span class="note-shape-toggle-name">{t('customize.noteShapes.fingers')}</span>
        </span>
        <Toggle
          label={t('customize.noteShapes.fingers')}
          pressed={prefs().noteFingerNumbers}
          onChange={(next) => setPaintPrefs({ noteFingerNumbers: next })}
        />
      </div>
      <div class="note-shape-toggle">
        <span class="note-shape-toggle-copy">
          <span class="note-shape-toggle-name">{t('customize.noteShapes.hands')}</span>
          <span class="note-shape-toggle-sub">{t('customize.noteShapes.hands.sub')}</span>
        </span>
        <Toggle
          label={t('customize.noteShapes.hands')}
          pressed={prefs().noteHandShapes}
          onChange={(next) => setPaintPrefs({ noteHandShapes: next })}
        />
      </div>
      <div class="note-shape-toggle">
        <span class="note-shape-toggle-copy">
          <span class="note-shape-toggle-name">{t('customize.noteShapes.bloom')}</span>
        </span>
        <Toggle
          label={t('customize.noteShapes.bloom')}
          pressed={prefs().noteLandingBloom}
          onChange={(next) => setPaintPrefs({ noteLandingBloom: next })}
        />
      </div>
    </div>
  )
}
