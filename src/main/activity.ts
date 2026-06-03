import { powerMonitor, type BrowserWindow } from 'electron'
import { IPC, type PresenceStatus } from '../shared/types'

// ---------------------------------------------------------------------------
// Stage 2a — local presence detection (idle / AFK).
//
// Electron's `powerMonitor.getSystemIdleTime()` reports seconds since the last
// keyboard/mouse input, cross-platform and with no extra dependencies. We poll
// it and flip the user between `active` and `afk` around a threshold, pushing a
// status to the renderer only when it actually changes.
//
// Later slices will layer foreground-app detection on top to produce the richer
// gaming / working / music / video statuses; this module owns the same pipe.
// ---------------------------------------------------------------------------

/** Idle seconds after which the local user is considered away from keyboard. */
const AFK_THRESHOLD_SECONDS = 60
/** How often to sample the system idle time. */
const POLL_INTERVAL_MS = 5_000

export interface ActivityMonitor {
  /** Stop polling and detach OS listeners. */
  stop(): void
  /** Re-send the current status (e.g. after the renderer (re)loads). */
  resend(): void
}

/**
 * Begin polling OS idle time and emit `PresenceUpdate` to the renderer whenever
 * the active/afk status changes.
 *
 * @param getWindow Accessor for the live widget window (may be null if hidden).
 */
export function startActivityMonitor(
  getWindow: () => BrowserWindow | null,
): ActivityMonitor {
  let current: PresenceStatus | null = null

  const send = (status: PresenceStatus) => {
    const win = getWindow()
    win?.webContents.send(IPC.PresenceUpdate, status)
  }

  const sample = () => {
    const idle = powerMonitor.getSystemIdleTime()
    const next: PresenceStatus = idle >= AFK_THRESHOLD_SECONDS ? 'afk' : 'active'
    if (next === current) return
    current = next
    send(next)
  }

  // Lock/unlock are immediate, reliable AFK signals on platforms that emit them;
  // fold them into the same poll so they take effect without waiting a tick.
  powerMonitor.on('lock-screen', sample)
  powerMonitor.on('unlock-screen', sample)

  sample() // establish the initial status right away
  const timer = setInterval(sample, POLL_INTERVAL_MS)

  return {
    stop() {
      clearInterval(timer)
      powerMonitor.removeListener('lock-screen', sample)
      powerMonitor.removeListener('unlock-screen', sample)
    },
    resend() {
      if (current !== null) send(current)
    },
  }
}
