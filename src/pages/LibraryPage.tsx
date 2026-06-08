import { useState } from 'react'
import { useLibrary, type Playlist } from '@/state/libraryStore'
import { usePlayer } from '@/state/playerStore'
import { fmtTime } from '@/lib/format'
import { Play, Next as QueueIcon, Trash, Heart, Clock, MusicNote, Plus, Download } from '@/components/icons'
import { AddToPlaylist } from '@/components/AddToPlaylist'
import { SyncGroupButton } from '@/components/SyncGroupButton'
import { OfflineLibrary } from '@/components/OfflineLibrary'
import type { Track } from '@shared/types'

type Tab = 'recent' | 'liked' | 'playlists' | 'downloads'

export function LibraryPage() {
  const [tab, setTab] = useState<Tab>('recent')
  const lib = useLibrary()

  return (
    <div className="glass flex h-full flex-col rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Library</h1>
        <div className="flex gap-1 rounded-xl bg-white/[0.04] p-1">
          {(
            [
              ['recent', 'Recent', Clock],
              ['liked', 'Liked', Heart],
              ['playlists', 'Playlists', MusicNote],
              ['downloads', 'Offline', Download]
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                tab === id ? 'bg-accent text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon width={15} height={15} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {tab === 'recent' && (
          <TrackList
            tracks={lib.history.map((h) => h.track)}
            empty="Nothing played yet."
            onClear={lib.history.length ? lib.clearHistory : undefined}
          />
        )}
        {tab === 'liked' && (
          <TrackList
            tracks={lib.favorites}
            empty="No liked songs yet — tap the heart while playing."
            onRemove={lib.removeFavorite}
          />
        )}
        {tab === 'playlists' && <Playlists />}
        {tab === 'downloads' && <OfflineLibrary />}
      </div>
    </div>
  )
}

function TrackList({
  tracks,
  empty,
  onClear,
  onRemove
}: {
  tracks: Track[]
  empty: string
  onClear?: () => void
  onRemove?: (id: string) => void
}) {
  const player = usePlayer()
  if (!tracks.length)
    return <div className="grid h-full place-items-center text-sm text-slate-500">{empty}</div>
  return (
    <div className="space-y-1">
      {onClear && (
        <div className="flex justify-end">
          <button className="text-xs text-slate-400 hover:text-red-300" onClick={onClear}>
            Clear
          </button>
        </div>
      )}
      {tracks.map((t, i) => (
        <div
          key={`${t.id}-${i}`}
          className="group flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[0.04]"
        >
          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-ink-600">
            {t.thumbnail && <img src={t.thumbnail} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-slate-100">{t.title}</div>
            <div className="truncate text-xs text-slate-400">
              {t.artist ?? 'Unknown'} {t.duration ? `· ${fmtTime(t.duration)}` : ''}
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            <button className="btn-ghost h-8 w-8" title="Add to queue" onClick={() => player.enqueue(t)}>
              <QueueIcon width={16} height={16} />
            </button>
            <AddToPlaylist track={t} />
            {onRemove && (
              <button className="btn-ghost h-8 w-8" title="Remove" onClick={() => onRemove(t.id)}>
                <Trash width={15} height={15} />
              </button>
            )}
            <button
              className="grid h-8 w-8 place-items-center rounded-full bg-accent text-white transition hover:brightness-110"
              title="Play"
              onClick={() => void player.playTrack(t)}
            >
              <Play width={15} height={15} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function Playlists() {
  const lib = useLibrary()
  const player = usePlayer()
  const current = usePlayer((s) => s.current)
  const [open, setOpen] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  const playlist = lib.playlists.find((p) => p.id === open)

  if (playlist) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <button className="text-sm text-slate-400 hover:text-slate-200" onClick={() => setOpen(null)}>
            ← Playlists
          </button>
          <div className="flex gap-2">
            {current && (
              <button
                className="chip hover:text-white"
                onClick={() => lib.addToPlaylist(playlist.id, current)}
              >
                + Add now-playing
              </button>
            )}
            <button
              className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
              disabled={!playlist.tracks.length}
              onClick={() => {
                player.clearQueue()
                playlist.tracks.forEach((t, i) => (i === 0 ? player.playTrack(t) : player.enqueue(t)))
              }}
            >
              ▶ Play all
            </button>
          </div>
        </div>
        <h2 className="text-lg font-bold text-white">{playlist.name}</h2>
        <TrackList
          tracks={playlist.tracks}
          empty="Empty playlist. Add the now-playing track, or build it by voice later."
          onRemove={(id) => lib.removeFromPlaylist(playlist.id, id)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (newName.trim()) {
            lib.createPlaylist(newName)
            setNewName('')
          }
        }}
      >
        <input
          className="input"
          placeholder="New playlist name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button
          type="submit"
          className="flex shrink-0 items-center gap-1 rounded-xl bg-accent px-4 text-sm font-medium text-white"
        >
          <Plus width={16} height={16} /> Create
        </button>
      </form>
      {!lib.playlists.length && (
        <div className="grid place-items-center py-10 text-sm text-slate-500">
          No playlists yet. Create one above.
        </div>
      )}
      {lib.playlists.map((p: Playlist) => (
        <div
          key={p.id}
          className="group flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-white/[0.04]"
        >
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
            <MusicNote width={18} height={18} />
          </div>
          <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(p.id)}>
            <div className="truncate text-sm font-medium text-slate-100">{p.name}</div>
            <div className="text-xs text-slate-400">{p.tracks.length} tracks</div>
          </button>
          <div className="opacity-0 transition group-hover:opacity-100">
            <SyncGroupButton
              tracks={p.tracks}
              group={{ groupId: `pl-${p.id}`, groupName: p.name, groupType: 'playlist' }}
            />
          </div>
          <button
            className="flex shrink-0 items-center gap-1 rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-slate-200 opacity-0 transition hover:bg-white/[0.12] group-hover:opacity-100 disabled:opacity-0"
            title="Add this playlist to the queue (collapsible group)"
            disabled={!p.tracks.length}
            onClick={() => {
              const groupId = `pl-${p.id}-${Date.now().toString(36)}`
              player.enqueueAlbum(p.tracks.map((t) => ({ ...t, groupId, groupName: p.name })))
            }}
          >
            <QueueIcon width={14} height={14} /> Add to queue
          </button>
          <button
            className="btn-ghost h-8 w-8 opacity-0 transition group-hover:opacity-100"
            title="Delete playlist"
            onClick={() => lib.deletePlaylist(p.id)}
          >
            <Trash width={15} height={15} />
          </button>
        </div>
      ))}
    </div>
  )
}
