// ---------------------------------------------------------------------------
// CoupleWidget presence relay (Stage 3b).
//
// A tiny, stateless-ish WebSocket "post office". Two partner apps connect and
// `join` the same room (their shared pairing code); whatever presence one sends
// is forwarded to the other. The relay never persists anything to disk and only
// keeps the *last* presence per peer in memory, so a partner who joins later
// immediately learns the current status.
//
// Deliberately minimal so it deploys to any free Node host (Fly.io, Railway,
// Render, Glitch, …). It binds to `process.env.PORT` (what those hosts inject)
// and falls back to 8080 for local development (`npm run relay` from the repo
// root, or `npm start` in this folder).
//
// It also owns the couple's "online together" timer: it alone knows when *both*
// partners are in the room, so it runs the shared clock and pushes the same
// numbers to both — guaranteeing they display identically (instead of each app
// counting locally and drifting apart). The cumulative total is seeded from
// whatever the clients last persisted (`join.totalMs`, larger wins), so it
// survives a relay restart without the relay needing its own disk.
//
// Wire protocol (JSON text frames):
//   client -> relay  { type: 'join',     room, name, totalMs }
//   client -> relay  { type: 'presence', name, status }
//   client -> relay  { type: 'emote',    kind }
//   client -> relay  { type: 'chat',     text }
//   relay  -> client { type: 'presence', name, status }            // the partner's
//   relay  -> client { type: 'emote',    kind }                    // the partner's
//   relay  -> client { type: 'chat',     text }                    // the partner's
//   relay  -> client { type: 'partner-online' }                    // partner joined
//   relay  -> client { type: 'partner-offline' }                   // partner left
//   relay  -> client { type: 'uptime', online, sessionMs, totalMs} // shared timer
//   relay  -> client { type: 'error',    reason }                  // e.g. room-full
// ---------------------------------------------------------------------------

import { WebSocketServer } from 'ws'
import { createServer } from 'http'

const PORT = Number(process.env.PORT) || 8080

/** Couples are pairs — at most two live connections share a room. */
const ROOM_CAPACITY = 2
/** How often to ping clients to detect dead connections (proxies drop idle WS). */
const HEARTBEAT_MS = 30_000
/** How often to push the live "online together" counter while both are present. */
const UPTIME_PUSH_MS = 10_000

/** room code -> Set<WebSocket>. A peer also carries `.room` and `.lastPresence`. */
const rooms = new Map()
/**
 * room code -> shared "online together" timer state:
 *   { totalMs, sessionStart }
 * `sessionStart` is the epoch ms the current both-present stretch began, or null
 * when fewer than two partners are in the room.
 */
const roomState = new Map()

const send = (ws, obj) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj))
}

/** Current shared-timer snapshot for a room (cumulative total + live session). */
const uptimeFrame = (state) => {
  const online = state.sessionStart != null
  const sessionMs = online ? Date.now() - state.sessionStart : 0
  return { type: 'uptime', online, sessionMs, totalMs: state.totalMs + sessionMs }
}

/** Push the room's shared timer to everyone in it, so both partners agree. */
const broadcastUptime = (room) => {
  const state = roomState.get(room)
  const peers = rooms.get(room)
  if (!state || !peers) return
  const frame = uptimeFrame(state)
  for (const peer of peers) send(peer, frame)
}

// A bare HTTP server so platform health checks (Render, Railway, …) get a clean
// 200 on plain GET requests. The WebSocket server piggybacks on it, handling the
// `Upgrade` handshake on the same port — so couples connect and hosts stay happy.
const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('CoupleWidget relay is up.\n')
})

