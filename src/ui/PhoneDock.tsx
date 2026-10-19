import { createEffect, createSignal } from 'solid-js'
import { render } from 'solid-js/web'
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
  const [sheet, setSheet] = createSignal<'guide' | 'range'>('guide')
  createEffect(() => {
    document.documentElement.dataset.phoneSheet = sheet()
  })
  return (
    <div class="gh-phone-dock" role="tablist" aria-label={t('songGuide.title')}>
      <button
        type="button"
        class="gh-phone-dock__tab"
        role="tab"
        aria-selected={sheet() === 'guide'}
        onClick={() => setSheet('guide')}
      >
        {t('songGuide.title')}
      </button>
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
