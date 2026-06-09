/**
 * AudioEngine wraps a single <audio> element in a Web Audio graph:
 *
 *   <audio> -> MediaElementSource -> GainNode -> AnalyserNode -> destination
 *
 * The AnalyserNode feeds the visualizer; GainNode is the volume control; and
 * setSinkId on the element routes output to the chosen device.
 *
 * It is a plain (non-React) singleton so the graph survives re-renders. React
 * subscribes to time/duration/state via the callbacks passed to `attach`.
 */
export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'

interface EngineCallbacks {
  onState?: (s: PlaybackState) => void
  onTime?: (current: number, duration: number) => void
  onEnded?: () => void
  onError?: (message: string) => void
}

class AudioEngine {
  private el: HTMLAudioElement
  private ctx: AudioContext | null = null
  private source: MediaElementAudioSourceNode | null = null
  private gain: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private cb: EngineCallbacks = {}
  private rafId: number | null = null

  constructor() {
    this.el = new Audio()
    this.el.crossOrigin = 'anonymous'
    this.el.preload = 'auto'

    this.el.addEventListener('playing', () => this.cb.onState?.('playing'))
    this.el.addEventListener('pause', () => {
      if (!this.el.ended) this.cb.onState?.('paused')
    })
    this.el.addEventListener('waiting', () => this.cb.onState?.('loading'))
    this.el.addEventListener('ended', () => {
      this.cb.onState?.('ended')
      this.cb.onEnded?.()
    })
    this.el.addEventListener('error', () => {
      const err = this.el.error
      this.cb.onState?.('error')
      this.cb.onError?.(err ? `Audio error (code ${err.code})` : 'Unknown audio error')
    })
  }

  /** Lazily build the audio graph — must happen after a user gesture. */
  private ensureGraph(): void {
    if (this.ctx) return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new Ctx()
    this.source = this.ctx.createMediaElementSource(this.el)
    this.gain = this.ctx.createGain()
    this.analyser = this.ctx.createAnalyser()
    // 4096 → finer low-end resolution for a clean log-frequency spectrum; the
    // visualizer does its own attack/decay easing so keep built-in smoothing modest.
    this.analyser.fftSize = 4096
    this.analyser.smoothingTimeConstant = 0.7
    this.source.connect(this.gain)
    this.gain.connect(this.analyser)
    this.analyser.connect(this.ctx.destination)
  }

  attach(cb: EngineCallbacks): void {
    this.cb = cb
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser
  }

  private startTimeLoop(): void {
    if (this.rafId != null) return
    const tick = () => {
      this.cb.onTime?.(this.el.currentTime || 0, this.el.duration || 0)
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  async load(url: string, autoplay = true): Promise<void> {
    this.ensureGraph()
    if (this.ctx?.state === 'suspended') await this.ctx.resume()
    this.cb.onState?.('loading')
    this.el.src = url
    this.el.load()
    this.startTimeLoop()
    if (autoplay) await this.play()
  }

  async play(): Promise<void> {
    this.ensureGraph()
    if (this.ctx?.state === 'suspended') await this.ctx.resume()
    try {
      await this.el.play()
    } catch (e) {
      this.cb.onError?.(`Playback blocked: ${String(e)}`)
    }
  }

  pause(): void {
    this.el.pause()
  }

  stop(): void {
    this.el.pause()
    this.el.removeAttribute('src')
    this.el.load()
    this.cb.onState?.('idle')
  }

  seek(seconds: number): void {
    if (Number.isFinite(seconds)) this.el.currentTime = seconds
  }

  private baseVolume = 0.9
  private duckFactor = 1

  private applyVolume(): void {
    // gain stays at 1 so the analyser sees full signal; volume rides the element.
    this.el.volume = Math.max(0, Math.min(1, this.baseVolume * this.duckFactor))
  }

  setVolume(v: number): void {
    this.baseVolume = Math.max(0, Math.min(1, v))
    this.applyVolume()
  }

  /** Temporarily lower volume (e.g. while listening / speaking) without losing
   * the user's setting. setDuck(false) restores it. */
  setDuck(active: boolean, factor = 0.1): void {
    this.duckFactor = active ? factor : 1
    this.applyVolume()
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    if (typeof this.el.setSinkId === 'function') {
      try {
        await this.el.setSinkId(deviceId || 'default')
      } catch (e) {
        console.warn('setSinkId failed', e)
      }
    }
  }
}

export const audioEngine = new AudioEngine()
