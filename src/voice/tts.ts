// Text-to-speech via the Web Speech API (Chromium uses installed Windows voices).
// This is the default 'sapi' provider; cloud providers can be added later behind
// the same speak() interface.

let preferred: SpeechSynthesisVoice | null = null

function pickVoice(): SpeechSynthesisVoice | null {
  if (preferred) return preferred
  const voices = window.speechSynthesis?.getVoices() ?? []
  if (!voices.length) return null
  // Prefer a natural-sounding English voice if available.
  preferred =
    voices.find((v) => /en-US/i.test(v.lang) && /natural|aria|jenny|guy/i.test(v.name)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    voices[0]
  return preferred
}

// Voice list loads asynchronously in Chromium.
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    preferred = null
    pickVoice()
  }
}

export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis
    if (!synth || !text) return resolve()
    synth.cancel() // interrupt any in-progress utterance
    const u = new SpeechSynthesisUtterance(text)
    const v = pickVoice()
    if (v) u.voice = v
    u.rate = 1.05
    u.pitch = 1
    u.onend = () => resolve()
    u.onerror = () => resolve()
    synth.speak(u)
  })
}

export function stopSpeaking(): void {
  window.speechSynthesis?.cancel()
}
