// Rule-based intent router: turns a transcribed voice command into an action.
// Kept pure (no imports) so it's trivially unit-testable.

export type Intent =
  | { type: 'play'; query: string }
  | { type: 'queue'; query: string }
  | { type: 'dj'; request: string }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'stop' }
  | { type: 'volumeUp' }
  | { type: 'volumeDown' }
  | { type: 'mute' }
  | { type: 'unmute' }
  | { type: 'unknown'; text: string }

const FILLERS = [
  'please',
  'can you',
  'could you',
  'would you',
  'i want to',
  'i wanna',
  'i want',
  'for me',
  'now',
  'some',
  'a song',
  'the song',
  'a track',
  'some music',
  'music'
]

// Leading conversational prefixes to drop before parsing the command verb.
const LEAD = [
  'hey dj',
  'ok dj',
  'okay dj',
  'yo dj',
  'can you',
  'could you',
  'would you',
  'please',
  'okay',
  'ok',
  'um',
  'uh',
  'so',
  'yo',
  'hey'
]

function clean(text: string): string {
  let s = text
    .toLowerCase()
    .replace(/[.,!?;:"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // Strip leading politeness/wake-residue (repeatedly) and trailing thanks.
  let changed = true
  while (changed) {
    changed = false
    for (const p of LEAD) {
      if (s === p || s.startsWith(p + ' ')) {
        s = s.slice(p.length).trim()
        changed = true
      }
    }
  }
  s = s.replace(/\b(please|thanks|thank you)\s*$/g, '').trim()
  return s
}

function stripFillers(s: string): string {
  let out = ` ${s} `
  for (const f of FILLERS) out = out.replace(new RegExp(`\\b${f}\\b`, 'g'), ' ')
  return out.replace(/\s+/g, ' ').trim()
}

/** Parse a transcript into an Intent. Falls back to treating it as a play query. */
export function parseIntent(transcript: string): Intent {
  const t = clean(transcript)
  if (!t) return { type: 'unknown', text: '' }

  // Command form: drop trailing objects so "pause the music" / "skip this" /
  // "stop it" reduce to the bare command.
  const c = t
    .replace(/\s+(?:the\s+)?(?:music|song|songs|track|tracks|playback|it|this|that|now)$/i, '')
    .trim()

  // Transport commands (matched on the object-stripped form).
  if (/^(pause|hold on|wait|wait a (?:sec|second|minute)|hold)$/.test(c)) return { type: 'pause' }
  if (/^(resume|continue|unpause|keep playing|carry on|play|go|resume playing)$/.test(c))
    return { type: 'resume' }
  if (/^(stop|stop playing|silence|shut up|be quiet|quiet)$/.test(c)) return { type: 'stop' }
  if (/^(next|skip|next one|skip this|skip it|next song|next track|skip ahead|forward)$/.test(c))
    return { type: 'next' }
  if (/^(previous|back|go back|last one|previous song|previous track|rewind|start over|restart)$/.test(c))
    return { type: 'previous' }
  if (/\b(louder|turn it up|volume up|crank it|pump it up|turn up)\b/.test(t)) return { type: 'volumeUp' }
  if (/\b(quieter|softer|turn it down|volume down|turn down|lower (?:it|the volume))\b/.test(t))
    return { type: 'volumeDown' }
  if (/^(mute|silence it)$/.test(c)) return { type: 'mute' }
  if (/^(unmute|sound on)$/.test(c)) return { type: 'unmute' }

  // Conversational "Smart DJ" requests → curated by the LLM.
  if (
    /\b(like this|like that|similar|surprise me|dealer'?s choice|read the room|keep it going|more of the same|some more|mix it up)\b/.test(
      t
    )
  ) {
    return { type: 'dj', request: t }
  }
  if (
    /^(?:play|put on|give me|throw on|i (?:wanna|want to) hear|let'?s hear)\s+(?:some|something|anything|a bit of|a mix of|me something)\b/.test(
      t
    )
  ) {
    return { type: 'dj', request: t }
  }

  // "play X" — but bare "play" resumes
  const playNext = t.match(
    /^(?:play|put on|queue up|add)\s+(.*?)\s+(?:next|after this|to the queue|to queue)$/
  )
  if (playNext && playNext[1]) {
    const q = stripFillers(playNext[1])
    if (q) return { type: 'queue', query: q }
  }

  const queue = t.match(/^(?:queue|add)\s+(.*)$/)
  if (queue && queue[1]) {
    const q = stripFillers(queue[1])
    if (q) return { type: 'queue', query: q }
  }

  const play = t.match(/^(?:play|put on|start|i wanna hear|i want to hear|let'?s hear)\s+(.*)$/)
  if (play) {
    const q = stripFillers(play[1])
    if (q) return { type: 'play', query: q }
    return { type: 'resume' } // "play" with nothing else
  }

  // No verb — treat the whole phrase as a search query.
  const q = stripFillers(t)
  return q ? { type: 'play', query: q } : { type: 'unknown', text: transcript }
}

/** A short spoken confirmation for an intent, before the action's own result. */
export function confirmationFor(intent: Intent): string | null {
  switch (intent.type) {
    case 'pause':
      return 'Paused.'
    case 'resume':
      return null
    case 'next':
      return 'Skipping.'
    case 'previous':
      return 'Going back.'
    case 'stop':
      return 'Stopped.'
    case 'unknown':
      return "Sorry, I didn't catch that."
    default:
      return null
  }
}
