import { BrowserWindow, Menu, ipcMain } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { IPC, type ActivityStatus, type CharacterAction } from '../shared/types'
import type { ActivityMonitor } from './activity'

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
): void {
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
      { label: 'Settings', click: () => send('settings') },
    ])

    menu.popup({ window: win })
  })
}
