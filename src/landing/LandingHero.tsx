import { APP_NAME } from '../brand'
import { t } from '../i18n'
import { icons } from '../ui/icons'
import { HeroArt } from './HeroArt'

export function LandingHero(props: { rush: boolean; onStart: () => void; onPlug: () => void }) {
  return (
    <section class="landing" id="landing" aria-label={t('landing.kicker')}>
      <div class="landing-brand">
        <span class="landing-mark" innerHTML={icons.wordmark()} />
        <span class="landing-word">{APP_NAME}</span>
      </div>
      <div class="landing-copy">
        <p class="landing-kicker">
          {t('landing.kicker')}
          <span class="landing-kicker-rule" aria-hidden="true" />
        </p>
        {/* biome-ignore lint/a11y/useHeadingContent: translated HTML, same as the home title. */}
        <h1 class="landing-headline" innerHTML={t('landing.headline.html')} />
        <p class="landing-description">{t('landing.description')}</p>
        <div class="landing-ctas">
          <button
            class="landing-start"
            id="landing-start"
            type="button"
            onClick={() => props.onStart()}
          >
            <span class="landing-start-icon" innerHTML={icons.play(14)} />
            {t('landing.cta.start')}
          </button>
          <button
            class="landing-plug"
            id="landing-plug"
            type="button"
            onClick={() => props.onPlug()}
          >
            <span class="landing-plug-icon" innerHTML={icons.plug(16)} />
            {t('landing.cta.plug')}
          </button>
        </div>
      </div>
      <HeroArt rush={props.rush} />
    </section>
  )
}
