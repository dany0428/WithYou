import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomInt } from 'node:crypto'
import path from 'node:path'
import type { AppSettings } from '../shared/types'

// Unambiguous alphabet for pairing codes — no 0/O/1/I/L, so a code read aloud or
// retyped can't be confused. 32 symbols → ~5 bits each.
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
/** Characters in a generated code (excluding the grouping dashes). */
const CODE_LENGTH = 12

/**
 * A fresh random pairing code, e.g. `K7QF-2M9X-PBRT` (~60 bits of entropy). It's
 * the couple's shared secret AND the relay room name: random so nobody can guess
 * it, and since the relay caps each room at two connections, only the two
 * partners holding the code can ever be paired.
 */
export function generatePairCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)] // unbiased
  }
  // Group into blocks of four for readability: ABCD-EFGH-IJKL (no trailing dash).
  return code.replace(/(.{4})(?=.)/g, '$1-')
}

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
    anniversary: '',
    scale: 1,
  }
}

/** Smallest / largest the widget may be scaled to (matches the Size menu). */
const MIN_SCALE = 0.8
const MAX_SCALE = 1.4

/** A `YYYY-MM-DD` string that names a real calendar date, else empty. */
function sanitizeDate(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  if (s === '') return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const d = new Date(`${s}T00:00:00`)
  return Number.isNaN(d.getTime()) ? '' : s
}

/** Keep only the known fields, trimmed/validated — never trust the file/IPC blob. */
function sanitize(raw: unknown): Partial<AppSettings> {
  if (typeof raw !== 'object' || raw === null) return {}
  const obj = raw as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined)
  const out: Partial<AppSettings> = {}
  const name = str(obj.name)
  const pairCode = str(obj.pairCode)
  const relayUrl = str(obj.relayUrl)
  const anniversary = sanitizeDate(obj.anniversary)
  if (name !== undefined) out.name = name
  if (pairCode !== undefined) out.pairCode = pairCode
  if (relayUrl !== undefined) out.relayUrl = relayUrl
  if (anniversary !== undefined) out.anniversary = anniversary
  if (typeof obj.scale === 'number' && Number.isFinite(obj.scale)) {
    out.scale = Math.min(Math.max(obj.scale, MIN_SCALE), MAX_SCALE)
  }
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
