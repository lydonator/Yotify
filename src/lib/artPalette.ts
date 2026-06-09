// Album-art content analysis for the visualizer.
//
// One downscaled read of the artwork yields everything the presets need to
// paint with the art's own colors instead of a single flat accent:
//  - palette:  the most vibrant distinct hues (multi-color ribbons/rings),
//  - columns:  left→right strip colors, so EQ bars take on the color of the
//              artwork directly beneath them,
//  - rim:      colors around the cover's inscribed circle, so radial spokes
//              continue the art's edge color outward,
//  - grid:     the raw downsampled pixels, so particles can be born with the
//              color of an actual pixel of the cover.
// Analysis returns null for CORS-tainted images — callers fall back to accent.

export type Rgb = [number, number, number]

export interface ArtAnalysis {
  palette: Rgb[]
  columns: Rgb[]
  rim: Rgb[]
  grid: Uint8ClampedArray
  size: number
}

const SIZE = 64
const RIM_N = 48
const HUE_BUCKETS = 12

const cache = new Map<string, ArtAnalysis | null>()

export function analyzeArt(img: HTMLImageElement): ArtAnalysis | null {
  const key = img.src
  if (cache.has(key)) return cache.get(key)!
  let result: ArtAnalysis | null = null
  try {
    result = compute(img)
  } catch {
    result = null // tainted canvas (no CORS) — accent fallback
  }
  if (cache.size > 40) cache.delete(cache.keys().next().value as string)
  cache.set(key, result)
  return result
}

/** Color of the art pixel at fractional position (fx, fy), lifted for glow. */
export function gridColor(a: ArtAnalysis, fx: number, fy: number): Rgb {
  const x = Math.min(a.size - 1, Math.floor(fx * a.size))
  const y = Math.min(a.size - 1, Math.floor(fy * a.size))
  const i = (y * a.size + x) * 4
  return lift([a.grid[i], a.grid[i + 1], a.grid[i + 2]], 110)
}

/** Scale a color up so its brightest channel reaches `minMax` — dark pixels
 * would otherwise vanish against the near-black canvas. */
function lift([r, g, b]: Rgb, minMax: number): Rgb {
  const m = Math.max(r, g, b)
  if (m === 0) return [96, 96, 108]
  if (m >= minMax) return [r, g, b]
  const k = minMax / m
  return [Math.min(255, Math.round(r * k)), Math.min(255, Math.round(g * k)), Math.min(255, Math.round(b * k))]
}

function hueOf(r: number, g: number, b: number, max: number, min: number): number {
  const d = max - min
  if (d === 0) return 0
  let hx: number
  if (max === r) hx = ((g - b) / d) % 6
  else if (max === g) hx = (b - r) / d + 2
  else hx = (r - g) / d + 4
  const deg = hx * 60
  return deg < 0 ? deg + 360 : deg
}

function compute(img: HTMLImageElement): ArtAnalysis {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('no 2d context')
  // Center-crop to a square so strips/rim align with how presets draw the art.
  const s = Math.min(img.naturalWidth, img.naturalHeight)
  ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, SIZE, SIZE)
  const grid = ctx.getImageData(0, 0, SIZE, SIZE).data

  // Vibrant palette: weight saturated pixels into hue buckets, keep the heaviest.
  const buckets = Array.from({ length: HUE_BUCKETS }, () => ({ r: 0, g: 0, b: 0, w: 0 }))
  let total = 0
  for (let i = 0; i < grid.length; i += 4) {
    const r = grid[i]
    const g = grid[i + 1]
    const b = grid[i + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const lum = max / 255
    const sat = max === 0 ? 0 : (max - min) / max
    if (lum < 0.1 || sat < 0.12) continue // blacks/whites/grays don't vote
    const w = sat * sat * (0.25 + lum)
    const bk = buckets[Math.floor((hueOf(r, g, b, max, min) / 360) * HUE_BUCKETS) % HUE_BUCKETS]
    bk.r += r * w
    bk.g += g * w
    bk.b += b * w
    bk.w += w
    total += w
  }
  const palette: Rgb[] = buckets
    .filter((bk) => bk.w > total * 0.04)
    .sort((a, b) => b.w - a.w)
    .slice(0, 4)
    .map((bk) => lift([Math.round(bk.r / bk.w), Math.round(bk.g / bk.w), Math.round(bk.b / bk.w)], 140))

  // Column strip colors — what color the art is at each horizontal position.
  const columns: Rgb[] = []
  for (let x = 0; x < SIZE; x++) {
    let r = 0
    let g = 0
    let b = 0
    let wsum = 0
    for (let y = 0; y < SIZE; y++) {
      const i = (y * SIZE + x) * 4
      const cr = grid[i]
      const cg = grid[i + 1]
      const cb = grid[i + 2]
      const max = Math.max(cr, cg, cb)
      const min = Math.min(cr, cg, cb)
      const sat = max === 0 ? 0 : (max - min) / max
      const w = 0.06 + sat * (0.2 + max / 255) // favor vivid pixels, never zero
      r += cr * w
      g += cg * w
      b += cb * w
      wsum += w
    }
    columns.push(lift([Math.round(r / wsum), Math.round(g / wsum), Math.round(b / wsum)], 120))
  }

  // Rim colors around the inscribed circle (angle 0 = +x, canvas convention).
  const rim: Rgb[] = []
  const c = SIZE / 2
  const R = SIZE * 0.46
  for (let k = 0; k < RIM_N; k++) {
    const ang = (k / RIM_N) * Math.PI * 2
    const px = Math.min(SIZE - 2, Math.max(1, Math.round(c + Math.cos(ang) * R)))
    const py = Math.min(SIZE - 2, Math.max(1, Math.round(c + Math.sin(ang) * R)))
    let r = 0
    let g = 0
    let b = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const i = ((py + dy) * SIZE + (px + dx)) * 4
        r += grid[i]
        g += grid[i + 1]
        b += grid[i + 2]
      }
    }
    rim.push(lift([Math.round(r / 9), Math.round(g / 9), Math.round(b / 9)], 120))
  }

  return { palette, columns, rim, grid, size: SIZE }
}
