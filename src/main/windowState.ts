import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Persisted widget position.
//
// Kept in its own JSON file (separate from user settings) so dragging the widget
// to a preferred spot survives restarts without entangling the user-facing
// settings blob. A missing/garbage file just means "use the default corner".
// ---------------------------------------------------------------------------

export interface WidgetPosition {
  x: number
  y: number
}

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json')

export function loadWidgetPosition(): WidgetPosition | null {
  try {
    const raw = JSON.parse(readFileSync(stateFile(), 'utf8')) as Record<string, unknown>
    if (typeof raw.x === 'number' && typeof raw.y === 'number') {
      return { x: raw.x, y: raw.y }
    }
  } catch {
    /* no file yet, or unreadable — fall back to the default corner */
  }
  return null
}

export function saveWidgetPosition(pos: WidgetPosition): void {
  try {
    writeFileSync(stateFile(), JSON.stringify(pos), 'utf8')
  } catch (err) {
    console.error('[windowState] failed to write', err)
  }
}
