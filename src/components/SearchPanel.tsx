import { usePlayer } from '@/state/playerStore'
import { useSettings } from '@/state/settingsStore'
import { useSearch } from '@/state/searchStore'
import { fmtTime } from '@/lib/format'
import { Search as SearchIcon, Play, Next as QueueIcon } from './icons'
import { AddToPlaylist } from './AddToPlaylist'
import type { SearchResult, Track } from '@shared/types'

function toTrack(r: SearchResult): Track {
  return {
    id: r.id,
    title: r.title,
    artist: r.artist,
    duration: r.duration,
    thumbnail: r.thumbnail,
    url: r.url,
    source: 'youtube'
  }
}

export function SearchPanel() {
  const { query, results, loading, error, setQuery, run } = useSearch()
  const sidecarReady = useSettings((s) => s.sidecar.running)
  const player = usePlayer()

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    void run()
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <form onSubmit={onSubmit} className="no-drag relative">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            sidecarReady ? 'Search YouTube or say “Hey DJ”…' : 'Engine starting — please wait…'
          }
          className="input pl-12 pr-24 py-3 text-base"
        />
        <button
          type="submit"
          disabled={loading || !sidecarReady}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-40"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {results.map((r) => (
          <div
            key={r.id}
            className="group flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[0.04]"
          >
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-ink-600">
              {r.thumbnail && <img src={r.thumbnail} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-slate-100">{r.title}</div>
              <div className="truncate text-xs text-slate-400">
                {r.artist ?? 'Unknown'} {r.duration ? `· ${fmtTime(r.duration)}` : ''}
              </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
              <button
                className="btn-ghost h-8 w-8"
                title="Add to queue"
                onClick={() => player.enqueue(toTrack(r))}
              >
                <QueueIcon width={16} height={16} />
              </button>
              <AddToPlaylist track={toTrack(r)} />
              <button
                className="grid h-8 w-8 place-items-center rounded-full bg-accent text-white transition hover:brightness-110"
                title="Play now"
                onClick={() => void player.playTrack(toTrack(r))}
              >
                <Play width={15} height={15} />
              </button>
            </div>
          </div>
        ))}
        {!loading && results.length === 0 && !error && (
          <div className="grid h-full place-items-center text-center text-sm text-slate-500">
            <div>
              <p className="text-slate-400">Search for a song to get started.</p>
              <p className="mt-1 text-xs">Or enable the wake word in Settings and just say “Hey DJ”.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
