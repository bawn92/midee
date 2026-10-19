import './styles/main.css'
import './styles/tokens.css'
import './styles/scenes/golden-hour.css'
import './styles/scenes/rainy-study.css'
import './styles/kit.css'
import './styles/play.css'
import './styles/scenes/after-hours.css'
import './styles/landing.css'
import './styles/app-mark.css'
import './styles/viewTransition.css'
import './styles/particles.css'
import './styles/rangeCard.css'
import './styles/transportPill.css'
import './styles/floatingCards.css'
import '@fontsource/nunito-sans/latin-500.css'
import '@fontsource/nunito-sans/latin-600.css'
import '@fontsource/nunito-sans/latin-700.css'
import '@fontsource/nunito-sans/latin-800.css'
import '@fontsource-variable/fraunces/full.css'
import './styles/overlay.css'
import './ui/paint'
// Self-hosted fonts via @fontsource. Each CSS import emits a `@font-face`
// rule into the main stylesheet bundle and ships its woff2 file to
// `dist/assets/` as a long-cacheable hashed asset. Compared to
// fonts.googleapis.com + fonts.gstatic.com, this saves the cross-origin
// DNS+TLS chain Lighthouse measures as ~360 ms render-blocking on first
// load. The bundled `latin-` subsets cover the Latin-script locales we ship;
// `zh-CN` and `ja` fall back to system CJK fonts via CSS.
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/instrument-serif/latin-400.css'
import '@fontsource/instrument-serif/latin-400-italic.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/latin-600.css'
import { render } from 'solid-js/web'
import { AppRoot } from './AppRoot'
import { justReloadedForStaleChunk, reloadForStaleChunk } from './core/staleChunk'
import { createApp } from './createApp'
import { currentLocaleNativeName, initI18n, shouldShowLocaleHint, t } from './i18n'
import { AppCtx } from './store/AppCtx'
import { installSkipLink } from './ui/SkipLink'
import { showToast } from './ui/Toast'
import { whenIdle } from './whenIdle'

// Vite fires this when a dynamic import's chunk (or its preloaded deps) fails
// to fetch — typically a tab that outlived a deploy. See core/staleChunk.ts.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForStaleChunk(event.payload)) event.preventDefault()
})

whenIdle(() => {
  void import('@vercel/analytics').then(({ inject }) => inject())
})

// Load the right locale before constructing UI so the first paint is already
// translated — avoids an English-then-French flash. Adds ~5–15ms for the
// dynamic import on non-English; English is bundled and resolves instantly.
async function boot(): Promise<void> {
  await initI18n()
  const { ctx } = await createApp()
  installSkipLink(() => ctx.store.state.mode)
  // Solid owns a dedicated child of #ui-overlay so its render() call doesn't
  // wipe the legacy UI (Controls, DropZone, TrackPanel, modals) that the
  // wrapped App class has already mounted into #ui-overlay directly.
  // Ported tasks (T4+) progressively move those surfaces into the Solid tree.
  const overlay = document.querySelector<HTMLElement>('#ui-overlay')!
  const solidRoot = document.createElement('div')
  solidRoot.id = 'solid-root'
  overlay.appendChild(solidRoot)
  render(
    () => (
      <AppCtx.Provider value={ctx}>
        <AppRoot />
      </AppCtx.Provider>
    ),
    solidRoot,
  )
  // Subtle one-time onboarding for users whose browser language was
  // auto-detected to a non-English locale.
  if (shouldShowLocaleHint()) showLocaleHint()
  if (justReloadedForStaleChunk()) showToast(t('toast.updated'), 'toast toast--success', 2500)

  // Bench runner is a build-time opt-in. `npm run bench` sets
  // VITE_ENABLE_BENCH=1; public prod builds don't, so Vite constant-folds the
  // condition to `false` and tree-shakes both the dynamic import and the
  // branch — `bench/runner.ts` never reaches the public bundle, and
  // `?bench=...` URLs are inert in prod. Read `import.meta.env` directly (not
  // through env.ts) so the value is statically inlined for the dead-code pass.
  if (import.meta.env.VITE_ENABLE_BENCH) {
    const { maybeRunBench } = await import('./bench/runner')
    await maybeRunBench(ctx)
  }
}

function showLocaleHint(): void {
  const el = document.createElement('div')
  el.className = 'locale-hint'
  el.innerHTML = `
    <span>${t('onboarding.localeDetected', { language: currentLocaleNativeName() })}</span>
    <button class="locale-hint-close" type="button" aria-label="${escapeAttr(t('coachmark.dismiss'))}">×</button>
  `
  document.body.appendChild(el)
  requestAnimationFrame(() => el.classList.add('locale-hint--shown'))
  const dismiss = (): void => {
    el.classList.remove('locale-hint--shown')
    setTimeout(() => el.remove(), 400)
  }
  el.querySelector<HTMLButtonElement>('.locale-hint-close')?.addEventListener('click', dismiss)
  setTimeout(dismiss, 8000)
}

// Translated strings can carry quotes; encode for safe interpolation into
// an HTML attribute. Locale-hint copy is the only place we touch innerHTML
// with translated content.
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

void boot().catch((err) => {
  console.error('App failed to initialize:', err)
})
