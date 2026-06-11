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
//   client -> relay  { type: 'emote',    kind }
//   relay  -> client { type: 'presence', name, status }   // the partner's
//   relay  -> client { type: 'emote',    kind }           // the partner's
//   relay  -> client { type: 'partner-online' }           // partner joined
//   relay  -> client { type: 'partner-offline' }          // partner left
//   relay  -> client { type: 'error',    reason }         // e.g. room-full
// ---------------------------------------------------------------------------

import { WebSocketServer } from 'ws'
import { createServer } from 'http'

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
    }
  })

  ws.on('close', () => {
    const peers = rooms.get(ws.room)
    if (!peers) return
    peers.delete(ws)
    // Let whoever's left know their partner went offline.
    for (const peer of peers) send(peer, { type: 'partner-offline' })
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

httpServer.listen(PORT, () => {
  console.log(`[relay] CoupleWidget relay listening on :${PORT}`)
})
