// Smart DJ / voice intent via an LLM. Groq and DeepSeek are OpenAI-compatible
// chat APIs, so one client covers both. The LLM both *classifies* the (often
// misheard) spoken command and *curates* tracks for vibe requests.

import { useSettings } from '@/state/settingsStore'

interface ProviderCfg {
  url: string
  defaultModel: string
}

const PROVIDERS: Record<string, ProviderCfg> = {
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', defaultModel: 'llama-3.3-70b-versatile' },
  deepseek: { url: 'https://api.deepseek.com/chat/completions', defaultModel: 'deepseek-chat' },
  openai: { url: 'https://api.openai.com/v1/chat/completions', defaultModel: 'gpt-4o-mini' }
}

/** Is an LLM provider configured (provider chosen + a usable key)? */
export function llmConfigured(): boolean {
  const s = useSettings.getState().settings
  if (!(s.llmProvider in PROVIDERS)) return false
  const key = s.llmApiKey || (s.llmProvider === 'groq' ? s.cloudSttApiKey : '')
  return !!key
}

async function chatJSON(system: string, user: string, temperature: number): Promise<any | null> {
  const s = useSettings.getState().settings
  const cfg = PROVIDERS[s.llmProvider]
  if (!cfg) return null
  const key = s.llmApiKey || (s.llmProvider === 'groq' ? s.cloudSttApiKey : '')
  if (!key) throw new Error(`No API key set for ${s.llmProvider}`)
  const model = s.llmModel.trim() || cfg.defaultModel

  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${s.llmProvider} ${res.status}: ${text.slice(0, 160)}`)
  }
  const data = await res.json()
  const content: string = data?.choices?.[0]?.message?.content ?? ''
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

// ---- unified voice intent ---------------------------------------------------

export type VoiceAction =
  | 'pause'
  | 'resume'
  | 'next'
  | 'previous'
  | 'stop'
  | 'volume_up'
  | 'volume_down'
  | 'mute'
  | 'unmute'
  | 'play'
  | 'queue'
  | 'unknown'

export interface VoiceCommand {
  action: VoiceAction
  /** For a specific play/queue request: "artist title". */
  query?: string
  /** For a curated vibe request: real songs to play/queue. */
  tracks?: { artist: string; title: string }[]
  name?: string
  reply?: string
}

const INTENT_SYSTEM = `You are the voice control + DJ for a music player. The user's words come from
speech-to-text and may be slightly misheard or have extra words. Decide ONE action and reply with
STRICT JSON only: {"action":"...","query":"...","tracks":[{"artist":"","title":""}],"name":"...","reply":"..."}

Actions:
- Transport (no query/tracks): "pause","resume","next","previous","stop","volume_up","volume_down","mute","unmute".
  Map natural/misheard phrases: skip / next one / "next" -> next; go back / previous / back -> previous;
  louder / turn it up -> volume_up; quieter / turn it down -> volume_down; hold on / wait -> pause;
  shut up / silence / stop -> stop; continue / unpause -> resume.
- "play": if the user named a specific song or artist, set "query" to a clean "artist title" search string.
  If instead they asked for a vibe / mood / genre / era / activity / "more like this" / "surprise me",
  set "tracks" to 6-9 well-known REAL songs (and a short "name"); leave query empty.
- "queue": same as play but they said "queue", "add", or "... next".
- "unknown": only if truly unintelligible.

Use the now-playing track + recent history for "more like this"/"similar". Keep "reply" to one short sentence.
Prefer a transport action when the phrase is basically a control word.`

/** Classify a spoken command (and curate tracks if it's a vibe request). */
export async function interpretCommand(
  transcript: string,
  context: { current?: string; recent?: string[] }
): Promise<VoiceCommand | null> {
  const user = [
    `User said: "${transcript}"`,
    context.current ? `Now playing: ${context.current}` : '',
    context.recent?.length ? `Recently played: ${context.recent.join('; ')}` : ''
  ]
    .filter(Boolean)
    .join('\n')

  const r = await chatJSON(INTENT_SYSTEM, user, 0.6)
  if (!r || typeof r.action !== 'string') return null
  const cmd: VoiceCommand = {
    action: r.action,
    query: typeof r.query === 'string' ? r.query.trim() : undefined,
    tracks: Array.isArray(r.tracks)
      ? r.tracks.filter((t: any) => t && t.title).slice(0, 12)
      : undefined,
    name: typeof r.name === 'string' ? r.name : undefined,
    reply: typeof r.reply === 'string' ? r.reply : undefined
  }
  return cmd
}
