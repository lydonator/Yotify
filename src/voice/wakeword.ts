// "Hey DJ" wake word. Detection runs in the Python sidecar (Vosk, offline, free);
// the renderer just subscribes to the sidecar's Server-Sent Events stream and
// kicks off a listen/act cycle when the wake word fires.

import { api } from '@/api/client'
import { useSettings } from '@/state/settingsStore'
import { useVoice } from './voiceStore'

let source: EventSource | null = null

export async function startWakeWord(): Promise<{ ok: boolean; reason?: string }> {
  const baseUrl = useSettings.getState().baseUrl
  if (!baseUrl) return { ok: false, reason: 'Sidecar not running' }
  try {
    await api.setConfig({ wakeWord: true })
  } catch (e) {
    return { ok: false, reason: String(e) }
  }
  if (source) return { ok: true }

  source = new EventSource(`${baseUrl}/wake/stream`)
  source.addEventListener('wake', () => {
    void useVoice.getState().activate()
  })
  source.onerror = () => {
    // EventSource auto-reconnects; nothing to do.
  }
  return { ok: true }
}

export async function stopWakeWord(): Promise<void> {
  if (source) {
    source.close()
    source = null
  }
  try {
    await api.setConfig({ wakeWord: false })
  } catch {
    // sidecar may be down; ignore.
  }
}

export function isWakeWordRunning(): boolean {
  return source !== null
}
