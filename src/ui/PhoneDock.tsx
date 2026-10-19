import { createEffect, createSignal, Show } from 'solid-js'
import { render } from 'solid-js/web'
import { practicePick } from '../deadmau5/session'
import { t } from '../i18n'

// Phone play view (P2): Guide and Range share one bottom sheet. The dock is
// hidden above the phone breakpoint; the attribute only changes layout there.
export function mountPhoneDock(host: HTMLElement): () => void {
  const el = document.createElement('div')
  host.appendChild(el)
  const dispose = render(() => <PhoneDock />, el)
  return () => {
    dispose()
    el.remove()
    delete document.documentElement.dataset.phoneSheet
  }
}

function PhoneDock() {
  const [sheet, setSheet] = createSignal<'guide' | 'range'>(
    practicePick()?.active ? 'guide' : 'range',
  )
  createEffect(() => {
    const active = Boolean(practicePick()?.active)
    if (!active && sheet() === 'guide') setSheet('range')
    document.documentElement.dataset.phoneSheet = active ? sheet() : 'range'
  })
  return (
    <div
      class="gh-phone-dock"
      role="tablist"
      aria-label={practicePick()?.active ? t('songGuide.title') : t('kbdRange.title')}
    >
      <Show when={practicePick()?.active}>
        <button
          type="button"
          class="gh-phone-dock__tab"
          role="tab"
          aria-selected={sheet() === 'guide'}
          onClick={() => setSheet('guide')}
        >
          {t('songGuide.title')}
        </button>
      </Show>
      <button
        type="button"
        class="gh-phone-dock__tab"
        role="tab"
        aria-selected={sheet() === 'range'}
        onClick={() => setSheet('range')}
      >
        {t('kbdRange.title')}
      </button>
    </div>
  )
}
