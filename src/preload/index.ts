import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type CharacterAction,
  type ConnectionState,
  type CoupleWidgetApi,
  type PartnerPresence,
} from '../shared/types'

// The preload runs in an isolated context with access to a limited set of Node
// APIs. We expose only a tiny, explicit surface to the renderer via
// contextBridge — never the raw ipcRenderer.
const api: CoupleWidgetApi = {
  setMouseThrough(through) {
    ipcRenderer.send(IPC.SetMouseThrough, through)
  },
  showContextMenu() {
    ipcRenderer.send(IPC.ShowContextMenu)
  },
  onCharacterAction(handler) {
    const listener = (_event: Electron.IpcRendererEvent, action: CharacterAction) =>
      handler(action)
    ipcRenderer.on(IPC.CharacterAction, listener)
    return () => ipcRenderer.removeListener(IPC.CharacterAction, listener)
  },
  onPartnerUpdate(handler) {
    const listener = (_event: Electron.IpcRendererEvent, partner: PartnerPresence) =>
      handler(partner)
    ipcRenderer.on(IPC.PartnerUpdate, listener)
    return () => ipcRenderer.removeListener(IPC.PartnerUpdate, listener)
  },
  onConnectionState(handler) {
    const listener = (_event: Electron.IpcRendererEvent, state: ConnectionState) =>
      handler(state)
    ipcRenderer.on(IPC.ConnectionState, listener)
    return () => ipcRenderer.removeListener(IPC.ConnectionState, listener)
  },
}

contextBridge.exposeInMainWorld('couple', api)
