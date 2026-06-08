import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePlayer } from '@/state/playerStore'
import { fetchLyrics, type LyricsCandidate } from '@/api/client'

interface Line {
  t: number // seconds
  text: string
}

/** Parse LRC ("[mm:ss.xx] text") into time-sorted lines. */
function parseLrc(lrc: string): Line[] {
  const out: Line[] = []
  for (const raw of lrc.split('\n')) {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
    if (!stamps.length) continue
    const text = raw.replace(/\[[^\]]*\]/g, '').trim()
    for (const m of stamps) {
      const min = Number(m[1])
      const sec = Number(m[2])
      const frac = m[3] ? Number(`0.${m[3]}`) : 0
      out.push({ t: min * 60 + sec + frac, text })
    }
  }
  return out.sort((a, b) => a.t - b.t)
}

/** Synced lyrics view: highlights the current line, auto-scrolls. Falls back to
 * plain lyrics, or a friendly empty state. */
export function Lyrics() {
  const current = usePlayer((s) => s.current)
  const position = usePlayer((s) => s.position)
  const duration = usePlayer((s) => s.duration)
  const [candidates, setCandidates] = useState<LyricsCandidate[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'none'>('idle')
  const activeRef = useRef<HTMLParagraphElement | null>(null)

  useEffect(() => {
    setCandidates([])
    if (!current) {
      setStatus('idle')
      return
    }
    setStatus('loading')
    let cancelled = false
    fetchLyrics(current.artist, current.title).then((res) => {
      if (cancelled) return
      setCandidates(res)
      setStatus(res.length ? 'idle' : 'none')
    })
    return () => {
      cancelled = true
    }
  }, [current?.id])

  // Pick the candidate whose recording duration best matches what's playing,
  // preferring synced lyrics. This keeps timing aligned across versions.
  const { lines, plain } = useMemo(() => {
    if (!candidates.length) return { lines: [] as Line[], plain: null as string | null }
    const synced = candidates.filter((c) => c.synced)
    const pool = synced.length ? synced : candidates
    const best =
      duration > 0
        ? pool.reduce((a, b) =>
            Math.abs((b.duration ?? 1e9) - duration) < Math.abs((a.duration ?? 1e9) - duration)
              ? b
              : a
          )
        : pool[0]
    return {
      lines: best.synced ? parseLrc(best.synced) : [],
      plain: best.plain ?? null
    }
  }, [candidates, duration])

  // Find the active synced line for the current position.
  let activeIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t <= position + 0.2) activeIdx = i
    else break
  }

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeIdx])

  if (status === 'loading')
    return <Centered>Loading lyrics…</Centered>
  if (status === 'none' || (!lines.length && !plain))
    return <Centered>No lyrics found for this track.</Centered>

  if (lines.length) {
    return (
      <div className="h-full overflow-y-auto px-2 py-6 [scrollbar-width:none]">
        <div className="space-y-3">
          {lines.map((l, i) => (
            <p
              key={i}
              ref={i === activeIdx ? activeRef : null}
              className={`text-center text-lg font-semibold transition-all duration-300 ${
                i === activeIdx
                  ? 'scale-105 text-white'
                  : i < activeIdx
                    ? 'text-slate-600'
                    : 'text-slate-500'
              }`}
            >
              {l.text || '♪'}
            </p>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto whitespace-pre-wrap px-4 py-6 text-center text-slate-300">
      {plain}
    </div>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="grid h-full place-items-center px-4 text-center text-sm text-slate-500">{children}</div>
}