const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', (ws) => {
  ws.isAlive = true
  ws.on('pong', () => {
    ws.isAlive = true
  })

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return // ignore non-JSON noise
    }

    if (msg.type === 'join') {
      const room = String(msg.room)
      const peers = rooms.get(room) ?? new Set()
      if (peers.size >= ROOM_CAPACITY && !peers.has(ws)) {
        send(ws, { type: 'error', reason: 'room-full' })
        ws.close()
        return
      }
      ws.room = room
      ws.name = typeof msg.name === 'string' ? msg.name : 'Partner'
      peers.add(ws)
      rooms.set(room, peers)
      // Tell each side about the other: the newcomer learns an existing partner
      // is online (plus their last status), and any existing peer learns the
      // newcomer just came online.
      for (const peer of peers) {
        if (peer === ws) continue
        send(ws, { type: 'partner-online' })
        if (peer.lastPresence) send(ws, { type: 'presence', ...peer.lastPresence })
        send(peer, { type: 'partner-online' })
      }
      // Shared "online together" timer. Seed the cumulative total from the
      // newcomer's last-persisted value (larger wins, so a relay restart recovers
      // it from whichever partner is most up to date), and start the session
      // clock once both partners are present.
      const state = roomState.get(room) ?? { totalMs: 0, sessionStart: null }
      state.totalMs = Math.max(state.totalMs, Number(msg.totalMs) || 0)
      if (peers.size === ROOM_CAPACITY && state.sessionStart == null) {
        state.sessionStart = Date.now()
      }
      roomState.set(room, state)
      broadcastUptime(room)
      console.log(`[relay] join room=${room} name=${ws.name} size=${peers.size}`)
      return
    }

    if (msg.type === 'presence' && ws.room) {
      const presence = {
        name: typeof msg.name === 'string' ? msg.name : ws.name,
        status: String(msg.status),
      }
      ws.lastPresence = presence
      for (const peer of rooms.get(ws.room) ?? []) {
        if (peer !== ws) send(peer, { type: 'presence', ...presence })
      }
      return
    }

    if (msg.type === 'emote' && ws.room) {
      for (const peer of rooms.get(ws.room) ?? []) {
        if (peer !== ws) send(peer, { type: 'emote', kind: String(msg.kind) })
      }
      return
    }

    if (msg.type === 'chat' && ws.room) {
      // Cap defensively so a misbehaving client can't push huge frames at the partner.
      const text = String(msg.text).slice(0, 500)
      for (const peer of rooms.get(ws.room) ?? []) {
        if (peer !== ws) send(peer, { type: 'chat', text })
      }
    }
  })

  ws.on('close', () => {
    const peers = rooms.get(ws.room)
    if (!peers) return
    peers.delete(ws)
    // Let whoever's left know their partner went offline.
    for (const peer of peers) send(peer, { type: 'partner-offline' })
    // Stop the shared timer now that the pair is broken: bank the just-ended
    // stretch into the cumulative total and pause the session clock.
    const state = roomState.get(ws.room)
    if (state && state.sessionStart != null && peers.size < ROOM_CAPACITY) {
      state.totalMs += Date.now() - state.sessionStart
      state.sessionStart = null
    }
    if (peers.size === 0) {
      rooms.delete(ws.room)
      // Drop the timer too: the total lives on in the clients and re-seeds on
      // the next join, so empty rooms don't accumulate state here.
      roomState.delete(ws.room)
    } else {
      broadcastUptime(ws.room)
    }
    console.log(`[relay] leave room=${ws.room} remaining=${peers.size}`)
  })
})

// Drop connections that stopped answering pings (cleans up dead peers behind
// flaky NATs / proxies so rooms don't fill with ghosts).
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate()
      continue
    }
    ws.isAlive = false
    ws.ping()
  }
}, HEARTBEAT_MS)
wss.on('close', () => clearInterval(heartbeat))

// Keep both partners' "online together" counters live and in lockstep by pushing
// the shared timer on a steady cadence while a room has both partners present.
const uptimeTick = setInterval(() => {
  for (const [room, state] of roomState) {
    if (state.sessionStart != null) broadcastUptime(room)
  }
}, UPTIME_PUSH_MS)
wss.on('close', () => clearInterval(uptimeTick))

httpServer.listen(PORT, () => {
  console.log(`[relay] CoupleWidget relay listening on :${PORT}`)
})
