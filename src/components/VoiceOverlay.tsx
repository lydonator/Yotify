import { useVoice } from '@/voice/voiceStore'
import { Mic } from './icons'

/** Full-screen listening/thinking/speaking overlay shown during a voice cycle. */
export function VoiceOverlay() {
  const { state, level, transcript, message } = useVoice()
  if (state === 'idle') return null

  const label =
    state === 'listening'
      ? 'Listening…'
      : state === 'thinking'
        ? 'Thinking…'
        : state === 'speaking'
          ? message || 'Speaking…'
          : 'Something went wrong'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/70 backdrop-blur-md">
      <div className="flex flex-col items-center gap-6">
        <div className="relative grid h-32 w-32 place-items-center">
          {state === 'listening' && (
            <>
              <span
                className="absolute rounded-full bg-accent/30"
                style={{
                  width: `${80 + level * 120}px`,
                  height: `${80 + level * 120}px`,
                  transition: 'width 80ms, height 80ms'
                }}
              />
              <span className="absolute h-28 w-28 animate-pulse-ring rounded-full bg-accent/20" />
            </>
          )}
          <div className="relative grid h-20 w-20 place-items-center rounded-full bg-accent text-white shadow-glow">
            <Mic width={32} height={32} />
          </div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-white">{label}</div>
          {transcript && state !== 'listening' && (
            <div className="mt-1 max-w-md text-sm text-slate-400">“{transcript}”</div>
          )}
          {state === 'listening' && (
            <div className="mt-1 text-xs text-slate-500">Say “play …”, “skip”, “pause”…</div>
          )}
        </div>
      </div>
    </div>
  )
}
