import type { YotifyApi } from '@shared/types'

declare global {
  interface Window {
    yotify: YotifyApi
  }

  // HTMLMediaElement.setSinkId is not yet in the default TS DOM lib types.
  interface HTMLMediaElement {
    setSinkId?(sinkId: string): Promise<void>
    readonly sinkId?: string
  }
}

export {}
