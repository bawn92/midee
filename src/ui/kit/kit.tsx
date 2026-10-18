import { createSignal, For, type JSX, Show } from 'solid-js'

export function PlayButton(props: {
  playing: boolean
  disabled?: boolean
  id?: string
  label: string
  onClick: () => void
  children: JSX.Element
}) {
  return (
    <button
      type="button"
      id={props.id}
      class="gh-play btn-play"
      data-playing={props.playing ? 'true' : 'false'}
      data-empty={props.disabled ? 'true' : undefined}
      disabled={props.disabled}
      aria-label={props.label}
      onClick={() => props.onClick()}
    >
      {props.children}
    </button>
  )
}

export function IconButton(props: {
  id?: string
  label: string
  pressed?: boolean
  disabled?: boolean
  class?: string
  onClick: () => void
  children: JSX.Element
}) {
  return (
    <button
      type="button"
      id={props.id}
      class={`gh-icon-btn ${props.class ?? ''}`}
      aria-label={props.label}
      aria-pressed={props.pressed}
      disabled={props.disabled}
      onClick={() => props.onClick()}
    >
      {props.children}
    </button>
  )
}

export function Segmented<T extends string>(props: {
  value: T
  options: readonly { id: T; label: string }[]
  ariaLabel: string
  hand?: 'left' | 'right' | 'both'
  onChange: (id: T) => void
}) {
  return (
    <fieldset class="gh-seg" aria-label={props.ariaLabel} data-hand={props.hand}>
      <For each={props.options}>
        {(option) => (
          <button
            type="button"
            class="gh-seg-btn"
            aria-pressed={props.value === option.id}
            onClick={() => props.onChange(option.id)}
          >
            {option.label}
          </button>
        )}
      </For>
    </fieldset>
  )
}

export function Chip(props: {
  current?: boolean
  next?: boolean
  class?: string
  children: JSX.Element
}) {
  return (
    <span
      class={`gh-chip ${props.class ?? ''}`}
      classList={{
        'gh-chip--current': !!props.current,
        'gh-chip--next': !!props.next && !props.current,
        'song-guide-chip--on': !!props.current,
      }}
    >
      {props.children}
    </span>
  )
}

export function Slider(props: {
  min: number
  max: number
  step: number
  value: number
  label: string
  onInput: (value: number) => void
}) {
  const pct = () => `${((props.value - props.min) / (props.max - props.min)) * 100}%`
  return (
    <input
      class="gh-slider"
      type="range"
      min={props.min}
      max={props.max}
      step={props.step}
      value={props.value}
      aria-label={props.label}
      style={{ '--pct': pct() }}
      onInput={(e) => props.onInput(Number(e.currentTarget.value))}
    />
  )
}

export function Stepper(props: {
  value: string
  decLabel: string
  incLabel: string
  decDisabled?: boolean
  incDisabled?: boolean
  onDec: () => void
  onInc: () => void
}) {
  return (
    <span class="gh-stepper">
      <button
        type="button"
        class="gh-step"
        aria-label={props.decLabel}
        disabled={props.decDisabled}
        onClick={() => props.onDec()}
      >
        −
      </button>
      <span class="gh-number">{props.value}</span>
      <button
        type="button"
        class="gh-step"
        aria-label={props.incLabel}
        disabled={props.incDisabled}
        onClick={() => props.onInc()}
      >
        +
      </button>
    </span>
  )
}

export function Toggle(props: {
  id?: string
  pressed: boolean
  label: string
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      id={props.id}
      class="gh-toggle"
      aria-label={props.label}
      aria-pressed={props.pressed}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.pressed)}
    />
  )
}

export function Badge(props: { tone: 'ok' | 'warn'; id?: string; children: JSX.Element }) {
  return (
    <span id={props.id} class={`gh-badge gh-badge--${props.tone}`} role="status">
      {props.children}
    </span>
  )
}

export function Dropdown(props: {
  label: string
  value: string
  options: readonly { id: string; label: string }[]
  onChange: (id: string) => void
}) {
  const [open, setOpen] = createSignal(false)
  return (
    <div class="gh-dropdown">
      <button
        type="button"
        class="gh-dropdown-trigger"
        aria-expanded={open()}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{props.label}</span>
        <span aria-hidden="true">▾</span>
      </button>
      <Show when={open()}>
        <div class="gh-menu" role="listbox">
          <For each={props.options}>
            {(option) => (
              <button
                type="button"
                class="gh-menu-item"
                role="option"
                aria-selected={option.id === props.value}
                onClick={() => {
                  props.onChange(option.id)
                  setOpen(false)
                }}
              >
                {option.label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
