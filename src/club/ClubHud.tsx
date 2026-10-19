import { createEffect, onCleanup, onMount } from 'solid-js'
import { t } from '../i18n'
import { prefersReducedMotion } from '../ui/viewTransition'
import { type JudgementName, paceFor, type ScoreBreakdown } from './score'

const RING = 207.3

function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds)
  const mins = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
}

function Odometer(props: { value: number }) {
  let host: HTMLDivElement | undefined
  const columns: HTMLDivElement[] = []
  let frame = 0
  let shown = 0
  let started = 0

  const paint = (px: number): void => {
    const height = columns[0]?.querySelector('span')?.clientHeight || 56
    const reduced = prefersReducedMotion()
    for (let place = 0; place < 4; place++) {
      const column = columns[place]
      if (!column) continue
      const unit = 10 ** place
      const digit = Math.floor(px / unit) % 10
      const remainder = px % unit
      let fraction = place === 0 ? px % 1 : Math.max(0, Math.min(1, remainder - (unit - 1)))
      if (reduced) fraction = 0
      column.style.transform = `translateY(${-(digit + fraction) * height}px)`
      column.style.display = place > 0 && px < unit ? 'none' : 'flex'
    }
    if (host) host.setAttribute('aria-label', `${t('club.score')} ${Math.round(px)}`)
  }

  onMount(() => {
    if (!host) return
    for (let place = 3; place >= 0; place--) {
      const column = document.createElement('div')
      column.className = 'club-odo-col'
      for (let digit = 0; digit <= 10; digit++) {
        const cell = document.createElement('span')
        cell.textContent = String(digit % 10)
        column.appendChild(cell)
      }
      host.appendChild(column)
      columns[place] = column
    }
    paint(0)
  })

  createEffect(() => {
    const next = props.value
    cancelAnimationFrame(frame)
    if (prefersReducedMotion()) {
      shown = next
      paint(next)
      return
    }
    const begin = shown
    started = performance.now()
    const step = (now: number): void => {
      const k = Math.min(1, (now - started) / 240)
      const eased = 1 - (1 - k) ** 3
      const value = begin + (next - begin) * eased
      shown = value
      paint(value)
      if (k < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
  })

  onCleanup(() => cancelAnimationFrame(frame))

  return <div class="club-odo" ref={host} />
}

function judgementLabel(name: JudgementName | 'ready', deltaMs: number | null): string {
  const ms = Math.abs(Math.round(deltaMs ?? 0))
  if (name === 'ready') return t('club.judge.ready')
  if (name === 'perfect') return t('club.judge.perfect')
  if (name === 'good') return t('club.judge.good')
  if (name === 'early') return t('club.judge.early', { ms })
  if (name === 'late') return t('club.judge.late', { ms })
  return t('club.judge.miss')
}

export function ClubHud(props: {
  breakdown: ScoreBreakdown
  elapsed: number
  duration: number
  take: number
  title: string
}) {
  const last = () => props.breakdown.notes[props.breakdown.notes.length - 1]
  const age = () => {
    const note = last()
    return note ? Math.max(0, props.elapsed - note.judgedAt) : 1
  }
  const reduced = () => prefersReducedMotion()
  const pace = () => paceFor(props.breakdown.score, props.breakdown.judged, props.breakdown.total)
  const ticks = () =>
    props.breakdown.notes
      .filter((note) => note.deltaMs != null && note.hit === 1)
      .slice(-10)
      .reverse()
  const average = () => {
    const timed = props.breakdown.notes.filter((note) => note.deltaMs != null && note.hit === 1)
    if (timed.length === 0) return null
    const sum = timed.reduce((total, note) => total + (note.deltaMs ?? 0), 0)
    return sum / timed.length
  }
  const progress = () =>
    props.duration > 0 ? Math.max(0, Math.min(1, props.elapsed / props.duration)) : 0

  return (
    <>
      <div class="club-recbar">
        <span class="club-dot" aria-hidden="true" />
        <span>{t('club.recording', { n: props.take })}</span>
        <span class="club-rec-title">{props.title}</span>
        <span class="club-pill">{t('club.locked')}</span>
        <span class="club-pill club-pill--wide">{t('club.liveMidi')}</span>
      </div>
      <div class="club-progress">
        <span>{formatClock(props.elapsed)}</span>
        <span class="club-track" aria-hidden="true">
          <span class="club-track-fill" style={{ width: `${progress() * 100}%` }} />
        </span>
        <span>{formatClock(props.duration)}</span>
      </div>
      <aside class="club-hud" aria-label={t('club.score')}>
        <div class="club-hud-row">
          <div>
            <div class="club-cap">{t('club.score')}</div>
            <div class="club-score-line">
              <Odometer value={props.breakdown.score} />
              <span
                class="club-delta"
                classList={{ 'is-miss': !last() || last()?.hit !== 1 }}
                style={{
                  opacity: !last()
                    ? 0
                    : reduced()
                      ? age() < 0.8
                        ? 1
                        : 0
                      : Math.max(0, 1 - age() / 0.8),
                  transform: reduced() ? 'none' : `translateY(${-Math.min(age(), 0.8) * 14}px)`,
                }}
              >
                {last()?.hit === 1 ? `+${Math.max(1, Math.round(last()?.points ?? 0))}` : '+0'}
              </span>
            </div>
            <div class="club-sub">
              {pace() == null
                ? t('club.paceWait')
                : t('club.pace', { score: Math.max(0, Math.min(1000, pace() ?? 0)) })}
            </div>
          </div>
          <div class="club-ring">
            <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
              <circle
                cx="38"
                cy="38"
                r="33"
                fill="none"
                stroke="var(--border-strong)"
                stroke-width="6"
                opacity="0.55"
              />
              <circle
                cx="38"
                cy="38"
                r="33"
                fill="none"
                stroke="var(--success)"
                stroke-width="6"
                stroke-linecap="round"
                stroke-dasharray={String(RING)}
                stroke-dashoffset={String(RING * (1 - props.breakdown.accuracy))}
                transform="rotate(-90 38 38)"
              />
            </svg>
            <div class="club-ring-label">
              <span>
                {props.breakdown.judged > 0
                  ? `${Math.round(props.breakdown.accuracy * 100)}%`
                  : '—'}
              </span>
              <small>{t('club.accuracy')}</small>
            </div>
          </div>
        </div>
        <div class="club-hud-row">
          <div class="club-streak">
            <b>{props.breakdown.streak}</b>
            <span>{t('club.streakLabel')}</span>
          </div>
          <span
            class="club-judge"
            data-judge={last()?.judgement ?? 'ready'}
            style={{
              transform: reduced() ? 'none' : `scale(${1 + 0.08 * Math.max(0, 1 - age() / 0.18)})`,
            }}
          >
            <i />
            <span>{judgementLabel(last()?.judgement ?? 'ready', last()?.deltaMs ?? null)}</span>
          </span>
        </div>
        <div class="club-meter-wrap">
          <div class="club-meter-labels">
            <span>{t('club.early')}</span>
            <span>
              {average() == null
                ? t('club.timing')
                : t('club.timingAvg', {
                    ms: Math.abs(Math.round(average() ?? 0)),
                    dir: (average() ?? 0) >= 0 ? t('club.dir.late') : t('club.dir.early'),
                  })}
            </span>
            <span>{t('club.late')}</span>
          </div>
          <div class="club-meter">
            <span class="club-meter-window" />
            <span class="club-meter-good" />
            <span class="club-meter-perfect" />
            <span class="club-meter-zero" />
            {ticks().map((note, index) => (
              <span
                class="club-tick"
                style={{
                  left: `${Math.max(0, Math.min(100, 50 + ((note.deltaMs ?? 0) / 200) * 50))}%`,
                  opacity: index === 0 ? 1 : Math.max(0.15, 0.8 - index * 0.08),
                  height: index === 0 ? '18px' : '12px',
                  top: index === 0 ? '2px' : '5px',
                }}
              />
            ))}
          </div>
          <div class="club-legend">
            <span>{t('club.legendPerfect')}</span>
            <span>{t('club.legendGood')}</span>
          </div>
        </div>
      </aside>
    </>
  )
}
