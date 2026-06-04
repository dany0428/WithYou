import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { AppSettings } from '../shared/types'

// ---------------------------------------------------------------------------
// Persisted user settings (name / pairing code / relay URL).
//
// Stored as JSON in Electron's per-user data directory so it survives restarts
// and updates. The `COUPLE_*` environment variables now act only as initial
// defaults (handy for dev and first run); once the user saves, the file wins.
// A small in-memory cache avoids re-reading on every transport rebuild.
// ---------------------------------------------------------------------------

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json')

function defaults(): AppSettings {
  return {
    name: process.env.COUPLE_NAME ?? '',
    pairCode: process.env.COUPLE_PAIR_CODE ?? '',
    relayUrl: process.env.COUPLE_RELAY_URL ?? '',
  }
}

/** Keep only the known string fields, trimmed — never trust the file/IPC blob. */
function sanitize(raw: unknown): Partial<AppSettings> {
  if (typeof raw !== 'object' || raw === null) return {}
  const obj = raw as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined)
  const out: Partial<AppSettings> = {}
  const name = str(obj.name)
  const pairCode = str(obj.pairCode)
  const relayUrl = str(obj.relayUrl)
  if (name !== undefined) out.name = name
  if (pairCode !== undefined) out.pairCode = pairCode
  if (relayUrl !== undefined) out.relayUrl = relayUrl
  return out
}

let cache: AppSettings | null = null

export function loadSettings(): AppSettings {
  if (cache) return cache
  try {
    const raw = JSON.parse(readFileSync(settingsFile(), 'utf8'))
    cache = { ...defaults(), ...sanitize(raw) }
  } catch {
    cache = defaults() // no file yet, or unreadable — fall back to env/defaults
  }
  return cache
}

export function saveSettings(next: AppSettings): AppSettings {
  const merged: AppSettings = { ...loadSettings(), ...sanitize(next) }
  cache = merged
  try {
    writeFileSync(settingsFile(), JSON.stringify(merged, null, 2), 'utf8')
  } catch (err) {
    console.error('[settings] failed to write', err)
  }
  return merged
}
