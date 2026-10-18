import { createSignal, onCleanup } from 'solid-js'
import {
  getHandPractice,
  type Hand,
  setHandPractice,
  subscribeHandPractice,
} from '../core/handPractice'
import { t } from '../i18n'
import { icons } from './icons'

const HANDS = ['left', 'both', 'right'] as const

function handTip(hand: Hand): string {
  if (hand === 'left') return t('learn.pa.handLeftTip')
  if (hand === 'right') return t('learn.pa.handRightTip')
  return t('learn.pa.handBothTip')
}

function handAria(hand: Hand): string {
  if (hand === 'left') return t('learn.pa.handLeftAria')
  if (hand === 'right') return t('learn.pa.handRightAria')
  return t('learn.pa.handBothAria')
}

function handLabel(hand: Hand): string {
  if (hand === 'left') return t('learn.pa.handLeftLabel')
  if (hand === 'right') return t('learn.pa.handRightLabel')
  return t('learn.pa.handBothLabel')
}

// Left / Both / Right, plus hear-or-mute for the hand that isn't being
// practised. One control for the Play/Live transport and the Learn HUD, both
// writing the same persisted choice.
export function HandPracticeButtons(props: { variant: 'transport' | 'learn' }) {
  const [prefs, setPrefs] = createSignal(getHandPractice())
  onCleanup(subscribeHandPractice(setPrefs))
  const learn = (): boolean => props.variant === 'learn'

  const buttons = (
    <>
      <div class={learn() ? 'pa-hud__seg-track' : 'hud-hand-track'}>
        {HANDS.map((hand) => (
          <button
            class={learn() ? 'pa-hud__seg' : 'hud-hand'}
            classList={{ 'is-active': prefs().hand === hand }}
            id={learn() ? undefined : `hud-hand-${hand}`}
            type="button"
            data-tip={handTip(hand)}
            aria-label={handAria(hand)}
            aria-pressed={prefs().hand === hand}
            onClick={() => setHandPractice({ hand })}
          >
            {handLabel(hand)}
          </button>
        ))}
      </div>
      <button
        class={learn() ? 'pa-hud__seg pa-hand-audio' : 'hud-hand-audio'}
        id={learn() ? 'pa-hand-audio' : 'hud-hand-audio'}
        type="button"
        aria-pressed={prefs().otherHandAudible}
        disabled={prefs().hand === 'both'}
        data-tip={prefs().otherHandAudible ? t('hud.handHearTip') : t('hud.handMuteTip')}
        aria-label={prefs().otherHandAudible ? t('hud.handHear') : t('hud.handMute')}
        onClick={() => setHandPractice({ otherHandAudible: !prefs().otherHandAudible })}
        innerHTML={prefs().otherHandAudible ? icons.volume(13) : icons.volumeMuted(13)}
      />
    </>
  )

  return (
    <>
      {learn() ? (
        <fieldset class="pa-hud__segmented" aria-label={t('learn.pa.handsAria')}>
          <span class="pa-hud__seg-label">{t('learn.pa.handsLabel')}</span>
          {buttons}
        </fieldset>
      ) : (
        <fieldset
          class="ctrl-group hud-hands"
          aria-label={t('learn.pa.handsAria')}
          data-hand={prefs().hand}
        >
          {buttons}
        </fieldset>
      )}
    </>
  )
}
