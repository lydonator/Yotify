import { create } from 'zustand'
import { audioEngine, type PlaybackState } from '@/audio/engine'
import { api } from '@/api/client'
import { useSettings, applyAccent } from '@/state/settingsStore'
import { fetchArtwork, extractColor } from '@/lib/albumArt'
import { useLibrary } from '@/state/libraryStore'
import type { RepeatMode, Track } from '@shared/types'

interface PlayerState {
  state: PlaybackState
  current: Track | null
  /** High-res album art for the current track (iTunes), falling back to thumbnail. */
  artUrl: string | null
  /** Dominant color of the current art, as [r,g,b], or null. */
  artColor: [number, number, number] | null
  /** iTunes album the current track belongs to (for the Album tab). */
  albumId: number | null
  albumName: string | null
  queue: Track[]
  index: number // index of current within queue (-1 if none)
  position: number
  duration: number
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  error: string | null

  // actions
  init: () => void
  playTrack: (track: Track) => Promise<void>
  playQuery: (query: string) => Promise<void>
  enqueue: (track: Track, playNext?: boolean) => void
  enqueueAlbum: (tracks: Track[]) => void
  playDjSet: (tracks: Track[]) => void
  removeGroup: (groupId: string) => void
  playPause: () => void
  stop: () => void
  next: () => Promise<void>
  prev: () => Promise<void>
  seek: (s: number) => void
  setVolume: (v: number) => void
  toggleMute: () => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  removeFromQueue: (id: string) => void
  clearQueue: () => void
}

async function resolveStreamUrl(track: Track): Promise<string> {
  // Prefer a local download (offline / instant) when enabled — match by exact
  // title/artist, then fuzzily by the search query or "artist title".
  if (useSettings.getState().settings.preferLocal) {
    const lib = useLibrary.getState()
    const dl =
      lib.getDownload(track) ||
      lib.findDownloadByQuery(track.query || `${track.artist ?? ''} ${track.title}`)
    if (dl) return api.fileUrl(dl.path)
  }
  if (track.source === 'local' && track.localPath) {
    return api.fileUrl(track.localPath)
  }
  if (track.source === 'search' && track.query) {
    // Album/playlist entry: resolve the actual YouTube stream on first play.
    const info = await api.topStream(track.query)
    return info.streamUrl
  }
  const info = await api.stream(track.id)
  return info.streamUrl
}

let _uidSeq = 0
/** Unique key for a queue entry. */
function genUid(): string {
  return `q${++_uidSeq}-${Math.random().toString(36).slice(2, 6)}`
}
/** Return a queue entry: the track with a guaranteed unique uid. */
function asEntry(track: Track): Track {
  return track.uid ? track : { ...track, uid: genUid() }
}

/** Look up nicer album art + a dominant color, then theme the UI if enabled.
 * Guards against races when the user skips quickly. */
async function enrichArt(track: Track, set: (p: Partial<PlayerState>) => void, isCurrent: () => boolean) {
  const art = await fetchArtwork(track.title, track.artist, track.duration)
  if (!isCurrent()) return
  const url = art?.hiResUrl || track.thumbnail || null
  set({ artUrl: url, albumId: art?.collectionId ?? null, albumName: art?.album ?? null })
  if (!url) return
  const color = await extractColor(url)
  if (!isCurrent()) return
  set({ artColor: color })
  const { dynamicAccent, accent } = useSettings.getState().settings
  applyAccent(dynamicAccent && color ? `${color[0]} ${color[1]} ${color[2]}` : accent)
}

