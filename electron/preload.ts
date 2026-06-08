import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AppSettings,
  type MediaControl,
  type SidecarStatus,
  type UpdateStatus,
  type YotifyApi
} from '@shared/types'

const api: YotifyApi = {
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  setSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke(IPC.settingsSet, patch),
  getSidecarStatus: () => ipcRenderer.invoke(IPC.sidecarStatus),
  getSidecarBaseUrl: () => ipcRenderer.invoke(IPC.sidecarBaseUrl),
  pickFolder: () => ipcRenderer.invoke(IPC.pickFolder),
  pickFile: (filters) => ipcRenderer.invoke(IPC.pickFile, filters),
  minimize: () => ipcRenderer.send(IPC.winMinimize),
  toggleMaximize: () => ipcRenderer.send(IPC.winMaximize),
  close: () => ipcRenderer.send(IPC.winClose),
  onSidecarStatus: (cb: (status: SidecarStatus) => void) => {
    const listener = (_e: unknown, status: SidecarStatus) => cb(status)
    ipcRenderer.on(IPC.evtSidecarStatus, listener)
    return () => ipcRenderer.removeListener(IPC.evtSidecarStatus, listener)
  },
  onMediaControl: (cb: (control: MediaControl) => void) => {
    const listener = (_e: unknown, control: MediaControl) => cb(control)
    ipcRenderer.on(IPC.evtMediaControl, listener)
    return () => ipcRenderer.removeListener(IPC.evtMediaControl, listener)
  },
  checkForUpdate: () => ipcRenderer.send(IPC.updateCheck),
  installUpdate: () => ipcRenderer.send(IPC.updateInstall),
  onUpdate: (cb: (status: UpdateStatus) => void) => {
    const listener = (_e: unknown, status: UpdateStatus) => cb(status)
    ipcRenderer.on(IPC.evtUpdate, listener)
    return () => ipcRenderer.removeListener(IPC.evtUpdate, listener)
  }
}

contextBridge.exposeInMainWorld('yotify', api)
