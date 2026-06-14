import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { IPC, type UptimeStats } from '../shared/types'

// ---------------------------------------------------------------------------
// "Online together" time tracker.
//
// Two modes:
//   • Local (loopback transport): the clock runs while the partner is online,
//     driven by `setOnline`. Used standalone / for UI work on one machine.
//   • Remote (relay transport): the *relay* owns the shared timer — it alone
//     knows when both partners are in the room — and pushes authoritative stats
//     via `applyRemote`. Both partners then display the exact same number. We
//     extrapolate between pushes so the counter ticks smoothly, and persist the
//     latest total to userData so it can re-seed the relay after a restart
//     (`seedTotal`).
//
// In both modes the cumulative total is persisted (crash/restart safety) and
// broadcast to every window (widget + settings) so each shows a live counter.
// ---------------------------------------------------------------------------

const uptimeFile = () => path.join(app.getPath('userData'), 'uptime.json')
/** Refresh the renderer's live counter at this cadence while online. */
const PUSH_INTERVAL_MS = 10_000
/** Fold the running session into the persisted total this often (crash safety). */
const SAVE_INTERVAL_MS = 60_000

export interface UptimeTracker {
  /** Local mode: partner came online (true) or went offline (false). */
  setOnline(online: boolean): void
  /** Remote mode: adopt authoritative stats pushed by the relay. */
  applyRemote(stats: UptimeStats): void
  /** Our last-known cumulative total (ms), to seed the relay's shared timer on join. */
  seedTotal(): number
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
  // Local-mode session state.
  let online = false
  let onlineSince = 0
  // Remote-mode snapshot: the last stats the relay pushed, plus when we received
  // them, so we can extrapolate the live counter between pushes.
  let remote: { online: boolean; sessionMs: number; totalMs: number; at: number } | null = null
  let pushTimer: NodeJS.Timeout | null = null
  let saveTimer: NodeJS.Timeout | null = null

  const liveSession = () => (online ? Date.now() - onlineSince : 0)
  const current = (): UptimeStats => {
    if (remote) {
      // Extrapolate from the relay's authoritative base so both partners, ticking
      // off the same numbers, stay in lockstep between pushes.
      const elapsed = remote.online ? Date.now() - remote.at : 0
      return {
        online: remote.online,
        sessionMs: remote.sessionMs + elapsed,
        totalMs: remote.totalMs + elapsed,
      }
    }
    return { online, sessionMs: liveSession(), totalMs: totalMs + liveSession() }
  }

  const broadcast = () => {
    const stats = current()
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.UptimeUpdate, stats)
    }
  }

  // Local mode only: move elapsed session time into the persisted total without
  // ending the session, so periodic saves don't double-count. No-op in remote
  // mode (where `applyRemote` persists each pushed total instead).
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
      // Switching to local mode supersedes any stale relay snapshot.
      remote = null
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
    applyRemote(stats) {
      remote = { ...stats, at: Date.now() }
      // Cache + persist the authoritative total so we can re-seed the relay later.
      totalMs = stats.totalMs
      saveTotal(totalMs)
      // Keep the live counter ticking while online; stop pushing once offline.
      if (stats.online) startTimers()
      else stopTimers()
      broadcast()
    },
    seedTotal: () => current().totalMs,
    current,
    resend: broadcast,
    stop() {
      if (remote) saveTotal(current().totalMs)
      else fold()
      stopTimers()
    },
  }
}
