import { useEffect, useRef } from 'react'
import { audioEngine } from '@/audio/engine'
import { useSettings } from '@/state/settingsStore'
import { usePlayer } from '@/state/playerStore'
import type { VisualizerPreset } from '@shared/types'

function accentRgb(): [number, number, number] {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  const [r, g, b] = v.split(/\s+/).map(Number)
  return [r || 124, g || 92, b || 255]
}

const N_BANDS = 96

interface Particle {
  ang: number
  radF: number
  band: number
  spin: number
}

/**
 * Shared analysis engine that gives every preset its fluidity. Instead of
 * reading raw FFT each frame (which snaps and jitters), we keep:
 *  - eased, log-spaced bands with fast attack / slow decay (gravity feel),
 *  - a spectral-flux beat detector with an adaptive threshold → `flash` kicks,
 *  - a smoothed overall `level`, and a continuously advancing `rot`.
 * Presets read these instead of the raw bins, so motion flows and reacts.
 */
interface Engine {
  bands: Float32Array // eased magnitudes 0..1, log-mapped
  prevSpec: Float32Array // coarse spectrum for flux
  fluxAvg: number
  beatCd: number
  flash: number // 0..1, spikes on a beat then decays — drives pops/flashes
  level: number // smoothed overall energy 0..1
  rot: number // ever-advancing rotation (rad)
  rings: { r: number; life: number }[]
  particles: Particle[] | null
}

function avg(freq: Uint8Array, lo: number, hi: number): number {
  if (hi <= lo) return 0
  let s = 0
  for (let i = lo; i < hi; i++) s += freq[i]
  return s / (hi - lo) / 255
}

/** Update eased bands, beat detection, level and rotation from a fresh FFT. */
function updateEngine(eng: Engine, freq: Uint8Array, bins: number, dt: number): boolean {
  const usable = Math.floor(bins * 0.85)
  const N = eng.bands.length
  // Log-ish band mapping (power curve) so bass isn't crammed into a few bins.
  for (let k = 0; k < N; k++) {
    const lo = Math.floor(Math.pow(k / N, 1.8) * usable)
    const hi = Math.max(lo + 1, Math.floor(Math.pow((k + 1) / N, 1.8) * usable))
    const mag = avg(freq, lo, hi)
    const cur = eng.bands[k]
    // Fast attack, slow decay → bars leap and settle like they have weight.
    eng.bands[k] = mag > cur ? cur + (mag - cur) * 0.5 : cur + (mag - cur) * 0.12
  }

  // Smoothed overall level.
  let sum = 0
  for (let k = 0; k < N; k++) sum += eng.bands[k]
  const lvl = sum / N
  eng.level += (lvl - eng.level) * (lvl > eng.level ? 0.4 : 0.1)

  // Spectral flux beat detection over a coarse spectrum with adaptive threshold.
  const M = eng.prevSpec.length
  const step = Math.max(1, Math.floor(usable / M))
  let flux = 0
  for (let m = 0; m < M; m++) {
    const cur = avg(freq, m * step, m * step + step)
    const d = cur - eng.prevSpec[m]
    if (d > 0) flux += d
    eng.prevSpec[m] = cur
  }
  flux /= M
  eng.fluxAvg = eng.fluxAvg * 0.92 + flux * 0.08
  eng.beatCd -= dt
  let beat = false
  if (flux > eng.fluxAvg * 1.6 && flux > 0.008 && eng.beatCd <= 0) {
    beat = true
    eng.beatCd = 0.12
    eng.flash = 1
  }
  eng.flash = Math.max(0, eng.flash - dt * 3.5)
  eng.rot += dt * (0.15 + eng.level * 0.7)
  return beat
}

/** How much of the previous frame to keep (trails). 1 = hard clear. */
const TRAIL: Record<VisualizerPreset, number> = {
  album: 1,
  bars: 0.32,
  waveform: 0.28,
  radial: 0.26,
  spectrum: 0.4,
  aurora: 0.16,
  nebula: 0.2,
  mirror: 0.34,
  sonar: 0.18,
  liquid: 0.26
}

