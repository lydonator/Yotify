import { useEffect } from 'react'
import { TitleBar } from '@/components/TitleBar'
import { Sidebar } from '@/components/Sidebar'
import { useUi } from '@/state/uiStore'
import { TransportBar } from '@/components/TransportBar'
import { VoiceOverlay } from '@/components/VoiceOverlay'
import { UpdateToast } from '@/components/UpdateToast'
import { PlayerPage } from '@/pages/PlayerPage'
import { LibraryPage } from '@/pages/LibraryPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { useSettings } from '@/state/settingsStore'
import { usePlayer } from '@/state/playerStore'
import { useVoice } from '@/voice/voiceStore'
import { startWakeWord, stopWakeWord } from '@/voice/wakeword'
import { setupMediaSession } from '@/audio/mediaSession'
import type { MediaControl } from '@shared/types'

export default function App() {
  const route = useUi((s) => s.route)
  const setRoute = useUi((s) => s.setRoute)
  const loadSettings = useSettings((s) => s.load)
  const loaded = useSettings((s) => s.loaded)
  const wakeWordEnabled = useSettings((s) => s.settings.wakeWordEnabled)
  const sidecarRunning = useSettings((s) => s.sidecar.running)

  // Boot: load settings, init the audio engine, wire global media keys + PTT.
  // Player actions are read via getState() so App never re-renders on playback
  // ticks (position updates several times a second while music plays).
  useEffect(() => {
    void loadSettings()
    usePlayer.getState().init()
    setupMediaSession()

    const off = window.yotify.onMediaControl((c: MediaControl) => {
      const player = usePlayer.getState()
      if (c === 'playpause') player.playPause()
      else if (c === 'next') void player.next()
      else if (c === 'prev') void player.prev()
      else if (c === 'stop') player.stop()
    })

    // Push-to-talk: Ctrl+Shift+Space starts a listen/act cycle.
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.code === 'Space') {
        e.preventDefault()
        void useVoice.getState().activate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      off()
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Wake-word lifecycle: starts once enabled and the sidecar is connected.
  useEffect(() => {
    if (wakeWordEnabled && sidecarRunning) {
      void startWakeWord()
    } else {
      void stopWakeWord()
    }
    return () => void stopWakeWord()
  }, [wakeWordEnabled, sidecarRunning])

  return (
    <div className="flex h-screen flex-col bg-ink-900 text-slate-200">
      {/* Ambient accent glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-accent/20 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-accent/10 blur-[120px]" />
      </div>

      <div className="relative z-10 flex h-full flex-col">
        <TitleBar />
        <div className="flex min-h-0 flex-1 gap-2 px-3">
          <Sidebar route={route} onNavigate={setRoute} />
          <main className="min-h-0 min-w-0 flex-1 pb-2">
            {!loaded ? (
              <div className="grid h-full place-items-center text-slate-500">Loading…</div>
            ) : route === 'player' ? (
              <PlayerPage />
            ) : route === 'library' ? (
              <LibraryPage />
            ) : (
              <SettingsPage />
            )}
          </main>
        </div>
        <div className="px-3 pb-3">
          <TransportBar />
        </div>
      </div>
      <VoiceOverlay />
      <UpdateToast />
    </div>
  )
}
