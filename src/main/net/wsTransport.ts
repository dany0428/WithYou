import WebSocket from 'ws'
import type { ConnectionState, EmoteKind, PresenceMessage } from '../../shared/types'
import type { Transport } from './transport'

// ---------------------------------------------------------------------------
// WebSocket relay transport (Stage 3b) — the first *real* partner link.
//
// Connects to a hosted relay (see server/relay.mjs), joins the shared room (the
// couple's pairing code), and exchanges presence with the partner connected to
// the same room. Drop-in for the loopback transport: the connection manager,
// IPC, and renderer are unchanged.
//
// Robustness: the link auto-reconnects with capped exponential backoff and
// pings the relay periodically so idle-connection-killing proxies don't silently
// drop us. `ConnectionState` reflects the link to the relay (connecting /
// connected / disconnected); the partner's presence arrives separately as
// messages.
// ---------------------------------------------------------------------------

export interface WebSocketTransportOptions {
  /** Relay URL, e.g. `ws://localhost:8080` (dev) or `wss://your-app.fly.dev`. */
  url: string
  /** Shared pairing code; both partners must use the same room. */
  room: string
  /** Our display name, sent to the relay on join. */
  name: string
}

const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 15_000
/** Ping the relay this often to keep the connection alive through proxies. */
const PING_INTERVAL_MS = 25_000

export function createWebSocketTransport(opts: WebSocketTransportOptions): Transport {
  let messageHandler: ((m: PresenceMessage) => void) | null = null
  let stateHandler: ((s: ConnectionState) => void) | null = null
  let partnerHandler: ((online: boolean) => void) | null = null
  let emoteHandler: ((kind: EmoteKind) => void) | null = null

  let ws: WebSocket | null = null
  let stopped = false
  let attempts = 0
  let reconnectTimer: NodeJS.Timeout | null = null
  let pingTimer: NodeJS.Timeout | null = null

  const setState = (s: ConnectionState) => stateHandler?.(s)

  const clearTimers = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (pingTimer) clearInterval(pingTimer)
    reconnectTimer = pingTimer = null
  }

  const scheduleReconnect = () => {
    if (stopped) return
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempts, RECONNECT_MAX_MS)
    attempts += 1
    reconnectTimer = setTimeout(connect, delay)
  }

  function connect() {
    if (stopped) return
    setState('connecting')

    const socket = new WebSocket(opts.url)
    ws = socket

    socket.on('open', () => {
      attempts = 0
      socket.send(JSON.stringify({ type: 'join', room: opts.room, name: opts.name }))
      setState('connected')
      pingTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.ping()
      }, PING_INTERVAL_MS)
    })

    socket.on('message', (data) => {
      let msg: { type?: string; name?: string; status?: string; kind?: string }
      try {
        msg = JSON.parse(data.toString())
      } catch {
        return
      }
      if (msg.type === 'partner-online') {
        partnerHandler?.(true)
      } else if (msg.type === 'partner-offline') {
        partnerHandler?.(false)
      } else if (msg.type === 'emote' && typeof msg.kind === 'string') {
        emoteHandler?.(msg.kind as EmoteKind)
      } else if (msg.type === 'presence' && typeof msg.status === 'string') {
        // Presence implies the partner is present, even if we missed the
        // explicit online signal (e.g. we joined after them).
        partnerHandler?.(true)
        messageHandler?.({
          name: typeof msg.name === 'string' ? msg.name : 'Partner',
          status: msg.status as PresenceMessage['status'],
        })
      }
    })

    // `error` is always followed by `close`; let `close` drive reconnection so
    // we don't schedule two reconnects.
    socket.on('error', () => {})
    socket.on('close', () => {
      if (pingTimer) clearInterval(pingTimer)
      pingTimer = null
      // Our link dropped, so we can no longer vouch for the partner being online.
      partnerHandler?.(false)
      setState('disconnected')
      scheduleReconnect()
    })
  }

  return {
    start() {
      stopped = false
      attempts = 0
      connect()
    },
    stop() {
      stopped = true
      clearTimers()
      ws?.removeAllListeners()
      ws?.close()
      ws = null
      partnerHandler?.(false)
      setState('disconnected')
    },
    send(message) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'presence', name: message.name, status: message.status }))
      }
    },
    sendEmote(kind) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'emote', kind }))
      }
    },
    onMessage(handler) {
      messageHandler = handler
    },
    onState(handler) {
      stateHandler = handler
    },
    onPartnerPresence(handler) {
      partnerHandler = handler
    },
    onEmote(handler) {
      emoteHandler = handler
    },
  }
}
