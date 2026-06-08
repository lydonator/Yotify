import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLibrary } from '@/state/libraryStore'
import { Plus } from './icons'
import type { Track } from '@shared/types'

const MENU_W = 224
const MENU_MAX_H = 280

/**
 * "+" button that opens a menu (in a portal, to escape scroll/backdrop-filter
 * clipping) to add a track — or a whole album — to a playlist, or create one.
 */
export function AddToPlaylist({
  track,
  tracks,
  title = 'Add to playlist'
}: {
  track?: Track
  tracks?: Track[]
  title?: string
}) {
  const playlists = useLibrary((s) => s.playlists)
  const addToPlaylist = useLibrary((s) => s.addToPlaylist)
  const addTracksToPlaylist = useLibrary((s) => s.addTracksToPlaylist)
  const createPlaylist = useLibrary((s) => s.createPlaylist)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null)
  const [newName, setNewName] = useState('')

  const items = tracks ?? (track ? [track] : [])
  const open = pos !== null

  function toggle() {
    if (open) {
      setPos(null)
      return
    }
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8))
    const spaceBelow = window.innerHeight - r.bottom
    if (spaceBelow < MENU_MAX_H + 12) {
      setPos({ left, bottom: window.innerHeight - r.top + 6 }) // open upward
    } else {
      setPos({ left, top: r.bottom + 6 })
    }
  }

  function addTo(id: string) {
    if (items.length > 1) addTracksToPlaylist(id, items)
    else if (items[0]) addToPlaylist(id, items[0])
    setPos(null)
  }

  return (
    <>
      <button
        ref={btnRef}
        className="btn-ghost h-8 w-8"
        title={title}
        onClick={(e) => {
          e.stopPropagation()
          toggle()
        }}
      >
        <Plus width={16} height={16} />
      </button>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setPos(null)} />
            <div
              className="fixed z-[61] w-56 overflow-hidden rounded-xl border border-white/10 bg-ink-700/95 p-1.5 shadow-card backdrop-blur-xl"
              style={{ left: pos!.left, top: pos!.top, bottom: pos!.bottom }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-2 pb-1 pt-0.5 text-[11px] uppercase tracking-wide text-slate-500">
                {items.length > 1 ? `Add ${items.length} tracks to…` : 'Add to playlist'}
              </div>
              <div className="max-h-48 overflow-y-auto">
                {playlists.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-slate-500">No playlists yet.</div>
                )}
                {playlists.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addTo(p.id)}
                    className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm text-slate-200 transition hover:bg-white/[0.06]"
                  >
                    {p.name} <span className="text-xs text-slate-500">· {p.tracks.length}</span>
                  </button>
                ))}
              </div>
              <form
                className="mt-1 flex gap-1 border-t border-white/[0.06] pt-1.5"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!newName.trim()) return
                  addTo(createPlaylist(newName))
                  setNewName('')
                }}
              >
                <input
                  autoFocus
                  className="w-full rounded-lg bg-ink-600 px-2 py-1 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  placeholder="New playlist…"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <button
                  type="submit"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent text-white"
                >
                  <Plus width={15} height={15} />
                </button>
              </form>
            </div>
          </>,
          document.body
        )}
    </>
  )
}
