import { useState } from 'react'
import { usePlayer } from '@/state/playerStore'
import { fmtTime } from '@/lib/format'
import { Trash, MusicNote } from './icons'
import { AddToPlaylist } from './AddToPlaylist'
import type { Track } from '@shared/types'

interface Indexed {
  track: Track
  qi: number // index within the queue
}
type Unit =
  | { type: 'track'; item: Indexed }
  | { type: 'group'; groupId: string; name: string; items: Indexed[] }

/** Collapse the flat queue into render units, grouping contiguous album runs. */
function buildUnits(queue: Track[]): Unit[] {
  const units: Unit[] = []
  let i = 0
  while (i < queue.length) {
    const t = queue[i]
    if (t.groupId) {
      const groupId = t.groupId
      const items: Indexed[] = []
      while (i < queue.length && queue[i].groupId === groupId) {
        items.push({ track: queue[i], qi: i })
        i++
      }
      units.push({ type: 'group', groupId, name: t.groupName ?? 'Album', items })
    } else {
      units.push({ type: 'track', item: { track: t, qi: i } })
      i++
    }
  }
  return units
}

export function QueuePanel() {
  // Narrow selectors: the queue list only re-renders when the queue or the
  // playing track changes — not on every playback position tick.
  const queue = usePlayer((s) => s.queue)
  const current = usePlayer((s) => s.current)
  const removeFromQueue = usePlayer((s) => s.removeFromQueue)
  const removeGroup = usePlayer((s) => s.removeGroup)
  const clearQueue = usePlayer((s) => s.clearQueue)
  const playTrack = usePlayer((s) => s.playTrack)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const units = buildUnits(queue)
  const isNowPlaying = (t: Track) => !!current?.uid && current.uid === t.uid

  return (
    <div className="glass flex h-full flex-col rounded-2xl">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <MusicNote width={16} height={16} className="text-accent" />
          Queue
          <span className="chip ml-1">{queue.length}</span>
        </div>
        {queue.length > 0 && (
          <button className="text-xs text-slate-400 transition hover:text-red-300" onClick={clearQueue}>
            Clear
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
        {queue.length === 0 && (
          <div className="grid h-full place-items-center px-4 text-center text-xs text-slate-500">
            Your queue is empty. Play a song, add tracks, or add a whole album.
          </div>
        )}

        {units.map((u) =>
          u.type === 'track' ? (
            <Row
              key={u.item.track.uid}
              indexed={u.item}
              now={isNowPlaying(u.item.track)}
              onPlay={() => void playTrack(u.item.track)}
              onRemove={() => u.item.track.uid && removeFromQueue(u.item.track.uid)}
            />
          ) : (
            <div key={u.groupId} className="rounded-lg bg-white/[0.02]">
              <div className="group flex items-center gap-2 rounded-lg px-2 py-1.5">
                <button
                  className="grid h-5 w-5 place-items-center text-slate-400 transition hover:text-white"
                  onClick={() => toggle(u.groupId)}
                  title={collapsed.has(u.groupId) ? 'Expand' : 'Collapse'}
                >
                  <span className={`transition ${collapsed.has(u.groupId) ? '' : 'rotate-90'}`}>▶</span>
                </button>
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded bg-accent-soft text-accent">
                  <MusicNote width={14} height={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-slate-100">{u.name}</div>
                  <div className="text-[11px] text-slate-500">{u.items.length} tracks · album</div>
                </div>
                <button
                  className="btn-ghost h-7 w-7 opacity-0 transition group-hover:opacity-100"
                  title="Remove album from queue"
                  onClick={() => removeGroup(u.groupId)}
                >
                  <Trash width={14} height={14} />
                </button>
              </div>
              {!collapsed.has(u.groupId) && (
                <div className="space-y-0.5 pb-1 pl-4">
                  {u.items.map((it) => (
                    <Row
                      key={it.track.uid}
                      indexed={it}
                      now={isNowPlaying(it.track)}
                      onPlay={() => void playTrack(it.track)}
                      onRemove={() => it.track.uid && removeFromQueue(it.track.uid)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  )
}

function Row({
  indexed,
  now,
  onPlay,
  onRemove
}: {
  indexed: Indexed
  now: boolean
  onPlay: () => void
  onRemove: () => void
}) {
  const t = indexed.track
  return (
    <div
      onDoubleClick={onPlay}
      className={`group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition ${
        now ? 'bg-accent-soft' : 'hover:bg-white/[0.04]'
      }`}
    >
      <div className="w-5 text-center text-[11px] tabular-nums text-slate-500">
        {now ? '▶' : indexed.qi + 1}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[13px] ${now ? 'text-accent' : 'text-slate-200'}`}>
          {t.title}
        </div>
        <div className="truncate text-[11px] text-slate-500">{t.artist ?? '—'}</div>
      </div>
      <span className="text-[11px] tabular-nums text-slate-500">
        {t.duration ? fmtTime(t.duration) : ''}
      </span>
      <div className="flex items-center opacity-0 transition group-hover:opacity-100">
        <AddToPlaylist track={t} />
        <button className="btn-ghost h-7 w-7" onClick={onRemove} title="Remove">
          <Trash width={14} height={14} />
        </button>
      </div>
    </div>
  )
}
