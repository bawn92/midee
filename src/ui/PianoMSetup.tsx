import { createEffect, createSignal, For, on, onCleanup, onMount, Show } from 'solid-js'
import { pitchToNoteName } from '../core/midi/types'
import { t } from '../i18n'
import type { KeyLights } from '../midi/KeyLights'
import type { MidiInputManager, PianoKeyEvent } from '../midi/MidiInputManager'
import {
  consumePianoMSetupRequest,
  isPianoMPortName,
  type PianoMBoards,
  subscribePianoMSetupRequest,
} from '../midi/pianoM'
import { PIANO_M_ALL_ID } from '../midi/pianoMPorts'
import {
  type BoardHit,
  decideInputOffset,
  getPianoMSetup,
  type InputDecision,
  type LightAnswer,
  lightResultFor,
  orderAfterLightAnswer,
  type PianoMSetupRecord,
  pianoMDeviceKey,
  type SetupStep,
  savePianoMSetup,
} from '../midi/pianoMSetup'

const SCRIPT_FILES = [
  ['piano-m-lights-left.littlefoot', 'keyLights.pianoMScriptLeft'],
  ['piano-m-lights-right.littlefoot', 'keyLights.pianoMScriptRight'],
  ['piano-m-lights-board-3.littlefoot', 'keyLights.pianoMScriptBoard3'],
] as const

interface Session {
  step: SetupStep
  left: BoardHit | null
  right: BoardHit | null
  decision: InputDecision | null
  confirmLeft: number | null
  confirmRight: number | null
  leftLight: LightAnswer | null
  rightLight: LightAnswer | null
  needsFiles: boolean
  redoing: boolean
}

function blankSession(redoing = false): Session {
  return {
    step: 'left',
    left: null,
    right: null,
    decision: null,
    confirmLeft: null,
    confirmRight: null,
    leftLight: null,
    rightLight: null,
    needsFiles: false,
    redoing,
  }
}

function noteName(pitch: number | null): string {
  return pitch === null ? '…' : pitchToNoteName(pitch)
}

export function PianoMScriptLinks() {
  const base = import.meta.env.BASE_URL
  return (
    <div class="piano-m-scripts">
      <For each={SCRIPT_FILES}>
        {([file, key]) => (
          <a class="piano-m-guide-script" href={`${base}${file}`} download={file}>
            {t(key)}
          </a>
        )}
      </For>
      <a
        class="piano-m-guide-script"
        href={`${base}piano-m-theme-lights.littlefoot`}
        download="piano-m-theme-lights.littlefoot"
      >
        {t('keyLights.pianoMScript')}
      </a>
    </div>
  )
}

