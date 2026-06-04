import type {
  ActivityStatus,
  AnimationState,
  AppSettings,
  CharacterAction,
  ConnectionState,
  CoupleWidgetApi,
  EmoteKind,
  UptimeStats,
} from '../../shared/types'

// Browser-only demo shim. When the app runs in a plain browser (no Electron
// preload), `window.couple` is undefined. This installs a mock implementation so
// the React UI works without the main process, plus some demo chrome: a
// desktop-like backdrop, an HTML right-click menu, and a state switcher panel.
//
// In Electron this file's install function returns immediately because the real
// `window.couple` bridge already exists.
export function installDemoMock(): void {
  if (window.couple) return // running under Electron — nothing to do.

  let actionHandler: ((action: CharacterAction) => void) | null = null
  let partnerHandler: ((p: { name: string; status: ActivityStatus }) => void) | null = null
  let connectionHandler: ((s: ConnectionState) => void) | null = null
  let uptimeHandler: ((stats: UptimeStats) => void) | null = null
  let emoteHandler: ((kind: EmoteKind) => void) | null = null
  let lastPos = { x: window.innerWidth - 90, y: window.innerHeight - 150 }
  // In-memory settings so the settings view can be previewed in a plain browser.
  let demoSettings: AppSettings = { name: '', pairCode: '', relayUrl: '' }
  // Simulated "online together" stats, seeded so the counter is visible.
  let uptime: UptimeStats = { online: false, sessionMs: 0, totalMs: 3 * 3_600_000 + 12 * 60_000 }

  // Remember where the last right-click happened so the menu opens there.
  document.addEventListener(
    'contextmenu',
    (e) => {
      lastPos = { x: e.clientX, y: e.clientY }
    },
    true,
  )

  const api: CoupleWidgetApi = {
    setMouseThrough() {
      /* no-op in the browser — there's no OS window to make click-through */
    },
    showContextMenu() {
      openMenu(lastPos.x, lastPos.y)
    },
    onCharacterAction(handler) {
      actionHandler = handler
      return () => {
        if (actionHandler === handler) actionHandler = null
      }
    },
    onPartnerUpdate(handler) {
      partnerHandler = handler
      return () => {
        if (partnerHandler === handler) partnerHandler = null
      }
    },
    onConnectionState(handler) {
      connectionHandler = handler
      return () => {
        if (connectionHandler === handler) connectionHandler = null
      }
    },
    getSettings() {
      return Promise.resolve(demoSettings)
    },
    saveSettings(settings) {
      demoSettings = settings
      return Promise.resolve(demoSettings)
    },
    closeSettings() {
      // No OS window to close in the browser — return to the widget view.
      window.location.hash = ''
      window.location.reload()
    },
    onUptimeUpdate(handler) {
      uptimeHandler = handler
      return () => {
        if (uptimeHandler === handler) uptimeHandler = null
      }
    },
    getUptime() {
      return Promise.resolve(uptime)
    },
    sendEmote(kind) {
      // Local feedback now, then a simulated partner mirror shortly after —
      // mirrors the real (feedback + loopback echo) behaviour.
      emoteHandler?.(kind)
      window.setTimeout(() => emoteHandler?.(kind), 600)
    },
    onEmote(handler) {
      emoteHandler = handler
      return () => {
        if (emoteHandler === handler) emoteHandler = null
      }
    },
  }
  window.couple = api

  // The settings view is a standalone page; skip the faux-desktop chrome below.
  if (window.location.hash.replace(/^#/, '') === 'settings') return

  const fire = (action: CharacterAction) => actionHandler?.(action)
  const firePartner = (status: ActivityStatus) =>
    partnerHandler?.({ name: 'Partner', status })

  // Drive the simulated "online together" counter from the connection state:
  // online while connected, frozen otherwise; tick once a second.
  const pushUptime = () => uptimeHandler?.({ ...uptime })
  window.setInterval(() => {
    if (!uptime.online) return
    uptime = { ...uptime, sessionMs: uptime.sessionMs + 1000, totalMs: uptime.totalMs + 1000 }
    pushUptime()
  }, 1000)

  const fireConnection = (state: ConnectionState) => {
    connectionHandler?.(state)
    const online = state === 'connected'
    if (online !== uptime.online) {
      uptime = { ...uptime, online, sessionMs: online ? 0 : uptime.sessionMs }
      pushUptime()
    }
  }

  // Simulate the loopback transport connecting shortly after load.
  setTimeout(() => fireConnection('connected'), 400)
  const setState = (s: AnimationState) =>
    window.dispatchEvent(new CustomEvent('couple:set-state', { detail: s }))

  // --- Desktop-like backdrop so the transparent overlay reads correctly -------
  Object.assign(document.body.style, {
    background:
      'linear-gradient(135deg,#1e3a8a 0%,#6d28d9 50%,#be185d 100%)',
  })

  // --- HTML right-click menu --------------------------------------------------
  function openMenu(x: number, y: number) {
    document.getElementById('demo-menu')?.remove()
    const menu = document.createElement('div')
    menu.id = 'demo-menu'
    Object.assign(menu.style, {
      position: 'fixed',
      left: `${Math.min(x, window.innerWidth - 140)}px`,
      top: `${Math.min(y, window.innerHeight - 160)}px`,
      minWidth: '120px',
      background: 'rgba(30,30,40,0.97)',
      color: '#fff',
      borderRadius: '8px',
      padding: '4px',
      font: '13px system-ui, sans-serif',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      zIndex: '9999',
    })
    const items: Array<{ label: string; run: () => void; separatorBefore?: boolean }> = [
      { label: 'Pet', run: () => fire('pet') },
      { label: 'Poke', run: () => fire('poke') },
      { label: 'Send Heart ❤️', run: () => api.sendEmote('heart') },
      { label: '😘 Kiss', run: () => api.sendEmote('kiss') },
      { label: '🤗 Hug', run: () => api.sendEmote('hug') },
      { label: '😂 Laugh', run: () => api.sendEmote('laugh') },
      {
        label: 'Settings',
        separatorBefore: true,
        // No tray/window in the browser — preview the settings page in place.
        run: () => {
          window.location.hash = 'settings'
          window.location.reload()
        },
      },
    ]
    items.forEach(({ label, run, separatorBefore }) => {
      if (separatorBefore) {
        const sep = document.createElement('div')
        Object.assign(sep.style, {
          height: '1px',
          background: 'rgba(255,255,255,0.15)',
          margin: '4px 0',
        })
        menu.appendChild(sep)
      }
      const item = document.createElement('div')
      item.textContent = label
      Object.assign(item.style, {
        padding: '6px 12px',
        borderRadius: '5px',
        cursor: 'pointer',
      })
      item.onmouseenter = () => (item.style.background = 'rgba(255,255,255,0.12)')
      item.onmouseleave = () => (item.style.background = 'transparent')
      item.onclick = () => {
        menu.remove()
        document.removeEventListener('mousedown', close)
        run()
      }
      menu.appendChild(item)
    })
    document.body.appendChild(menu)
    // Close on an *outside* click. Crucially, ignore mousedowns inside the menu:
    // otherwise the menu is removed before the item's `click` fires and the
    // action is lost. (Declared as a hoisted function so the item handlers above
    // can reference it.)
    function close(ev: globalThis.MouseEvent) {
      if (menu.contains(ev.target as Node)) return
      menu.remove()
      document.removeEventListener('mousedown', close)
    }
    setTimeout(() => document.addEventListener('mousedown', close), 0)
  }

  // --- Demo control panel -----------------------------------------------------
  const panel = document.createElement('div')
  Object.assign(panel.style, {
    position: 'fixed',
    left: '16px',
    top: '16px',
    color: '#fff',
    font: '13px system-ui, sans-serif',
    background: 'rgba(0,0,0,0.45)',
    padding: '14px 16px',
    borderRadius: '12px',
    maxWidth: '300px',
    lineHeight: '1.5',
    zIndex: '9998',
  })
  panel.innerHTML = `
    <div style="font-weight:700;font-size:15px;margin-bottom:6px">CoupleWidget — browser preview</div>
    <div style="opacity:.85;margin-bottom:10px">
      The real app is a transparent, always-on-top desktop overlay (bottom-right).
      Here it's shown on a faux desktop. The system tray isn't available in a browser.
      <br><br>
      Try: <b>hover</b>, <b>click</b> (♥), <b>double-click</b> (~), <b>right-click</b> the character.
    </div>
    <div style="font-weight:600;margin-bottom:4px">Connection:</div>
    <div id="demo-connection" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px"></div>
    <div style="font-weight:600;margin-bottom:4px">Partner status (simulated):</div>
    <div id="demo-activity" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px"></div>
    <div style="font-weight:600;margin-bottom:4px">Animation states:</div>
    <div id="demo-states" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px"></div>
    <div style="font-weight:600;margin-bottom:4px">Menu actions:</div>
    <div id="demo-actions" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px"></div>
    <div style="font-weight:600;margin-bottom:4px">Send emote:</div>
    <div id="demo-emotes" style="display:flex;flex-wrap:wrap;gap:6px"></div>
  `
  document.body.appendChild(panel)

  const mkBtn = (label: string, onClick: () => void) => {
    const b = document.createElement('button')
    b.textContent = label
    Object.assign(b.style, {
      padding: '4px 10px',
      borderRadius: '999px',
      border: '1px solid rgba(255,255,255,0.25)',
      background: 'rgba(255,255,255,0.08)',
      color: '#fff',
      cursor: 'pointer',
      font: '12px system-ui, sans-serif',
    })
    b.onclick = onClick
    return b
  }

  const connectionEl = panel.querySelector('#demo-connection')!
  ;(['connecting', 'connected', 'disconnected'] as ConnectionState[]).forEach((s) =>
    connectionEl.appendChild(mkBtn(s, () => fireConnection(s))),
  )

  const activityEl = panel.querySelector('#demo-activity')!
  ;(['idle', 'gaming', 'working', 'music', 'video', 'afk'] as ActivityStatus[]).forEach(
    (a) => activityEl.appendChild(mkBtn(a, () => firePartner(a))),
  )

  const states: AnimationState[] = ['idle', 'happy', 'talking', 'studying', 'away']
  const statesEl = panel.querySelector('#demo-states')!
  states.forEach((s) => statesEl.appendChild(mkBtn(s, () => setState(s))))

  const actionsEl = panel.querySelector('#demo-actions')!
  ;(['pet', 'poke'] as CharacterAction[]).forEach((a) =>
    actionsEl.appendChild(mkBtn(a, () => fire(a))),
  )

  const emotesEl = panel.querySelector('#demo-emotes')!
  ;(['heart', 'kiss', 'hug', 'laugh', 'sad', 'wave'] as EmoteKind[]).forEach((k) =>
    emotesEl.appendChild(mkBtn(k, () => api.sendEmote(k))),
  )
}
