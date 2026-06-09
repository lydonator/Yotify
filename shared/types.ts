// Shared domain + IPC contract types used by both the Electron main process
// and the React renderer. Keep this dependency-free so it can be imported anywhere.

export interface Track {
  /** YouTube video id, a synthetic id for local files, or a synthetic id for
   * search-resolved tracks (album entries that resolve to YouTube on play). */
  id: string
  title: string
  artist?: string
  /** Total duration in seconds, if known. */
  duration?: number
  thumbnail?: string
  /** Canonical YouTube watch URL. */
  url?: string
  /** Absolute path to a locally downloaded audio file, when available. */
  localPath?: string
  /** Where this track's playable audio is coming from. 'search' resolves the
   * stream from `query` via YouTube the first time it plays. */
  source: 'youtube' | 'local' | 'search'
  /** Search query used to resolve a 'search' track. */
  query?: string
  /** Album grouping in the queue (collapsible). */
  groupId?: string
  groupName?: string
  /** Unique per queue *entry* (assigned on enqueue). Lets the same track appear
   * multiple times in the queue and be removed/highlighted independently. */
  uid?: string
}

export interface SearchResult {
  id: string
  title: string
  artist?: string
  duration?: number
  thumbnail?: string
  url: string
}

export interface StreamInfo {
  /** Direct audio stream URL (may be a sidecar proxy URL). */
  streamUrl: string
  /** Expiry epoch ms for the resolved URL, if known. */
  expiresAt?: number
  track: Track
}

export type RepeatMode = 'off' | 'all' | 'one'

export type VisualizerPreset =
  | 'album'
  | 'bars'
  | 'waveform'
  | 'radial'
  | 'spectrum'
  | 'aurora'
  | 'nebula'
  | 'mirror'
  | 'sonar'
  | 'liquid'
  | 'kaleido'

export type SttProvider = 'local-whisper' | 'groq' | 'openai' | 'azure'
export type TtsProvider = 'piper' | 'sapi' | 'elevenlabs' | 'openai' | 'azure'
export type LlmProvider = 'none' | 'groq' | 'deepseek' | 'openai' | 'anthropic' | 'local'
export type AudioFormat = 'm4a' | 'opus' | 'mp3'

export interface AppSettings {
  // Downloads
  saveDownloads: boolean
  downloadFolder: string
  preferLocal: boolean
  audioFormat: AudioFormat
  audioQuality: 'low' | 'medium' | 'high'

  // Devices
  outputDeviceId: string // '' = system default
  inputDeviceId: string

  // Voice / AI
  wakeWordEnabled: boolean
  earconEnabled: boolean
  /** Speak a spoken confirmation after successful commands (off = chime only). */
  speakConfirmations: boolean
  sttProvider: SttProvider
  ttsProvider: TtsProvider
  whisperModel: 'tiny' | 'base' | 'small' | 'medium' | 'large-v3'
  llmProvider: LlmProvider
  llmApiKey: string
  /** Optional model override for the Smart DJ (per-provider default otherwise). */
  llmModel: string
  cloudSttApiKey: string
  cloudTtsApiKey: string
  youtubeApiKey: string
  /** Path to a Netscape-format cookies.txt for authenticated YouTube access. */
  youtubeCookiesFile: string

  // Appearance
  accent: string // "r g b" triplet, e.g. "124 92 255"
  /** Theme the UI/visualizer from the current track's album-art color. */
  dynamicAccent: boolean
  visualizerPreset: VisualizerPreset
  visualizerSensitivity: number // 0.5 - 2.0
  startWithWindows: boolean
  /** Hide to the system tray on close instead of quitting. */
  closeToTray: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  saveDownloads: false,
  downloadFolder: '',
  preferLocal: true,
  audioFormat: 'm4a',
  audioQuality: 'high',
  outputDeviceId: '',
  inputDeviceId: '',
  wakeWordEnabled: false,
  earconEnabled: true,
  speakConfirmations: false,
  sttProvider: 'groq',
  ttsProvider: 'sapi',
  whisperModel: 'small',
  llmProvider: 'none',
  llmApiKey: '',
  llmModel: '',
  cloudSttApiKey: '',
  cloudTtsApiKey: '',
  youtubeApiKey: '',
  youtubeCookiesFile: '',
  accent: '124 92 255',
  dynamicAccent: true,
  visualizerPreset: 'album',
  visualizerSensitivity: 1,
  startWithWindows: false,
  closeToTray: true
}

export interface SidecarStatus {
  running: boolean
  port: number | null
  /** Last error message, if the sidecar failed to start. */
  error?: string
}

// ---- IPC channel names (renderer <-> main) ----
export const IPC = {
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  sidecarStatus: 'sidecar:status',
  sidecarBaseUrl: 'sidecar:baseUrl',
  pickFolder: 'dialog:pickFolder',
  pickFile: 'dialog:pickFile',
  winMinimize: 'win:minimize',
  winMaximize: 'win:maximize',
  winClose: 'win:close',
  updateCheck: 'update:check',
  updateInstall: 'update:install',
  // main -> renderer events
  evtSidecarStatus: 'evt:sidecar-status',
  evtMediaControl: 'evt:media-control', // global hotkeys / SMTC
  evtWakeToggle: 'evt:wake-toggle',
  evtUpdate: 'evt:update' // auto-update lifecycle
} as const

export type MediaControl = 'playpause' | 'next' | 'prev' | 'stop'

/** Auto-update lifecycle, surfaced to the renderer for a small status toast. */
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'none' }
  | { state: 'error'; message: string }

// Shape exposed on window.yotify by the preload bridge.
export interface YotifyApi {
  getSettings(): Promise<AppSettings>
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  getSidecarStatus(): Promise<SidecarStatus>
  getSidecarBaseUrl(): Promise<string | null>
  pickFolder(): Promise<string | null>
  pickFile(filters?: { name: string; extensions: string[] }[]): Promise<string | null>
  minimize(): void
  toggleMaximize(): void
  close(): void
  onSidecarStatus(cb: (status: SidecarStatus) => void): () => void
  onMediaControl(cb: (control: MediaControl) => void): () => void
  checkForUpdate(): void
  installUpdate(): void
  onUpdate(cb: (status: UpdateStatus) => void): () => void
}
