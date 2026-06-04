import { app, BrowserWindow, Menu, Tray, screen, nativeImage } from 'electron'
import path from 'node:path'
import { IPC } from '../shared/types'
import { registerIpc } from './ipc'
import { startActivityMonitor, type ActivityMonitor } from './activity'
import { createConnection, type Connection } from './net/connection'
import { createLoopbackTransport } from './net/loopbackTransport'
import { createWebSocketTransport } from './net/wsTransport'
import type { Transport } from './net/transport'
import { loadSettings } from './settings'
import { createUptimeTracker, type UptimeTracker } from './uptime'

// ---------------------------------------------------------------------------
// Container/headless support (e.g. running inside GitHub Codespaces).
// Chromium's sandbox needs a properly-configured SUID helper that isn't present
// in most Linux containers, so disable it there. This is a no-op on Win/macOS.
// ---------------------------------------------------------------------------
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
}

const WIDGET_WIDTH = 260
const WIDGET_HEIGHT = 300

// A tiny pink-heart icon generated at build-time, embedded so we don't depend on
// an external file path that may not be packaged. Used for the system tray.
const TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACzUlEQVR4nO2X61ITQRCF8wD88pl8AN3cSCDcEaMiFKVVPoTJxoREQmIQwUvlVXgB/wohiIiAIApqtfWdhCVgEAVl+eFWTc1OT8+c06d7Z3cDgf/XOa831x5eKFjH4vXU1UUnNb7kpDNLwfTcUjBdVe+kM9iZx+9vA19ZdFKDgNVCbr0Wdm05nLHlSEsLZww78/jhz7pzgxMREdZC7j4g9egjW4lmbaWz2WIt99Gs5kUm5O6zjvVnB3dSiVrQXfCAO7P2Npaz1fikrXY12ruuvHePnXn8PCJBd4F9zgYecl8jL5EJGMDuvK0lCrbWU7D3PY+9xhg78/iJSDSr9LDPH5FANkUOOFHHc4oUAMDW+6bUPvQXvXZgExmIdOW1jvUigRK/kw4Kh9whnyIHnKh7Crbe2wDdGJi2jcFp2xwqeY0xdpHpnZI/60QCJcIZY99TC5PqpYDIITIqcsCJeKBom4Ml2xou29aNsn0ceeI1xtiZxw9/kUCJWE41wb7s/6voO3iEFH1nVrlETkUO+FBJQNsjFdtOVmwnOWM7t2bUM8bOPH4igRKJgvZRKhoqVE88J5T7kFv3ou/OK6fIqsgBv1kR6KfbT233zqztjs6qZ4ydeZFAif6i1isVhyrUT6wFTjIOE3LGI6Xo+6aUW+QlQkAA/Hz3mX0Zm7O9sXn1jLGLBEoMl7VOqUCF+KT2ZX9w2hLgOD0ifzP3FJiiT1YUKWB74/O2P/Hcvk68UM8YO/P44c+6g1o4kgYnnWlPgOqPHBLw5B8qqdDINVESMaDf7r207/dfqWeMXSokZ+SvWmimwSMQaTwN7QowoAKEQCyr6v2JAPKPzkp2IgfcHlTVM8bOPH7HCbAf+zYJVNu+RX1V4FLUgO9Pge/ngO8nYcDvd0HgMrwNA35/D7Skwr8voiMk/Pom9Ej4+VV8cPn6X3CMiD9/RqeQujCsf3L9AO5In0f2Z9+SAAAAAElFTkSuQmCC'

const SETTINGS_WIDTH = 440
const SETTINGS_HEIGHT = 520

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let tray: Tray | null = null
let activityMonitor: ActivityMonitor | null = null
let connection: Connection | null = null
let uptime: UptimeTracker | null = null

/** Anchor the widget to the bottom-right of the *primary* display's work area. */
function positionWindow(win: BrowserWindow): void {
  const { workArea } = screen.getPrimaryDisplay()
  const x = workArea.x + workArea.width - WIDGET_WIDTH
  const y = workArea.y + workArea.height - WIDGET_HEIGHT
  win.setBounds({ x, y, width: WIDGET_WIDTH, height: WIDGET_HEIGHT })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true, // hidden from the taskbar (and, on Windows, from Alt+Tab)
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Float above virtually everything, including full-screen apps and other spaces.
  mainWindow.setAlwaysOnTop(true, 'screen-saver')
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  positionWindow(mainWindow)

  // Start fully click-through. `forward: true` (Windows/macOS) keeps forwarding
  // move events to the renderer so it can detect when the cursor is over the
  // character and ask the main process to re-enable interaction.
  mainWindow.setIgnoreMouseEvents(true, { forward: true })

  // Re-anchor when monitors change (resolution, scaling, plug/unplug).
  const reposition = () => mainWindow && positionWindow(mainWindow)
  screen.on('display-metrics-changed', reposition)
  screen.on('display-added', reposition)
  screen.on('display-removed', reposition)

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // The connection may have settled before the renderer was listening; replay
  // the partner presence + connection state whenever the page (re)loads, and
  // re-emit our local status so the loopback partner repopulates.
  mainWindow.webContents.on('did-finish-load', () => {
    connection?.resend()
    activityMonitor?.resend()
  })
}

