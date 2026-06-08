// Generates resources/icon.png — a clean rounded-square app/tray icon
// (accent-purple gradient + white play glyph). Pure Node (zlib), no deps.
import zlib from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const S = 512
const buf = Buffer.alloc(S * S * 4) // RGBA

const lerp = (a, b, t) => a + (b - a) * t
const top = [139, 108, 255]
const bot = [88, 60, 200]
const radius = 112

function roundedAlpha(x, y) {
  // distance outside a rounded rect → soft alpha edge (anti-aliased)
  const rx = Math.max(0, Math.max(radius - x, x - (S - 1 - radius)))
  const ry = Math.max(0, Math.max(radius - y, y - (S - 1 - radius)))
  const d = Math.hypot(rx, ry)
  if (rx === 0 || ry === 0) return 1
  return Math.max(0, Math.min(1, radius - d + 0.5))
}

// White play triangle (pointing right), centered.
const tri = [
  [196, 150],
  [196, 362],
  [372, 256]
]
function inTriangle(px, py) {
  const [a, b, c] = tri
  const sign = (p1, p2, p3) =>
    (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
  const d1 = sign([px, py], a, b)
  const d2 = sign([px, py], b, c)
  const d3 = sign([px, py], c, a)
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4
    const t = y / S
    let r = lerp(top[0], bot[0], t)
    let g = lerp(top[1], bot[1], t)
    let b = lerp(top[2], bot[2], t)
    if (inTriangle(x, y)) {
      r = 255
      g = 255
      b = 255
    }
    const a = roundedAlpha(x, y)
    buf[i] = r
    buf[i + 1] = g
    buf[i + 2] = b
    buf[i + 3] = Math.round(a * 255)
  }
}

// --- encode PNG (RGBA, filter 0) ---
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(zlib.crc32(td) >>> 0, 0)
  return Buffer.concat([len, td, crc])
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0)
ihdr.writeUInt32BE(S, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type RGBA
const raw = Buffer.alloc((S * 4 + 1) * S)
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0 // filter: none
  buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4)
}
const idat = zlib.deflateSync(raw, { level: 9 })
const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])

const out = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'icon.png')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, png)
console.log('wrote', out, png.length, 'bytes')
