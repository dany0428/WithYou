import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { IPC, type UptimeStats } from '../shared/types'

// ---------------------------------------------------------------------------
// "Online together" time tracker.
//
// The clock runs while the partner is online (driven by the transport's
// partner-presence signal). The cumulative total is persisted to userData so it
// survives restarts, and folded forward periodically so a crash loses at most
// one interval. Stats are broadcast to every window (widget + settings) so both
// show a live counter.
// ---------------------------------------------------------------------------

const uptimeFile = () => path.join(app.getPath('userData'), 'uptime.json')
/** Refresh the renderer's live counter at this cadence while online. */
const PUSH_INTERVAL_MS = 10_000
/** Fold the running session into the persisted total this often (crash safety). */
const SAVE_INTERVAL_MS = 60_000

export interface UptimeTracker {
  /** Partner came online (true) or went offline (false). */
  setOnline(online: boolean): void
  /** Current stats snapshot. */
  current(): UptimeStats
  /** Re-broadcast the current stats (e.g. after a window (re)loads). */
  resend(): void
  /** Persist and stop (call on quit). */
  stop(): void
}

function loadTotal(): number {
  try {
    const raw = JSON.parse(readFileSync(uptimeFile(), 'utf8'))
    return typeof raw?.totalMs === 'number' && raw.totalMs >= 0 ? raw.totalMs : 0
  } catch {
    return 0
  }
}

function saveTotal(totalMs: number): void {
  try {
    writeFileSync(uptimeFile(), JSON.stringify({ totalMs }), 'utf8')
  } catch (err) {
    console.error('[uptime] failed to write', err)
  }
}

export function createUptimeTracker(): UptimeTracker {
  let totalMs = loadTotal()
  let online = false
  let onlineSince = 0
  let pushTimer: NodeJS.Timeout | null = null
  let saveTimer: NodeJS.Timeout | null = null

  const liveSession = () => (online ? Date.now() - onlineSince : 0)
  const current = (): UptimeStats => ({
    online,
    sessionMs: liveSession(),
    totalMs: totalMs + liveSession(),
  })

  const broadcast = () => {
    const stats = current()
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.UptimeUpdate, stats)
    }
  }

  // Move the elapsed session time into the persisted total without ending the
  // session, so periodic saves don't double-count.
  const fold = () => {
    if (!online) return
    const now = Date.now()
    totalMs += now - onlineSince
    onlineSince = now
    saveTotal(totalMs)
  }

  const startTimers = () => {
    pushTimer ??= setInterval(broadcast, PUSH_INTERVAL_MS)
    saveTimer ??= setInterval(fold, SAVE_INTERVAL_MS)
  }
  const stopTimers = () => {
    if (pushTimer) clearInterval(pushTimer)
    if (saveTimer) clearInterval(saveTimer)
    pushTimer = saveTimer = null
  }

  return {
    setOnline(next) {
      if (next === online) return
      if (next) {
        online = true
        onlineSince = Date.now()
        startTimers()
      } else {
        fold() // bank the just-ended stretch
        online = false
        onlineSince = 0
        stopTimers()
      }
      broadcast()
    },
    current,
    resend: broadcast,
    stop() {
      fold()
      stopTimers()
    },
  }
}
