import { useSettings } from '@/state/settingsStore'
import type { SearchResult, StreamInfo } from '@shared/types'

/** Resolve the sidecar base URL from the settings store (kept fresh by IPC events). */
function baseUrl(): string {
  const url = useSettings.getState().baseUrl
  if (!url) throw new Error('Sidecar is not running')
  return url
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Sidecar ${path} failed (${res.status}): ${text}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  /** Push runtime config (cookies file path, wake-word on/off) to the sidecar. */
  setConfig(patch: {
    cookiesFile?: string
    wakeWord?: boolean
    sttProvider?: string
    sttApiKey?: string
    whisperModel?: string
  }): Promise<{ ok: boolean; authenticated: boolean; wakeRunning: boolean; wakeError?: string }> {
    return getJson('/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    })
  },

  /** Search YouTube for tracks matching the query (via yt-dlp ytsearch). */
  search(query: string, limit = 12): Promise<{ results: SearchResult[] }> {
    return getJson(`/search?q=${encodeURIComponent(query)}&limit=${limit}`)
  },

  /** Resolve a direct, playable audio stream URL for a video id. */
  stream(videoId: string): Promise<StreamInfo> {
    return getJson(`/stream/${encodeURIComponent(videoId)}`)
  },

  /** Search + resolve the top hit's stream in one call. */
  topStream(query: string): Promise<StreamInfo> {
    return getJson(`/top?q=${encodeURIComponent(query)}`)
  },

  /** Trigger a local download of a track; returns the saved path. */
  download(videoId: string, folder: string, fmt: string): Promise<{ path: string }> {
    const params = new URLSearchParams({ folder, fmt })
    return getJson(`/download/${encodeURIComponent(videoId)}?${params}`, { method: 'POST' })
  },

  /** URL to stream a locally-downloaded file from the sidecar (range-enabled). */
  fileUrl(path: string): string {
    return `${baseUrl()}/file?path=${encodeURIComponent(path)}`
  },

  /** Delete a downloaded file from disk. */
  deleteFile(path: string): Promise<{ ok: boolean }> {
    return getJson(`/file?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
  },

  /** Transcribe a recorded audio blob via the configured STT provider. */
  async transcribe(blob: Blob, model = 'small'): Promise<{ text: string; device?: string }> {
    const form = new FormData()
    form.append('audio', blob, 'speech.webm')
    form.append('model', model)
    const res = await fetch(`${baseUrl()}/stt`, { method: 'POST', body: form })
    if (!res.ok) throw new Error(`STT failed (${res.status})`)
    return res.json()
  }
}

export interface LyricsCandidate {
  synced?: string
  plain?: string
  duration?: number // seconds, the recording these lyrics are timed to
}

/**
 * Fetch candidate lyrics from LRCLIB (free, no key). Returns all matches so the
 * caller can pick the one whose duration best matches the *playing* audio —
 * crucial for sync, since different recordings (remaster/live/extended) share a
 * title but have different timing.
 */
export async function fetchLyrics(
  artist: string | undefined,
  title: string
): Promise<LyricsCandidate[]> {
  try {
    const params = new URLSearchParams({ track_name: title, artist_name: artist ?? '' })
    const res = await fetch(`https://lrclib.net/api/search?${params}`)
    if (!res.ok) return []
    const list = (await res.json()) as Array<{
      syncedLyrics?: string
      plainLyrics?: string
      duration?: number
    }>
    return list.map((l) => ({
      synced: l.syncedLyrics ?? undefined,
      plain: l.plainLyrics ?? undefined,
      duration: l.duration
    }))
  } catch {
    return []
  }
}
