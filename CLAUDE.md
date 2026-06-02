# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**CoupleWidget** (working title) — a desktop widget for couples, intended for Steam release. Each partner runs the app on their own PC; a small character sits in the bottom-right corner of the screen. The character shown on **your** screen represents your **partner**, and characters react to each other's real-time PC activity. Stage 1 (current) is the local widget foundation — no networking yet.

## Tech Stack

Electron + TypeScript, React + Tailwind CSS, built with Vite (`vite-plugin-electron`), npm.

## Commands

- `npm run dev` — start Vite dev server and launch Electron with hot reload
- `npm run build` — typecheck (`tsc --noEmit`) then build all three targets
- `npm run preview` — preview the built renderer
- `npm run typecheck` — type-check only
- `npm run dist` — build and package installers via electron-builder (output in `release/`)

There is no test runner configured yet.

## Architecture

Three build targets come out of the single `vite.config.ts` (see the `vite-plugin-electron/simple` block):

- **Main process** (`src/main/`) → `dist-electron/main.js` (CommonJS). `index.ts` owns window + tray lifecycle; `ipc.ts` registers IPC handlers.
- **Preload** (`src/preload/index.ts`) → `dist-electron/preload.js` (CommonJS). Exposes a minimal, typed bridge on `window.couple` via `contextBridge` — the renderer never touches `ipcRenderer` directly.
- **Renderer** (`src/renderer/`) → `dist/` (React app loaded from the root `index.html`).

`src/shared/types.ts` is imported by all three sides and must stay runtime-free (types + the `IPC` channel-name constants only).

### The transparent overlay (the central, non-obvious mechanism)

The window is 200×200, frameless, transparent, always-on-top, and click-through **except over the character itself**. This is achieved by a renderer↔main handshake, not by window shape:

1. Main starts the window with `setIgnoreMouseEvents(true, { forward: true })` — the whole window passes clicks through, but `forward: true` keeps forwarding mouse-move events to the renderer.
2. When the cursor enters the character's wrapper (`App.tsx` `onMouseEnter`), the renderer calls `window.couple.setMouseThrough(false)`, and main re-enables interaction. On leave, it flips back to click-through.

If you change interaction behavior, keep this invariant: **transparent regions must remain click-through, only the character is interactive.** `forward: true` is Windows/macOS-only — on Linux the hover handshake doesn't forward events, so behavior there is degraded by design.

The window is anchored to the **primary display's** `workArea` bottom-right and re-anchored on any `screen` display change. On macOS the Dock icon is hidden (`app.dock.hide()`); on Linux Chromium's sandbox is disabled (required in containers).

### Character interactions

- Single click → bounce + floating "♥"; double click → spin + floating "~"; hover → scale up; right-click → native context menu (built in `ipc.ts`, popped over the window) with Pet / Poke / Send Heart / Settings.
- Context-menu and tray actions flow main → renderer over the `character:action` channel; `App.tsx` maps them onto the `Character` imperative handle (`pet`/`poke`/`sendHeart`).
- Animation states (`idle`/`happy`/`talking`/`studying`/`away`) are placeholder emoji + Tailwind classes in `Character.tsx`. CSS keyframes (`float`, `bounce1`, `spin1`, `floatText`) live in `tailwind.config.js`. Real sprites go in `assets/characters/`.

## Running in GitHub Codespaces (important)

Codespaces is **headless Linux** — a transparent, always-on-top desktop widget cannot be visually used there. Develop and `npm run build` in Codespaces, but **run the real app on a local desktop** (Windows/macOS/Linux) with `npm run dev`.

For a headless **smoke test** (confirms it launches without crashing, no visible window), the GUI libraries and a virtual display are needed:

```bash
sudo apt-get update && sudo apt-get install -y xvfb \
  libatk1.0-0t64 libatk-bridge2.0-0t64 libgtk-3-0t64 libnss3 libgbm1 \
  libasound2t64 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
  libxrandr2 libxfixes3 libcups2t64 libpango-1.0-0 libcairo2
npm run build
xvfb-run -a node_modules/.bin/electron . --no-sandbox
```

`dbus` and `GPU process` errors in headless logs are expected and harmless. (Package names use Ubuntu 24.04's `t64` suffix.)