function createTray(): void {
  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL)
  tray = new Tray(icon)
  tray.setToolTip('CoupleWidget')

  const rebuildMenu = () => {
    const visible = mainWindow?.isVisible() ?? false
    const menu = Menu.buildFromTemplate([
      {
        label: visible ? 'Hide widget' : 'Show widget',
        click: () => {
          if (!mainWindow) return
          if (mainWindow.isVisible()) mainWindow.hide()
          else mainWindow.show()
        },
      },
      {
        label: 'Settings…',
        click: () => openSettingsWindow(),
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
    tray?.setContextMenu(menu)
  }

  rebuildMenu()
  // Keep the Show/Hide label in sync with the window's visibility.
  mainWindow?.on('show', rebuildMenu)
  mainWindow?.on('hide', rebuildMenu)
}

// macOS: this is a background overlay, so keep it out of the Dock.
if (process.platform === 'darwin') {
  app.dock?.hide()
}

/**
 * Pick the partner link from the saved settings: with a relay URL *and* a
 * pairing code we use the real WebSocket relay, otherwise we fall back to the
 * in-process loopback so the app still runs standalone for UI work.
 */
function createTransport(): Transport {
  const { relayUrl, pairCode, name } = loadSettings()
  if (relayUrl && pairCode) {
    console.log(`[net] relay transport -> ${relayUrl} (room: ${pairCode})`)
    return createWebSocketTransport({ url: relayUrl, room: pairCode, name: name || 'Me' })
  }
  console.log('[net] no relay URL / pairing code set; using loopback transport')
  return createLoopbackTransport()
}

/** (Re)build the partner connection from current settings and start it. Called
 *  on startup and whenever settings are saved. */
function rebuildConnection(): void {
  connection?.stop()
  const transport = createTransport()
  // The partner-presence signal drives the "online together" timer; registered
  // here (not in the connection) so the connection stays a pure presence bridge.
  transport.onPartnerPresence((online) => uptime?.setOnline(online))
  connection = createConnection(() => mainWindow, transport)
  connection.start()
  // Push our current detected status into the fresh connection so the partner
  // is repopulated immediately rather than waiting for the next change.
  activityMonitor?.resend()
}

/** Open the settings window, or focus it if already open. */
function openSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.show()
    settingsWindow.focus()
    return
  }
  settingsWindow = new BrowserWindow({
    width: SETTINGS_WIDTH,
    height: SETTINGS_HEIGHT,
    title: 'CoupleWidget — Settings',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#11131a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })

  // Same renderer bundle, routed to the settings view via the URL hash.
  if (process.env.VITE_DEV_SERVER_URL) {
    settingsWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#settings`)
  } else {
    settingsWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'settings' })
  }
}

app.whenReady().then(() => {
  createWindow()
  createTray()
  uptime = createUptimeTracker()
  // Detection feeds the connection (outbound); the connection feeds the
  // renderer (inbound partner presence). Transport chosen from saved settings.
  activityMonitor = startActivityMonitor((status) =>
    connection?.setLocalStatus(status),
  )
  rebuildConnection()
  registerIpc(() => mainWindow, () => activityMonitor, () => uptime, {
    openSettings: openSettingsWindow,
    closeSettings: () => settingsWindow?.close(),
    onSettingsChanged: rebuildConnection,
    sendEmote: (kind) => {
      connection?.sendEmote(kind) // to the partner
      // Immediate local feedback so sending feels responsive (the partner's
      // mirrored emote, if any, arrives separately over the transport).
      mainWindow?.webContents.send(IPC.EmoteReceived, kind)
    },
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Bank any in-progress "online together" time before the process exits.
app.on('before-quit', () => uptime?.stop())

// The widget lives in the tray; don't quit when the (only) window is hidden.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Intentionally do nothing here — quitting happens via the tray "Quit" item.
  }
})
