// Places a floating layer (tooltip, menu, popover) so it stays in the viewport
// and outside the header, transport, and keyboard. Callers render the result
// in a top-level portal; this function only does the geometry.

export interface Rect {
  top: number
  left: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export type FloatingSide = 'below' | 'above' | 'right' | 'left'

export interface FloatingPlacement {
  top: number
  left: number
  side: FloatingSide
  maxWidth: number
  maxHeight: number
}

const GAP = 8
const MARGIN = 8
const SIDES: readonly FloatingSide[] = ['below', 'above', 'right', 'left']

function intersects(a: Rect, b: Rect): boolean {
  return (
    a.left < b.left + b.width - 0.5 &&
    a.left + a.width > b.left + 0.5 &&
    a.top < b.top + b.height - 0.5 &&
    a.top + a.height > b.top + 0.5
  )
}

function overlapArea(a: Rect, b: Rect): number {
  const width = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left))
  const height = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top))
  return width * height
}

function clampStart(start: number, size: number, limit: number): number {
  const room = limit - MARGIN * 2
  if (size >= room) return MARGIN
  return Math.min(Math.max(start, MARGIN), limit - MARGIN - size)
}

function overlapsX(left: number, width: number, obstacle: Rect): boolean {
  return left < obstacle.left + obstacle.width - 0.5 && left + width > obstacle.left + 0.5
}

function overlapsY(top: number, height: number, obstacle: Rect): boolean {
  return top < obstacle.top + obstacle.height - 0.5 && top + height > obstacle.top + 0.5
}

function pushBelow(
  top: number,
  left: number,
  width: number,
  height: number,
  obstacles: readonly Rect[],
  viewportHeight: number,
): number {
  let edge = top
  const floor = viewportHeight - MARGIN - 48
  for (let guard = 0; guard < obstacles.length + 1; guard++) {
    const rect = { top: edge, left, width, height: Math.min(height, viewportHeight - edge) }
    const hit = obstacles.find(
      (obstacle) => intersects(rect, obstacle) && obstacle.top + obstacle.height > edge,
    )
    if (!hit) break
    const next = hit.top + hit.height + GAP
    if (next > floor) break
    edge = next
  }
  return edge
}

function pushAbove(
  bottom: number,
  left: number,
  width: number,
  height: number,
  obstacles: readonly Rect[],
): number {
  let edge = bottom
  for (let guard = 0; guard < obstacles.length + 1; guard++) {
    const top = edge - height
    const rect = { top, left, width, height }
    const hit = obstacles.find((obstacle) => intersects(rect, obstacle) && obstacle.top < edge)
    if (!hit) break
    const next = hit.top - GAP
    if (next < MARGIN + 48) break
    edge = next
  }
  return edge
}

function roomBelow(
  top: number,
  left: number,
  width: number,
  obstacles: readonly Rect[],
  viewportHeight: number,
): number {
  let limit = viewportHeight - MARGIN
  for (const obstacle of obstacles) {
    if (!overlapsX(left, width, obstacle)) continue
    if (obstacle.top >= top - 0.5 && obstacle.top < limit) limit = obstacle.top - GAP
  }
  return Math.max(0, limit - top)
}

function roomAbove(
  bottom: number,
  left: number,
  width: number,
  obstacles: readonly Rect[],
): number {
  let limit = MARGIN
  for (const obstacle of obstacles) {
    if (!overlapsX(left, width, obstacle)) continue
    const obstacleBottom = obstacle.top + obstacle.height
    if (obstacleBottom <= bottom + 0.5 && obstacleBottom > limit) limit = obstacleBottom + GAP
  }
  return Math.max(0, bottom - limit)
}

