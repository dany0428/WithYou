import { BrowserWindow, Menu, ipcMain } from 'electron'
import { IPC, type CharacterAction } from '../shared/types'

/**
 * Register all main-process IPC handlers.
 *
 * @param getWindow Accessor for the current widget window (may be null if hidden
 *   or recreated), so handlers always act on the live instance.
 */
export function registerIpc(getWindow: () => BrowserWindow | null): void {
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

    const menu = Menu.buildFromTemplate([
      { label: 'Pet', click: () => send('pet') },
      { label: 'Poke', click: () => send('poke') },
      { label: 'Send Heart', click: () => send('send-heart') },
      { type: 'separator' },
      { label: 'Settings', click: () => send('settings') },
    ])

    menu.popup({ window: win })
  })
}
