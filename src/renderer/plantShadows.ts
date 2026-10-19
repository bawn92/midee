// Plant-shadow choice for the Golden Hour wall. The painter lives in
// plantShadowField.ts; this module is the setting, the budget, and the
// leaf model so tests can pin persistence without a canvas.

export const PLANT_SHADOWS = ['off', 'monstera', 'fern', 'fiddle', 'olive', 'mixed'] as const
export type PlantShadowId = (typeof PLANT_SHADOWS)[number]
export type LeafKind = 'monstera' | 'fern' | 'fiddle' | 'olive'

export const DEFAULT_PLANT_SHADOW: PlantShadowId = 'fern'
export const PLANT_SHADOW_KEY = 'midee.plantShadows'

// Parked pose for prefers-reduced-motion. Sway is zero, so the time only
// matters for the gust envelope, which is also multiplied by sway.
export const PLANT_PARKED_TIME = 3.2

export interface PlantShadowBudget {
  scale: number
  density: number
}

export interface PlantLeaf {
  kind: LeafKind
  px: number
  py: number
  bx: number
  by: number
  dir: number
  len: number
  z: number
  seed: number
  stiff: number
  flip: number
  stem: boolean
  layer: 0 | 1 | 2
}

interface LeafType {
  n: number
  len: number
  spread: number
  stem: boolean
  stiff: number
}

const LEAF_TYPE: Record<LeafKind, LeafType> = {
  monstera: { n: 7, len: 0.4, spread: 28, stem: true, stiff: 0.55 },
  fern: { n: 9, len: 0.62, spread: 18, stem: false, stiff: 0.25 },
  fiddle: { n: 11, len: 0.27, spread: 34, stem: true, stiff: 0.6 },
  olive: { n: 10, len: 0.46, spread: 22, stem: false, stiff: 0.35 },
}

const listeners = new Set<(id: PlantShadowId) => void>()
let current: PlantShadowId = readStored()

function readStored(): PlantShadowId {
  try {
    const raw = localStorage.getItem(PLANT_SHADOW_KEY)
    if (raw && (PLANT_SHADOWS as readonly string[]).includes(raw)) return raw as PlantShadowId
  } catch {
    // Private mode can reject the read. Fern is the default either way.
  }
  return DEFAULT_PLANT_SHADOW
}

export function storedPlantShadow(): PlantShadowId {
  return readStored()
}

export function plantShadowId(): PlantShadowId {
  return current
}

export function setPlantShadow(id: PlantShadowId): void {
  if (!(PLANT_SHADOWS as readonly string[]).includes(id)) return
  if (current === id) return
  current = id
  try {
    localStorage.setItem(PLANT_SHADOW_KEY, id)
  } catch {
    // The in-memory choice still applies for this visit.
  }
  for (const fn of listeners) fn(id)
}

