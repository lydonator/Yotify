import { create } from 'zustand'
import { listenForCommand } from './stt'
import { speak, stopSpeaking } from './tts'
import { parseIntent, type Intent } from './intent'
import { interpretCommand, llmConfigured, type VoiceCommand } from './smartdj'
import { audioEngine } from '@/audio/engine'
import { api } from '@/api/client'
import { usePlayer } from '@/state/playerStore'
import { useSettings } from '@/state/settingsStore'
import { useLibrary } from '@/state/libraryStore'
import { useSearch } from '@/state/searchStore'
import { useUi } from '@/state/uiStore'
import type { Track } from '@shared/types'

/** Run a search by voice: jump to the Player's Search tab and populate it with
 * the spoken query + results, so the user sees what was heard and what matched
 * (instead of silently committing something to the queue). */
async function showSearch(query: string): Promise<IntentResult> {
  useUi.getState().setRoute('player')
  useUi.getState().setPlayerTab('search')
  await useSearch.getState().run(query)
  const n = useSearch.getState().results.length
  return n
    ? { ok: true, message: `Here's what I found for ${query}.` }
    : { ok: false, message: `I couldn't find anything for ${query}.` }
}

/** Turn a curated track list into grouped, prunable queue entries. */
function toSetTracks(list: { artist: string; title: string }[], name: string): Track[] {
  const groupId = `dj-${Date.now().toString(36)}`
  return list.map((t, i) => ({
    id: `srch-${groupId}-${i}`,
    title: t.title,
    artist: t.artist,
    source: 'search',
    query: `${t.artist} ${t.title}`.trim(),
    groupId,
    groupName: name
  }))
}

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'

interface VoiceStore {
  state: VoiceState
  level: number // mic level 0..1 while listening
  transcript: string
  message: string
  busy: boolean
  /** Begin a single listen→act cycle (push-to-talk or post-wake-word). */
  activate: () => Promise<void>
}

/** Short WebAudio chimes: a rising "wake" tone, a two-note "success", a low
 * "error" buzz. Respects the earcon setting. */
function chime(kind: 'wake' | 'success' | 'error'): void {
  if (!useSettings.getState().settings.earconEnabled) return
  try {
    const ctx = new AudioContext()
    const t0 = ctx.currentTime
    const notes: [number, number, number][] =
      kind === 'wake'
        ? [[660, 0, 0.14], [990, 0.06, 0.2]]
        : kind === 'success'
          ? [[784, 0, 0.12], [1175, 0.1, 0.18]]
          : [[300, 0, 0.18], [200, 0.08, 0.26]]
    let end = 0
    for (const [freq, start, dur] of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = kind === 'error' ? 'sawtooth' : 'sine'
      const t = t0 + start
      osc.frequency.setValueAtTime(freq, t)
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      osc.start(t)
      osc.stop(t + dur + 0.02)
      end = Math.max(end, start + dur)
    }
    setTimeout(() => ctx.close(), (end + 0.1) * 1000)
  } catch {
    // ignore audio errors
  }
}

interface IntentResult {
  ok: boolean
  /** Spoken only on failure, or on success when "speak confirmations" is on. */
  message: string
}

async function runIntent(intent: Intent): Promise<IntentResult> {
  const player = usePlayer.getState()
  switch (intent.type) {
    case 'play': {
      await player.playQuery(intent.query)
      const cur = usePlayer.getState().current
      return cur
        ? { ok: true, message: `Playing ${cur.title}.` }
        : { ok: false, message: `I couldn't find ${intent.query}.` }
    }
    case 'queue': {
      try {
        const info = await api.topStream(intent.query)
        player.enqueue(info.track, true)
        return { ok: true, message: `Added ${info.track.title} to the queue.` }
      } catch {
        return { ok: false, message: `I couldn't find ${intent.query}.` }
      }
    }
    case 'dj': {
      // Rule-based fallback only (LLM path handles real curation): literal search.
      await player.playQuery(intent.request.replace(/^(play|put on)\s+/, ''))
      const cur = usePlayer.getState().current
      return cur
        ? { ok: true, message: `Playing ${cur.title}.` }
        : { ok: false, message: "I couldn't find that." }
    }
    case 'search':
      return showSearch(intent.query)
    case 'pause':
    case 'resume':
      player.playPause()
      return { ok: true, message: '' }
    case 'next':
      await player.next()
      return { ok: true, message: 'Skipping.' }
    case 'previous':
      await player.prev()
      return { ok: true, message: 'Going back.' }
    case 'stop':
      player.stop()
      return { ok: true, message: 'Stopped.' }
    case 'volumeUp':
      player.setVolume(Math.min(1, player.volume + 0.15))
      return { ok: true, message: '' }
    case 'volumeDown':
      player.setVolume(Math.max(0, player.volume - 0.15))
      return { ok: true, message: '' }
    case 'mute':
      if (!player.muted) player.toggleMute()
      return { ok: true, message: '' }
    case 'unmute':
      if (player.muted) player.toggleMute()
      return { ok: true, message: '' }
    default:
      return { ok: false, message: "Sorry, I didn't catch that." }
  }
}

/** Execute an LLM-classified voice command: transport, a specific track,
 * a curated set (honoring a requested count), or a browse-style search. */
