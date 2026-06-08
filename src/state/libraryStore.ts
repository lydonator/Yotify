import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Track } from '@shared/types'

export interface Playlist {
  id: string
  name: string
  tracks: Track[]
  createdAt: number
}

interface HistoryEntry {
  track: Track
  playedAt: number
}

export interface DownloadEntry {
  track: Track
  path: string
  videoId: string
  savedAt: number
  /** When synced as part of an album/playlist, groups it in the Offline page. */
  groupId?: string
  groupName?: string
  groupType?: 'album' | 'playlist'
}

/** Normalized "artist|title" key so a download is reused regardless of source
 * (YouTube id vs. album/search synthetic id). */
export function downloadKey(track: { artist?: string; title: string }): string {
  return `${(track.artist ?? '').toLowerCase().trim()}|${track.title.toLowerCase().trim()}`
}

interface LibraryState {
  favorites: Track[]
  history: HistoryEntry[]
  playlists: Playlist[]
  downloads: Record<string, DownloadEntry>

  isFavorite: (id: string) => boolean
  toggleFavorite: (track: Track) => void
  removeFavorite: (id: string) => void
  addHistory: (track: Track) => void
  clearHistory: () => void

  createPlaylist: (name: string) => string
  deletePlaylist: (id: string) => void
  renamePlaylist: (id: string, name: string) => void
  addToPlaylist: (id: string, track: Track) => void
  addTracksToPlaylist: (id: string, tracks: Track[]) => void
  removeFromPlaylist: (id: string, trackId: string) => void

  getDownload: (track: { artist?: string; title: string }) => DownloadEntry | undefined
  /** Find a synced track that matches a free-text request like "adventures on earth". */
  findDownloadByQuery: (query: string) => DownloadEntry | undefined
  addDownload: (entry: DownloadEntry) => void
  removeDownload: (key: string) => void
  removeDownloadsByGroup: (groupId: string) => void
}

function normalizeText(x?: string): string {
  return (x ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Noise words ignored when token-matching a request against a stored title.
const STOP = new Set([
  'the', 'a', 'an', 'of', 'on', 'in', 'to', 'and', 'for', 'with', 'feat', 'ft', 'by',
  'official', 'video', 'audio', 'lyrics', 'lyric', 'hd', 'hq', '4k', 'remastered',
  'remaster', 'from', 'theme', 'soundtrack', 'ost', 'mv', 'live', 'play'
])

function sigTokens(x?: string): string[] {
  return normalizeText(x)
    .split(' ')
    .filter((w) => w.length > 1 && !STOP.has(w))
}

// Monotonic id helper (Date.now()/Math.random are fine in the renderer).
function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

/** Strip queue-only fields (uid/group) before storing a track in the library,
 * so re-queuing it later gets fresh queue identities. */
function clean(track: Track): Track {
  const { uid: _u, groupId: _g, groupName: _n, ...rest } = track
  return rest
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      favorites: [],
      history: [],
      playlists: [],
      downloads: {},

      isFavorite: (id) => get().favorites.some((t) => t.id === id),

      toggleFavorite: (track) => {
        const exists = get().favorites.some((t) => t.id === track.id)
        set({
          favorites: exists
            ? get().favorites.filter((t) => t.id !== track.id)
            : [clean(track), ...get().favorites]
        })
      },

      removeFavorite: (id) => set({ favorites: get().favorites.filter((t) => t.id !== id) }),

      addHistory: (track) => {
        // Dedupe consecutive repeats; cap at 200 entries.
        const hist = get().history.filter((h) => h.track.id !== track.id)
        set({ history: [{ track: clean(track), playedAt: Date.now() }, ...hist].slice(0, 200) })
      },

      clearHistory: () => set({ history: [] }),

      createPlaylist: (name) => {
        const id = uid()
        set({
          playlists: [
            ...get().playlists,
            { id, name: name.trim() || 'Untitled', tracks: [], createdAt: Date.now() }
          ]
        })
        return id
      },

      deletePlaylist: (id) => set({ playlists: get().playlists.filter((p) => p.id !== id) }),

      renamePlaylist: (id, name) =>
        set({
          playlists: get().playlists.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p))
        }),

      addToPlaylist: (id, track) =>
        set({
          playlists: get().playlists.map((p) =>
            p.id === id && !p.tracks.some((t) => t.id === track.id)
              ? { ...p, tracks: [...p.tracks, clean(track)] }
              : p
          )
        }),

      addTracksToPlaylist: (id, tracks) =>
        set({
          playlists: get().playlists.map((p) => {
            if (p.id !== id) return p
            const have = new Set(p.tracks.map((t) => t.id))
            const add = tracks.filter((t) => !have.has(t.id)).map(clean)
            return { ...p, tracks: [...p.tracks, ...add] }
          })
        }),

      removeFromPlaylist: (id, trackId) =>
        set({
          playlists: get().playlists.map((p) =>
            p.id === id ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) } : p
          )
        }),

      getDownload: (track) => get().downloads[downloadKey(track)],

      findDownloadByQuery: (query) => {
        const qNorm = normalizeText(query)
        if (!qNorm) return undefined
        const qTok = sigTokens(query)
        let best: DownloadEntry | undefined
        let bestScore = 0
        for (const e of Object.values(get().downloads)) {
          const titleNorm = normalizeText(e.track.title)
          if (!titleNorm) continue
          const artistNorm = normalizeText(e.track.artist)
          const qNoArtist = artistNorm ? qNorm.replace(artistNorm, '').replace(/\s+/g, ' ').trim() : qNorm
          // Stored titles are often verbose YouTube strings, so match on tokens.
          const hay = new Set([...sigTokens(e.track.title), ...sigTokens(e.track.artist)])
          const titleTok = sigTokens(e.track.title)

          let score = 0
          if (qNorm === titleNorm || qNoArtist === titleNorm) {
            score = 4 // exact title (handles single-word titles too)
          } else if (qTok.length >= 2 && qTok.every((t) => hay.has(t))) {
            score = 3 // every word of the request is in the title/artist
          } else if (titleTok.length >= 2 && titleTok.every((t) => qTok.includes(t))) {
            score = 3 // the full (significant) title appears in the request
          }
          if (score > bestScore) {
            bestScore = score
            best = e
          }
        }
        return bestScore >= 3 ? best : undefined
      },

      addDownload: (entry) =>
        set({ downloads: { ...get().downloads, [downloadKey(entry.track)]: entry } }),

      removeDownload: (key) => {
        const next = { ...get().downloads }
        delete next[key]
        set({ downloads: next })
      },

      removeDownloadsByGroup: (groupId) => {
        const next = Object.fromEntries(
          Object.entries(get().downloads).filter(([, e]) => e.groupId !== groupId)
        )
        set({ downloads: next })
      }
    }),
    { name: 'yotify-library' }
  )
)
