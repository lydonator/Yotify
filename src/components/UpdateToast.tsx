import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/types'

/**
 * Reflects the auto-update lifecycle. A small bottom-right toast for the
 * download/ready phases, and — once the user commits to installing — a
 * full-screen "updating" overlay so the app never just freezes silently while
 * it quits and the installer runs.
 */
export function UpdateToast() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [dismissed, setDismissed] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    return window.yotify.onUpdate((s) => {
      setStatus(s)
      setDismissed(false) // a new status is worth showing again
    })
  }, [])

  // Once installing, paint the overlay first, then trigger the quit+install on
  // the next frame so the user always sees feedback before the window goes away.
  useEffect(() => {
    if (!installing) return
    const t = setTimeout(() => window.yotify.installUpdate(), 150)
    return () => clearTimeout(t)
  }, [installing])

  // Full-screen takeover: the app is about to close and reinstall. Setting clear
  // expectations here is what keeps the ~30s relaunch from looking like a crash.
  if (installing) {
    const version = status.state === 'downloaded' ? status.version : ''
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-ink-900/80 backdrop-blur-md">
        <div className="flex max-w-md flex-col items-center gap-5 px-8 text-center">
          <Spinner />
          <div>
            <div className="text-lg font-semibold text-white">
              Updating Yotify{version ? ` to ${version}` : ''}…
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              The app will close and reopen automatically. This can take up to a minute — no
              need to do anything.
            </p>
          </div>
        </div>
      </div>
    )
  }

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
        <span className="text-sm text-slate-200">Version {status.version} is ready.</span>
        <button
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110"
          onClick={() => setInstalling(true)}
        >
          Restart &amp; update
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

function Spinner() {
  return (
    <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-white/15 border-t-accent" />
  )
}
