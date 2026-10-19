import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { encodeTake } from '../../shared/club/assess'
import { isMonthClosed } from '../../shared/club/calendar'
import { APP_NAME } from '../brand'
import {
  bytesToBase64,
  fetchCurrentMonth,
  fetchLeaderboard,
  fetchTake,
  submitAttempt,
} from '../club/api'
import { ClubHud } from '../club/ClubHud'
import { currentMonth } from '../club/month'
import { isClubRemoteEnabled } from '../club/remote'
import type { PlayedNote } from '../club/score'
import { type ScoreBreakdown, scoreTake } from '../club/score'
import {
  accountFrom,
  type ClubAccount,
  finishClerkRedirect,
  loadClerk,
  signInWith,
} from '../club/session'
import { bestScore, clubStorage, placeOf, previewPlace } from '../club/storage'
import { notesForTake } from '../club/take'
import type { ClubAttempt, LeaderboardEntry } from '../club/types'
import { getKeyboardRange } from '../core/keyboardRange'
import { parseMidiFile } from '../core/midi/parser'
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
  | 'signed-out'
  | 'signed-in'
  | 'rank'
  | 'board'
  | 'leaderboard'

const SCREENS: readonly ClubScreen[] = [
  'loading',
  'landing',
  'prerecord',
  'countin',
  'recording',
  'results',
  'submit',
  'signed-out',
  'signed-in',
  'rank',
  'board',
  'leaderboard',
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
  const [remoteOn, setRemoteOn] = createSignal(isClubRemoteEnabled())
  const [remoteUser, setRemoteUser] = createSignal<ClubAccount | null>(null)
  const [closed, setClosed] = createSignal(isClubRemoteEnabled() && isMonthClosed(month.id))
  const [formError, setFormError] = createSignal('')
  const [posting, setPosting] = createSignal(false)
  const [boardTab, setBoardTab] = createSignal<'global' | 'friends'>('global')

  let generation = 0
  let recording = false
  let played: PlayedNote[] = []
  let lastPlayed: PlayedNote[] = []
  let detachClerk: (() => void) | null = null
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
    lastPlayed = played.slice()
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

  const connectRemote = async (): Promise<void> => {
    try {
      await finishClerkRedirect()
      const clerk = await loadClerk()
      if (!clerk) {
        setRemoteOn(false)
        setClosed(false)
        return
      }
      detachClerk = clerk.addListener(() => setRemoteUser(accountFrom(clerk)))
      setRemoteUser(accountFrom(clerk))
      const remoteMonth = await fetchCurrentMonth()
      if (remoteMonth) setClosed(remoteMonth.closed)
    } catch {
      setRemoteOn(false)
      setClosed(false)
    }
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
    if (requested === 'signed-out' || requested === 'signed-in' || requested === 'leaderboard') {
      showSharedPreview(requested)
      return
    }
    if (isScreen(requested)) {
      setScreen(requested)
      if (requested === 'countin' || requested === 'recording') showPiece()
      else hidePiece()
      if (requested === 'countin') setCountBeat(month.beatsPerBar)
      return
    }
    hidePiece()
    if (isClubRemoteEnabled()) void connectRemote()
    const frame = requestAnimationFrame(() => {
      if (generation === 0 && screen() === 'loading') setScreen('landing')
    })
    onCleanup(() => cancelAnimationFrame(frame))
  })

  onCleanup(() => {
    detachClerk?.()
    stopTake()
    services.clock.speed = services.store.state.speed || speedWas
    services.synth.setSpeed(services.store.state.speed || speedWas)
    services.clock.seek(0)
    services.synth.seek(0)
    services.renderer.setVisible(true)
  })

  const openBoard = (): void => {
    hidePiece()
    setBoardTab('global')
    if (remoteOn()) {
      setScreen('leaderboard')
      void loadRemoteBoard()
      return
    }
    refresh()
    setScreen('board')
  }

  const loadRemoteBoard = async (): Promise<void> => {
    const remote = await fetchLeaderboard(month.id)
    if (!remote) {
      refresh()
      setScreen('board')
      return
    }
    setClosed(remote.closed)
    setBoard(remote.entries)
  }

  const replay = async (row: LeaderboardEntry): Promise<void> => {
    if (row.local || row.id.startsWith('preview-')) return
    const buf = await fetchTake(row.id)
    if (!buf) return
    try {
      const midi = await parseMidiFile(buf, 'take.mid')
      services.renderer.setVisible(true)
      services.renderer.loadMidi(midi, 0)
      void services.synth.load(midi)
    } catch {
      // The board stays up when the take cannot be read.
    }
  }

  const showSharedPreview = (kind: 'signed-out' | 'signed-in' | 'leaderboard'): void => {
    setRemoteOn(true)
    setClosed(false)
    setAttempt(previewAttempt(month.id))
    if (kind === 'signed-in') {
      setRemoteUser({
        id: 'user_preview',
        displayName: 'Mara Chen',
        avatarUrl: avatarData('#9C5F2B', 'M'),
        getToken: async () => null,
      })
      setScreen('signed-in')
    } else if (kind === 'signed-out') {
      setRemoteUser(null)
      setScreen('signed-out')
    } else {
      setBoard(previewBoard(month.id))
      setScreen('leaderboard')
    }
    hidePiece()
  }

  const postRemote = async (current: ClubAttempt): Promise<void> => {
    const user = remoteUser()
    if (!user || closed()) return
    setPosting(true)
    setFormError('')
    const token = await user.getToken()
    if (!token) {
      setFormError(t('club.postFailed'))
      setPosting(false)
      return
    }
    const outcome = await submitAttempt({
      token,
      monthId: month.id,
      clientScore: current.score,
      speed: 1,
      takeMidi: bytesToBase64(encodeTake(lastPlayed, month.bpm)),
    })
    setPosting(false)
    if (!outcome.ok) {
      setFormError(failureText(outcome.error))
      return
    }
    const saved = {
      ...current,
      displayName: user.displayName,
      submitted: true,
      score: outcome.serverScore,
    }
    storage.updateAttempt(saved)
    const entry: LeaderboardEntry = {
      id: outcome.id,
      monthId: month.id,
      displayName: user.displayName,
      score: outcome.serverScore,
      createdAt: current.createdAt,
      local: false,
      avatarUrl: user.avatarUrl,
    }
    setPosted(entry)
    setBoard(outcome.board)
    setAttempt(saved)
    setScreen('rank')
  }

  const post = (): void => {
    const current = attempt()
    if (!current) return
    if (remoteOn()) {
      void postRemote(current)
      return
    }
    const displayName = name().trim()
    if (!displayName) return
    storage.saveName(displayName)
    const entry: LeaderboardEntry = {
      id: current.id,
      monthId: month.id,
      displayName,
      score: current.score,
      createdAt: current.createdAt,
      local: true,
      avatarUrl: null,
    }
    const next = storage.submit(entry)
    storage.updateAttempt({ ...current, displayName, submitted: true })
    setPosted(entry)
    setBoard(next)
    setAttempt({ ...current, displayName, submitted: true })
    setScreen('rank')
  }

  const submitMode = (): 'local' | 'signed-out' | 'signed-in' | 'closed' => {
    const view = screen()
    if (view === 'signed-out') return 'signed-out'
    if (view === 'signed-in') return 'signed-in'
    if (!remoteOn()) return 'local'
    if (closed()) return 'closed'
    if (!remoteUser()) return 'signed-out'
    return 'signed-in'
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
      data-auth={remoteOn() ? (remoteUser() ? 'signed-in' : 'signed-out') : 'local'}
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
              onClick={() => {
                if (remoteOn() && closed()) {
                  openBoard()
                  return
                }
                setScreen('submit')
              }}
            >
              {remoteOn() && closed() ? t('club.monthClosed') : t('club.submitBoard')}
            </button>
            <button class="club-secondary" type="button" onClick={() => setScreen('prerecord')}>
              {t('club.recordAgain')}
            </button>
          </div>
        </section>
      </Show>

      <Show
        when={
          (screen() === 'submit' || screen() === 'signed-out' || screen() === 'signed-in') &&
          attempt()
        }
      >
        <section class="club-card">
          <h1 class="club-title">
            {submitMode() === 'signed-out' ? t('club.signInSubmit') : t('club.submitTitle')}
          </h1>
          <p class="club-place">
            {t('club.submitPreview', { score: attempt()?.score ?? 0, n: place().rank })}
          </p>
          <Show when={submitMode() === 'signed-out'}>
            <p class="club-local">{t('club.practiceLocal')}</p>
            <div class="club-actions club-actions--stack">
              <button
                class="club-primary"
                id="club-sign-in-google"
                type="button"
                onClick={() => void signInWith('oauth_google')}
              >
                {t('club.signInGoogle')}
              </button>
              <button
                class="club-secondary"
                id="club-sign-in-apple"
                type="button"
                onClick={() => void signInWith('oauth_apple')}
              >
                {t('club.signInApple')}
              </button>
            </div>
          </Show>
          <Show when={submitMode() === 'signed-in'}>
            <p class="club-signed-in">
              <Show
                when={remoteUser()?.avatarUrl}
                fallback={
                  <span class="club-avatar club-avatar--letter">
                    {(remoteUser()?.displayName ?? 'Y').slice(0, 1)}
                  </span>
                }
              >
                {(url) => <img class="club-avatar" alt="" src={url()} />}
              </Show>
              <span>{t('club.signedInAs', { name: remoteUser()?.displayName ?? '' })}</span>
            </p>
            <p class="club-local">{t('club.practiceLocal')}</p>
            <Show when={formError()}>
              <p class="club-error">{formError()}</p>
            </Show>
            <div class="club-actions">
              <button
                class="club-primary"
                id="club-post"
                type="button"
                disabled={posting()}
                onClick={() => post()}
              >
                {t('club.post')}
              </button>
              <button class="club-secondary" type="button" onClick={() => setScreen('results')}>
                {t('club.notNow')}
              </button>
            </div>
          </Show>
          <Show when={submitMode() === 'closed'}>
            <p class="club-local">{t('club.monthClosed')}</p>
            <div class="club-actions">
              <button class="club-primary" type="button" onClick={openBoard}>
                {t('club.seeBoard')}
              </button>
            </div>
          </Show>
          <Show when={submitMode() === 'local'}>
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
          </Show>
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

      <Show when={screen() === 'leaderboard'}>
        <section class="club-card club-card--board">
          <p class="club-kicker">{t(month.kickerKey)}</p>
          <h1 class="club-title">{month.title}</h1>
          <p class="club-meta">
            <span>
              {closed() ? t('club.finalRanks') : t('club.closes', { date: t(month.closesKey) })}
            </span>
          </p>
          <div class="club-tabs" role="tablist">
            <button
              id="club-tab-global"
              type="button"
              role="tab"
              aria-selected={boardTab() === 'global'}
              onClick={() => setBoardTab('global')}
            >
              {t('club.global')}
            </button>
            <button
              id="club-tab-friends"
              type="button"
              role="tab"
              aria-selected={boardTab() === 'friends'}
              onClick={() => setBoardTab('friends')}
            >
              {t('club.friends')}
            </button>
          </div>
          <Show when={boardTab() === 'global'} fallback={<FriendsEmpty />}>
            <Show
              when={board().length > 0}
              fallback={<p class="club-empty">{t('club.boardEmpty')}</p>}
            >
              <ol class="club-board club-board--shared">
                <For each={board()}>
                  {(row, index) => (
                    <li
                      classList={{ 'is-you': row.id === attempt()?.id || row.id === posted()?.id }}
                    >
                      <span class="club-board-rank">{index() + 1}</span>
                      <Show
                        when={row.avatarUrl}
                        fallback={
                          <span class="club-avatar club-avatar--letter">
                            {row.displayName.slice(0, 1)}
                          </span>
                        }
                      >
                        {(url) => <img class="club-avatar" alt="" src={url()} />}
                      </Show>
                      <span class="club-board-name">
                        {row.displayName}
                        <Show when={row.id === attempt()?.id || row.id === posted()?.id}>
                          <span class="club-you">{t('club.you')}</span>
                        </Show>
                      </span>
                      <span class="club-board-score">{row.score}</span>
                      <button class="club-replay" type="button" onClick={() => void replay(row)}>
                        {t('club.replay')}
                      </button>
                    </li>
                  )}
                </For>
              </ol>
            </Show>
          </Show>
          <p class="club-local">{closed() ? t('club.monthClosed') : t('club.boardShared')}</p>
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

function previewAttempt(monthId: string): ClubAttempt {
  return {
    id: 'preview-2',
    monthId,
    score: 812,
    accuracy: 0.9,
    counts: { perfect: 40, good: 4, early: 2, late: 1, miss: 1, extra: 0 },
    createdAt: Date.parse('2026-10-18T18:00:00Z'),
    displayName: 'Mara Chen',
    submitted: false,
  }
}

function previewBoard(monthId: string): LeaderboardEntry[] {
  return [
    {
      id: 'preview-1',
      monthId,
      displayName: 'Noah Abebe',
      score: 964,
      createdAt: 1,
      local: false,
      avatarUrl: avatarData('#3E6B4F', 'N'),
    },
    {
      id: 'preview-2',
      monthId,
      displayName: 'Mara Chen',
      score: 812,
      createdAt: 2,
      local: false,
      avatarUrl: avatarData('#9C5F2B', 'M'),
    },
    {
      id: 'preview-3',
      monthId,
      displayName: 'Leila Ortiz',
      score: 740,
      createdAt: 3,
      local: false,
      avatarUrl: avatarData('#2C4A6E', 'L'),
    },
  ]
}

function avatarData(color: string, letter: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="${color}"/><text x="32" y="42" text-anchor="middle" font-size="28" fill="#fff" font-family="sans-serif">${letter}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function failureText(error: string): string {
  if (error === 'closed') return t('club.monthClosed')
  if (error === 'rate_limited') return t('club.rateLimited')
  if (error === 'rejected') return t('club.rejected')
  return t('club.postFailed')
}

function FriendsEmpty() {
  // TODO(club-friends): a later phase lists accounts this player follows.
  return <p class="club-empty">{t('club.friendsEmpty')}</p>
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
