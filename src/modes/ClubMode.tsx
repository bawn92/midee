import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { APP_NAME } from '../brand'
import { ClubHud } from '../club/ClubHud'
import { currentMonth } from '../club/month'
import type { PlayedNote } from '../club/score'
import { type ScoreBreakdown, scoreTake } from '../club/score'
import { bestScore, clubStorage, placeOf, previewPlace } from '../club/storage'
import { notesForTake } from '../club/take'
import type { ClubAttempt, LeaderboardEntry } from '../club/types'
import { getKeyboardRange } from '../core/keyboardRange'
import { t } from '../i18n'
import { useApp } from '../store/AppCtx'
import '../styles/club.css'

type ClubScreen =
  | 'loading'
  | 'landing'
  | 'prerecord'
  | 'countin'
  | 'recording'
  | 'results'
  | 'submit'
  | 'rank'
  | 'board'

const SCREENS: readonly ClubScreen[] = [
  'loading',
  'landing',
  'prerecord',
  'countin',
  'recording',
  'results',
  'submit',
  'rank',
  'board',
]

function isScreen(value: string | null): value is ClubScreen {
  return SCREENS.includes(value as ClubScreen)
}

function freshId(): string {
  return `club-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function signed(points: number): string {
  const rounded = Math.round(points)
  return rounded > 0 ? `+${rounded}` : `${rounded}`
}

export function ClubMode() {
  const {
    services,
    dropzone,
    trackPanel,
    keyboardInput,
    resetInteractionState,
    primeInteractiveAudio,
  } = useApp()
  const month = currentMonth()
  const storage = clubStorage()
  const [screen, setScreen] = createSignal<ClubScreen>('loading')
  const [best, setBest] = createSignal<number | null>(null)
  const [board, setBoard] = createSignal<LeaderboardEntry[]>([])
  const [take, setTake] = createSignal(1)
  const [countBeat, setCountBeat] = createSignal(month.beatsPerBar)
  const [elapsed, setElapsed] = createSignal(0)
  const [breakdown, setBreakdown] = createSignal<ScoreBreakdown>(
    scoreTake(notesForTake(month.midi, getKeyboardRange()), [], 0),
  )
  const [attempt, setAttempt] = createSignal<ClubAttempt | null>(null)
  const [posted, setPosted] = createSignal<LeaderboardEntry | null>(null)
  const [name, setName] = createSignal(storage.readName())

  let generation = 0
  let recording = false
  let played: PlayedNote[] = []
  let unsubClock: (() => void) | null = null
  let unsubNotes: (() => void) | null = null
  let timers: number[] = []
  const speedWas = services.store.state.speed

  const refresh = (): void => {
    const attempts = storage.listAttempts(month.id)
    setBest(bestScore(attempts))
    setBoard(storage.listBoard(month.id))
    setTake(attempts.length + 1)
  }

  const stopTake = (): void => {
    generation += 1
    recording = false
    for (const id of timers) window.clearTimeout(id)
    timers = []
    unsubClock?.()
    unsubClock = null
    unsubNotes?.()
    unsubNotes = null
    services.metronome.stop()
    services.clock.pause()
    services.synth.pause()
  }

  const showPiece = (): void => {
    services.renderer.setVisible(true)
    services.renderer.loadMidi(month.midi, 0)
    void services.synth.load(month.midi).catch(() => {
      // The roll still shows the piece when the sampler is not ready yet.
    })
    services.clock.pause()
    services.clock.seek(0)
    services.clock.speed = 1
    services.synth.setSpeed(1)
    setElapsed(0)
  }

  const hidePiece = (): void => {
    services.renderer.setVisible(false)
  }

  const finish = (gen: number): void => {
    if (gen !== generation || !recording) return
    recording = false
    unsubClock?.()
    unsubClock = null
    unsubNotes?.()
    unsubNotes = null
    services.clock.pause()
    services.synth.pause()
    const expected = notesForTake(month.midi, getKeyboardRange())
    const result = scoreTake(expected, played)
    setBreakdown(result)
    setElapsed(month.midi.duration)
    const saved: ClubAttempt = {
      id: freshId(),
      monthId: month.id,
      score: result.score,
      accuracy: result.accuracy,
      counts: result.counts,
      createdAt: Date.now(),
      displayName: name().trim(),
      submitted: false,
    }
    storage.saveAttempt(saved)
    setAttempt(saved)
    refresh()
    hidePiece()
    setScreen('results')
  }

  const beginRecording = (gen: number): void => {
    if (gen !== generation) return
    played = []
    recording = true
    const expected = notesForTake(month.midi, getKeyboardRange())
    setBreakdown(scoreTake(expected, [], 0))
    setScreen('recording')
    unsubNotes = services.input.noteOn.subscribe((evt) => {
      if (!evt || !recording || gen !== generation) return
      played.push({ pitch: evt.pitch, time: evt.clockTime, velocity: evt.velocity })
    })
    unsubClock = services.clock.subscribe((time) => {
      if (!recording || gen !== generation) return
      setElapsed(time)
      setBreakdown(scoreTake(expected, played, time))
      if (time >= month.midi.duration - 0.03) finish(gen)
    })
    services.clock.seek(0)
    services.clock.play()
    void services.synth.play(0).catch(() => {
      // A suspended context leaves the roll where the clock is. The take
      // still ends when that clock reaches the last bar.
    })
  }

  const startCountIn = (): void => {
    primeInteractiveAudio()
    stopTake()
    const gen = generation
    refresh()
    setCountBeat(month.beatsPerBar)
    setBreakdown(scoreTake(notesForTake(month.midi, getKeyboardRange()), [], 0))
    showPiece()
    setScreen('countin')
    const beatMs = (60 / month.bpm) * 1000
    for (let step = 1; step < month.beatsPerBar; step++) {
      timers.push(
        window.setTimeout(() => {
          if (gen === generation) setCountBeat(month.beatsPerBar - step)
        }, step * beatMs),
      )
    }
    void services.metronome.countIn(month.beatsPerBar, month.bpm).then(() => {
      beginRecording(gen)
    })
  }

  onMount(() => {
    resetInteractionState()
    trackPanel.close()
    dropzone.hide()
    keyboardInput.enable()
    document.title = t('doc.title.club', { name: APP_NAME })
    services.clock.speed = 1
    services.synth.setSpeed(1)
    refresh()
    const requested = new URLSearchParams(location.search).get('view')
    if (isScreen(requested)) {
      setScreen(requested)
      if (requested === 'countin' || requested === 'recording') showPiece()
      else hidePiece()
      if (requested === 'countin') setCountBeat(month.beatsPerBar)
      return
    }
    hidePiece()
    const frame = requestAnimationFrame(() => {
      if (generation === 0 && screen() === 'loading') setScreen('landing')
    })
    onCleanup(() => cancelAnimationFrame(frame))
  })

  onCleanup(() => {
    stopTake()
    services.clock.speed = services.store.state.speed || speedWas
    services.synth.setSpeed(services.store.state.speed || speedWas)
    services.clock.seek(0)
    services.synth.seek(0)
    services.renderer.setVisible(true)
  })

  const openBoard = (): void => {
    refresh()
    hidePiece()
    setScreen('board')
  }

  const post = (): void => {
    const current = attempt()
    const displayName = name().trim()
    if (!current || !displayName) return
    storage.saveName(displayName)
    const entry: LeaderboardEntry = {
      id: current.id,
      monthId: month.id,
      displayName,
      score: current.score,
      createdAt: current.createdAt,
      local: true,
    }
    const next = storage.submit(entry)
    storage.updateAttempt({ ...current, displayName, submitted: true })
    setPosted(entry)
    setBoard(next)
    setAttempt({ ...current, displayName, submitted: true })
    setScreen('rank')
  }

  const place = () => {
    const current = attempt()
    if (!current) return { rank: 1, total: 1 }
    return previewPlace(current.score, current.createdAt, storage.listBoard(month.id))
  }

  const playing = () => screen() === 'countin' || screen() === 'recording'

  return (
    <div
      class="club-stage"
      classList={{ 'club-stage--play': playing() }}
      data-club
      data-screen={screen()}
    >
      <Show when={playing()}>
        <ClubHud
          breakdown={breakdown()}
          elapsed={elapsed()}
          duration={month.midi.duration}
          take={take()}
          title={month.title}
        />
      </Show>
      <Show when={screen() === 'countin'}>
        <div class="club-count" role="status">
          {countBeat()}
        </div>
      </Show>

      <Show when={screen() === 'loading'}>
        <section class="club-card" aria-busy="true">
          <p class="club-kicker">{t(month.kickerKey)}</p>
          <h1 class="club-title">{month.title}</h1>
          <p class="club-loading">{t('club.loading')}</p>
        </section>
      </Show>

      <Show when={screen() === 'landing'}>
        <section class="club-card">
          <p class="club-kicker">{t(month.kickerKey)}</p>
          <h1 class="club-title">{month.title}</h1>
          <p class="club-composer">{month.composer}</p>
          <p class="club-blurb">{t('club.blurb')}</p>
          <div class="club-actions">
            <button
              class="club-primary"
              id="club-record-take"
              type="button"
              onClick={() => setScreen('prerecord')}
            >
              {t('club.recordTake')}
            </button>
            <button class="club-secondary" id="club-open-board" type="button" onClick={openBoard}>
              {t('club.leaderboard')}
            </button>
          </div>
          <p class="club-meta">
            <span>
              {best() == null ? t('club.noBest') : t('club.yourBest', { score: best() ?? 0 })}
            </span>
            <span>{t('club.closes', { date: t(month.closesKey) })}</span>
          </p>
        </section>
      </Show>

      <Show when={screen() === 'prerecord'}>
        <section class="club-card">
          <p class="club-kicker">{t(month.kickerKey)}</p>
          <h1 class="club-title">{month.title}</h1>
          <p class="club-blurb">{t('club.oneTake')}</p>
          <p class="club-meta club-meta--stack">
            <span>
              {best() == null ? t('club.noBest') : t('club.yourBest', { score: best() ?? 0 })}
            </span>
            <span>{t('club.closes', { date: t(month.closesKey) })}</span>
          </p>
          <div class="club-actions">
            <button class="club-primary" id="club-start" type="button" onClick={startCountIn}>
              {t('club.record')}
            </button>
            <button class="club-secondary" type="button" onClick={() => setScreen('landing')}>
              {t('club.back')}
            </button>
          </div>
        </section>
      </Show>

      <Show when={screen() === 'results' && attempt()}>
        <section class="club-card">
          <p class="club-kicker">{t(month.kickerKey)}</p>
          <p class="club-score-big">{attempt()?.score}</p>
          <p class="club-of">{t('club.of1000')}</p>
          <p class="club-place">
            {t('club.results.place', {
              n: place().rank,
              total: place().total,
            })}
          </p>
          <p class="club-accuracy-line">
            {Math.round((attempt()?.accuracy ?? 0) * 100)}% {t('club.accuracy')}
          </p>
          <ul class="club-breakdown">
            <Breakdown result={breakdown()} />
          </ul>
          <div class="club-actions">
            <button
              class="club-primary"
              id="club-submit"
              type="button"
              onClick={() => setScreen('submit')}
            >
              {t('club.submitBoard')}
            </button>
            <button class="club-secondary" type="button" onClick={() => setScreen('prerecord')}>
              {t('club.recordAgain')}
            </button>
          </div>
        </section>
      </Show>

      <Show when={screen() === 'submit' && attempt()}>
        <section class="club-card">
          <h1 class="club-title">{t('club.submitTitle')}</h1>
          <p class="club-place">
            {t('club.submitPreview', { score: attempt()?.score ?? 0, n: place().rank })}
          </p>
          <form
            class="club-form"
            onSubmit={(event) => {
              event.preventDefault()
              post()
            }}
          >
            <label class="club-field-label" for="club-name">
              {t('club.nameLabel')}
            </label>
            <input
              id="club-name"
              class="club-field"
              type="text"
              maxlength="32"
              autocomplete="nickname"
              placeholder={t('club.namePlaceholder')}
              value={name()}
              onInput={(event) => setName(event.currentTarget.value)}
            />
            <p class="club-local">{t('club.localNote')}</p>
            <div class="club-actions">
              <button
                class="club-primary"
                id="club-post"
                type="submit"
                disabled={name().trim().length === 0}
              >
                {t('club.post')}
              </button>
              <button class="club-secondary" type="button" onClick={() => setScreen('results')}>
                {t('club.notNow')}
              </button>
            </div>
          </form>
        </section>
      </Show>

      <Show when={screen() === 'rank' && posted()}>
        <section class="club-card club-card--rank">
          <h1 class="club-title">
            {t('club.rankTitle', { n: placeOf(posted()?.id ?? '', board()) })}
          </h1>
          <p class="club-of">{t('club.rankOf', { total: board().length })}</p>
          <p class="club-name">{posted()?.displayName}</p>
          <p class="club-score-big">{posted()?.score}</p>
          <p class="club-place">{t('club.rankOn', { month: t(month.kickerKey) })}</p>
          <div class="club-actions">
            <button class="club-primary" id="club-see-board" type="button" onClick={openBoard}>
              {t('club.seeBoard')}
            </button>
          </div>
        </section>
      </Show>

      <Show when={screen() === 'board'}>
        <section class="club-card">
          <p class="club-kicker">{t(month.kickerKey)}</p>
          <h1 class="club-title">{month.title}</h1>
          <p class="club-meta">
            <span>{t('club.closes', { date: t(month.closesKey) })}</span>
          </p>
          <Show
            when={board().length > 0}
            fallback={<p class="club-empty">{t('club.boardEmpty')}</p>}
          >
            <ol class="club-board">
              <For each={board()}>
                {(row, index) => (
                  <li classList={{ 'is-you': row.id === attempt()?.id || row.id === posted()?.id }}>
                    <span class="club-board-rank">{index() + 1}</span>
                    <span class="club-board-name">
                      {row.displayName}
                      <Show when={row.id === attempt()?.id || row.id === posted()?.id}>
                        <span class="club-you">{t('club.you')}</span>
                      </Show>
                    </span>
                    <span class="club-board-score">{row.score}</span>
                  </li>
                )}
              </For>
            </ol>
          </Show>
          <p class="club-local">{t('club.boardLocal')}</p>
          <div class="club-actions">
            <button class="club-secondary" type="button" onClick={() => setScreen('landing')}>
              {t('club.back')}
            </button>
          </div>
        </section>
      </Show>
    </div>
  )
}

function Breakdown(props: { result: ScoreBreakdown }) {
  const rows: { key: 'perfect' | 'good' | 'early' | 'late' | 'miss'; label: string }[] = [
    { key: 'perfect', label: t('club.breakdown.perfect') },
    { key: 'good', label: t('club.breakdown.good') },
    { key: 'early', label: t('club.breakdown.early') },
    { key: 'late', label: t('club.breakdown.late') },
    { key: 'miss', label: t('club.breakdown.miss') },
  ]
  return (
    <>
      <For each={rows}>
        {(row) => {
          const points = props.result.notes
            .filter((note) => note.judgement === row.key)
            .reduce((sum, note) => sum + note.points, 0)
          return (
            <li>
              <span>{row.label}</span>
              <span class="club-count">{props.result.counts[row.key]}</span>
              <span class="club-points">{signed(points)}</span>
            </li>
          )
        }}
      </For>
      <li>
        <span>{t('club.breakdown.extra')}</span>
        <span class="club-count">{props.result.counts.extra}</span>
        <span class="club-points">{signed(-props.result.extraPenalty)}</span>
      </li>
    </>
  )
}
