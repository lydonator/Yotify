import { create } from 'zustand'
import { api } from '@/api/client'
import { useSettings } from '@/state/settingsStore'
import { useLibrary, downloadKey } from '@/state/libraryStore'
import type { Track } from '@shared/types'

interface GroupMeta {
  groupId: string
  groupName: string
  groupType: 'album' | 'playlist'
}

interface DownloaderState {
  inProgress: Record<string, boolean> // by track key
  groupProgress: Record<string, { done: number; total: number }> // by groupId
  error: string | null
  isDownloading: (track: { artist?: string; title: string }) => boolean
  download: (track: Track, group?: GroupMeta) => Promise<boolean>
  syncGroup: (tracks: Track[], group: GroupMeta) => Promise<void>
}

/** Resolves tracks to YouTube ids, downloads them via the sidecar to the user's
 * folder, and records them in the library's download index. Sync is explicit —
 * nothing is saved automatically. */
export const useDownloader = create<DownloaderState>((set, get) => ({
  inProgress: {},
  groupProgress: {},
  error: null,

  isDownloading: (track) => !!get().inProgress[downloadKey(track)],

  download: async (track, group) => {
    const key = downloadKey(track)
    const lib = useLibrary.getState()
    if (lib.getDownload(track)) return true
    if (get().inProgress[key]) return false
    set({ inProgress: { ...get().inProgress, [key]: true }, error: null })
    try {
      const s = useSettings.getState().settings
      const videoId =
        track.source === 'youtube'
          ? track.id
          : (await api.topStream(track.query || `${track.artist ?? ''} ${track.title}`)).track.id
      const { path } = await api.download(videoId, s.downloadFolder, s.audioFormat)
      useLibrary.getState().addDownload({
        track: {
          id: videoId,
          title: track.title,
          artist: track.artist,
          thumbnail: track.thumbnail,
          duration: track.duration,
          source: 'local',
          localPath: path
        },
        path,
        videoId,
        savedAt: Date.now(),
        groupId: group?.groupId,
        groupName: group?.groupName,
        groupType: group?.groupType
      })
      return true
    } catch (e) {
      set({ error: String(e) })
      return false
    } finally {
      const next = { ...get().inProgress }
      delete next[key]
      set({ inProgress: next })
    }
  },

  syncGroup: async (tracks, group) => {
    set({
      groupProgress: { ...get().groupProgress, [group.groupId]: { done: 0, total: tracks.length } }
    })
    // Sequential to avoid hammering YouTube / saturating the connection.
    for (let i = 0; i < tracks.length; i++) {
      await get().download(tracks[i], group)
      set({
        groupProgress: {
          ...get().groupProgress,
          [group.groupId]: { done: i + 1, total: tracks.length }
        }
      })
    }
    const next = { ...get().groupProgress }
    delete next[group.groupId]
    set({ groupProgress: next })
  }
}))
