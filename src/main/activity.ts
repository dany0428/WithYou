import { powerMonitor } from 'electron'
import type { ActivityStatus } from '../shared/types'
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
  /** Re-emit the current status (e.g. after the renderer (re)loads). */
  resend(): void
  /**
   * Force a status, overriding auto-detection, or pass `null` to return to
   * automatic detection. A manual override wins over both AFK and the
   * foreground signal until cleared.
   */
  setOverride(status: ActivityStatus | null): void
  /** The current manual override, or `null` when auto-detecting. */
  getOverride(): ActivityStatus | null
}

/**
 * Begin detecting local activity and invoke `onStatus` whenever the merged
 * status changes. The caller decides what to do with it (Stage 3: forward it to
 * the partner over the connection).
 *
 * @param onStatus Called with the new status on every change.
 */
export function startActivityMonitor(
  onStatus: (status: ActivityStatus) => void,
): ActivityMonitor {
  let emitted: ActivityStatus | null = null
  let afk = false
  // Status derived from the foreground window when not AFK; `idle` until the
  // first successful query (and on any platform where it can't be determined).
  let foreground: ActivityStatus = 'idle'
  // A user-forced status; when set it wins over auto-detection entirely.
  let override: ActivityStatus | null = null

  // Merge the signals and emit only on change. A manual override wins over
  // everything; otherwise AFK beats the foreground-derived status.
  const recompute = () => {
    const next: ActivityStatus = override ?? (afk ? 'afk' : foreground)
    if (next === emitted) return
    emitted = next
    onStatus(next)
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
      if (emitted !== null) onStatus(emitted)
    },
    setOverride(status) {
      override = status
      recompute()
    },
    getOverride() {
      return override
    },
  }
}
