import { create } from 'zustand'

export type Route = 'player' | 'library' | 'settings'

interface UiState {
  route: Route
  setRoute: (r: Route) => void
}

/** Global UI navigation state, so non-component code (e.g. the voice flow) can
 * switch views — a voice request jumps to the Player so you see now-playing. */
export const useUi = create<UiState>((set) => ({
  route: 'player',
  setRoute: (route) => set({ route })
}))
