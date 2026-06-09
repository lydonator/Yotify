import { useEffect, useState, type ReactNode } from 'react'
import { useSettings } from '@/state/settingsStore'
import { audioEngine } from '@/audio/engine'
import type { AppSettings } from '@shared/types'

const ACCENTS: { name: string; rgb: string }[] = [
  { name: 'Violet', rgb: '124 92 255' },
  { name: 'Cyan', rgb: '34 211 238' },
  { name: 'Emerald', rgb: '16 185 129' },
  { name: 'Rose', rgb: '244 63 94' },
  { name: 'Amber', rgb: '245 158 11' },
  { name: 'Blue', rgb: '59 130 246' }
]

export function SettingsPage() {
  const { settings, update, sidecar } = useSettings()
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])

  useEffect(() => {
    const enumerate = () =>
      navigator.mediaDevices.enumerateDevices().then(setDevices).catch(() => {})
    enumerate()
    navigator.mediaDevices.addEventListener('devicechange', enumerate)
    return () => navigator.mediaDevices.removeEventListener('devicechange', enumerate)
  }, [])

  const outputs = devices.filter((d) => d.kind === 'audiooutput')
  const inputs = devices.filter((d) => d.kind === 'audioinput')

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    update({ [key]: value } as Partial<AppSettings>)

  return (
    <div className="mx-auto h-full max-w-3xl space-y-5 overflow-y-auto pr-2 pb-6">
      <h1 className="text-xl font-bold text-white">Settings</h1>

      <Section
        title="YouTube access"
        desc="Optional. Most songs play without signing in. Add cookies only to unlock age-restricted or region-locked videos (and to download smaller audio-only files)."
      >
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs leading-relaxed text-slate-400">
          Browser cookies can't be read automatically on Windows (App-Bound Encryption). To sign in,
          export your YouTube cookies once to a <code className="text-slate-300">cookies.txt</code> file:
          <ol className="mt-2 list-decimal space-y-0.5 pl-4">
            <li>
              Install the{' '}
              <button
                className="text-accent underline"
                onClick={() =>
                  window.open(
                    'https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc'
                  )
                }
              >
                “Get cookies.txt LOCALLY”
              </button>{' '}
              extension in Brave.
            </li>
            <li>Open youtube.com (signed in), click the extension, and Export.</li>
            <li>Select that file below.</li>
          </ol>
        </div>
        <Field label="Cookies file" hint="Netscape cookies.txt">
          <div className="flex gap-2">
            <input
              className="input"
              readOnly
              placeholder="No cookies file selected"
              value={settings.youtubeCookiesFile}
            />
            {settings.youtubeCookiesFile && (
              <button
                className="shrink-0 rounded-xl bg-white/[0.06] px-3 text-sm text-slate-400 transition hover:bg-white/[0.1]"
                onClick={() => set('youtubeCookiesFile', '')}
              >
                Clear
              </button>
            )}
            <button
              className="shrink-0 rounded-xl bg-white/[0.06] px-4 text-sm text-slate-200 transition hover:bg-white/[0.1]"
              onClick={async () => {
                const file = await window.yotify.pickFile([
                  { name: 'Cookies', extensions: ['txt'] }
                ])
                if (file) set('youtubeCookiesFile', file)
              }}
            >
              Browse…
            </button>
          </div>
        </Field>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`h-2 w-2 rounded-full ${
              settings.youtubeCookiesFile ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
          />
          <span className="text-slate-400">
            {settings.youtubeCookiesFile ? 'Signed in (cookies active)' : 'Not signed in (anonymous playback)'}
          </span>
        </div>
      </Section>

      <Section title="Appearance" desc="Make Yotify yours.">
        <Field label="Accent color">
          <div className="flex gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.rgb}
                onClick={() => set('accent', a.rgb)}
                title={a.name}
                className={`h-8 w-8 rounded-full ring-2 transition ${
                  settings.accent === a.rgb ? 'ring-white' : 'ring-transparent hover:ring-white/40'
                }`}
                style={{ background: `rgb(${a.rgb})` }}
              />
            ))}
          </div>
        </Field>
        <Field label="Visualizer style">
          <Select
            value={settings.visualizerPreset}
            onChange={(v) => set('visualizerPreset', v as AppSettings['visualizerPreset'])}
            options={[
              ['album', 'Album (reactive art)'],
              ['aurora', 'Aurora (ribbons over art)'],
              ['nebula', 'Nebula (art galaxy core)'],
              ['liquid', 'Liquid (art in a wave orb)'],
              ['sonar', 'Sonar (art + beat rings)'],
              ['mirror', 'Mirror (art reveal)'],
              ['bars', 'Bars (art reveal)'],
              ['waveform', 'Waveform (over art)'],
              ['radial', 'Radial (art core)'],
              ['spectrum', 'Spectrum (art fill)']
            ]}
          />
        </Field>
        <Field label={`Sensitivity (${settings.visualizerSensitivity.toFixed(1)}×)`}>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={settings.visualizerSensitivity}
            onChange={(e) => set('visualizerSensitivity', Number(e.target.value))}
            className="accent-[rgb(var(--accent))] w-full"
          />
        </Field>
        <Toggle
          label="Color from album art"
          desc="Theme the accent + visualizer using the playing track's artwork color."
          checked={settings.dynamicAccent}
          onChange={(v) => set('dynamicAccent', v)}
        />
      </Section>

      <Section title="Audio devices" desc="Choose where sound goes and where the mic listens.">
        <Field label="Output device">
          <Select
            value={settings.outputDeviceId}
            onChange={(v) => {
              set('outputDeviceId', v)
              void audioEngine.setOutputDevice(v)
            }}
            options={[['', 'System default'], ...outputs.map((d) => [d.deviceId, d.label || 'Output'] as [string, string])]}
          />
        </Field>
        <Field label="Microphone">
          <Select
            value={settings.inputDeviceId}
            onChange={(v) => set('inputDeviceId', v)}
            options={[['', 'System default'], ...inputs.map((d) => [d.deviceId, d.label || 'Microphone'] as [string, string])]}
          />
        </Field>
        {outputs.length === 0 && (
          <p className="text-xs text-slate-500">
            Device labels appear after microphone permission is granted (enable the wake word or
            push-to-talk once).
          </p>
        )}
      </Section>

      <Section title="Voice & AI" desc="Wake word, speech recognition, and the Smart DJ.">
        <Toggle
          label="Wake word (“Hey DJ”)"
          desc="Always-listen for “Hey DJ” using offline on-device detection (Vosk). First enable downloads a ~50 MB model."
          checked={settings.wakeWordEnabled}
          onChange={(v) => set('wakeWordEnabled', v)}
        />
        <Toggle
          label="Chimes"
          desc="Play short chimes on wake, success, and errors."
          checked={settings.earconEnabled}
          onChange={(v) => set('earconEnabled', v)}
        />
        <Toggle
          label="Speak confirmations"
          desc="Speak a reply after commands. Off = chime only (avoids talking over the music)."
          checked={settings.speakConfirmations}
          onChange={(v) => set('speakConfirmations', v)}
        />
        <p className="text-[11px] text-slate-500">
          Tip: you can also push-to-talk anytime with the mic button or{' '}
          <kbd className="rounded bg-white/10 px-1">Ctrl+Shift+Space</kbd>.
        </p>
        <Field label="Speech-to-text">
          <Select
            value={settings.sttProvider}
            onChange={(v) => set('sttProvider', v as AppSettings['sttProvider'])}
            options={[
              ['groq', 'Groq (cloud, fastest — recommended)'],
              ['local-whisper', 'Local Whisper (offline, CPU)'],
              ['openai', 'OpenAI (cloud)'],
              ['azure', 'Azure (cloud)']
            ]}
          />
        </Field>
        {settings.sttProvider !== 'local-whisper' && (
          <Field
            label="STT API key"
            hint={settings.sttProvider === 'groq' ? 'Free key from console.groq.com' : undefined}
          >
            <input
              type="password"
              className="input"
              placeholder="Required for cloud STT"
              value={settings.cloudSttApiKey}
              onChange={(e) => set('cloudSttApiKey', e.target.value)}
            />
          </Field>
        )}
        {settings.sttProvider === 'local-whisper' && (
          <Field label="Whisper model">
            <Select
              value={settings.whisperModel}
              onChange={(v) => set('whisperModel', v as AppSettings['whisperModel'])}
              options={[
                ['tiny', 'Tiny (fastest)'],
                ['base', 'Base'],
                ['small', 'Small (recommended)'],
                ['medium', 'Medium (slower on CPU)']
              ]}
            />
          </Field>
        )}
        <Field label="Text-to-speech">
          <Select
            value={settings.ttsProvider}
            onChange={(v) => set('ttsProvider', v as AppSettings['ttsProvider'])}
            options={[
              ['sapi', 'Windows (SAPI)'],
              ['piper', 'Piper (local neural)'],
              ['elevenlabs', 'ElevenLabs (cloud)'],
              ['openai', 'OpenAI (cloud)'],
              ['azure', 'Azure (cloud)']
            ]}
          />
        </Field>
        <Field label="Smart DJ (LLM)" hint="Lets you say “play something chill” / “more like this”.">
          <Select
            value={settings.llmProvider}
            onChange={(v) => set('llmProvider', v as AppSettings['llmProvider'])}
            options={[
              ['none', 'Off (literal search only)'],
              ['groq', 'Groq (fast)'],
              ['deepseek', 'DeepSeek'],
              ['openai', 'OpenAI']
            ]}
          />
        </Field>
        {settings.llmProvider !== 'none' && (
          <>
            <Field
              label="Smart DJ API key"
              hint={
                settings.llmProvider === 'groq'
                  ? 'Reuses your Groq STT key if left blank'
                  : settings.llmProvider === 'deepseek'
                    ? 'Key from platform.deepseek.com'
                    : undefined
              }
            >
              <input
                type="password"
                className="input"
                placeholder={
                  settings.llmProvider === 'groq' && settings.cloudSttApiKey
                    ? 'Using Groq STT key'
                    : 'API key'
                }
                value={settings.llmApiKey}
                onChange={(e) => set('llmApiKey', e.target.value)}
              />
            </Field>
            <Field
              label="Model"
              hint={
                settings.llmProvider === 'deepseek'
                  ? 'e.g. deepseek-chat (or your V4 Flash model id)'
                  : 'Blank = provider default'
              }
            >
              <input
                className="input"
                placeholder={
                  settings.llmProvider === 'groq'
                    ? 'llama-3.3-70b-versatile'
                    : settings.llmProvider === 'deepseek'
                      ? 'deepseek-chat'
                      : 'gpt-4o-mini'
                }
                value={settings.llmModel}
                onChange={(e) => set('llmModel', e.target.value)}
              />
            </Field>
          </>
        )}
      </Section>

      <Section
        title="Downloads & storage"
        desc="Sync tracks, albums or playlists for offline play using the download/sync buttons. Nothing is saved automatically."
      >
        <Toggle
          label="Prefer local copy"
          desc="When a song has been synced, play it from disk instead of streaming."
          checked={settings.preferLocal}
          onChange={(v) => set('preferLocal', v)}
        />
        <Field label="Storage folder">
          <div className="flex gap-2">
            <input className="input" readOnly value={settings.downloadFolder} />
            <button
              className="shrink-0 rounded-xl bg-white/[0.06] px-4 text-sm text-slate-200 transition hover:bg-white/[0.1]"
              onClick={async () => {
                const folder = await window.yotify.pickFolder()
                if (folder) set('downloadFolder', folder)
              }}
            >
              Browse…
            </button>
          </div>
        </Field>
        <Field label="Audio format">
          <Select
            value={settings.audioFormat}
            onChange={(v) => set('audioFormat', v as AppSettings['audioFormat'])}
            options={[
              ['m4a', 'M4A (AAC)'],
              ['opus', 'Opus'],
              ['mp3', 'MP3']
            ]}
          />
        </Field>
        <Field label="Quality">
          <Select
            value={settings.audioQuality}
            onChange={(v) => set('audioQuality', v as AppSettings['audioQuality'])}
            options={[
              ['low', 'Low'],
              ['medium', 'Medium'],
              ['high', 'High']
            ]}
          />
        </Field>
      </Section>

      <Section title="System">
        <Toggle
          label="Close to tray"
          desc="Hide to the system tray on close instead of quitting (right-click the tray icon to quit)."
          checked={settings.closeToTray}
          onChange={(v) => set('closeToTray', v)}
        />
        <Toggle
          label="Start with Windows"
          desc="Launch Yotify automatically at sign-in."
          checked={settings.startWithWindows}
          onChange={(v) => set('startWithWindows', v)}
        />
        <p className="text-xs text-slate-500">
          Engine status:{' '}
          <span className={sidecar.running ? 'text-emerald-400' : 'text-amber-400'}>
            {sidecar.running ? 'connected' : sidecar.error || 'starting…'}
          </span>
        </p>
      </Section>
    </div>
  )
}

function Section({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <section className="glass rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
      {desc && <p className="mb-4 mt-0.5 text-xs text-slate-500">{desc}</p>}
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="grid grid-cols-[200px_1fr] items-center gap-4">
      <div>
        <div className="text-sm text-slate-300">{label}</div>
        {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  )
}

function Toggle({
  label,
  desc,
  checked,
  onChange
}: {
  label: string
  desc?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm text-slate-300">{label}</div>
        {desc && <div className="text-[11px] text-slate-500">{desc}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? 'bg-accent' : 'bg-white/10'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  )
}

function Select({
  value,
  onChange,
  options
}: {
  value: string
  onChange: (v: string) => void
  options: [string, string][]
}) {
  return (
    <select className="input cursor-pointer" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, label]) => (
        <option key={v} value={v} className="bg-ink-700">
          {label}
        </option>
      ))}
    </select>
  )
}
