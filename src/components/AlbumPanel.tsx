import { useEffect, useState, type ReactNode } from 'react'
import { usePlayer } from '@/state/playerStore'
import { fetchAlbumTracks, type AlbumTrack } from '@/lib/albumArt'
import { api } from '@/api/client'
import { fmtTime } from '@/lib/format'
import { Play, Next as QueueIcon, Plus } from './icons'
import { AddToPlaylist } from './AddToPlaylist'
import { SyncGroupButton } from './SyncGroupButton'
import type { Track } from '@shared/types'

/** Shows the tracklist of the album the current song belongs to (via iTunes),
 * each track playable from YouTube through our normal search/stream path. */
export function AlbumPanel() {
  const albumId = usePlayer((s) => s.albumId)
  const albumName = usePlayer((s) => s.albumName)
  const current = usePlayer((s) => s.current)
  // Actions only (stable refs) — avoids re-rendering the tracklist on ticks.
  const enqueue = usePlayer((s) => s.enqueue)
  const enqueueAlbum = usePlayer((s) => s.enqueueAlbum)
  const playQuery = usePlayer((s) => s.playQuery)
  const [tracks, setTracks] = useState<AlbumTrack[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setTracks([])
    if (!albumId) return
    setLoading(true)
    let cancelled = false
    fetchAlbumTracks(albumId).then((t) => {
      if (!cancelled) {
        setTracks(t)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [albumId])

  if (!albumId)
    return (
      <Centered>
        {current ? 'No album info found for this track.' : 'Play a song to see its album here.'}
      </Centered>
    )
  if (loading) return <Centered>Loading album…</Centered>
  if (!tracks.length) return <Centered>Couldn’t find this album.</Centered>

  const playingTitle = current?.title?.toLowerCase() ?? ''

  const toSearchTrack = (t: AlbumTrack, i: number): Track => ({
    id: `srch-alb-${albumId}-${i}`,
    title: t.title,
    artist: t.artist,
    duration: t.duration,
    thumbnail: t.thumbnail,
    source: 'search',
    query: `${t.artist} ${t.title}`
  })

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-end justify-between gap-2 px-1">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{albumName}</div>
          <div className="text-xs text-slate-400">{tracks.length} tracks · from YouTube</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {albumId && (
            <SyncGroupButton
              tracks={tracks.map(toSearchTrack)}
              group={{ groupId: `alb-${albumId}`, groupName: albumName ?? 'Album', groupType: 'album' }}
            />
          )}
          <AddToPlaylist tracks={tracks.map(toSearchTrack)} title="Add album to a playlist" />
          <button
            className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110"
            title="Add the whole album to the queue (as individual tracks you can prune)"
            onClick={() => {
              const groupId = `alb-${albumId}-${Date.now().toString(36)}`
              const queued: Track[] = tracks.map((t, i) => ({
                ...toSearchTrack(t, i),
                id: `srch-${groupId}-${i}`,
                groupId,
                groupName: albumName ?? undefined
              }))
              enqueueAlbum(queued)
            }}
          >
            <Plus width={14} height={14} /> Add album
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {tracks.map((t, i) => {
          const isCurrent = playingTitle.includes(t.title.toLowerCase().slice(0, 12))
          const query = `${t.artist} ${t.title}`
          return (
            <div
              key={i}
              className={`group flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[0.04] ${
                isCurrent ? 'bg-accent-soft' : ''
              }`}
            >
              <div className="w-5 text-center text-[11px] tabular-nums text-slate-500">
                {isCurrent ? '▶' : t.trackNumber || i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`truncate text-sm ${isCurrent ? 'text-accent' : 'text-slate-100'}`}>
                  {t.title}
                </div>
                <div className="truncate text-xs text-slate-400">{t.artist}</div>
              </div>
              <span className="text-[11px] tabular-nums text-slate-500">
                {t.duration ? fmtTime(t.duration) : ''}
              </span>
              <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                <button
                  className="btn-ghost h-8 w-8"
                  title="Add to queue"
                  onClick={async () => {
                    try {
                      const info = await api.topStream(query)
                      enqueue(info.track)
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  <QueueIcon width={16} height={16} />
                </button>
                <AddToPlaylist track={toSearchTrack(t, i)} />
                <button
                  className="grid h-8 w-8 place-items-center rounded-full bg-accent text-white transition hover:brightness-110"
                  title="Play from YouTube"
                  onClick={() => void playQuery(query)}
                >
                  <Play width={15} height={15} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-full place-items-center px-4 text-center text-sm text-slate-500">
      {children}
    </div>
  )
}
