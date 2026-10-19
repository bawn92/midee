import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { t } from '../i18n'
import type { MidiDeviceStatus } from '../midi/MidiInputManager'
import { useApp } from '../store/AppCtx'

export function MidiConnect(props: { defer: boolean; onClose: () => void }) {
  const { midiInput, enterLive, connectMidi, openFilePicker } = useApp()
  const [busy, setBusy] = createSignal(false)
  let pop: HTMLDivElement | undefined
  let closed = false

  const status = (): MidiDeviceStatus => midiInput.status.value
  const deviceName = (): string => midiInput.deviceName.value.split(',')[0]?.trim() || ''

  const place = (): void => {
    const el = pop
    const pill = document.getElementById('ts-midi')
    if (!el || !pill) return
    if (window.matchMedia('(max-width: 759px)').matches) {
      el.style.top = ''
      el.style.left = ''
      return
    }
    const rect = pill.getBoundingClientRect()
    const width = el.offsetWidth || 340
    const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))
    el.style.top = `${Math.round(rect.bottom + 10)}px`
    el.style.left = `${Math.round(left)}px`
  }

  onMount(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') props.onClose()
    }
    const onResize = (): void => place()
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    const focusTimer = window.setTimeout(
      () => {
        place()
        const current = status()
        const id =
          current === 'connected' || current === 'unavailable'
            ? 'landing-midi-play'
            : 'landing-midi-enable'
        document.getElementById(id)?.focus()
      },
      props.defer ? 280 : 40,
    )

    let closeTimer = 0
    const offNote = midiInput.noteOn.subscribe((evt) => {
      if (!evt || closed || closeTimer) return
      closeTimer = window.setTimeout(() => props.onClose(), 4000)
    })

    onCleanup(() => {
      closed = true
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      window.clearTimeout(focusTimer)
      window.clearTimeout(closeTimer)
      offNote()
    })
  })

  const enable = (): void => {
    if (busy()) return
    setBusy(true)
    void connectMidi().finally(() => setBusy(false))
  }

  return (
    <>
      <button
        class="midi-scrim"
        type="button"
        aria-label={t('landing.midi.close')}
        onClick={() => props.onClose()}
      />
      <div
        class="midi-pop"
        classList={{ 'midi-pop--defer': props.defer }}
        id="landing-midi"
        role="dialog"
        aria-modal="true"
        aria-labelledby="landing-midi-title"
        ref={pop}
      >
        <Show when={status() === 'unavailable'}>
          <h2 id="landing-midi-title">{t('landing.midi.unavailable')}</h2>
          <p class="midi-pop-note">{t('landing.midi.computerKeys')}</p>
          <button
            id="landing-midi-play"
            class="midi-pop-primary"
            type="button"
            onClick={() => enterLive()}
          >
            {t('landing.midi.playLive')}
          </button>
        </Show>
        <Show when={status() === 'blocked'}>
          <h2 id="landing-midi-title">{t('error.midi.permissionBlocked')}</h2>
          <button
            id="landing-midi-enable"
            class="midi-pop-primary"
            type="button"
            disabled={busy()}
            onClick={enable}
          >
            {t('landing.midi.enable')}
          </button>
        </Show>
        <Show when={status() === 'connected'}>
          <h2 class="midi-pop-kicker" id="landing-midi-title">
            <span class="midi-pop-dot midi-pop-dot--on" />
            {t('landing.midi.connected', { name: deviceName() || t('home.midi.ready') })}
          </h2>
          <button
            id="landing-midi-play"
            class="midi-pop-primary"
            type="button"
            onClick={() => enterLive()}
          >
            {t('landing.midi.playLive')}
          </button>
          <button class="midi-pop-file" type="button" onClick={() => openFilePicker()}>
            {t('landing.midi.orFile')}
          </button>
        </Show>
        <Show when={status() === 'disconnected'}>
          <h2 id="landing-midi-title">
            <span class="midi-pop-dot" />
            {t('landing.midi.looking')}
          </h2>
          <ol class="midi-pop-steps">
            <li>{t('landing.midi.stepPlug')}</li>
            <li>{t('landing.midi.stepAllow')}</li>
          </ol>
          <button
            id="landing-midi-enable"
            class="midi-pop-primary"
            type="button"
            disabled={busy()}
            onClick={enable}
          >
            {t('landing.midi.enable')}
          </button>
        </Show>
      </div>
    </>
  )
}
