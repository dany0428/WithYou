import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AppSettings,
  type CharacterAction,
  type ConnectionState,
  type CoupleWidgetApi,
  type EmoteKind,
  type PartnerPresence,
  type UptimeStats,
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
  getSettings() {
    return ipcRenderer.invoke(IPC.GetSettings) as Promise<AppSettings>
  },
  saveSettings(settings) {
    return ipcRenderer.invoke(IPC.SaveSettings, settings) as Promise<AppSettings>
  },
  closeSettings() {
    ipcRenderer.send(IPC.CloseSettings)
  },
  onUptimeUpdate(handler) {
    const listener = (_event: Electron.IpcRendererEvent, stats: UptimeStats) =>
      handler(stats)
    ipcRenderer.on(IPC.UptimeUpdate, listener)
    return () => ipcRenderer.removeListener(IPC.UptimeUpdate, listener)
  },
  getUptime() {
    return ipcRenderer.invoke(IPC.GetUptime) as Promise<UptimeStats>
  },
  sendEmote(kind) {
    ipcRenderer.send(IPC.SendEmote, kind)
  },
  onEmote(handler) {
    const listener = (_event: Electron.IpcRendererEvent, kind: EmoteKind) => handler(kind)
    ipcRenderer.on(IPC.EmoteReceived, listener)
    return () => ipcRenderer.removeListener(IPC.EmoteReceived, listener)
  },
}

contextBridge.exposeInMainWorld('couple', api)
