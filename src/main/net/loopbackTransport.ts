import type { ConnectionState, PresenceMessage } from '../../shared/types'
import type { Transport } from './transport'

// ---------------------------------------------------------------------------
// Loopback transport — a stand-in "partner" that lives in this process.
//
// It reports `connected` shortly after start and echoes whatever we send back
// as the partner's presence (relabelled with a simulated partner name), after a
// small delay to mimic a round-trip. This lets the full pipe — detect → send →
// receive → display — run and be tested on one machine with no server, and is
// the seam where a real networked transport will replace it.
// ---------------------------------------------------------------------------

/** Name the simulated partner reports back. */
const SIMULATED_PARTNER_NAME = 'Partner'
/** Fake round-trip latency, so the echo doesn't feel instantaneous. */
const ECHO_DELAY_MS = 400
/** Delay before the loopback reports itself connected. */
const CONNECT_DELAY_MS = 300

export function createLoopbackTransport(): Transport {
  let messageHandler: ((m: PresenceMessage) => void) | null = null
  let stateHandler: ((s: ConnectionState) => void) | null = null
  let connected = false
  const timers = new Set<NodeJS.Timeout>()

  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t)
      fn()
    }, ms)
    timers.add(t)
  }

  return {
    start() {
      stateHandler?.('connecting')
      later(() => {
        connected = true
        stateHandler?.('connected')
      }, CONNECT_DELAY_MS)
    },
    stop() {
      for (const t of timers) clearTimeout(t)
      timers.clear()
      connected = false
      stateHandler?.('disconnected')
    },
    send(message) {
      if (!connected) return
      later(
        () => messageHandler?.({ name: SIMULATED_PARTNER_NAME, status: message.status }),
        ECHO_DELAY_MS,
      )
    },
    onMessage(handler) {
      messageHandler = handler
    },
    onState(handler) {
      stateHandler = handler
    },
  }
}
