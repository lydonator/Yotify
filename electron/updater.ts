import { app } from 'electron'
import pkg from 'electron-updater'
import type { UpdateStatus } from '@shared/types'

// electron-updater ships as CommonJS; pull autoUpdater off the default export so
// it works under our ESM build.
const { autoUpdater } = pkg

const SIX_HOURS = 6 * 60 * 60 * 1000

let started = false

/**
 * Wire up GitHub-Releases auto-update.
 *
 * Flow: on launch (and every few hours) we check the published `latest.yml`. If
 * a newer version exists, electron-updater downloads it in the background and we
 * report progress to the renderer via `emit`. When the download completes the
 * user gets a "Restart to update" prompt; if they ignore it, the update installs
 * automatically on the next quit (`autoInstallOnAppQuit`).
 *
 * Safe no-op in dev (no `app-update.yml` is bundled) and offline (errors are
 * swallowed and just reported as a status).
 */
export function setupUpdater(emit: (status: UpdateStatus) => void): void {
  // Only meaningful in a packaged build with a publish config baked in.
  if (!app.isPackaged) return
  if (started) return
  started = true

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  // We surface our own UI, so don't let it pop native dialogs.
  autoUpdater.on('checking-for-update', () => emit({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => emit({ state: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => emit({ state: 'none' }))
  autoUpdater.on('download-progress', (p) =>
    emit({ state: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    emit({ state: 'downloaded', version: info.version })
  )
  autoUpdater.on('error', (err) =>
    emit({ state: 'error', message: err == null ? 'unknown' : (err.message ?? String(err)) })
  )

  void checkForUpdate()
  setInterval(() => void checkForUpdate(), SIX_HOURS)
}

/** Manual or scheduled check; errors are reported via the 'error' event above. */
export async function checkForUpdate(): Promise<void> {
  if (!app.isPackaged) return
  try {
    await autoUpdater.checkForUpdates()
  } catch {
    // Network/feed errors already surface through the 'error' listener.
  }
}

/** Quit and install a downloaded update. Caller must set the quitting flag so
 * close-to-tray doesn't intercept the shutdown. */
export function installUpdate(): void {
  if (!app.isPackaged) return
  // isSilent=false (run installer UI-less but show progress), forceRunAfter=true.
  autoUpdater.quitAndInstall(true, true)
}
