import { useShallow } from 'zustand/react/shallow'
import { usePlayer } from '@/state/playerStore'
import { useLibrary } from '@/state/libraryStore'
import { AddToPlaylist } from './AddToPlaylist'
import { DownloadButton } from './DownloadButton'
import { fmtTime } from '@/lib/format'
import {
  Play,
  Pause,
  Next,
  Prev,
  Shuffle,
  Repeat,
  VolumeHigh,
  VolumeMute,
  Heart
} from './icons'

export function TransportBar() {
  // Select only what's rendered (actions are stable refs), so the bar only
  // re-renders when one of these actually changes — not on every store write.
  const p = usePlayer(
    useShallow((s) => ({
      state: s.state,
      current: s.current,
      artUrl: s.artUrl,
      position: s.position,
      duration: s.duration,
      volume: s.volume,
      muted: s.muted,
      shuffle: s.shuffle,
      repeat: s.repeat,
      playPause: s.playPause,
      next: s.next,
      prev: s.prev,
      seek: s.seek,
      setVolume: s.setVolume,
      toggleMute: s.toggleMute,
      toggleShuffle: s.toggleShuffle,
      cycleRepeat: s.cycleRepeat
    }))
  )
  const playing = p.state === 'playing'
  const favorites = useLibrary((s) => s.favorites)
  const toggleFavorite = useLibrary((s) => s.toggleFavorite)
  const liked = !!p.current && favorites.some((t) => t.id === p.current!.id)

  return (
    <div className="glass-strong flex items-center gap-4 rounded-2xl px-4 py-3">
      {/* Now playing thumbnail + title */}
      <div className="flex min-w-0 flex-[1.2] items-center gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-ink-600">
          {(p.artUrl || p.current?.thumbnail) && (
            <img
              src={p.artUrl ?? p.current?.thumbnail}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-100">
            {p.current?.title ?? 'Nothing playing'}
          </div>
          <div className="truncate text-xs text-slate-400">{p.current?.artist ?? '—'}</div>
        </div>
        <button
          className={`btn-ghost h-8 w-8 shrink-0 ${liked ? 'text-accent' : ''}`}
          title={liked ? 'Remove from favorites' : 'Add to favorites'}
          disabled={!p.current}
          onClick={() => p.current && toggleFavorite(p.current)}
        >
          <Heart width={16} height={16} fill={liked ? 'currentColor' : 'none'} />
        </button>
        {p.current && <AddToPlaylist track={p.current} />}
        {p.current && <DownloadButton track={p.current} />}
      </div>

      {/* Transport + seek */}
      <div className="flex flex-[1.6] flex-col items-center gap-1.5">
        <div className="flex items-center gap-2">
          <button
            className={`btn-ghost h-8 w-8 ${p.shuffle ? 'text-accent' : ''}`}
            onClick={p.toggleShuffle}
            title="Shuffle"
          >
            <Shuffle width={16} height={16} />
          </button>
          <button className="btn-ghost h-9 w-9" onClick={() => void p.prev()} title="Previous">
            <Prev width={18} height={18} />
          </button>
          <button
            className="grid h-11 w-11 place-items-center rounded-full bg-accent text-white shadow-glow transition hover:brightness-110 active:scale-95"
            onClick={p.playPause}
            title={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause width={20} height={20} /> : <Play width={20} height={20} />}
          </button>
          <button className="btn-ghost h-9 w-9" onClick={() => void p.next()} title="Next">
            <Next width={18} height={18} />
          </button>
          <button
            className={`btn-ghost relative h-8 w-8 ${p.repeat !== 'off' ? 'text-accent' : ''}`}
            onClick={p.cycleRepeat}
            title={`Repeat: ${p.repeat}`}
          >
            <Repeat width={16} height={16} />
            {p.repeat === 'one' && (
              <span className="absolute -bottom-0.5 right-0.5 text-[9px] font-bold">1</span>
            )}
          </button>
        </div>
        <div className="flex w-full items-center gap-2">
          <span className="w-9 text-right text-[11px] tabular-nums text-slate-400">
            {fmtTime(p.position)}
          </span>
          <Seekbar value={p.position} max={p.duration || 0} onChange={p.seek} />
          <span className="w-9 text-[11px] tabular-nums text-slate-400">{fmtTime(p.duration)}</span>
        </div>
      </div>

      {/* Volume */}
      <div className="flex flex-1 items-center justify-end gap-2">
        <button className="btn-ghost h-8 w-8" onClick={p.toggleMute}>
          {p.muted ? <VolumeMute width={18} height={18} /> : <VolumeHigh width={18} height={18} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={p.muted ? 0 : p.volume}
          onChange={(e) => p.setVolume(Number(e.target.value))}
          className="accent-[rgb(var(--accent))] w-28"
        />
      </div>
    </div>
  )
}

function Seekbar({
  value,
  max,
  onChange
}: {
  value: number
  max: number
  onChange: (v: number) => void
}) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="group relative h-1.5 flex-1">
      <div className="absolute inset-0 rounded-full bg-white/10" />
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-accent"
        style={{ width: `${pct}%` }}
      />
      <input
        type="range"
        min={0}
        max={max || 0}
        step={0.1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  )
}
