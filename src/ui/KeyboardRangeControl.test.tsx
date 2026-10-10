import { afterEach, describe, expect, it } from 'vitest'
import {
  getKeyboardRange,
  KEYBOARD_RANGE_STORAGE_KEY,
  reloadKeyboardRange,
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
    expect(getKeyboardRange()).toMatchObject({ start: 53, size: 24 })
    expect(root.querySelector('.kbd-range-notes')!.textContent).toBe('F3–E5')

    host.querySelector<HTMLButtonElement>('#kbd-range-up')!.click()
    expect(getKeyboardRange().start).toBe(54)
    expect(root.querySelector('.kbd-range-notes')!.textContent).toBe('F#3–F5')

    host.querySelector<HTMLButtonElement>('#kbd-range-oct-up')!.click()
    expect(getKeyboardRange().start).toBe(66)

    host.querySelector<HTMLButtonElement>('.kbd-range-follow')!.click()
    expect(getKeyboardRange().followMidi).toBe(true)

    reloadKeyboardRange()
    expect(getKeyboardRange()).toMatchObject({ start: 66, size: 24, followMidi: true })
  })

  it('hides on the home screen', () => {
    mount('home')
    expect(host.querySelector('#kbd-range')!.classList.contains('kbd-range--hidden')).toBe(true)
  })
})
