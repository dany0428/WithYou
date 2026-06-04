# CoupleWidget Relay Server

A tiny WebSocket "post office" that forwards presence between the two partner
apps. One partner's app sends its status to the relay; the relay forwards it to
the other partner connected to the **same room** (their shared pairing code).

It keeps nothing on disk and only remembers each peer's *last* status in memory,
so a partner who connects later immediately sees the current state.

## Run it locally (development)

From the **repo root**:

```bash
npm run relay              # listens on ws://localhost:8080
```

Then start each app pointing at it (see "Connecting the app" below). For local
testing you can run two app instances on one machine with the same pairing code.

## Connecting the app

The app picks its transport from environment variables (a settings UI will
replace these later). Set **both** of these and the app uses the relay; leave
them unset and it falls back to the offline loopback:

| Variable            | Meaning                                  | Example                    |
| ------------------- | ---------------------------------------- | -------------------------- |
| `COUPLE_RELAY_URL`  | Relay address                            | `wss://couple.fly.dev`     |
| `COUPLE_PAIR_CODE`  | Shared room — **must match the partner** | `dany-and-love`            |
| `COUPLE_NAME`       | Your display name (optional)             | `Dany`                     |

Example (run the desktop app against a local relay):

```bash
COUPLE_RELAY_URL=ws://localhost:8080 COUPLE_PAIR_CODE=test-room COUPLE_NAME=Dany npm run dev
```

> Use `ws://` for plain local dev and `wss://` (TLS) for any hosted relay — most
> free hosts give you HTTPS/WSS automatically.

## Deploy it for free

The relay is a standard Node WebSocket server that binds to `process.env.PORT`,
so it runs on essentially any Node host. Free options that work well for an
always-on hobby service (as of 2026 — free tiers change, so double-check):

1. **Fly.io** — generous hobby allowance, global, real WSS. Good default.
   ```bash
   cd server
   fly launch --no-deploy        # creates fly.toml (set internal_port = 8080)
   fly deploy
   ```
   Your URL becomes `wss://<app-name>.fly.dev`.

2. **Render** — free Web Service, dead simple from a GitHub repo.
   - New → Web Service → point at this repo, **root directory = `server`**.
   - Build command: `npm install` · Start command: `npm start`.
   - URL becomes `wss://<service>.onrender.com`.
   - Note: the free tier sleeps after ~15 min idle and cold-starts on the next
     connection (fine for a hobby widget; the app auto-reconnects).

3. **Railway** — easy GitHub deploys, small monthly free credit.
   - New Project → Deploy from repo → set root to `server` → it detects `npm start`.

4. **Glitch / Replit** — quickest to click together for a quick test, but they
   sleep aggressively; better for experiments than daily use.

### What the host needs to know

- **Start command:** `npm start` (i.e. `node relay.mjs`)
- **Port:** don't hard-code it — the server reads `process.env.PORT` (hosts
  inject it). Locally it defaults to `8080`.
- **Health:** it's a pure WebSocket server (no HTTP routes). If a host insists on
  an HTTP health check, point it at `/` and expect a non-200 — the WS upgrade
  still works. (Tell me if a host blocks deploy on the health check and I'll add
  a tiny HTTP 200 handler.)

## Wire protocol (for reference)

JSON text frames:

```
client -> relay   { "type": "join",     "room": "<code>", "name": "<you>" }
client -> relay   { "type": "presence", "name": "<you>",  "status": "<status>" }
relay  -> client  { "type": "presence", "name": "<partner>", "status": "<status>" }
relay  -> client  { "type": "error",    "reason": "room-full" }
```

Rooms hold at most two peers (a couple); a third connection to the same room is
rejected with `room-full`.
