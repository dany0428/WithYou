import { BrowserWindow, Menu, ipcMain } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { IPC, type ActivityStatus, type AppSettings, type CharacterAction, type EmoteKind } from '../shared/types'
import type { ActivityMonitor } from './activity'
import { loadSettings, saveSettings } from './settings'
import type { UptimeTracker } from './uptime'

/** Hooks the main process supplies so IPC can drive window/connection lifecycle. */
export interface IpcHooks {
  /** Open (or focus) the settings window. */
  openSettings: () => void
  /** Close the settings window. */
  closeSettings: () => void
  /**
   * React to saved settings. `linkChanged` is true only when the relay URL or
   * pairing code changed (so the transport must be rebuilt); on a name-only
   * change the caller can keep the live link and just refresh the partner.
   */
  onSettingsChanged: (linkChanged: boolean) => void
  /** Send an emote to the partner (and echo it locally for feedback). */
  sendEmote: (kind: EmoteKind) => void
  /** Hide the widget (it can be brought back from the tray). */
  hideWidget: () => void
  /** Quit the whole app. */
  quitApp: () => void
  /** Whether the widget is mid-drag (so we don't flip it click-through). */
  isDragging: () => boolean
}

/** Emotes offered in the right-click "Send emote" submenu, in display order. */
const EMOTE_ITEMS: ReadonlyArray<{ label: string; kind: EmoteKind }> = [
  { label: '❤️ Heart', kind: 'heart' },
  { label: '😘 Kiss', kind: 'kiss' },
  { label: '🤗 Hug', kind: 'hug' },
  { label: '😂 Laugh', kind: 'laugh' },
  { label: '🥺 Miss you', kind: 'sad' },
  { label: '👋 Wave', kind: 'wave' },
]

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
    const before = loadSettings()
    const saved = saveSettings(settings)
    // Only the relay URL / pairing code define the link; if neither changed we
    // keep the existing connection alive instead of flapping it offline.
    const linkChanged =
      before.relayUrl !== saved.relayUrl || before.pairCode !== saved.pairCode
    hooks.onSettingsChanged(linkChanged)
    return saved
  })
  ipcMain.on(IPC.CloseSettings, () => hooks.closeSettings())

  // Initial uptime snapshot for a freshly-loaded window (live updates are pushed).
  ipcMain.handle(IPC.GetUptime, () => getUptime()?.current() ?? null)

  // Renderer-initiated emote (e.g. a future in-UI button) -> partner + feedback.
  ipcMain.on(IPC.SendEmote, (_event, kind: EmoteKind) => hooks.sendEmote(kind))

  // Renderer toggles click-through as the cursor enters/leaves the character.
  // `forward: true` keeps move events flowing so the renderer can re-detect a
  // leave even while the window is ignoring clicks.
  ipcMain.on(IPC.SetMouseThrough, (_event, through: boolean) => {
    // Never go click-through mid-drag, or the window would stop receiving the
    // mouseup that ends the drag and get stuck following the cursor.
    if (through && hooks.isDragging()) return
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

    const emoteSubmenu: MenuItemConstructorOptions[] = EMOTE_ITEMS.map((it) => ({
      label: it.label,
      click: () => hooks.sendEmote(it.kind),
    }))

    const menu = Menu.buildFromTemplate([
      { label: 'Pet 🤗', click: () => send('pet') },
      { label: 'Poke 👉', click: () => send('poke') },
      { label: 'Send Heart ❤️', click: () => hooks.sendEmote('heart') },
      { label: 'Send emote', submenu: emoteSubmenu },
      { type: 'separator' },
      { label: 'Status', submenu: statusSubmenu },
      { label: 'Settings…', click: () => hooks.openSettings() },
      { type: 'separator' },
      { label: 'Hide widget', click: () => hooks.hideWidget() },
      { label: 'Quit CoupleWidget', click: () => hooks.quitApp() },
    ])

    menu.popup({ window: win })
  })
}