function placeOnSide(
  side: FloatingSide,
  anchor: Rect,
  size: Size,
  viewport: Size,
  obstacles: readonly Rect[],
): FloatingPlacement {
  const maxWidth = Math.max(0, viewport.width - MARGIN * 2)
  const width = Math.min(size.width, maxWidth)
  if (side === 'below' || side === 'above') {
    const left = clampStart(anchor.left + anchor.width / 2 - width / 2, width, viewport.width)
    if (side === 'below') {
      const top = pushBelow(
        anchor.top + anchor.height + GAP,
        left,
        width,
        size.height,
        obstacles,
        viewport.height,
      )
      return {
        top,
        left,
        side,
        maxWidth: width,
        maxHeight: roomBelow(top, left, width, obstacles, viewport.height),
      }
    }
    const bottom = pushAbove(anchor.top - GAP, left, width, size.height, obstacles)
    const maxHeight = roomAbove(bottom, left, width, obstacles)
    const height = Math.min(size.height, maxHeight)
    return {
      top: bottom - height,
      left,
      side,
      maxWidth: width,
      maxHeight,
    }
  }

  const maxHeight = Math.max(0, viewport.height - MARGIN * 2)
  const height = Math.min(size.height, maxHeight)
  const top = clampStart(anchor.top + anchor.height / 2 - height / 2, height, viewport.height)
  if (side === 'right') {
    let left = anchor.left + anchor.width + GAP
    for (let guard = 0; guard < obstacles.length + 1; guard++) {
      const rect = { top, left, width, height }
      const hit = obstacles.find((obstacle) => intersects(rect, obstacle))
      if (!hit) break
      const next = hit.left + hit.width + GAP
      if (next > viewport.width - MARGIN - 48) break
      left = next
    }
    left = clampStart(left, width, viewport.width)
    return {
      top,
      left,
      side,
      maxWidth: roomRight(left, top, height, obstacles, viewport.width),
      maxHeight: height,
    }
  }
  let right = anchor.left - GAP
  for (let guard = 0; guard < obstacles.length + 1; guard++) {
    const left = right - width
    const rect = { top, left, width, height }
    const hit = obstacles.find((obstacle) => intersects(rect, obstacle))
    if (!hit) break
    const next = hit.left - GAP
    if (next < MARGIN + 48) break
    right = next
  }
  const maxW = Math.max(0, right - MARGIN)
  const used = Math.min(width, maxW)
  return { top, left: right - used, side, maxWidth: used, maxHeight: height }
}

function roomRight(
  left: number,
  top: number,
  height: number,
  obstacles: readonly Rect[],
  viewportWidth: number,
): number {
  let limit = viewportWidth - MARGIN
  for (const obstacle of obstacles) {
    if (!overlapsY(top, height, obstacle)) continue
    if (obstacle.left >= left - 0.5 && obstacle.left < limit) limit = obstacle.left - GAP
  }
  return Math.max(0, limit - left)
}

function scoreOf(
  placement: FloatingPlacement,
  size: Size,
  viewport: Size,
  obstacles: readonly Rect[],
): number {
  const width = Math.min(size.width, placement.maxWidth)
  const height = Math.min(size.height, placement.maxHeight)
  const rect = { top: placement.top, left: placement.left, width, height }
  const clipped =
    (placement.maxWidth + 0.5 < size.width ? 1 : 0) +
    (placement.maxHeight + 0.5 < size.height ? 1 : 0)
  const overlap = obstacles.reduce((sum, obstacle) => sum + overlapArea(rect, obstacle), 0)
  const overflowX =
    Math.max(0, MARGIN - rect.left) +
    Math.max(0, rect.left + rect.width - (viewport.width - MARGIN))
  const overflowY =
    Math.max(0, MARGIN - rect.top) +
    Math.max(0, rect.top + rect.height - (viewport.height - MARGIN))
  return clipped * 1e9 + overlap * 1e6 + overflowX + overflowY
}

export function placeFloating(
  anchor: Rect,
  size: Size,
  viewport: Size,
  obstacles: readonly Rect[] = [],
): FloatingPlacement {
  let best = placeOnSide('below', anchor, size, viewport, obstacles)
  let bestScore = scoreOf(best, size, viewport, obstacles)
  if (bestScore === 0) return best
  for (const side of SIDES.slice(1)) {
    const placement = placeOnSide(side, anchor, size, viewport, obstacles)
    const score = scoreOf(placement, size, viewport, obstacles)
    if (score < bestScore) {
      best = placement
      bestScore = score
    }
    if (bestScore === 0) break
  }
  return best
}

export function collectObstacles(): Rect[] {
  const seen = new Set<Element>()
  const boxes: Rect[] = []
  const add = (element: Element | null): void => {
    if (!element || seen.has(element)) return
    seen.add(element)
    const style = getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden') return
    if (Number(style.opacity) === 0) return
    const rect = element.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    boxes.push({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
  }
  add(document.getElementById('top-strip'))
  for (const hud of document.querySelectorAll('.float-hud')) add(hud)
  const keyboard = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--keyboard-h'),
  )
  if (Number.isFinite(keyboard) && keyboard > 0) {
    boxes.push({
      top: window.innerHeight - keyboard,
      left: 0,
      width: window.innerWidth,
      height: keyboard,
    })
  }
  return boxes
}

export function placeLayer(anchor: DOMRect | Rect, size: Size): FloatingPlacement {
  return placeFloating(
    { top: anchor.top, left: anchor.left, width: anchor.width, height: anchor.height },
    size,
    { width: window.innerWidth, height: window.innerHeight },
    collectObstacles(),
  )
}
