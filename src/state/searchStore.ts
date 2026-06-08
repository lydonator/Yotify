import { create } from 'zustand'
import { api } from '@/api/client'
import type { SearchResult } from '@shared/types'

interface SearchState {
  query: string
  results: SearchResult[]
  loading: boolean
  error: string | null
  setQuery: (q: string) => void
  run: (q?: string) => Promise<void>
}

/** Search state lives here (not in the component) so results persist when you
 * switch tabs/pages and come back. */
export const useSearch = create<SearchState>((set, get) => ({
  query: '',
  results: [],
  loading: false,
  error: null,
  setQuery: (query) => set({ query }),
  run: async (q) => {
    const query = (q ?? get().query).trim()
    if (!query) return
    set({ loading: true, error: null, query })
    try {
      const { results } = await api.search(query)
      set({ results, loading: false })
    } catch (e) {
      set({ error: String(e), loading: false })
    }
  }
}))
