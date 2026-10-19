import { overlayRoot } from './overlayRoot'
import { collectObstacles, placeFloating } from './placeFloating'

// One bubble for every [data-tip]. The bubble is portaled, so it paints above
// cards and pills, and it flips or shifts to stay in the viewport and clear
// of the header, the transport, and the keyboard.

const TIP_ID = 'tip-bubble'

function tipTarget(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null
  const host = node.closest('[data-tip]')
  if (!(host instanceof HTMLElement)) return null
  if (!host.getAttribute('data-tip')?.trim()) return null
  if (!host.isConnected) return null
  const style = getComputedStyle(host)
  if (style.display === 'none' || style.visibility === 'hidden') return null
  return host
}

export function installTooltips(): () => void {
  const tip = document.createElement('div')
  tip.id = TIP_ID
  tip.className = 'tip-bubble'
  tip.setAttribute('role', 'tooltip')
  tip.hidden = true
  overlayRoot().appendChild(tip)

  let anchor: HTMLElement | null = null
  let previousDescribed: string | null = null
  let frame = 0
  let touchHide = 0

  const restore = (): void => {
    if (!anchor) return
    if (previousDescribed === null) anchor.removeAttribute('aria-describedby')
    else anchor.setAttribute('aria-describedby', previousDescribed)
    previousDescribed = null
    anchor = null
  }

  const hide = (): void => {
    window.clearTimeout(touchHide)
    cancelAnimationFrame(frame)
    frame = 0
    tip.hidden = true
    tip.textContent = ''
    restore()
  }

  const position = (): void => {
    if (!anchor) return
    const text = anchor.getAttribute('data-tip')?.trim() ?? ''
    if (!text || !anchor.isConnected) {
      hide()
      return
    }
    if (tip.textContent !== text) tip.textContent = text
    tip.hidden = false
    const rect = anchor.getBoundingClientRect()
    const placed = placeFloating(
      { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      { width: tip.offsetWidth, height: tip.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      collectObstacles(),
    )
    tip.style.top = `${Math.round(placed.top)}px`
    tip.style.left = `${Math.round(placed.left)}px`
    tip.dataset.side = placed.side
  }

  const tick = (): void => {
    position()
    if (anchor) frame = requestAnimationFrame(tick)
  }

  const show = (el: HTMLElement): void => {
    if (anchor === el && !tip.hidden) return
    hide()
    anchor = el
    previousDescribed = el.getAttribute('aria-describedby')
    el.setAttribute('aria-describedby', TIP_ID)
    position()
    frame = requestAnimationFrame(tick)
  }

  const onOver = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return
    const el = tipTarget(event.target)
    if (!el) return
    show(el)
  }

  const onOut = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return
    if (!anchor) return
    const next = event.relatedTarget
    if (next instanceof Node && anchor.contains(next)) return
    if (tipTarget(next) === anchor) return
    hide()
  }

  const onDown = (event: PointerEvent): void => {
    const el = tipTarget(event.target)
    if (event.pointerType === 'touch') {
      if (el) show(el)
      return
    }
    hide()
  }

  const onUp = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch') return
    window.clearTimeout(touchHide)
    touchHide = window.setTimeout(hide, 700)
  }

  const onFocus = (event: FocusEvent): void => {
    const el = tipTarget(event.target)
    if (!el?.matches(':focus-visible')) return
    show(el)
  }

  const onBlur = (event: FocusEvent): void => {
    if (event.target === anchor) hide()
  }

  document.addEventListener('pointerover', onOver)
  document.addEventListener('pointerout', onOut)
  document.addEventListener('pointerdown', onDown)
  document.addEventListener('pointerup', onUp)
  document.addEventListener('pointercancel', onUp)
  document.addEventListener('focusin', onFocus)
  document.addEventListener('focusout', onBlur)

  return () => {
    hide()
    tip.remove()
    document.removeEventListener('pointerover', onOver)
    document.removeEventListener('pointerout', onOut)
    document.removeEventListener('pointerdown', onDown)
    document.removeEventListener('pointerup', onUp)
    document.removeEventListener('pointercancel', onUp)
    document.removeEventListener('focusin', onFocus)
    document.removeEventListener('focusout', onBlur)
  }
}
