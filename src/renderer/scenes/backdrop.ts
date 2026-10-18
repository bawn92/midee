import type { Scene } from './types'

// Painted once per resize into a canvas texture. Leaves are drawn, not
// shipped as image files, so a new scene can swap the palette without assets.
export function paintSceneBackdrop(
  canvas: HTMLCanvasElement,
  scene: Scene,
  width: number,
  height: number,
): void {
  const w = Math.max(2, width)
  const h = Math.max(2, height)
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  if (scene.token === 'golden-hour') {
    // 212deg, matching the Screens page: warm at the top-right, deeper at the bottom-left.
    const angle = (212 * Math.PI) / 180
    const dx = Math.sin(angle)
    const dy = -Math.cos(angle)
    const len = Math.abs(w * dx) + Math.abs(h * dy)
    const wash = ctx.createLinearGradient(
      w / 2 - (dx * len) / 2,
      h / 2 - (dy * len) / 2,
      w / 2 + (dx * len) / 2,
      h / 2 + (dy * len) / 2,
    )
    wash.addColorStop(0, scene.background.top)
    wash.addColorStop(0.167, scene.background.top)
    wash.addColorStop(0.833, scene.background.bottom)
    wash.addColorStop(1, scene.background.bottom)
    ctx.fillStyle = wash
    ctx.fillRect(0, 0, w, h)
  } else {
    const wash = ctx.createLinearGradient(0, 0, w * 0.15, h)
    wash.addColorStop(0, scene.background.top)
    wash.addColorStop(0.42, scene.background.mid)
    wash.addColorStop(1, scene.background.bottom)
    ctx.fillStyle = wash
    ctx.fillRect(0, 0, w, h)

    const bloom = ctx.createRadialGradient(w * 0.46, h * 0.4, 24, w * 0.5, h * 0.46, w * 0.48)
    bloom.addColorStop(0, 'rgba(255, 236, 196, 0.62)')
    bloom.addColorStop(0.42, 'rgba(255, 210, 150, 0.22)')
    bloom.addColorStop(1, 'rgba(255, 210, 150, 0)')
    ctx.fillStyle = bloom
    ctx.fillRect(0, 0, w, h)
  }

  if (scene.background.decor === 'window-leaf') paintLeafShadow(ctx, w, h)

  const vignette = ctx.createRadialGradient(
    w * 0.5,
    h * 0.42,
    w * 0.28,
    w * 0.5,
    h * 0.45,
    w * 0.78,
  )
  vignette.addColorStop(0, 'rgba(255, 244, 226, 0)')
  const edge = scene.token === 'golden-hour' ? 'rgba(120, 70, 30, 0.1)' : 'rgba(48, 62, 70, 0.12)'
  vignette.addColorStop(1, edge)
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, w, h)
}

function paintLeafShadow(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save()
  ctx.filter = 'blur(16px)'
  // Hang from the top-right corner so the shadow falls across the wall,
  // past the floating transport, like a plant in the late sun.
  ctx.translate(w * 0.94, 8)
  const reach = Math.min(h * 0.62, 460)
  const leaves: Array<[number, number, number, number, number]> = [
    [-30, reach * 0.18, -0.7, 280, 0.42],
    [20, reach * 0.36, -0.2, 240, 0.36],
    [-150, reach * 0.42, 0.55, 220, 0.34],
    [-70, reach * 0.62, -1.05, 190, 0.3],
    [40, reach * 0.58, 0.35, 170, 0.28],
    [-200, reach * 0.28, 0.9, 150, 0.26],
    [-110, reach * 0.78, -0.4, 140, 0.24],
    [10, reach * 0.12, 0.15, 120, 0.32],
  ]
  for (const [x, y, rot, scale, alpha] of leaves) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot)
    ctx.scale(scale / 80, scale / 80)
    ctx.globalAlpha = alpha
    ctx.fillStyle = '#5c4632'
    ctx.beginPath()
    ctx.ellipse(0, 0, 78, 22, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(-30, 8, 28, 10, 0.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.restore()
}
