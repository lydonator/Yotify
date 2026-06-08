import Store from 'electron-store'
import { app } from 'electron'
import { join } from 'path'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types'

/**
 * Persistent settings store. Defaults the download folder to <Music>/Yotify the
 * first time it is read, so the UI always has a sensible path to show.
 */
const store = new Store<AppSettings>({
  name: 'settings',
  defaults: DEFAULT_SETTINGS
})

export function getSettings(): AppSettings {
  const s = { ...DEFAULT_SETTINGS, ...(store.store as Partial<AppSettings>) }
  if (!s.downloadFolder) {
    s.downloadFolder = join(app.getPath('music'), 'Yotify')
  }
  return s
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  for (const [k, v] of Object.entries(patch)) {
    store.set(k, v as never)
  }
  return getSettings()
}
