import { usePlayer } from '@/state/playerStore'

/**
 * Wire the Web MediaSession API to our player. Chromium maps this to the
 * Windows System Media Transport Controls (the media flyout / lock screen with
 * art + title) and routes hardware media keys here — no native code needed.
 */
export function setupMediaSession(): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  const ms = navigator.mediaSession
  const p = () => usePlayer.getState()

  ms.setActionHandler('play', () => {
    if (p().state !== 'playing') p().playPause()
  })
  ms.setActionHandler('pause', () => {
    if (p().state === 'playing') p().playPause()
  })
  ms.setActionHandler('nexttrack', () => void p().next())
  ms.setActionHandler('previoustrack', () => void p().prev())
  try {
    ms.setActionHandler('stop', () => p().stop())
  } catch {
    /* not all platforms support 'stop' */
  }
  ms.setActionHandler('seekto', (d) => {
    if (d.seekTime != null) p().seek(d.seekTime)
  })

  let lastUid: string | undefined
  let lastArt: string | null = null
  let lastState = ''
  let lastPosTick = 0

  usePlayer.subscribe((s) => {
    // Metadata — only when the track or its art changes.
    if (s.current && (s.current.uid !== lastUid || s.artUrl !== lastArt)) {
      lastUid = s.current.uid
      lastArt = s.artUrl
      ms.metadata = new MediaMetadata({
        title: s.current.title,
        artist: s.current.artist ?? '',
        album: s.albumName ?? '',
        artwork: s.artUrl
          ? [{ src: s.artUrl, sizes: '512x512', type: 'image/png' }]
          : []
      })
    }

    // Playback state.
    const state = s.state === 'playing' ? 'playing' : s.state === 'paused' ? 'paused' : 'none'
    if (state !== lastState) {
      lastState = state
      ms.playbackState = state as MediaSessionPlaybackState
    }

    // Position — throttle to ~1/sec (the time field updates every frame).
    if (s.duration > 0 && Math.abs(s.position - lastPosTick) > 0.9) {
      lastPosTick = s.position
      try {
        ms.setPositionState({
          duration: s.duration,
          position: Math.min(s.position, s.duration),
          playbackRate: 1
        })
      } catch {
        /* invalid state ignored */
      }
    }
  })
}
