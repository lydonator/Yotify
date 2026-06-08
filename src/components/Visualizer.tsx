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

  // Load the album art for the 'album' preset (drawing tainted images is fine).
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

    const resize = () => {
      // Cap the backing-store resolution: a high-DPI / scaled display would
      // otherwise multiply pixel count 2-4x and hammer the GPU at fullscreen.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25)
      const { clientWidth: w, clientHeight: h } = canvas
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    let lastFrame = 0
    const draw = (ts: number) => {
      raf = requestAnimationFrame(draw)
      // Frame-rate cap: 30 fps while playing, 15 when idle — plenty smooth for
      // an audio visualizer, and roughly halves GPU vs uncapped 60 fps.
      const targetFps = activeRef.current ? 30 : 15
      if (ts - lastFrame < 1000 / targetFps - 1) return
      lastFrame = ts
      const analyser = audioEngine.getAnalyser()
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.clearRect(0, 0, w, h)
      const [r, g, b] = accentRgb()
      const gain = sensRef.current

      if (!analyser || !activeRef.current) {
        if (presetRef.current === 'album' && artRef.current) {
          freq.fill(0)
          drawAlbum(ctx, w, h, freq, 512, artRef.current, r, g, b, gain)
        } else {
          drawIdle(ctx, w, h, r, g, b, performance.now())
        }
        return
      }

      if (presetRef.current === 'album') {
        analyser.getByteFrequencyData(freq.subarray(0, analyser.frequencyBinCount))
        drawAlbum(ctx, w, h, freq, analyser.frequencyBinCount, artRef.current, r, g, b, gain)
      } else if (presetRef.current === 'waveform') {
        analyser.getByteTimeDomainData(time.subarray(0, analyser.fftSize))
        drawWaveform(ctx, w, h, time, analyser.fftSize, r, g, b, gain)
      } else if (presetRef.current === 'radial') {
        analyser.getByteFrequencyData(freq.subarray(0, analyser.frequencyBinCount))
        drawRadial(ctx, w, h, freq, analyser.frequencyBinCount, r, g, b, gain)
      } else if (presetRef.current === 'spectrum') {
        analyser.getByteFrequencyData(freq.subarray(0, analyser.frequencyBinCount))
        drawSpectrum(ctx, w, h, freq, analyser.frequencyBinCount, r, g, b, gain)
      } else {
        analyser.getByteFrequencyData(freq.subarray(0, analyser.frequencyBinCount))
        drawBars(ctx, w, h, freq, analyser.frequencyBinCount, r, g, b, gain)
      }
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} className="h-full w-full" />
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

function drawAlbum(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  freq: Uint8Array,
  bins: number,
  img: HTMLImageElement | null,
  r: number,
  g: number,
  b: number,
  gain: number
) {
  const cx = w / 2
  const cy = h / 2
  // Bass energy drives the pulse; overall energy drives the ring length.
  let bass = 0
  for (let i = 2; i < 14; i++) bass += freq[i]
  bass = (bass / 12 / 255) * gain
  const baseR = Math.min(w, h) * 0.17
  const pulse = baseR * (1 + bass * 0.14)

  // Soft dominant-color glow that breathes with the bass.
  const glow = ctx.createRadialGradient(cx, cy, pulse * 0.6, cx, cy, pulse * (2.2 + bass))
  glow.addColorStop(0, `rgba(${r},${g},${b},${0.35 + bass * 0.4})`)
  glow.addColorStop(1, `rgba(${r},${g},${b},0)`)
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)

  // Reactive radial bars around the art.
  const count = 110
  const step = Math.max(1, Math.floor((bins * 0.55) / count))
  ctx.save()
  ctx.translate(cx, cy)
  for (let i = 0; i < count; i++) {
    let sum = 0
    for (let j = 0; j < step; j++) sum += freq[i * step + j]
    const v = (sum / step / 255) * gain
    const inner = pulse + 8
    const outer = inner + 6 + v * Math.min(w, h) * 0.22
    const ang = (i / count) * Math.PI * 2 - Math.PI / 2
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.25 + v})`
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(Math.cos(ang) * inner, Math.sin(ang) * inner)
    ctx.lineTo(Math.cos(ang) * outer, Math.sin(ang) * outer)
    ctx.stroke()
  }
  ctx.restore()

  // Album art clipped to a circle, gently pulsing.
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, pulse, 0, Math.PI * 2)
  ctx.closePath()
  ctx.shadowColor = `rgba(${r},${g},${b},0.6)`
  ctx.shadowBlur = 14
  ctx.fillStyle = `rgb(${r},${g},${b})`
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.clip()
  if (img && img.complete && img.naturalWidth > 0) {
    const d = pulse * 2
    ctx.drawImage(img, cx - pulse, cy - pulse, d, d)
  }
  ctx.restore()

  // Crisp ring outline.
  ctx.beginPath()
  ctx.arc(cx, cy, pulse, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(255,255,255,0.18)`
  ctx.lineWidth = 1.5
  ctx.stroke()
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  freq: Uint8Array,
  bins: number,
  r: number,
  g: number,
  b: number,
  gain: number
) {
  const count = 64
  const step = Math.floor((bins * 0.7) / count)
  const gap = 3
  const bw = (w - gap * (count - 1)) / count
  for (let i = 0; i < count; i++) {
    let sum = 0
    for (let j = 0; j < step; j++) sum += freq[i * step + j]
    const v = (sum / step / 255) * gain
    const bh = Math.max(2, v * h * 0.9)
    const x = i * (bw + gap)
    const grad = ctx.createLinearGradient(0, h, 0, h - bh)
    grad.addColorStop(0, `rgba(${r},${g},${b},0.25)`)
    grad.addColorStop(1, `rgba(${r},${g},${b},1)`)
    ctx.fillStyle = grad
    roundRect(ctx, x, h - bh, bw, bh, bw / 2)
    ctx.fill()
  }
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: Uint8Array,
  size: number,
  r: number,
  g: number,
  b: number,
  gain: number
) {
  ctx.lineWidth = 2.5
  ctx.strokeStyle = `rgb(${r},${g},${b})`
  ctx.shadowColor = `rgba(${r},${g},${b},0.7)`
  ctx.shadowBlur = 10
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

function drawRadial(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  freq: Uint8Array,
  bins: number,
  r: number,
  g: number,
  b: number,
  gain: number
) {
  const cx = w / 2
  const cy = h / 2
  const baseR = Math.min(w, h) * 0.18
  const count = 96
  const step = Math.floor((bins * 0.6) / count)
  ctx.save()
  ctx.translate(cx, cy)
  for (let i = 0; i < count; i++) {
    let sum = 0
    for (let j = 0; j < step; j++) sum += freq[i * step + j]
    const v = (sum / step / 255) * gain
    const len = baseR + v * Math.min(w, h) * 0.32
    const ang = (i / count) * Math.PI * 2
    const x1 = Math.cos(ang) * baseR
    const y1 = Math.sin(ang) * baseR
    const x2 = Math.cos(ang) * len
    const y2 = Math.sin(ang) * len
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.4 + v})`
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
  ctx.restore()
}

function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  freq: Uint8Array,
  bins: number,
  r: number,
  g: number,
  b: number,
  gain: number
) {
  const usable = Math.floor(bins * 0.7)
  ctx.beginPath()
  ctx.moveTo(0, h)
  for (let i = 0; i < usable; i++) {
    const v = (freq[i] / 255) * gain
    const x = (i / usable) * w
    const y = h - v * h
    ctx.lineTo(x, y)
  }
  ctx.lineTo(w, h)
  ctx.closePath()
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, `rgba(${r},${g},${b},0.85)`)
  grad.addColorStop(1, `rgba(${r},${g},${b},0.04)`)
  ctx.fillStyle = grad
  ctx.fill()
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
