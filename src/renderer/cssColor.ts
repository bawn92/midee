// Reads a custom property off the document so Pixi layers stay on the scene
// tokens. Falls back when the stylesheet has not been applied (unit tests).

export interface CssColor {
  color: number
  alpha: number
}

// getComputedStyle flushes style. Notes call this every body, every frame, so a
// scene switch is the only time the value is allowed to change.
const cssColorCache = new Map<string, CssColor>()

export function readCssColor(name: string, fallback: CssColor): CssColor {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return fallback
  const scene = document.documentElement.dataset.scene ?? ''
  const key = `${scene}|${name}`
  const cached = cssColorCache.get(key)
  if (cached) return cached
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (!raw) return fallback
  const hex = raw.match(/^#([0-9a-f]{6})$/i)
  if (hex?.[1]) {
    const parsed = { color: Number.parseInt(hex[1], 16), alpha: 1 }
    cssColorCache.set(key, parsed)
    return parsed
  }
  const rgb = raw.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
  )
  if (!rgb?.[1] || !rgb[2] || !rgb[3]) return fallback
  const r = Math.round(Number(rgb[1]))
  const g = Math.round(Number(rgb[2]))
  const b = Math.round(Number(rgb[3]))
  const alpha = rgb[4] === undefined ? 1 : Number(rgb[4])
  const parsed = { color: (r << 16) | (g << 8) | b, alpha }
  cssColorCache.set(key, parsed)
  return parsed
}
