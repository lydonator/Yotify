import { create } from 'zustand'

export type Route = 'player' | 'library' | 'settings'
export type PlayerTab = 'search' | 'album' | 'lyrics'

interface UiState {
  route: Route
  setRoute: (r: Route) => void
  /** Which tab is showing in the Player view's side panel. Lifted out of the
   * component so the voice flow can jump to Search and show spoken results. */
  playerTab: PlayerTab
  setPlayerTab: (t: PlayerTab) => void
}

/** Global UI navigation state, so non-component code (e.g. the voice flow) can
 * switch views — a voice request jumps to the Player so you see now-playing. */
export const useUi = create<UiState>((set) => ({
  route: 'player',
  setRoute: (route) => set({ route }),
  playerTab: 'search',
  setPlayerTab: (playerTab) => set({ playerTab })
}))
