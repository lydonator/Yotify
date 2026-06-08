import { useState } from 'react'
import { useLibrary, downloadKey, type DownloadEntry } from '@/state/libraryStore'
import { usePlayer } from '@/state/playerStore'
import { api } from '@/api/client'
import { fmtTime } from '@/lib/format'
import { Play, Trash, MusicNote, Download } from './icons'
import type { Track } from '@shared/types'

export function OfflineLibrary() {
  const downloads = useLibrary((s) => s.downloads)
  const removeDownload = useLibrary((s) => s.removeDownload)
  const removeDownloadsByGroup = useLibrary((s) => s.removeDownloadsByGroup)
  const player = usePlayer()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const entries = Object.values(downloads).sort((a, b) => b.savedAt - a.savedAt)
  const standalone = entries.filter((e) => !e.groupId)
  const groups = new Map<string, { name: string; type: string; entries: DownloadEntry[] }>()
  for (const e of entries) {
    if (!e.groupId) continue
    if (!groups.has(e.groupId))
      groups.set(e.groupId, { name: e.groupName ?? 'Group', type: e.groupType ?? 'album', entries: [] })
    groups.get(e.groupId)!.entries.push(e)
  }

  if (!entries.length)
    return (
      <div className="grid h-full place-items-center px-4 text-center text-sm text-slate-500">
        No offline music yet. Use the download icon on a track, or “Sync” an album/playlist.
      </div>
    )

  async function deleteEntry(e: DownloadEntry) {
    if (!window.confirm(`Delete the downloaded file for “${e.track.title}”? This removes it from disk.`))
      return
    try {
      await api.deleteFile(e.path)
    } catch {
      /* already gone */
    }
    removeDownload(downloadKey(e.track))
  }

  async function deleteGroup(groupId: string, name: string, list: DownloadEntry[]) {
    if (!window.confirm(`Delete all ${list.length} downloaded files for “${name}”? This removes them from disk.`))
      return
    await Promise.all(list.map((e) => api.deleteFile(e.path).catch(() => {})))
    removeDownloadsByGroup(groupId)
  }

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const playAll = (name: string, list: DownloadEntry[]) =>
    player.playDjSet(list.map((e) => ({ ...e.track, groupName: name })))

  return (
    <div className="space-y-1">
      {[...groups.entries()].map(([groupId, grp]) => (
        <div key={groupId} className="rounded-lg bg-white/[0.02]">
          <div className="group flex items-center gap-2 rounded-lg px-2 py-1.5">
            <button
              className="grid h-5 w-5 place-items-center text-slate-400 transition hover:text-white"
              onClick={() => toggle(groupId)}
            >
              <span className={collapsed.has(groupId) ? '' : 'rotate-90'}>▶</span>
            </button>
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded bg-accent-soft text-accent">
              <MusicNote width={14} height={14} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-slate-100">{grp.name}</div>
              <div className="text-[11px] text-slate-500">
                {grp.entries.length} tracks · {grp.type} · offline
              </div>
            </div>
            <button
              className="btn-ghost h-7 w-7"
              title="Play all"
              onClick={() => playAll(grp.name, grp.entries)}
            >
              <Play width={14} height={14} />
            </button>
            <button
              className="btn-ghost h-7 w-7 hover:text-red-300"
              title="Delete all files in this group"
              onClick={() => void deleteGroup(groupId, grp.name, grp.entries)}
            >
              <Trash width={14} height={14} />
            </button>
          </div>
          {!collapsed.has(groupId) && (
            <div className="space-y-0.5 pb-1 pl-4">
              {grp.entries.map((e) => (
                <Row key={e.path} track={e.track} onPlay={() => void player.playTrack(e.track)} onDelete={() => void deleteEntry(e)} />
              ))}
            </div>
          )}
        </div>
      ))}

      {standalone.length > 0 && groups.size > 0 && (
        <div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-wide text-slate-500">Tracks</div>
      )}
      {standalone.map((e) => (
        <Row key={e.path} track={e.track} onPlay={() => void player.playTrack(e.track)} onDelete={() => void deleteEntry(e)} />
      ))}
    </div>
  )
}

function Row({ track, onPlay, onDelete }: { track: Track; onPlay: () => void; onDelete: () => void }) {
  return (
    <div
      onDoubleClick={onPlay}
      className="group flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[0.04]"
    >
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-ink-600">
        {track.thumbnail && <img src={track.thumbnail} alt="" className="h-full w-full object-cover" />}
        <span className="absolute bottom-0 right-0 grid h-4 w-4 place-items-center rounded-tl bg-emerald-500/80 text-white">
          <Download width={10} height={10} />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-slate-100">{track.title}</div>
        <div className="truncate text-xs text-slate-400">
          {track.artist ?? 'Unknown'} {track.duration ? `· ${fmtTime(track.duration)}` : ''}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
        <button className="btn-ghost h-8 w-8 hover:text-red-300" title="Delete file" onClick={onDelete}>
          <Trash width={15} height={15} />
        </button>
        <button
          className="grid h-8 w-8 place-items-center rounded-full bg-accent text-white transition hover:brightness-110"
          title="Play offline"
          onClick={onPlay}
        >
          <Play width={15} height={15} />
        </button>
      </div>
    </div>
  )
}