export const usePlayer = create<PlayerState>((set, get) => ({
  state: 'idle',
  current: null,
  artUrl: null,
  artColor: null,
  albumId: null,
  albumName: null,
  queue: [],
  index: -1,
  position: 0,
  duration: 0,
  volume: 0.9,
  muted: false,
  shuffle: false,
  repeat: 'off',
  error: null,

  init: () => {
    audioEngine.attach({
      onState: (s) => set({ state: s }),
      onTime: (current, duration) => set({ position: current, duration }),
      onEnded: () => void get().next(),
      onError: (message) => set({ error: message, state: 'error' })
    })
    audioEngine.setVolume(get().volume)
    const { outputDeviceId } = useSettings.getState().settings
    void audioEngine.setOutputDevice(outputDeviceId)
  },

  playTrack: async (track) => {
    // Resolve to a concrete queue entry: reuse the existing one (matched by uid,
    // or by id for a standalone non-group track), else append a fresh entry.
    const q = get().queue
    let idx = track.uid
      ? q.findIndex((t) => t.uid === track.uid)
      : q.findIndex((t) => !t.groupId && t.id === track.id)
    let entry: Track
    if (idx === -1) {
      entry = asEntry(track)
      set({ queue: [...q, entry], index: q.length })
    } else {
      entry = q[idx]
      set({ index: idx })
    }
    set({
      error: null,
      current: entry,
      state: 'loading',
      artUrl: entry.thumbnail ?? null,
      artColor: null,
      albumId: null,
      albumName: null
    })
    void enrichArt(entry, set, () => get().current?.uid === entry.uid)
    try {
      const url = await resolveStreamUrl(entry)
      await audioEngine.load(url, true)
      useLibrary.getState().addHistory(entry)
    } catch (e) {
      set({ error: String(e), state: 'error' })
    }
  },

  playQuery: async (query) => {
    set({ error: null, state: 'loading' })
    // Prefer a synced offline copy that matches the request before searching.
    if (useSettings.getState().settings.preferLocal) {
      const local = useLibrary.getState().findDownloadByQuery(query)
      if (local) {
        await get().playTrack(local.track)
        return
      }
    }
    try {
      const info = await api.topStream(query)
      await get().playTrack(info.track)
    } catch (e) {
      set({ error: String(e), state: 'error' })
    }
  },

  enqueue: (track, playNext = false) => {
    const { queue, index, current } = get()
    const entry = asEntry(track)
    if (playNext && index >= 0) {
      const copy = [...queue]
      copy.splice(index + 1, 0, entry)
      set({ queue: copy })
    } else {
      set({ queue: [...queue, entry] })
    }
    if (!current) void get().playTrack(entry)
  },

  enqueueAlbum: (tracks) => {
    const { queue, current } = get()
    const entries = tracks.map(asEntry)
    set({ queue: [...queue, ...entries] })
    if (!current && entries.length) void get().playTrack(entries[0])
  },

  playDjSet: (tracks) => {
    if (!tracks.length) return
    const entries = tracks.map(asEntry)
    set({ queue: [...get().queue, ...entries] })
    void get().playTrack(entries[0])
  },

  removeGroup: (groupId) => {
    const { queue, index, current } = get()
    const currentUid = current?.uid
    const kept = queue.filter((t) => t.groupId !== groupId)
    // Recompute the current index against the filtered queue.
    const newIndex = currentUid ? kept.findIndex((t) => t.uid === currentUid) : index
    set({ queue: kept, index: newIndex })
  },

  playPause: () => {
    const { state } = get()
    if (state === 'playing') audioEngine.pause()
    else void audioEngine.play()
  },

  stop: () => {
    audioEngine.stop()
    set({ state: 'idle', position: 0, artColor: null })
    // Restore the user's base accent when nothing is playing.
    applyAccent(useSettings.getState().settings.accent)
  },

  next: async () => {
    const { queue, index, repeat, shuffle } = get()
    if (repeat === 'one' && get().current) {
      audioEngine.seek(0)
      await audioEngine.play()
      return
    }
    if (queue.length === 0) return
    let nextIndex: number
    if (shuffle) {
      nextIndex = Math.floor(Math.random() * queue.length)
    } else {
      nextIndex = index + 1
      if (nextIndex >= queue.length) {
        if (repeat === 'all') nextIndex = 0
        else {
          get().stop()
          return
        }
      }
    }
    set({ index: nextIndex })
    await get().playTrack(queue[nextIndex])
  },

  prev: async () => {
    const { queue, index, position } = get()
    if (position > 3) {
      audioEngine.seek(0)
      return
    }
    if (queue.length === 0) return
    const prevIndex = index - 1 < 0 ? 0 : index - 1
    set({ index: prevIndex })
    await get().playTrack(queue[prevIndex])
  },

  seek: (s) => {
    audioEngine.seek(s)
    set({ position: s })
  },

  setVolume: (v) => {
    audioEngine.setVolume(v)
    set({ volume: v, muted: v === 0 })
  },

  toggleMute: () => {
    const { muted, volume } = get()
    const nextMuted = !muted
    audioEngine.setVolume(nextMuted ? 0 : volume || 0.5)
    set({ muted: nextMuted })
  },

  toggleShuffle: () => set({ shuffle: !get().shuffle }),

  cycleRepeat: () => {
    const order: RepeatMode[] = ['off', 'all', 'one']
    const i = order.indexOf(get().repeat)
    set({ repeat: order[(i + 1) % order.length] })
  },

  removeFromQueue: (uid) => {
    const { queue, index } = get()
    const removeAt = queue.findIndex((t) => t.uid === uid)
    if (removeAt === -1) return
    const copy = queue.filter((t) => t.uid !== uid)
    let newIndex = index
    if (removeAt < index) newIndex = index - 1
    set({ queue: copy, index: newIndex })
  },

  clearQueue: () => set({ queue: [], index: -1 })
}))
