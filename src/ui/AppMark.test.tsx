import { render } from '@solidjs/testing-library'
import { describe, expect, it } from 'vitest'
import { AppMark } from './AppMark'

describe('AppMark', () => {
  it('keeps the Golden Hour mark and stacks the Rainy Study tile on it', () => {
    const view = render(() => <AppMark />)
    const golden = view.container.querySelector('.app-mark__golden svg')
    expect(golden?.getAttribute('class')).toContain('ts-home-mark')
    expect(golden?.innerHTML).toContain('#F6E0C2')
    const rainy = view.container.querySelector('.app-mark__rainy')
    expect(rainy?.getAttribute('src')).toBe('/icons/rainy/header-mark.svg')
    expect(rainy?.getAttribute('alt')).toBe('')
    expect(view.container.innerHTML.toLowerCase()).not.toContain('techno')
    view.unmount()
  })

  it('marks the landing hero copy of the same stack', () => {
    const view = render(() => <AppMark variant="landing" />)
    expect(view.container.querySelector('.app-mark')?.classList.contains('landing-mark')).toBe(true)
    view.unmount()
  })
})