/** Full-bleed canvas visualizer with selectable presets, driven by the AnalyserNode. */
export function Visualizer({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const preset = useSettings((s) => s.settings.visualizerPreset)
  const sensitivity = useSettings((s) => s.settings.visualizerSensitivity)
  const artUrl = usePlayer((s) => s.artUrl)
  const presetRef = useRef<VisualizerPreset>(preset)
  const sensRef = useRef(sensitivity)
  const activeRef = useRef(active)
  const artRef = useRef<HTMLImageElement | null>(null)

  presetRef.current = preset
  sensRef.current = sensitivity
  activeRef.current = active

  useEffect(() => {
    if (!artUrl) {
      artRef.current = null
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      artRef.current = img
    }
    img.src = artUrl
  }, [artUrl])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    const freq = new Uint8Array(1024)
    const time = new Uint8Array(2048)
    const eng: Engine = {
      bands: new Float32Array(N_BANDS),
      prevSpec: new Float32Array(64),
      fluxAvg: 0,
      beatCd: 0,
      flash: 0,
      level: 0,
      rot: 0,
      rings: [],
      particles: null
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25)
      const { clientWidth: w, clientHeight: h } = canvas
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    /** Fade the previous frame instead of clearing → motion leaves trails. */
    const applyTrail = (w: number, h: number, keep: number) => {
      if (keep >= 1) {
        ctx.clearRect(0, 0, w, h)
      } else {
        ctx.globalCompositeOperation = 'source-over'
        ctx.fillStyle = `rgba(7,8,13,${keep})`
        ctx.fillRect(0, 0, w, h)
      }
    }

    let lastFrame = 0
    const draw = (ts: number) => {
      raf = requestAnimationFrame(draw)
      // 60 fps while playing makes the eased motion read as genuinely fluid;
      // 20 when idle. Trails replace the clear, so per-frame cost is similar.
      const targetFps = activeRef.current ? 60 : 20
      if (ts - lastFrame < 1000 / targetFps - 1) return
      const dt = lastFrame ? Math.min(0.05, (ts - lastFrame) / 1000) : 0.016
      lastFrame = ts

      const analyser = audioEngine.getAnalyser()
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const [r, g, b] = accentRgb()
      const gain = sensRef.current
      const p = presetRef.current
      const img = artRef.current
      const col: Rgb = [r, g, b]

      applyTrail(w, h, TRAIL[p] ?? 1)

      const playing = !!analyser && activeRef.current

      if (playing) {
        analyser.getByteFrequencyData(freq.subarray(0, analyser.frequencyBinCount))
      } else {
        // Decay toward silence so things gently settle (and keep rotating).
        freq.fill(0)
      }
      const beat = updateEngine(eng, freq, playing ? analyser!.frequencyBinCount : 512, dt)

      ctx.globalCompositeOperation = 'source-over'

      // Presets that only make sense with real audio fall back to a calm line.
      if (!playing && (p === 'bars' || p === 'mirror' || p === 'spectrum' || p === 'waveform' || p === 'radial')) {
        drawIdle(ctx, w, h, r, g, b, ts)
        return
      }

      switch (p) {
        case 'album':
          drawAlbum(ctx, w, h, eng, col, gain, img)
          break
        case 'aurora':
          drawAurora(ctx, w, h, eng, col, gain, ts * 0.001)
          break
        case 'nebula':
          drawNebula(ctx, w, h, eng, col, gain, img)
          break
        case 'sonar':
          drawSonar(ctx, w, h, eng, col, gain, dt, beat, img)
          break
        case 'liquid':
          if (playing) analyser!.getByteTimeDomainData(time.subarray(0, analyser!.fftSize))
          else time.fill(128)
          drawLiquid(ctx, w, h, time, playing ? analyser!.fftSize : 2048, eng, col, gain, ts * 0.001, img)
          break
        case 'mirror':
          drawMirror(ctx, w, h, eng, col, gain)
          break
        case 'radial':
          drawRadial(ctx, w, h, eng, col, gain)
          break
        case 'spectrum':
          drawSpectrum(ctx, w, h, eng, col, gain)
          break
        case 'waveform':
          analyser!.getByteTimeDomainData(time.subarray(0, analyser!.fftSize))
          drawWaveform(ctx, w, h, time, analyser!.fftSize, eng, col, gain)
          break
        default:
          drawBars(ctx, w, h, eng, col, gain)
      }
      ctx.globalCompositeOperation = 'source-over'
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} className="h-full w-full" />
}

type Rgb = [number, number, number]

// ---- helpers ----------------------------------------------------------------

/** Average a fractional slice of the eased bands. */
function bandSlice(eng: Engine, from: number, to: number): number {
  const N = eng.bands.length
  const a = Math.floor(N * from)
  const z = Math.max(a + 1, Math.floor(N * to))
  let s = 0
  for (let i = a; i < Math.min(N, z); i++) s += eng.bands[i]
  return s / (z - a)
}

function drawArtDisc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  img: HTMLImageElement | null,
  [r, g, b]: Rgb,
  flash: number
) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.closePath()
  ctx.shadowColor = `rgba(${r},${g},${b},${0.55 + flash * 0.4})`
  ctx.shadowBlur = 14 + flash * 22
  ctx.fillStyle = `rgb(${r},${g},${b})`
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.clip()
  if (img && img.complete && img.naturalWidth > 0) {
    const d = radius * 2
    ctx.drawImage(img, cx - radius, cy - radius, d, d)
  }
  ctx.restore()
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(255,255,255,${0.18 + flash * 0.3})`
  ctx.lineWidth = 1.5
  ctx.stroke()
}

function drawIdle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  t: number
) {
  ctx.lineWidth = 2
  ctx.strokeStyle = `rgba(${r},${g},${b},0.35)`
  ctx.beginPath()
  for (let x = 0; x <= w; x += 4) {
    const y = h / 2 + Math.sin(x * 0.02 + t * 0.0015) * 10 * Math.sin(t * 0.0008)
    x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.stroke()
}

// ---- presets ----------------------------------------------------------------

function drawAlbum(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  eng: Engine,
  [r, g, b]: Rgb,
  gain: number,
  img: HTMLImageElement | null
) {
  const cx = w / 2
  const cy = h / 2
  const bass = bandSlice(eng, 0, 0.12) * gain
  const baseR = Math.min(w, h) * 0.17
  const pulse = baseR * (1 + bass * 0.16 + eng.flash * 0.05)

  const glow = ctx.createRadialGradient(cx, cy, pulse * 0.6, cx, cy, pulse * (2.2 + bass + eng.flash))
  glow.addColorStop(0, `rgba(${r},${g},${b},${0.32 + bass * 0.4 + eng.flash * 0.2})`)
  glow.addColorStop(1, `rgba(${r},${g},${b},0)`)
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)

  const count = N_BANDS
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(eng.rot * 0.3)
  ctx.lineCap = 'round'
  for (let i = 0; i < count; i++) {
    const v = eng.bands[i] * gain
    const inner = pulse + 8
    const outer = inner + 6 + v * Math.min(w, h) * 0.26
    const ang = (i / count) * Math.PI * 2 - Math.PI / 2
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.25 + v})`
    ctx.lineWidth = 2.2
    ctx.beginPath()
    ctx.moveTo(Math.cos(ang) * inner, Math.sin(ang) * inner)
    ctx.lineTo(Math.cos(ang) * outer, Math.sin(ang) * outer)
    ctx.stroke()
  }
  ctx.restore()

  drawArtDisc(ctx, cx, cy, pulse, img, [r, g, b], eng.flash)
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  eng: Engine,
  [r, g, b]: Rgb,
  gain: number
) {
  const count = N_BANDS
  const gap = 2
  const bw = (w - gap * (count - 1)) / count
  for (let i = 0; i < count; i++) {
    const v = eng.bands[i] * gain
    const bh = Math.max(2, v * h * 0.92)
    const x = i * (bw + gap)
    const grad = ctx.createLinearGradient(0, h, 0, h - bh)
    grad.addColorStop(0, `rgba(${r},${g},${b},0.2)`)
    grad.addColorStop(1, `rgba(${r},${g},${b},${0.85 + eng.flash * 0.15})`)
    ctx.fillStyle = grad
    roundRect(ctx, x, h - bh, bw, bh, Math.min(bw / 2, 3))
    ctx.fill()
  }
}

