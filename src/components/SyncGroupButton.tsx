import { useLibrary } from '@/state/libraryStore'
import { useDownloader } from '@/state/downloaderStore'
import { Download, Check } from './icons'
import type { Track } from '@shared/types'

/** Sync an album/playlist (all its tracks) for offline, with progress + a
 * "synced" state once every track is local. */
export function SyncGroupButton({
  tracks,
  group,
  label = 'Sync'
}: {
  tracks: Track[]
  group: { groupId: string; groupName: string; groupType: 'album' | 'playlist' }
  label?: string
}) {
  const downloads = useLibrary((s) => s.downloads)
  const progress = useDownloader((s) => s.groupProgress[group.groupId])
  const syncGroup = useDownloader((s) => s.syncGroup)

  const have = (t: Track) =>
    !!downloads[`${(t.artist ?? '').toLowerCase().trim()}|${t.title.toLowerCase().trim()}`]
  const syncedCount = tracks.filter(have).length
  const allSynced = tracks.length > 0 && syncedCount === tracks.length
  const syncing = !!progress

  return (
    <button
      className={`flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
        allSynced
          ? 'bg-emerald-500/15 text-emerald-400'
          : 'bg-white/[0.06] text-slate-200 hover:bg-white/[0.12]'
      } disabled:opacity-60`}
      disabled={syncing || allSynced || !tracks.length}
      title={allSynced ? 'All tracks synced offline' : `${label} for offline`}
      onClick={() => void syncGroup(tracks, group)}
    >
      {allSynced ? (
        <>
          <Check width={14} height={14} /> Synced
        </>
      ) : syncing ? (
        <>
          <Download width={14} height={14} className="animate-pulse" /> {progress!.done}/
          {progress!.total}
        </>
      ) : (
        <>
          <Download width={14} height={14} /> {label}
        </>
      )}
    </button>
  )
}
