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
  | 'play_track' // one specific named song → play now
  | 'queue_track' // one specific named song → add to queue
  | 'play_set' // a curated vibe/genre/era set → play now
  | 'queue_set' // a curated set → add to queue
  | 'search' // browse: show results in the Search tab, don't auto-play
  | 'unknown'

export interface VoiceCommand {
  action: VoiceAction
  /** For a specific track or a search: a clean "artist title" / search string. */
  query?: string
  /** For a curated set: real songs to play/queue. */
  tracks?: { artist: string; title: string }[]
  /** How many tracks the user asked for in a set (clamped 1..30). */
  count?: number
  name?: string
  reply?: string
}

const MAX_SET = 30
const DEFAULT_SET = 12

const INTENT_SYSTEM = `You are the voice control + DJ for a music player. The user's words come from
speech-to-text and may be slightly misheard or padded with filler. Decide ONE action and reply with
STRICT JSON only:
{"action":"...","query":"...","tracks":[{"artist":"","title":""}],"count":0,"name":"...","reply":"..."}

ACTIONS — choose exactly one:
- Transport (no other fields): "pause","resume","next","previous","stop","volume_up","volume_down","mute","unmute".
  Map natural/misheard phrases: skip / next one -> next; go back / previous -> previous;
  louder / turn it up -> volume_up; quieter / turn it down -> volume_down; hold on / wait -> pause;
  shut up / silence / stop -> stop; continue / unpause -> resume.

- "play_track": the user named ONE specific song or artist to play. Set "query" to a clean
  "artist title" search string (e.g. "play bohemian rhapsody" -> query "Queen Bohemian Rhapsody").
- "queue_track": same as play_track but they said "queue", "add", or "... next".

- "play_set": the user asked for a VIBE / mood / genre / era / activity / "more like this" /
  "surprise me" to start playing. Provide "tracks" = real, well-known songs that fit, plus a short
  "name" for the set. If the user stated a NUMBER of songs (e.g. "20 tracks", "five songs"), set
  "count" to that number and return exactly that many tracks (max ${MAX_SET}). If no number was given,
  set count to ${DEFAULT_SET} and return about ${DEFAULT_SET} tracks. Leave "query" empty.
- "queue_set": same as play_set but they said "queue" or "add".

- "search": the user wants to BROWSE results, not auto-play — they used a search word such as
  "search", "search for", "find", "find me", "look up", or "show me". Set "query" to a clean search
  string. Do NOT set tracks.

- "unknown": only if truly unintelligible.

RULES:
- A specific named song/artist -> play_track/queue_track. A descriptive vibe/genre/era -> a *_set. A
  search word -> search. Prefer a transport action when the phrase is basically a control word.
- Use the now-playing track + recent history for "more like this"/"similar".
- "reply": ONE short sentence confirming what you did. Output strict JSON only, no prose.`

/** Classify a spoken command (and curate tracks if it's a set request). */
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

  // Clamp a requested count into a sane range (set actions only).
  let count: number | undefined
  if (typeof r.count === 'number' && isFinite(r.count)) {
    count = Math.max(1, Math.min(MAX_SET, Math.round(r.count)))
  }
  const tracks = Array.isArray(r.tracks)
    ? r.tracks
        .filter((t: any) => t && typeof t.title === 'string' && t.title.trim())
        .slice(0, count ?? MAX_SET)
        .map((t: any) => ({ artist: String(t.artist ?? '').trim(), title: String(t.title).trim() }))
    : undefined

  return {
    action: r.action,
    query: typeof r.query === 'string' ? r.query.trim() : undefined,
    tracks,
    count,
    name: typeof r.name === 'string' ? r.name : undefined,
    reply: typeof r.reply === 'string' ? r.reply : undefined
  }
}
