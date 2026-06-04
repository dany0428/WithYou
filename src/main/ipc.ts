import { BrowserWindow, Menu, ipcMain } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { IPC, type ActivityStatus, type AppSettings, type CharacterAction } from '../shared/types'
import type { ActivityMonitor } from './activity'
import { loadSettings, saveSettings } from './settings'
import type { UptimeTracker } from './uptime'

/** Hooks the main process supplies so IPC can drive window/connection lifecycle. */
export interface IpcHooks {
  /** Open (or focus) the settings window. */
  openSettings: () => void
  /** Close the settings window. */
  closeSettings: () => void
  /** Rebuild the partner connection after settings change. */
  onSettingsChanged: () => void
}

/** Selectable statuses for the manual-override submenu, in display order. */
const STATUS_ITEMS: ReadonlyArray<{ label: string; status: ActivityStatus }> = [
  { label: 'Idle', status: 'idle' },
  { label: 'Gaming', status: 'gaming' },
  { label: 'Working', status: 'working' },
  { label: 'Listening to music', status: 'music' },
  { label: 'Watching a video', status: 'video' },
  { label: 'Away', status: 'afk' },
]

/**
 * Register all main-process IPC handlers.
 *
 * @param getWindow Accessor for the current widget window (may be null if hidden
 *   or recreated), so handlers always act on the live instance.
 * @param getMonitor Accessor for the activity monitor (may be null before it
 *   starts), used to read/force the manual status override.
 */
export function registerIpc(
  getWindow: () => BrowserWindow | null,
  getMonitor: () => ActivityMonitor | null,
  getUptime: () => UptimeTracker | null,
  hooks: IpcHooks,
): void {
  // Settings window <-> persistence. Saving also rebuilds the connection so a
  // new relay URL / pairing code takes effect immediately.
  ipcMain.handle(IPC.GetSettings, () => loadSettings())
  ipcMain.handle(IPC.SaveSettings, (_event, settings: AppSettings) => {
    const saved = saveSettings(settings)
    hooks.onSettingsChanged()
    return saved
  })
  ipcMain.on(IPC.CloseSettings, () => hooks.closeSettings())

  // Initial uptime snapshot for a freshly-loaded window (live updates are pushed).
  ipcMain.handle(IPC.GetUptime, () => getUptime()?.current() ?? null)

  // Renderer toggles click-through as the cursor enters/leaves the character.
  // `forward: true` keeps move events flowing so the renderer can re-detect a
  // leave even while the window is ignoring clicks.
  ipcMain.on(IPC.SetMouseThrough, (_event, through: boolean) => {
    const win = getWindow()
    win?.setIgnoreMouseEvents(through, { forward: true })
  })

  // Native right-click menu, popped up over the character.
  ipcMain.on(IPC.ShowContextMenu, () => {
    const win = getWindow()
    if (!win) return

    const send = (action: CharacterAction) =>
      win.webContents.send(IPC.CharacterAction, action)

    // "Status" submenu: radio items for Automatic + each forceable status, with
    // the current override (or Automatic) checked.
    const monitor = getMonitor()
    const override = monitor?.getOverride() ?? null
    const statusSubmenu: MenuItemConstructorOptions[] = [
      {
        label: 'Automatic (detect)',
        type: 'radio',
        checked: override === null,
        click: () => monitor?.setOverride(null),
      },
      { type: 'separator' },
      ...STATUS_ITEMS.map(
        (it): MenuItemConstructorOptions => ({
          label: it.label,
          type: 'radio',
          checked: override === it.status,
          click: () => monitor?.setOverride(it.status),
        }),
      ),
    ]

    const menu = Menu.buildFromTemplate([
      { label: 'Pet', click: () => send('pet') },
      { label: 'Poke', click: () => send('poke') },
      { label: 'Send Heart', click: () => send('send-heart') },
      { type: 'separator' },
      { label: 'Status', submenu: statusSubmenu },
      { label: 'Settings…', click: () => hooks.openSettings() },
    ])

    menu.popup({ window: win })
  })
}