export function subscribePlantShadow(fn: (id: PlantShadowId) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Shadows are a Golden Hour wall. Rainy Study, After Hours, Night, and Off draw nothing.
export function plantShadowsActive(themeId: string, id: PlantShadowId = current): boolean {
  return themeId === 'golden-hour' && id !== 'off'
}

// Half-resolution shadow buffer on a full desktop. Phone and low-power
// machines drop the buffer scale and the leaf count (README levers).
export function plantShadowBudget(input: {
  phone: boolean
  cores: number
  memory: number
}): PlantShadowBudget {
  if (input.phone || input.cores <= 2 || input.memory <= 4) {
    return { scale: 0.35, density: 0.65 }
  }
  return { scale: 0.5, density: 1 }
}

export function readPlantShadowBudget(): PlantShadowBudget {
  if (typeof window === 'undefined') return { scale: 0.5, density: 1 }
  const phone = window.matchMedia?.('(max-width: 759px), (pointer: coarse)').matches ?? false
  const cores = navigator.hardwareConcurrency || 8
  const nav = navigator as Navigator & { deviceMemory?: number }
  const memory = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 8
  return plantShadowBudget({ phone, cores, memory })
}

export function hash(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

export function noise(x: number): number {
  const i = Math.floor(x)
  const f = x - i
  const u = f * f * (3 - 2 * f)
  return (hash(i) * (1 - u) + hash(i + 1) * u) * 2 - 1
}

export function fbm(x: number): number {
  return noise(x) * 0.57 + noise(x * 2.03 + 17) * 0.29 + noise(x * 4.11 + 41) * 0.14
}

export function makeRng(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function buildLeaves(opts: {
  plant: Exclude<PlantShadowId, 'off'>
  width: number
  wall: number
  density: number
  seed?: number
}): PlantLeaf[] {
  const seed = opts.seed ?? 11
  const random = makeRng(seed * 97 + opts.plant.length)
  const leaves: PlantLeaf[] = []
  const kinds: Array<[LeafKind, number]> =
    opts.plant === 'mixed'
      ? [
          ['monstera', 4],
          ['fern', 3],
          ['olive', 3],
        ]
      : [[opts.plant, LEAF_TYPE[opts.plant].n]]
  const origin = { x: -opts.width * 0.05, y: opts.wall * 1.02 }
  for (const [kind, count] of kinds) {
    const type = LEAF_TYPE[kind]
    const n = Math.max(2, Math.round(count * opts.density))
    for (let i = 0; i < n; i++) {
      const a = lerp(-82, -18, (i + random()) / n) * (Math.PI / 180)
      const rad = lerp(0.32, 0.86, random()) * opts.wall * (kind === 'fern' ? 0.85 : 1)
      const px = origin.x + Math.cos(a) * rad * 1.25
      const py = origin.y + Math.sin(a) * rad
      const z = random()
      const layer: 0 | 1 | 2 = z < 0.34 ? 0 : z < 0.67 ? 1 : 2
      leaves.push({
        kind,
        px,
        py,
        bx: origin.x + random() * opts.width * 0.04,
        by: origin.y,
        dir: a + (random() - 0.35) * type.spread * (Math.PI / 90),
        len: type.len * opts.wall * lerp(0.75, 1.15, random()) * (1 + 0.35 * z),
        z,
        seed: random() * 100,
        stiff: type.stiff * lerp(0.8, 1.2, random()),
        flip: random() < 0.5 ? -1 : 1,
        stem: type.stem,
        layer,
      })
    }
  }
  leaves.sort((a, b) => b.z - a.z)
  return leaves
}

export function gustEnvelope(dt: number): number {
  if (dt < 0) return 0
  if (dt < 1.2) {
    const u = Math.sin((Math.PI / 2) * (dt / 1.2))
    return u * u
  }
  return Math.exp(-(dt - 1.2) / 1.4)
}

export interface LeafPose {
  ang: number
  dx: number
  dy: number
  flutter: number
}

// sway 0 (reduced motion) holds the base pose: no drift, no gust, no flutter.
export function leafPose(
  leaf: PlantLeaf,
  t: number,
  sway: number,
  gustAt: number,
  width: number,
): LeafPose {
  if (sway === 0) return { ang: leaf.dir, dx: 0, dy: 0, flutter: 1 }
  const gust =
    gustEnvelope(t - gustAt - (leaf.px / Math.max(1, width)) * 0.9) * (1 - leaf.stiff * 0.6)
  const ang =
    leaf.dir +
    sway *
      (0.075 * fbm(t * 0.11 + leaf.seed) +
        0.028 * noise(t * 0.85 + leaf.seed * 3) +
        0.16 * gust * (0.7 + 0.3 * noise(t * 2 + leaf.seed)))
  return {
    ang,
    dx: sway * (7 * fbm(t * 0.17 + leaf.seed + 9) + 14 * gust),
    dy: sway * 4 * fbm(t * 0.13 + leaf.seed + 21),
    flutter: 1 + (sway === 0 ? 0 : 0.05 * noise(t * 1.4 + leaf.seed + 5) * sway + 0.06 * gust),
  }
}
