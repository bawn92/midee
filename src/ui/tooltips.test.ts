import { afterEach, describe, expect, it } from 'vitest'
import { installTooltips } from './tooltips'

describe('tooltip portal', () => {
  let dispose: (() => void) | null = null

  afterEach(() => {
    dispose?.()
    dispose = null
    document.body.innerHTML = ''
  })

  it('renders the bubble on the overlay root, outside the control', () => {
    const card = document.createElement('div')
    card.id = 'hud'
    card.className = 'float-hud'
    const button = document.createElement('button')
    button.setAttribute('data-tip', 'Play')
    button.textContent = 'Play'
    card.appendChild(button)
    document.body.appendChild(card)
    button.getBoundingClientRect = () =>
      ({
        top: 18,
        left: 640,
        width: 80,
        height: 36,
        right: 720,
        bottom: 54,
        x: 640,
        y: 18,
        toJSON: () => ({}),
      }) as DOMRect

    dispose = installTooltips()
    button.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))

    const tip = document.getElementById('tip-bubble')
    expect(tip).not.toBeNull()
    expect(tip?.textContent).toBe('Play')
    expect(tip?.hidden).toBe(false)
    expect(tip?.parentElement?.id).toBe('overlay-root')
    expect(tip?.style.maxWidth).toBe('')
    expect(card.contains(tip)).toBe(false)
    expect(document.body.lastElementChild?.id).toBe('overlay-root')
  })

  it('shows the innermost tip when one control sits inside another', () => {
    const outer = document.createElement('div')
    outer.setAttribute('data-tip', 'Group')
    const inner = document.createElement('button')
    inner.setAttribute('data-tip', 'Mute')
    outer.appendChild(inner)
    document.body.appendChild(outer)

    dispose = installTooltips()
    inner.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))

    expect(document.getElementById('tip-bubble')?.textContent).toBe('Mute')
  })
})
