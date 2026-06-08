import { useState } from 'react'
import { usePlayer } from '@/state/playerStore'
import { Visualizer } from '@/components/Visualizer'
import { SearchPanel } from '@/components/SearchPanel'
import { QueuePanel } from '@/components/QueuePanel'
import { Lyrics } from '@/components/Lyrics'
import { AlbumPanel } from '@/components/AlbumPanel'

export function PlayerPage() {
  const state = usePlayer((s) => s.state)
  const current = usePlayer((s) => s.current)
  const active = state === 'playing'
  const [tab, setTab] = useState<'search' | 'album' | 'lyrics'>('search')

  return (
    <div className="grid h-full grid-cols-[1.15fr_0.85fr_320px] grid-rows-[minmax(0,1fr)] gap-4">
      {/* Visualizer + now playing hero */}
      <section className="glass relative flex min-h-0 flex-col overflow-hidden rounded-2xl">
        <div className="absolute inset-0">
          <Visualizer active={active} />
        </div>
        <div className="relative z-10 mt-auto bg-gradient-to-t from-ink-900/90 to-transparent p-6">
          {current ? (
            <>
              <div className="mb-1 text-xs uppercase tracking-widest text-accent">
                {state === 'playing' ? 'Now Playing' : state === 'paused' ? 'Paused' : state}
              </div>
              <h2 className="truncate text-2xl font-bold text-white">{current.title}</h2>
              <p className="truncate text-slate-300">{current.artist ?? '—'}</p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-white">Welcome to Yotify</h2>
              <p className="text-slate-400">Search for a track or say “Hey DJ” to begin.</p>
            </>
          )}
        </div>
      </section>

      {/* Search / Lyrics */}
      <section className="glass flex min-h-0 flex-col overflow-hidden rounded-2xl p-4">
        <div className="mb-3 flex gap-1 rounded-xl bg-white/[0.04] p-1">
          {(['search', 'album', 'lyrics'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg py-1.5 text-sm font-medium capitalize transition ${
                tab === t ? 'bg-accent text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1">
          {tab === 'search' ? <SearchPanel /> : tab === 'album' ? <AlbumPanel /> : <Lyrics />}
        </div>
      </section>

      {/* Queue */}
      <section className="min-h-0">
        <QueuePanel />
      </section>
    </div>
  )
}
