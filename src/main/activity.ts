import { powerMonitor, type BrowserWindow } from 'electron'
import { IPC, type ActivityStatus } from '../shared/types'
import { getForegroundWindow } from './foregroundWindow'
import { classifyForeground } from './activityRules'

// ---------------------------------------------------------------------------
// Stage 2 — local activity detection.
//
// Two signals feed one emitted status:
//   - OS input-idle time (powerMonitor) → `afk` once the user stops touching the
//     machine. This takes precedence over everything else.
//   - The foreground window, classified into gaming / working / music / video /
//     idle (see activityRules + foregroundWindow).
//
// Idle is cheap so we sample it often; querying the foreground window shells out
// to a native tool, so we sample it less frequently. Either sample recomputes
// the merged status and we push to the renderer only when it actually changes.
// ---------------------------------------------------------------------------

/** Idle seconds after which the local user is considered away from keyboard. */
const AFK_THRESHOLD_SECONDS = 60
/** How often to sample the (cheap) system idle time. */
const IDLE_POLL_MS = 5_000
/** How often to query the (more expensive) foreground window. */
const FOREGROUND_POLL_MS = 10_000

export interface ActivityMonitor {
  /** Stop polling and detach OS listeners. */
  stop(): void
  /** Re-send the current status (e.g. after the renderer (re)loads). */
  resend(): void
}

/**
 * Begin detecting local activity and emit `ActivityUpdate` to the renderer
 * whenever the merged status changes.
 *
 * @param getWindow Accessor for the live widget window (may be null if hidden).
 */
export function startActivityMonitor(
  getWindow: () => BrowserWindow | null,
): ActivityMonitor {
  let emitted: ActivityStatus | null = null
  let afk = false
  // Status derived from the foreground window when not AFK; `idle` until the
  // first successful query (and on any platform where it can't be determined).
  let foreground: ActivityStatus = 'idle'

  const send = (status: ActivityStatus) => {
    getWindow()?.webContents.send(IPC.ActivityUpdate, status)
  }

  // Merge the two signals (AFK wins) and emit only on change.
  const recompute = () => {
    const next: ActivityStatus = afk ? 'afk' : foreground
    if (next === emitted) return
    emitted = next
    send(next)
  }

  const sampleIdle = () => {
    afk = powerMonitor.getSystemIdleTime() >= AFK_THRESHOLD_SECONDS
    recompute()
  }

  const sampleForeground = async () => {
    const win = await getForegroundWindow()
    foreground = win ? classifyForeground(win) : 'idle'
    recompute()
  }

  // Lock/unlock are immediate, reliable AFK signals where the OS emits them.
  powerMonitor.on('lock-screen', sampleIdle)
  powerMonitor.on('unlock-screen', sampleIdle)

  sampleIdle() // establish an initial status right away
  void sampleForeground()
  const idleTimer = setInterval(sampleIdle, IDLE_POLL_MS)
  const fgTimer = setInterval(() => void sampleForeground(), FOREGROUND_POLL_MS)

  return {
    stop() {
      clearInterval(idleTimer)
      clearInterval(fgTimer)
      powerMonitor.removeListener('lock-screen', sampleIdle)
      powerMonitor.removeListener('unlock-screen', sampleIdle)
    },
    resend() {
      if (emitted !== null) send(emitted)
    },
  }
}