function drawMirror(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  eng: Engine,
  [r, g, b]: Rgb,
  gain: number
) {
  const count = N_BANDS
  const gap = 2
  const bw = (w - gap * (count - 1)) / count
  const mid = h / 2
  for (let i = 0; i < count; i++) {
    const v = eng.bands[i] * gain
    const bh = Math.max(2, v * h * 0.46)
    const x = i * (bw + gap)
    const grad = ctx.createLinearGradient(0, mid - bh, 0, mid + bh)
    grad.addColorStop(0, `rgba(${r},${g},${b},0.1)`)
    grad.addColorStop(0.5, `rgba(${r},${g},${b},${0.95 + eng.flash * 0.05})`)
    grad.addColorStop(1, `rgba(${r},${g},${b},0.1)`)
    ctx.fillStyle = grad
    roundRect(ctx, x, mid - bh, bw, bh * 2, Math.min(bw / 2, 3))
    ctx.fill()
  }
}

function drawRadial(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  eng: Engine,
  [r, g, b]: Rgb,
  gain: number
) {
  const cx = w / 2
  const cy = h / 2
  const baseR = Math.min(w, h) * 0.18 * (1 + eng.flash * 0.04)
  const count = N_BANDS
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(eng.rot * 0.5)
  ctx.lineCap = 'round'
  // Draw both sides for symmetry → a fuller, more hypnotic bloom.
  for (let s = 0; s < 2; s++) {
    for (let i = 0; i < count; i++) {
      const v = eng.bands[i] * gain
      const len = baseR + v * Math.min(w, h) * 0.34
      const ang = (i / count) * Math.PI + (s ? Math.PI : 0) - Math.PI / 2
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.35 + v})`
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(Math.cos(ang) * baseR, Math.sin(ang) * baseR)
      ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  eng: Engine,
  [r, g, b]: Rgb,
  gain: number
) {
  const N = eng.bands.length
  ctx.beginPath()
  ctx.moveTo(0, h)
  for (let i = 0; i < N; i++) {
    const v = eng.bands[i] * gain
    const x = (i / (N - 1)) * w
    const y = h - v * h
    ctx.lineTo(x, y)
  }
  ctx.lineTo(w, h)
  ctx.closePath()
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, `rgba(${r},${g},${b},${0.85 + eng.flash * 0.15})`)
  grad.addColorStop(1, `rgba(${r},${g},${b},0.04)`)
  ctx.fillStyle = grad
  ctx.fill()
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: Uint8Array,
  size: number,
  eng: Engine,
  [r, g, b]: Rgb,
  gain: number
) {
  ctx.lineWidth = 2.5
  ctx.strokeStyle = `rgb(${r},${g},${b})`
  ctx.shadowColor = `rgba(${r},${g},${b},${0.6 + eng.flash * 0.4})`
  ctx.shadowBlur = 10 + eng.flash * 16
  ctx.beginPath()
  const slice = w / size
  for (let i = 0; i < size; i++) {
    const v = ((time[i] - 128) / 128) * gain
    const y = h / 2 + v * (h / 2.4)
    const x = i * slice
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.shadowBlur = 0
}

/** Aurora: layered light ribbons; bands drive amplitude, additive glow stacks. */
function drawAurora(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  eng: Engine,
  [r, g, b]: Rgb,
  gain: number,
  t: number
) {
  const layers = [
    { e: bandSlice(eng, 0, 0.12), yo: 0.66, c: [r, g, b] as Rgb, spd: 0.5, fk: 0.011, ph: 0 },
    { e: bandSlice(eng, 0.12, 0.4), yo: 0.54, c: [g, b, r] as Rgb, spd: 0.85, fk: 0.015, ph: 2.1 },
    { e: bandSlice(eng, 0.4, 1), yo: 0.43, c: [b, r, g] as Rgb, spd: 1.2, fk: 0.02, ph: 4.2 }
  ]
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const L of layers) {
    const e = L.e * gain
    const amp = h * 0.05 + e * h * 0.26
    const yBase = h * L.yo
    const [cr, cg, cb] = L.c
    const thick = h * 0.26
    const grad = ctx.createLinearGradient(0, yBase - amp, 0, yBase + thick)
    grad.addColorStop(0, `rgba(${cr},${cg},${cb},0)`)
    grad.addColorStop(0.3, `rgba(${cr},${cg},${cb},${0.16 + e * 0.4})`)
    grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(0, h)
    for (let x = 0; x <= w; x += 6) {
      const y =
        yBase +
        Math.sin(x * L.fk + t * L.spd + L.ph) * amp +
        Math.sin(x * L.fk * 2.3 + t * L.spd * 0.7) * amp * 0.4
      ctx.lineTo(x, y)
    }
    ctx.lineTo(w, h)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

/** Nebula: a rotating particle galaxy that swells with bass and pops on beats,
 * with the album art as the glowing core. */
function drawNebula(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  eng: Engine,
  [r, g, b]: Rgb,
  gain: number,
  img: HTMLImageElement | null
) {
  const cx = w / 2
  const cy = h / 2
  const N = eng.bands.length
  if (!eng.particles) {
    eng.particles = Array.from({ length: 170 }, () => ({
      ang: Math.random() * Math.PI * 2,
      radF: 0.18 + Math.random() * 0.82,
      band: Math.floor(Math.random() * N),
      spin: 0.35 + Math.random() * 0.9
    }))
  }
  const bass = bandSlice(eng, 0, 0.12) * gain
  const baseR = Math.min(w, h) * 0.16
  const maxOut = Math.min(w, h) * 0.46
  const kick = 1 + bass * 0.55 + eng.flash * 0.25

  const glow = ctx.createRadialGradient(cx, cy, baseR * 0.5, cx, cy, maxOut * (1 + bass + eng.flash * 0.5))
  glow.addColorStop(0, `rgba(${r},${g},${b},${0.28 + bass * 0.35 + eng.flash * 0.2})`)
  glow.addColorStop(1, `rgba(${r},${g},${b},0)`)
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const p of eng.particles) {
    const fv = eng.bands[p.band] * gain
    const rad = baseR + p.radF * (maxOut - baseR) * (0.55 + 0.6 * kick * 0.7)
    const a = p.ang + eng.rot * p.spin
    const x = cx + Math.cos(a) * rad
    const y = cy + Math.sin(a) * rad * 0.72
    const sz = 0.6 + fv * 3.4 + p.radF * 0.5
    ctx.fillStyle = `rgba(${r},${g},${b},${0.12 + fv * 0.8})`
    ctx.beginPath()
    ctx.arc(x, y, sz, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  drawArtDisc(ctx, cx, cy, baseR * (0.92 + bass * 0.12 + eng.flash * 0.05), img, [r, g, b], eng.flash)
}

/** Sonar: rings fired outward on each detected beat, around a pulsing art core. */
function drawSonar(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  eng: Engine,
  [r, g, b]: Rgb,
  gain: number,
  dt: number,
  beat: boolean,
  img: HTMLImageElement | null
) {
  const cx = w / 2
  const cy = h / 2
  const baseR = Math.min(w, h) * 0.16
  const maxR = Math.min(w, h) * 0.55
  const speed = Math.min(w, h) * 0.3

  if (beat && eng.rings.length < 28) eng.rings.push({ r: baseR, life: 1 })

  for (const ring of eng.rings) {
    ring.r += dt * speed
    ring.life -= dt * 0.6
    const a = Math.max(0, ring.life)
    ctx.strokeStyle = `rgba(${r},${g},${b},${a * 0.55})`
    ctx.lineWidth = 1 + a * 2.5
    ctx.beginPath()
    ctx.arc(cx, cy, ring.r, 0, Math.PI * 2)
    ctx.stroke()
  }
  eng.rings = eng.rings.filter((ring) => ring.life > 0 && ring.r < maxR * 1.4)

  const bass = bandSlice(eng, 0, 0.12) * gain
  const pulse = baseR * (1 + bass * 0.14 + eng.flash * 0.06)
  const glow = ctx.createRadialGradient(cx, cy, pulse * 0.6, cx, cy, pulse * (2 + bass + eng.flash))
  glow.addColorStop(0, `rgba(${r},${g},${b},${0.28 + bass * 0.4 + eng.flash * 0.25})`)
  glow.addColorStop(1, `rgba(${r},${g},${b},0)`)
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)

  drawArtDisc(ctx, cx, cy, pulse, img, [r, g, b], eng.flash)
}

/** Liquid: the waveform wrapped into a slowly rotating, morphing orb with the
 * album art clipped inside, and a beat-driven size pop. */
function drawLiquid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: Uint8Array,
  size: number,
  eng: Engine,
  [r, g, b]: Rgb,
  gain: number,
  t: number,
  img: HTMLImageElement | null
) {
  const cx = w / 2
  const cy = h / 2
  const baseR = Math.min(w, h) * 0.2 * (1 + eng.flash * 0.06)
  const amp = Math.min(w, h) * 0.07
  const points = 128
  const cover = baseR + amp
  const spin = eng.rot * 0.25

  ctx.beginPath()
  for (let i = 0; i <= points; i++) {
    const idx = Math.floor((i / points) * (size - 1))
    const wv = ((time[idx] - 128) / 128) * gain
    const ang = (i / points) * Math.PI * 2 + spin
    const rad = baseR + wv * amp + Math.sin(ang * 3 - t * 1.2) * amp * 0.22
    const x = cx + Math.cos(ang) * rad
    const y = cy + Math.sin(ang) * rad
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.closePath()

  ctx.save()
  ctx.clip()
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, cx - cover, cy - cover, cover * 2, cover * 2)
  } else {
    const fill = ctx.createRadialGradient(cx, cy, 0, cx, cy, cover)
    fill.addColorStop(0, `rgba(${r},${g},${b},0.9)`)
    fill.addColorStop(1, `rgba(${r},${g},${b},0.25)`)
    ctx.fillStyle = fill
    ctx.fillRect(cx - cover, cy - cover, cover * 2, cover * 2)
  }
  ctx.restore()

  ctx.shadowColor = `rgba(${r},${g},${b},${0.6 + eng.flash * 0.4})`
  ctx.shadowBlur = 16 + eng.flash * 20
  ctx.strokeStyle = `rgba(${r},${g},${b},0.9)`
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.shadowBlur = 0
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}
