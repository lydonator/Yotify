import { MusicNote, SettingsGear, Mic, Library } from './icons'
import { useSettings } from '@/state/settingsStore'
import { useVoice } from '@/voice/voiceStore'
import type { Route } from '@/state/uiStore'

const items: { id: Route; label: string; icon: typeof MusicNote }[] = [
  { id: 'player', label: 'Player', icon: MusicNote },
  { id: 'library', label: 'Library', icon: Library },
  { id: 'settings', label: 'Settings', icon: SettingsGear }
]

export function Sidebar({ route, onNavigate }: { route: Route; onNavigate: (r: Route) => void }) {
  const wake = useSettings((s) => s.settings.wakeWordEnabled)
  const activate = useVoice((s) => s.activate)
  const voiceState = useVoice((s) => s.state)
  const busy = useVoice((s) => s.busy)
  const active = voiceState !== 'idle'

  return (
    <nav className="flex w-16 shrink-0 flex-col items-center gap-2 py-3">
      {items.map((it) => {
        const Icon = it.icon
        const isActive = route === it.id
        return (
          <button
            key={it.id}
            onClick={() => onNavigate(it.id)}
            title={it.label}
            className={`no-drag relative grid h-11 w-11 place-items-center rounded-xl transition ${
              isActive ? 'bg-accent-soft text-accent' : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
            }`}
          >
            {isActive && <span className="absolute left-0 h-5 w-1 rounded-r-full bg-accent" />}
            <Icon width={20} height={20} />
          </button>
        )
      })}
      <div className="mt-auto">
        <button
          onClick={() => void activate()}
          disabled={busy}
          title={wake ? 'Push to talk (wake word also on)' : 'Push to talk'}
          className={`no-drag relative grid h-11 w-11 place-items-center rounded-xl transition ${
            active ? 'bg-accent text-white shadow-glow' : wake ? 'text-accent hover:bg-white/[0.05]' : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
          }`}
        >
          {(active || wake) && (
            <span className="absolute inset-0 animate-pulse-ring rounded-xl bg-accent/30" />
          )}
          <Mic width={20} height={20} />
        </button>
      </div>
    </nav>
  )
}
