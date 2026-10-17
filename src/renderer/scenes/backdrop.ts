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

  const wash = ctx.createLinearGradient(0, 0, w * 0.15, h)
  wash.addColorStop(0, scene.background.top)
  wash.addColorStop(0.55, scene.background.mid)
  wash.addColorStop(1, scene.background.bottom)
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, w, h)

  if (scene.background.decor === 'window-leaf') paintLeafShadow(ctx, w, h)

  const vignette = ctx.createRadialGradient(w * 0.5, h * 0.42, w * 0.2, w * 0.5, h * 0.45, w * 0.72)
  vignette.addColorStop(0, 'rgba(255, 244, 226, 0)')
  vignette.addColorStop(1, 'rgba(122, 72, 40, 0.16)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, w, h)
}

function paintLeafShadow(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save()
  ctx.filter = 'blur(18px)'
  // Hang from the top-right corner so the shadow falls across the wall,
  // past the floating top strip, like a plant in the late sun.
  ctx.translate(w * 0.98, -8)
  const reach = Math.min(h * 0.32, 260)
  const leaves: Array<[number, number, number, number, number]> = [
    [-40, reach * 0.32, -0.85, 190, 0.24],
    [8, reach * 0.58, -0.35, 160, 0.2],
    [-110, reach * 0.66, 0.45, 140, 0.17],
    [-20, reach * 0.92, -1.05, 120, 0.15],
    [36, reach * 0.4, 0.2, 100, 0.16],
    [-150, reach * 0.48, 0.75, 80, 0.13],
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
