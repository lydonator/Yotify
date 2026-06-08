import { create } from 'zustand'
import { api } from '@/api/client'
import { DEFAULT_SETTINGS, type AppSettings, type SidecarStatus } from '@shared/types'

interface SettingsState {
  settings: AppSettings
  sidecar: SidecarStatus
  baseUrl: string | null
  loaded: boolean
  load: () => Promise<void>
  update: (patch: Partial<AppSettings>) => Promise<void>
}

/** Applies the chosen accent color to the document root as a CSS variable. */
function applyAccent(accent: string): void {
  document.documentElement.style.setProperty('--accent', accent)
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  sidecar: { running: false, port: null },
  baseUrl: null,
  loaded: false,

  load: async () => {
    const [settings, sidecar, baseUrl] = await Promise.all([
      window.yotify.getSettings(),
      window.yotify.getSidecarStatus(),
      window.yotify.getSidecarBaseUrl()
    ])
    applyAccent(settings.accent)
    set({ settings, sidecar, baseUrl, loaded: true })
    if (sidecar.running) void pushSidecarConfig()

    window.yotify.onSidecarStatus(async (status) => {
      const url = await window.yotify.getSidecarBaseUrl()
      set({ sidecar: status, baseUrl: url })
      // Re-push config every time the sidecar (re)connects — it may have restarted.
      if (status.running) void pushSidecarConfig()
    })
  },

  update: async (patch) => {
    const next = await window.yotify.setSettings(patch)
    if (patch.accent) applyAccent(next.accent)
    set({ settings: next })
    if (
      'youtubeCookiesFile' in patch ||
      'sttProvider' in patch ||
      'cloudSttApiKey' in patch ||
      'whisperModel' in patch
    ) {
      void pushSidecarConfig()
    }
  }
}))

/** Sync sidecar runtime config (cookies, STT provider/key/model) on connect or
 * settings change — so the sidecar can warm the right model / use the cloud. */
async function pushSidecarConfig(): Promise<void> {
  const s = useSettings.getState().settings
  try {
    await api.setConfig({
      cookiesFile: s.youtubeCookiesFile,
      sttProvider: s.sttProvider,
      sttApiKey: s.cloudSttApiKey,
      whisperModel: s.whisperModel
    })
  } catch {
    // sidecar may not be ready yet; the onSidecarStatus handler retries.
  }
}

export { applyAccent }
