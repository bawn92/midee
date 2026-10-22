import { For, Show } from 'solid-js'
import { t } from '../i18n'
import type { KeyLights, KeyLightsSettings as Settings } from '../midi/KeyLights'
import type { MidiInputManager } from '../midi/MidiInputManager'
import { isPianoMPortName, requestPianoMSetup } from '../midi/pianoM'
import { PIANO_M_ALL_ID, type PianoMPortInfo, pianoMPortsShareName } from '../midi/pianoMPorts'
import { PianoMScriptLinks } from './PianoMSetup'

function outputLabel(
  output: PianoMPortInfo,
  outputs: readonly PianoMPortInfo[],
  order: readonly string[],
): string {
  if (!pianoMPortsShareName(output, outputs)) return output.name
  const index = order.indexOf(output.id)
  return t('keyLights.pianoMBoard', { n: index >= 0 ? index + 1 : 1 })
}

export function KeyLightsSettings(props: { lights: KeyLights; midiInput: MidiInputManager }) {
  const available = () => props.midiInput.status.value !== 'unavailable'
  const pianoOutputs = () =>
    props.lights.outputs.value.filter((output) =>
      isPianoMPortName(output.name, output.manufacturer),
    )
  const listedOutputs = () => {
    const outputs = props.lights.outputs.value
    const order = props.lights.boardOrder.value
    const byId = new Map(outputs.map((output) => [output.id, output]))
    const piano = order.flatMap((id) => {
      const output = byId.get(id)
      return output ? [output] : []
    })
    const rest = outputs.filter((output) => !isPianoMPortName(output.name, output.manufacturer))
    return [...piano, ...rest]
  }
  const outputMissing = () => {
    const id = props.lights.settings.value.outputId
    if (!id) return false
    if (id === PIANO_M_ALL_ID) return props.lights.boardOrder.value.length === 0
    return !props.lights.outputs.value.some((output) => output.id === id)
  }
  return (
    <div class="customize-section key-lights-settings">
      <div class="customize-section-head">
        <span class="customize-section-label">{t('keyLights.title')}</span>
      </div>
      <p class="customize-toggle-sub">{t('keyLights.description')}</p>
      <Show when={available()} fallback={<p role="status">{t('keyLights.unavailable')}</p>}>
        <Show when={!props.midiInput.midiAccess.value}>
          <button
            class="customize-locale-chip"
            type="button"
            onClick={() => void props.midiInput.requestAccess()}
          >
            {t('keyLights.connect')}
          </button>
          <Show when={props.midiInput.status.value === 'blocked'}>
            <p role="status">{t('keyLights.blocked')}</p>
          </Show>
        </Show>
        <label class="key-lights-field">
          <span>{t('keyLights.device')}</span>
          <select
            disabled={!props.midiInput.midiAccess.value}
            value={props.lights.settings.value.outputId}
            onChange={(event) => {
              const outputId = event.currentTarget.value
              props.lights.configure(
                outputId === PIANO_M_ALL_ID ? { outputId, channelMode: 'pianoM' } : { outputId },
              )
            }}
          >
            <option value="" selected={!props.lights.settings.value.outputId}>
              {t('keyLights.off')}
            </option>
            <Show when={pianoOutputs().length >= 2}>
              <option
                value={PIANO_M_ALL_ID}
                selected={props.lights.settings.value.outputId === PIANO_M_ALL_ID}
              >
                {t('keyLights.pianoMAll', { count: pianoOutputs().length })}
              </option>
            </Show>
            <For each={listedOutputs()}>
              {(output) => (
                <option
                  value={output.id}
                  selected={props.lights.settings.value.outputId === output.id}
                >
                  {outputLabel(output, props.lights.outputs.value, props.lights.boardOrder.value)}
                </option>
              )}
            </For>
            <option
              value={props.lights.settings.value.outputId || '__disconnected'}
              hidden={!outputMissing()}
              disabled={!outputMissing()}
              selected={outputMissing()}
            >
              {t('keyLights.disconnected')}
            </option>
          </select>
        </label>
        <Show when={pianoOutputs().length >= 2 || props.midiInput.pianoM.value}>
          <button class="customize-locale-chip" type="button" onClick={() => requestPianoMSetup()}>
            {t('keyLights.pianoMSetup')}
          </button>
        </Show>
        <Show when={pianoOutputs().length >= 2}>
          <p class="customize-toggle-sub">{t('keyLights.pianoMOrder')}</p>
          <button
            class="key-lights-advanced"
            type="button"
            onClick={() => props.lights.swapPianoMBoards()}
          >
            {t('keyLights.pianoMSwap')}
          </button>
        </Show>
        <Show when={props.midiInput.midiAccess.value && props.lights.outputs.value.length === 0}>
          <p role="status">{t('keyLights.noDevices')}</p>
        </Show>
        <Show when={props.lights.status.value === 'error'}>
          <p role="status">{t('keyLights.error')}</p>
        </Show>
        <Show when={props.lights.settings.value.outputId}>
          <label class="key-lights-field">
            <span>{t('keyLights.colors')}</span>
            <select
              value={props.lights.settings.value.channelMode}
              onChange={(event) =>
                props.lights.configure({
                  channelMode: event.currentTarget.value as Settings['channelMode'],
                })
              }
            >
              <option value="original">{t('keyLights.original')}</option>
              <option value="pianoM">{t('keyLights.pianoM')}</option>
              <option value="synthesia">{t('keyLights.synthesia')}</option>
              <option value="track">{t('keyLights.track')}</option>
              <option value="single">{t('keyLights.single')}</option>
            </select>
          </label>
          <Show when={props.lights.settings.value.channelMode === 'single'}>
            <label class="key-lights-field">
              <span>{t('keyLights.channel')}</span>
              <select
                value={props.lights.settings.value.channel}
                onChange={(event) =>
                  props.lights.configure({ channel: Number(event.currentTarget.value) })
                }
              >
                <For each={Array.from({ length: 16 }, (_, i) => i + 1)}>
                  {(channel) => <option value={channel}>{channel}</option>}
                </For>
              </select>
            </label>
          </Show>
          <Show when={props.lights.settings.value.channelMode !== 'pianoM'}>
            <p class="customize-toggle-sub">{t('keyLights.colorHint')}</p>
          </Show>
        </Show>
        <details class="key-lights-help">
          <summary>{t('keyLights.setupHelp')}</summary>
          <div class="key-lights-help-body">
            <p class="customize-toggle-sub">{t('keyLights.keeziHint')}</p>
            <Show when={props.lights.settings.value.channelMode === 'pianoM'}>
              <p class="customize-toggle-sub">{t('keyLights.pianoMHint')}</p>
              <PianoMScriptLinks />
            </Show>
            <Show when={props.lights.outputs.value.length > 0}>
              <p class="customize-toggle-sub">{t('keyLights.pianoMDebug')}</p>
              <ul class="key-lights-debug">
                <For each={props.lights.outputs.value}>
                  {(output) => (
                    <li>
                      {output.name} · {output.id}
                    </li>
                  )}
                </For>
              </ul>
              <Show
                when={props.lights.sentLog.value.length > 0}
                fallback={<p class="customize-toggle-sub">{t('keyLights.pianoMDebugEmpty')}</p>}
              >
                <ul class="key-lights-debug">
                  <For each={props.lights.sentLog.value}>
                    {(row) => (
                      <li>
                        {row.portName}: {row.bytes.join(' ')}
                        {row.truncated ? ' …' : ''}
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </Show>
            <Show when={props.lights.settings.value.channelMode === 'synthesia'}>
              <p class="customize-toggle-sub">{t('keyLights.synthesiaHint')}</p>
            </Show>
            <Show when={props.midiInput.pianoM.value}>
              <button
                type="button"
                class="customize-locale-chip"
                onClick={() => requestPianoMSetup()}
              >
                {t('pianoM.guide.reopen')}
              </button>
            </Show>
          </div>
        </details>
      </Show>
    </div>
  )
}
