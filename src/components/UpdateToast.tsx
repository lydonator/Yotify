import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/types'

/**
 * Small bottom-right toast that reflects the auto-update lifecycle. Stays out of
 * the way (nothing shown while idle / up-to-date / merely checking) and only
 * asserts itself when there's an update to download or a restart to offer.
 */
export function UpdateToast() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    return window.yotify.onUpdate((s) => {
      setStatus(s)
      setDismissed(false) // a new status is worth showing again
    })
  }, [])

  // States we don't bother the user with.
  if (status.state === 'idle' || status.state === 'checking' || status.state === 'none') return null
  if (dismissed) return null

  let body: React.ReactNode
  if (status.state === 'available') {
    body = <span className="text-sm text-slate-200">Update {status.version} found — downloading…</span>
  } else if (status.state === 'downloading') {
    body = (
      <div className="min-w-[180px]">
        <div className="mb-1.5 text-sm text-slate-200">Downloading update… {status.percent}%</div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${status.percent}%` }}
          />
        </div>
      </div>
    )
  } else if (status.state === 'downloaded') {
    body = (
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-200">
          Version {status.version} is ready.
        </span>
        <button
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110"
          onClick={() => window.yotify.installUpdate()}
        >
          Restart & update
        </button>
      </div>
    )
  } else {
    // error — quiet, dismissible note (offline checks shouldn't nag).
    body = <span className="text-sm text-slate-400">Update check failed.</span>
  }

  return (
    <div className="pointer-events-auto fixed bottom-24 right-4 z-50 max-w-sm">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-ink-800/90 px-4 py-3 shadow-2xl backdrop-blur-xl">
        {body}
        <button
          className="ml-1 shrink-0 text-lg leading-none text-slate-500 transition hover:text-slate-200"
          title="Dismiss"
          onClick={() => setDismissed(true)}
        >
          ×
        </button>
      </div>
    </div>
  )
}
