// Microphone capture with simple voice-activity detection, then transcription
// via the sidecar's /stt endpoint (faster-whisper).

import { api } from '@/api/client'
import { useSettings } from '@/state/settingsStore'

interface RecordOptions {
  maxMs?: number // hard cap
  silenceMs?: number // stop after this much trailing silence
  onLevel?: (level: number) => void // 0..1, for UI feedback
}

/**
 * Record from the selected microphone until the speaker goes quiet (VAD) or the
 * max duration is hit, then return the captured audio as a Blob.
 */
export async function recordUtterance(opts: RecordOptions = {}): Promise<Blob> {
  const { maxMs = 8000, silenceMs = 1100, onLevel } = opts
  const inputDeviceId = useSettings.getState().settings.inputDeviceId

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: inputDeviceId ? { deviceId: { exact: inputDeviceId } } : true
  })

  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm'
  const recorder = new MediaRecorder(stream, { mimeType: mime })
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)

  // VAD via Web Audio
  const ctx = new AudioContext()
  const src = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  src.connect(analyser)
  const buf = new Uint8Array(analyser.fftSize)

  return new Promise<Blob>((resolve) => {
    let lastVoice = Date.now()
    let started = Date.now()
    let raf = 0
    let heardVoice = false

    const cleanup = () => {
      cancelAnimationFrame(raf)
      stream.getTracks().forEach((t) => t.stop())
      ctx.close()
    }

    recorder.onstop = () => {
      cleanup()
      resolve(new Blob(chunks, { type: mime }))
    }

    const tick = () => {
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / buf.length)
      onLevel?.(Math.min(1, rms * 4))

      const now = Date.now()
      if (rms > 0.04) {
        lastVoice = now
        heardVoice = true
      }
      const elapsed = now - started
      const silentFor = now - lastVoice
      // Stop on trailing silence (only after we've actually heard speech), or cap.
      if (elapsed > maxMs || (heardVoice && silentFor > silenceMs && elapsed > 700)) {
        if (recorder.state !== 'inactive') recorder.stop()
        return
      }
      raf = requestAnimationFrame(tick)
    }

    recorder.start()
    raf = requestAnimationFrame(tick)
  })
}

/** Capture a spoken command and return its transcript. */
export async function listenForCommand(onLevel?: (level: number) => void): Promise<string> {
  const blob = await recordUtterance({ onLevel })
  const model = useSettings.getState().settings.whisperModel
  const { text } = await api.transcribe(blob, model)
  return text.trim()
}