export function PianoMSetup(props: {
  midi: MidiInputManager | null
  lights: KeyLights | null
  boards: PianoMBoards | null
}) {
  const [session, setSession] = createSignal<Session>(blankSession())
  let ignoreUntil = 0
  let sentPort = ''

  const pianoInputIds = (): string[] => {
    const access = props.midi?.midiAccess.value
    if (!access) return []
    const ids: string[] = []
    for (const input of access.inputs.values()) {
      if (input.state !== 'connected') continue
      if (!isPianoMPortName(input.name ?? '', input.manufacturer ?? '')) continue
      ids.push(input.id)
    }
    return ids
  }

  const deviceKey = (): string => {
    const inputs = pianoInputIds()
    if (inputs.length > 0) return pianoMDeviceKey(inputs)
    const current = session()
    const hits = [current.left?.portId, current.right?.portId].filter((id): id is string => !!id)
    if (hits.length > 0) return pianoMDeviceKey(hits)
    return pianoMDeviceKey(props.lights?.boardOrder.value ?? [])
  }

  const saved = (): PianoMSetupRecord | null => getPianoMSetup(deviceKey())

  const active = (): boolean => {
    const boards = props.boards
    const outputs = props.lights?.boardOrder.value.length ?? 0
    return (boards != null && boards >= 2) || pianoInputIds().length >= 2 || outputs >= 2
  }

  const showSummary = (): boolean => {
    if (!active()) return false
    const current = session()
    if (current.redoing) return false
    if (current.step === 'done') return true
    return saved()?.completed === true && current.step === 'left' && current.left === null
  }

  function restart(): void {
    ignoreUntil = Date.now() + 280
    props.lights?.stopBoardSweep()
    setSession(blankSession(true))
  }

  onMount(() => {
    if (consumePianoMSetupRequest()) restart()
    const off = subscribePianoMSetupRequest(() => {
      consumePianoMSetupRequest()
      restart()
    })
    onCleanup(() => {
      off()
      props.lights?.stopBoardSweep()
    })
  })

  function persist(current: Session, completed: boolean): void {
    const left = current.left
    const right = current.right
    const decision = current.decision
    if (!left || !right || !decision) return
    const key = pianoMDeviceKey(
      pianoInputIds().length > 0
        ? pianoInputIds()
        : [left.portId, right.portId].filter((id) => id.length > 0),
    )
    if (!key) return
    const order = props.lights?.boardOrder.value ?? []
    savePianoMSetup({
      deviceKey: key,
      leftInputId: left.portId,
      rightInputId: right.portId,
      leftOutputId: order[0] ?? '',
      rightOutputId: order[1] ?? order[0] ?? '',
      leftNote: left.note,
      rightNote: right.note,
      confirmLeft: current.confirmLeft,
      confirmRight: current.confirmRight,
      samePort: decision.samePort,
      inputOffset: decision.inputOffset,
      leftLight: current.leftLight,
      rightLight: current.rightLight,
      lightResult: completed ? lightResultFor([current.leftLight, current.rightLight]) : 'unknown',
      completed,
    })
  }

  function remember(hit: PianoKeyEvent): void {
    if (hit.velocity <= 0 || !active() || showSummary()) return
    const now = Date.now()
    if (now < ignoreUntil) return
    const current = session()
    if (current.step === 'left') {
      ignoreUntil = now + 280
      setSession({
        ...current,
        left: { portId: hit.portId, portName: hit.portName, note: hit.rawPitch },
        step: 'right',
      })
      return
    }
    if (current.step === 'right' && current.left) {
      const right: BoardHit = {
        portId: hit.portId,
        portName: hit.portName,
        note: hit.rawPitch,
      }
      const decision = decideInputOffset(current.left, right)
      ignoreUntil = now + 280
      const next: Session = {
        ...current,
        right,
        decision,
        step: decision.clusteredWithoutOffset ? 'cluster' : 'confirm',
      }
      setSession(next)
      persist(next, false)
      return
    }
    if (current.step !== 'confirm' || !current.left || !current.right) return
    const same = current.left.portId === current.right.portId
    let confirmLeft = current.confirmLeft
    let confirmRight = current.confirmRight
    if (!same && hit.portId === current.left.portId) confirmLeft = hit.pitch
    else if (!same && hit.portId === current.right.portId) confirmRight = hit.pitch
    else if (confirmLeft === null) confirmLeft = hit.pitch
    else confirmRight = hit.pitch
    setSession({ ...current, confirmLeft, confirmRight })
  }

  createEffect(
    on(
      () => props.midi?.pianoKey.value ?? null,
      (hit) => {
        if (hit) remember(hit)
      },
    ),
  )

  createEffect(
    on(
      () => (active() && !showSummary() ? session().step : 'idle'),
      (step) => {
        const lights = props.lights
        if (!lights) return
        if (step === 'light-left') {
          sentPort = lights.boardOrder.value[0] ?? PIANO_M_ALL_ID
          lights.startBoardSweep(0, sentPort)
          return
        }
        if (step === 'light-right') {
          const current = session()
          const mirrored = current.leftLight === 'both' || current.leftLight === 'none'
          const order = lights.boardOrder.value
          sentPort = mirrored ? PIANO_M_ALL_ID : (order[1] ?? order[0] ?? PIANO_M_ALL_ID)
          lights.startBoardSweep(1, sentPort)
          return
        }
        lights.stopBoardSweep()
      },
    ),
  )

  function choose(answer: LightAnswer): void {
    const current = session()
    const lights = props.lights
    const order = lights?.boardOrder.value ?? []
    const sent = sentPort
    if (current.step === 'light-left') {
      const nextOrder = orderAfterLightAnswer(order, sent, answer, 'left')
      if (lights && nextOrder.join('\0') !== order.join('\0')) lights.setPianoMBoardOrder(nextOrder)
      setSession({
        ...current,
        leftLight: answer,
        needsFiles: answer === 'both' || answer === 'none',
        step: 'light-right',
      })
      return
    }
    if (current.step !== 'light-right') return
    const nextOrder = orderAfterLightAnswer(order, sent, answer, 'right')
    if (lights && nextOrder.join('\0') !== order.join('\0')) lights.setPianoMBoardOrder(nextOrder)
    const next: Session = {
      ...current,
      rightLight: answer,
      needsFiles: current.needsFiles || answer === 'both' || answer === 'none',
      step: 'done',
      redoing: false,
    }
    setSession(next)
    persist(next, true)
  }

  const summaryRecord = (): PianoMSetupRecord | null => {
    const current = session()
    if (current.step === 'done' && current.left && current.right && current.decision) {
      return {
        deviceKey: deviceKey(),
        leftInputId: current.left.portId,
        rightInputId: current.right.portId,
        leftOutputId: '',
        rightOutputId: '',
        leftNote: current.left.note,
        rightNote: current.right.note,
        confirmLeft: current.confirmLeft,
        confirmRight: current.confirmRight,
        samePort: current.decision.samePort,
        inputOffset: current.decision.inputOffset,
        leftLight: current.leftLight,
        rightLight: current.rightLight,
        lightResult: lightResultFor([current.leftLight, current.rightLight]),
        completed: true,
      }
    }
    return saved()
  }

  const filesNeeded = (): boolean => {
    const current = session()
    if (current.step === 'done' || current.step === 'light-right') return current.needsFiles
    return summaryRecord()?.lightResult === 'files'
  }

  const detectedLine = (record: {
    confirmLeft: number | null
    confirmRight: number | null
    leftNote: number
    rightNote: number
  }): string => {
    const left = record.confirmLeft ?? record.leftNote
    const right = record.confirmRight ?? record.rightNote
    return t('pianoM.setup.detected', { left: noteName(left), right: noteName(right) })
  }

  const roliPair = (left: number | null, right: number | null): boolean =>
    (left === 60 && right === 84) || (left === 84 && right === 60)

  return (
    <Show when={active()}>
      <section id="piano-m-setup" class="piano-m-setup" data-step={session().step}>
        <Show
          when={showSummary()}
          fallback={
            <>
              <h3 class="piano-m-setup-title">{t('pianoM.setup.title')}</h3>
              <Show when={session().step === 'left'}>
                <p class="piano-m-setup-prompt">{t('pianoM.setup.left')}</p>
              </Show>
              <Show when={session().step === 'right' && session().left}>
                {(left) => (
                  <>
                    <p class="piano-m-setup-heard">
                      {t('pianoM.setup.heard', {
                        note: noteName(left().note),
                        port: left().portName,
                      })}
                    </p>
                    <p class="piano-m-setup-prompt">{t('pianoM.setup.right')}</p>
                  </>
                )}
              </Show>
              <Show when={session().step === 'cluster'}>
                <p class="piano-m-setup-prompt">{t('pianoM.setup.cluster')}</p>
                <div class="piano-m-setup-actions">
                  <button
                    type="button"
                    class="piano-m-setup-choice piano-m-setup-choice-primary"
                    onClick={() => setSession({ ...session(), step: 'confirm' })}
                  >
                    {t('pianoM.setup.continue')}
                  </button>
                </div>
              </Show>
              <Show when={session().step === 'confirm'}>
                <p class="piano-m-setup-prompt">{t('pianoM.setup.confirm')}</p>
                <Show when={session().decision?.inputOffset === 24}>
                  <p class="piano-m-setup-heard">{t('pianoM.setup.offsetOn')}</p>
                </Show>
                <p class="piano-m-setup-heard">
                  {session().confirmLeft === null && session().confirmRight === null
                    ? t('pianoM.setup.waiting')
                    : t('pianoM.setup.detected', {
                        left: noteName(session().confirmLeft),
                        right: noteName(session().confirmRight),
                      })}
                </p>
                <Show when={roliPair(session().confirmLeft, session().confirmRight)}>
                  <p class="piano-m-setup-heard">{t('pianoM.setup.roli')}</p>
                </Show>
                <div class="piano-m-setup-actions">
                  <button
                    type="button"
                    class="piano-m-setup-choice piano-m-setup-choice-primary"
                    disabled={session().confirmLeft === null || session().confirmRight === null}
                    onClick={() => setSession({ ...session(), step: 'light-left' })}
                  >
                    {t('pianoM.setup.continue')}
                  </button>
                </div>
              </Show>
              <Show when={session().step === 'light-left' || session().step === 'light-right'}>
                <p class="piano-m-setup-prompt">
                  {session().step === 'light-left'
                    ? t('pianoM.setup.lightLeft')
                    : t('pianoM.setup.lightRight')}
                </p>
                <Show when={session().needsFiles && session().step === 'light-right'}>
                  <p class="piano-m-setup-heard">
                    {session().leftLight === 'none'
                      ? t('pianoM.setup.noneHelp')
                      : t('pianoM.setup.files')}
                  </p>
                  <PianoMScriptLinks />
                </Show>
                <div class="piano-m-setup-actions">
                  <button type="button" class="piano-m-setup-choice" onClick={() => choose('yes')}>
                    {t('pianoM.setup.yes')}
                  </button>
                  <button
                    type="button"
                    class="piano-m-setup-choice"
                    onClick={() => choose('swapped')}
                  >
                    {session().step === 'light-left'
                      ? t('pianoM.setup.otherLeft')
                      : t('pianoM.setup.otherRight')}
                  </button>
                  <button type="button" class="piano-m-setup-choice" onClick={() => choose('both')}>
                    {t('pianoM.setup.both')}
                  </button>
                  <button type="button" class="piano-m-setup-choice" onClick={() => choose('none')}>
                    {t('pianoM.setup.none')}
                  </button>
                </div>
              </Show>
            </>
          }
        >
          <div class="piano-m-setup-done" role="status">
            <h3 class="piano-m-setup-title">{t('pianoM.setup.done')}</h3>
            <p class="piano-m-setup-prompt">{t('pianoM.setup.summary')}</p>
            <Show when={summaryRecord()}>
              {(record) => (
                <>
                  <p class="piano-m-setup-heard">{detectedLine(record())}</p>
                  <Show when={record().inputOffset === 24}>
                    <p class="piano-m-setup-heard">{t('pianoM.setup.offsetOn')}</p>
                  </Show>
                  <Show when={record().samePort && record().inputOffset === 0}>
                    <p class="piano-m-setup-heard">{t('pianoM.setup.same')}</p>
                  </Show>
                  <Show when={roliPair(record().confirmLeft, record().confirmRight)}>
                    <p class="piano-m-setup-heard">{t('pianoM.setup.roli')}</p>
                  </Show>
                </>
              )}
            </Show>
            <Show when={filesNeeded()}>
              <p class="piano-m-setup-heard">{t('pianoM.setup.files')}</p>
              <PianoMScriptLinks />
            </Show>
            <button type="button" class="piano-m-setup-again" onClick={() => restart()}>
              {t('pianoM.setup.again')}
            </button>
          </div>
        </Show>
      </section>
    </Show>
  )
}
