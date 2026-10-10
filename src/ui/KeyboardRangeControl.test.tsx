import { afterEach, describe, expect, it } from 'vitest'
import {
  getKeyboardRange,
  isControllerCalibrateArmed,
  KEYBOARD_RANGE_STORAGE_KEY,
  reloadKeyboardRange,
  setControllerCalibrateArmed,
} from '../core/keyboardRange'
import { createAppStore } from '../store/state'
import { KeyboardRangeControl } from './KeyboardRangeControl'

describe('KeyboardRangeControl', () => {
  let control: KeyboardRangeControl
  let host: HTMLDivElement

  afterEach(() => {
    control.dispose()
    host.remove()
    localStorage.removeItem(KEYBOARD_RANGE_STORAGE_KEY)
    reloadKeyboardRange()
    setControllerCalibrateArmed(false)
  })

  function mount(mode: 'play' | 'home' = 'play'): void {
    const store = createAppStore()
    store.setState('mode', mode)
    host = document.createElement('div')
    document.body.append(host)
    control = new KeyboardRangeControl(host, store)
  }

  it('shifts and resizes the range from the bar and the panel, and saves it', () => {
    mount()
    const root = host.querySelector<HTMLElement>('#kbd-range')!
    expect(root.classList.contains('kbd-range--hidden')).toBe(false)
    expect(root.querySelector('.kbd-range-notes')!.textContent).toBe('A0–C8')
    expect((host.querySelector('#kbd-range-oct-down') as HTMLButtonElement).disabled).toBe(true)

    host.querySelector<HTMLButtonElement>('#kbd-range-label')!.click()
    const preset = [...host.querySelectorAll<HTMLButtonElement>('.kbd-range-preset')].find(
      (b) => b.textContent === '24',
    )!
    preset.click()
    // 24 keys snap to C. The middle of the piano lands on C3.
    expect(getKeyboardRange()).toMatchObject({ start: 48, size: 24 })
    expect(root.querySelector('.kbd-range-notes')!.textContent).toBe('C3–B4')

    host.querySelector<HTMLButtonElement>('#kbd-range-up')!.click()
    expect(getKeyboardRange().start).toBe(49)
    expect(root.querySelector('.kbd-range-notes')!.textContent).toBe('C#3–C5')

    host.querySelector<HTMLButtonElement>('#kbd-range-oct-up')!.click()
    expect(getKeyboardRange().start).toBe(61)

    host.querySelector<HTMLButtonElement>('#kbd-range-follow')!.click()
    expect(getKeyboardRange().followMidi).toBe(true)

    reloadKeyboardRange()
    expect(getKeyboardRange()).toMatchObject({ start: 61, size: 24, followMidi: true })
  })

  it('drags, jumps, and resizes the piano overview', () => {
    mount()
    host.querySelector<HTMLButtonElement>('#kbd-range-label')!.click()
    const preset = [...host.querySelectorAll<HTMLButtonElement>('.kbd-range-preset')].find(
      (b) => b.textContent === '24',
    )!
    preset.click()

    const picker = host.querySelector<HTMLElement>('.kbd-range-picker')!
    picker.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 880,
        bottom: 48,
        width: 880,
        height: 48,
        toJSON: () => ({}),
      }) as DOMRect

    const point = (pitch: number) => (pitch - 21) * 10 + 5
    // jsdom does not implement PointerEvent. A mouse event with the pointer
    // fields is enough for the handler, including a touch-typed drag.
    const fire = (type: string, target: Element, clientX: number, pointerType = 'mouse') => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, button: 0 })
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        pointerType: { value: pointerType },
      })
      target.dispatchEvent(event)
    }

    // Click a key outside the window: the highlight jumps, then snaps to C.
    fire('pointerdown', picker, point(90))
    fire('pointerup', picker, point(90))
    expect(getKeyboardRange()).toMatchObject({ start: 84, size: 24 })

    // Drag the window body. Touch uses the same pointer path. The landing snaps to C.
    const windowEl = host.querySelector<HTMLElement>('.kbd-range-window')!
    fire('pointerdown', windowEl, point(79), 'touch')
    fire('pointermove', picker, point(70), 'touch')
    fire('pointerup', picker, point(70), 'touch')
    expect(getKeyboardRange()).toMatchObject({ start: 72, size: 24 })

    // Drag the right edge to add keys. The low key stays on C.
    const endHandle = host.querySelector<HTMLElement>('.kbd-range-handle--end')!
    fire('pointerdown', endHandle, point(93))
    fire('pointermove', picker, point(100))
    fire('pointerup', picker, point(100))
    expect(getKeyboardRange()).toMatchObject({ start: 72, size: 29 })

    // Arrow keys fine-tune by a semitone and do not snap back to C.
    windowEl.focus()
    windowEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(getKeyboardRange().start).toBe(73)

    reloadKeyboardRange()
    expect(getKeyboardRange()).toMatchObject({ start: 73, size: 29 })
  })

  it('arms calibration until the lowest key is pressed', () => {
    mount()
    host.querySelector<HTMLButtonElement>('#kbd-range-label')!.click()
    const button = host.querySelector<HTMLButtonElement>('#kbd-range-calibrate')!
    expect(isControllerCalibrateArmed()).toBe(false)
    button.click()
    expect(isControllerCalibrateArmed()).toBe(true)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    button.click()
    expect(isControllerCalibrateArmed()).toBe(false)
  })

  it('fits notes into the range unless the toggle is turned off', () => {
    mount()
    host.querySelector<HTMLButtonElement>('#kbd-range-label')!.click()
    const fit = host.querySelector<HTMLButtonElement>('#kbd-range-fit')!
    expect(fit.getAttribute('aria-pressed')).toBe('true')
    expect(getKeyboardRange().fitToRange).toBe(true)
    fit.click()
    expect(fit.getAttribute('aria-pressed')).toBe('false')
    expect(getKeyboardRange().fitToRange).toBe(false)
  })

  it('hides on the home screen', () => {
    mount('home')
    expect(host.querySelector('#kbd-range')!.classList.contains('kbd-range--hidden')).toBe(true)
  })
})
