import { app, BrowserWindow, ipcMain, dialog, shell, session, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { Sidecar } from './sidecar'
import { getSettings, setSettings } from './store'
import { setupUpdater, checkForUpdate, installUpdate } from './updater'
import { IPC, type MediaControl, type SidecarStatus } from '@shared/types'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let sidecar: Sidecar | null = null
let isQuitting = false

const isDev = !app.isPackaged

function broadcast(channel: string, payload: unknown): void {
  // Guard against sends during/after shutdown when the window is destroyed.
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send(channel, payload)
  }
}

/** Locate the app icon in dev (project resources/) and packaged (resourcesPath). */
function iconPath(): string {
  const packaged = join(process.resourcesPath, 'icon.png')
  if (app.isPackaged && existsSync(packaged)) return packaged
  return join(app.getAppPath(), 'resources', 'icon.png')
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#07080d',
    icon: iconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => win?.show())
  win.on('closed', () => {
    win = null
  })

  // Close-to-tray: hide instead of quitting (unless the user chose otherwise).
  win.on('close', (e) => {
    if (!isQuitting && getSettings().closeToTray) {
      e.preventDefault()
      win?.hide()
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function showWindow(): void {
  if (!win) {
    createWindow()
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createTray(): void {
  const img = nativeImage.createFromPath(iconPath()).resize({ width: 18, height: 18 })
  tray = new Tray(img)
  tray.setToolTip('Yotify')
  const media = (c: MediaControl) => () => broadcast(IPC.evtMediaControl, c)
  const menu = Menu.buildFromTemplate([
    { label: 'Show Yotify', click: showWindow },
    { type: 'separator' },
    { label: 'Play / Pause', click: media('playpause') },
    { label: 'Next', click: media('next') },
    { label: 'Previous', click: media('prev') },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
  tray.on('click', showWindow)
  tray.on('double-click', showWindow)
}

function registerIpc(): void {
  ipcMain.handle(IPC.settingsGet, () => getSettings())
  ipcMain.handle(IPC.settingsSet, (_e, patch) => {
    const next = setSettings(patch)
    if ('startWithWindows' in patch) {
      app.setLoginItemSettings({ openAtLogin: next.startWithWindows })
    }
    return next
  })
  ipcMain.handle(IPC.sidecarStatus, () => sidecar?.getStatus() ?? { running: false, port: null })
  ipcMain.handle(IPC.sidecarBaseUrl, () => sidecar?.baseUrl() ?? null)
  ipcMain.handle(IPC.pickFolder, async () => {
    if (!win) return null
    const res = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory']
    })
    return res.canceled ? null : res.filePaths[0]
  })
  ipcMain.handle(IPC.pickFile, async (_e, filters) => {
    if (!win) return null
    const res = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: filters ?? [{ name: 'All Files', extensions: ['*'] }]
    })
    return res.canceled ? null : res.filePaths[0]
  })

  ipcMain.on(IPC.winMinimize, () => win?.minimize())
  ipcMain.on(IPC.winMaximize, () => {
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })
  ipcMain.on(IPC.winClose, () => win?.close())

  ipcMain.on(IPC.updateCheck, () => void checkForUpdate())
  ipcMain.on(IPC.updateInstall, () => {
    isQuitting = true // let the relaunch through close-to-tray
    installUpdate()
  })
}

// Single-instance: a second launch just focuses the existing window. Multiple
// instances would fight over the mic, sidecar port, and tray icon.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())

  app.whenReady().then(() => {
    // Allow the renderer's microphone access (push-to-talk) + device labels.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
      cb(permission === 'media')
    })

    registerIpc()

    sidecar = new Sidecar((status: SidecarStatus) => broadcast(IPC.evtSidecarStatus, status))
    sidecar.start()

    app.setLoginItemSettings({ openAtLogin: getSettings().startWithWindows })

    createWindow()
    createTray()

    // Auto-update via GitHub Releases (packaged builds only).
    setupUpdater((status) => broadcast(IPC.evtUpdate, status))

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else showWindow()
    })
  })
}

app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  // With close-to-tray the window only hides, so this won't fire then. If the
  // user disabled it, closing the window quits the app (non-macOS).
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  sidecar?.stop()
})