async function runCommand(cmd: VoiceCommand): Promise<IntentResult> {
  const player = usePlayer.getState()
  switch (cmd.action) {
    case 'pause':
    case 'resume':
      player.playPause()
      return { ok: true, message: '' }
    case 'next':
      await player.next()
      return { ok: true, message: 'Skipping.' }
    case 'previous':
      await player.prev()
      return { ok: true, message: 'Going back.' }
    case 'stop':
      player.stop()
      return { ok: true, message: 'Stopped.' }
    case 'volume_up':
      player.setVolume(Math.min(1, player.volume + 0.15))
      return { ok: true, message: '' }
    case 'volume_down':
      player.setVolume(Math.max(0, player.volume - 0.15))
      return { ok: true, message: '' }
    case 'mute':
      if (!player.muted) player.toggleMute()
      return { ok: true, message: '' }
    case 'unmute':
      if (player.muted) player.toggleMute()
      return { ok: true, message: '' }

    case 'play_track': {
      // playQuery prefers a synced local copy when "prefer local" is on.
      if (!cmd.query) return { ok: false, message: "Sorry, I didn't catch that." }
      await player.playQuery(cmd.query)
      const cur = usePlayer.getState().current
      return cur
        ? { ok: true, message: `Playing ${cur.title}.` }
        : { ok: false, message: `I couldn't find ${cmd.query}.` }
    }
    case 'queue_track': {
      if (!cmd.query) return { ok: false, message: "Sorry, I didn't catch that." }
      try {
        const info = await api.topStream(cmd.query)
        player.enqueue(info.track, true)
        return { ok: true, message: `Added ${info.track.title} to the queue.` }
      } catch {
        return { ok: false, message: `I couldn't find ${cmd.query}.` }
      }
    }

    case 'play_set':
    case 'queue_set': {
      const list = (cmd.tracks ?? []).slice(0, cmd.count ?? cmd.tracks?.length ?? 0)
      if (!list.length) return { ok: false, message: "I couldn't put a set together." }
      const name = cmd.name || 'Smart DJ'
      const tracks = toSetTracks(list, name)
      const queued = cmd.action === 'queue_set'
      if (queued) player.enqueueAlbum(tracks)
      else player.playDjSet(tracks)
      const verb = queued ? 'Queued' : 'Playing'
      return {
        ok: true,
        message: cmd.reply || `${verb} ${tracks.length} tracks — ${name}.`
      }
    }

    case 'search':
      if (!cmd.query) return { ok: false, message: 'What would you like me to search for?' }
      return showSearch(cmd.query)

    default:
      return { ok: false, message: "Sorry, I didn't catch that." }
  }
}

export const useVoice = create<VoiceStore>((set, get) => ({
  state: 'idle',
  level: 0,
  transcript: '',
  message: '',
  busy: false,

  activate: async () => {
    if (get().busy) return
    // Jump to the Player view so the user sees now-playing / the visualizer.
    useUi.getState().setRoute('player')
    set({ busy: true, state: 'listening', transcript: '', message: '' })
    stopSpeaking()
    // Duck any playing music for the whole interaction (wake chime → listen →
    // chimes/TTS); restored in `finally`.
    audioEngine.setDuck(true)
    chime('wake')
    try {
      const transcript = await listenForCommand((level) => set({ level }))

      // Close the overlay as soon as we have the words — don't keep the blur up
      // while the track resolves/loads (that felt "stuck").
      set({ state: 'idle', transcript, level: 0 })

      const ruleIntent = parseIntent(transcript)
      const isTransport = new Set([
        'pause',
        'resume',
        'next',
        'previous',
        'stop',
        'volumeUp',
        'volumeDown',
        'mute',
        'unmute'
      ]).has(ruleIntent.type)

      let result: IntentResult | null = null

      if (isTransport) {
        // Clear control word → act instantly, no LLM round-trip.
        result = await runIntent(ruleIntent)
      } else if (llmConfigured()) {
        // Everything else (specific track, vibe set, search, or a misheard
        // command) → let the LLM classify + curate. A specific play_track still
        // prefers a synced local copy via playQuery. Falls back to rules on error.
        try {
          const current = usePlayer.getState().current
          const recent = useLibrary
            .getState()
            .history.slice(0, 8)
            .map((h) => `${h.track.artist ?? ''} - ${h.track.title}`)
          const cmd = await interpretCommand(transcript, {
            current: current ? `${current.artist ?? ''} - ${current.title}` : undefined,
            recent
          })
          if (cmd) result = await runCommand(cmd)
        } catch (e) {
          console.warn('[voice] LLM intent failed, using rules:', e)
        }
      }
      if (!result) result = await runIntent(ruleIntent)

      const { ok, message } = result
      const speakConfirmations = useSettings.getState().settings.speakConfirmations

      if (ok) {
        // Success → brief chime (or spoken confirmation if the user opted in).
        if (speakConfirmations && message) await speak(message)
        else chime('success')
      } else {
        // Failure → error chime + a short spoken hint.
        chime('error')
        await speak(message)
      }
    } catch (e) {
      set({ state: 'error', message: String(e) })
      setTimeout(() => set({ state: 'idle' }), 2500)
    } finally {
      audioEngine.setDuck(false)
      set({ busy: false })
    }
  }
}))
