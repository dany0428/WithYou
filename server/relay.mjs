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
// Wire protocol (JSON text frames):
//   client -> relay  { type: 'join',     room, name }
//   client -> relay  { type: 'presence', name, status }
//   relay  -> client { type: 'presence', name, status }   // the partner's
//   relay  -> client { type: 'error',    reason }         // e.g. room-full
// ---------------------------------------------------------------------------

import { WebSocketServer } from 'ws'

const PORT = Number(process.env.PORT) || 8080

/** Couples are pairs — at most two live connections share a room. */
const ROOM_CAPACITY = 2
/** How often to ping clients to detect dead connections (proxies drop idle WS). */
const HEARTBEAT_MS = 30_000

/** room code -> Set<WebSocket>. A peer also carries `.room` and `.lastPresence`. */
const rooms = new Map()

const send = (ws, obj) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj))
}

const wss = new WebSocketServer({ port: PORT })

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
      // Catch the newcomer up with whatever the other peer last reported.
      for (const peer of peers) {
        if (peer !== ws && peer.lastPresence) send(ws, { type: 'presence', ...peer.lastPresence })
      }
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
    }
  })

  ws.on('close', () => {
    const peers = rooms.get(ws.room)
    if (!peers) return
    peers.delete(ws)
    if (peers.size === 0) rooms.delete(ws.room)
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

console.log(`[relay] CoupleWidget relay listening on :${PORT}`)
