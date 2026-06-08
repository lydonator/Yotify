import { Close, Minimize, Maximize } from './icons'
import { useSettings } from '@/state/settingsStore'

export function TitleBar() {
  const sidecar = useSettings((s) => s.sidecar)
  return (
    <div className="drag flex h-10 items-center justify-between px-3 select-none">
      <div className="flex items-center gap-2.5 pl-1">
        <div className="h-4 w-4 rounded-[5px] bg-accent shadow-glow" />
        <span className="text-[13px] font-semibold tracking-wide text-slate-200">Yotify</span>
        <span
          className={`ml-2 h-1.5 w-1.5 rounded-full ${
            sidecar.running ? 'bg-emerald-400' : 'bg-amber-400'
          }`}
          title={sidecar.running ? 'Engine connected' : sidecar.error || 'Engine starting…'}
        />
      </div>
      <div className="no-drag flex items-center gap-1">
        <button className="btn-ghost h-8 w-10" onClick={() => window.yotify.minimize()}>
          <Minimize width={16} height={16} />
        </button>
        <button className="btn-ghost h-8 w-10" onClick={() => window.yotify.toggleMaximize()}>
          <Maximize width={14} height={14} />
        </button>
        <button
          className="grid h-8 w-10 place-items-center rounded-md text-slate-300 transition hover:bg-red-500/80 hover:text-white"
          onClick={() => window.yotify.close()}
        >
          <Close width={16} height={16} />
        </button>
      </div>
    </div>
  )
}
