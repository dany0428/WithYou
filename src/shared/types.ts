// Types shared between the Electron main process, the preload bridge, and the
// React renderer. Keep this file free of any runtime imports from either side so
// it can be imported safely everywhere.

/** Visual/animation states the character can be in. */
export type AnimationState = 'idle' | 'happy' | 'talking' | 'studying' | 'away'

/**
 * What the *local* user is doing, detected in the main process and pushed to the
 * renderer. Derived from OS input-idle time (→ `afk`) plus the foreground window
 * (→ gaming / working / music / video). `idle` is the active-but-unclassified
 * fallback. These map to placeholder text labels now; real per-status sprites
 * come later (an animator's job — see CLAUDE.md).
 */
export type ActivityStatus =
  | 'idle'
  | 'gaming'
  | 'working'
  | 'music'
  | 'video'
  | 'afk'

/** State of the link to the partner's app. */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected'

/**
 * The partner's presence, as shown on *this* screen. Arrives over the network
 * (Stage 3); the displayed character represents the partner, not the local user.
 */
export interface PartnerPresence {
  /** Display name to show on the partner's character. */
  name: string
  /** The partner's current activity status. */
  status: ActivityStatus
}

/**
 * Wire message exchanged between the two apps. Intentionally tiny and
 * transport-agnostic so any transport (loopback now; a relay/P2P later) can
 * carry it. Lives in shared so both sides agree on the shape.
 */
export interface PresenceMessage {
  name: string
  status: ActivityStatus
}

/**
 * User-editable settings, persisted by the main process and edited in the
 * settings window. These replace the `COUPLE_*` environment variables: with a
 * `relayUrl` *and* `pairCode` set the app uses the real relay, otherwise it runs
 * offline on the loopback transport.
 */
export interface AppSettings {
  /** Your display name, shown on the partner's screen. */
  name: string
  /** Shared pairing code — must match the partner's exactly. */
  pairCode: string
  /** Relay URL (`ws://` or `wss://`). Empty means offline (loopback). */
  relayUrl: string
}

/**
 * "Online together" time, computed in the main process and pushed to the
 * renderer. The clock runs only while the partner is present *and* our link is
 * up; `totalMs` is cumulative across all sessions (persisted), `sessionMs` is the
 * current continuous stretch.
 */
export interface UptimeStats {
  /** True while the partner is online and our link is up. */
  online: boolean
  /** Continuous ms the partner has been online this session (0 when offline). */
  sessionMs: number
  /** Cumulative ms online together across all sessions. */
  totalMs: number
}

/** Discrete reactions triggered by user interaction (one-shot animations). */
export type ReactionKind = 'heart' | 'tilde' | 'bounce' | 'spin'

/**
 * Emotes one partner can send to the other. They travel over the transport and
 * play as a floating reaction on the *receiving* side's character (and as
 * immediate local feedback on the sender's). `heart` is the signature one.
 */
export type EmoteKind = 'heart' | 'kiss' | 'hug' | 'laugh' | 'sad' | 'wave' | 'poke'

/** Actions emitted from the native right-click context menu (main -> renderer). */
export type CharacterAction = 'pet' | 'poke' | 'settings' | 'message'

/**
 * Longest mini-chat message we send. Bubbles are meant to be short one-liners
 * over the character, not paragraphs; the renderer trims to this and the relay
 * caps defensively too.
 */
export const MAX_CHAT_LENGTH = 200

/** Channel names used for IPC. Centralised to avoid typos across processes. */
export const IPC = {
  /** Renderer -> main: toggle whether the window passes mouse events through. */
  SetMouseThrough: 'window:set-mouse-through',
  /** Renderer -> main: open the native character context menu. */
  ShowContextMenu: 'window:show-context-menu',
  /** Main -> renderer: a context-menu / tray action was chosen. */
  CharacterAction: 'character:action',
  /** Main -> renderer: the partner's presence (name + status) changed. */
  PartnerUpdate: 'partner:update',
  /** Main -> renderer: the connection to the partner changed state. */
  ConnectionState: 'connection:state',
  /** Renderer -> main (invoke): read the persisted settings. */
  GetSettings: 'settings:get',
  /** Renderer -> main (invoke): persist settings; reconnects with the new link. */
  SaveSettings: 'settings:save',
  /** Renderer -> main (invoke): generate a fresh random pairing code. */
  GeneratePairCode: 'settings:generate-pair-code',
  /** Renderer -> main: close the settings window. */
  CloseSettings: 'settings:close',
  /** Main -> renderer: updated "online together" stats. */
  UptimeUpdate: 'uptime:update',
  /** Renderer -> main (invoke): read the current uptime stats. */
  GetUptime: 'uptime:get',
  /** Renderer -> main: send an emote to the partner. */
  SendEmote: 'emote:send',
  /** Main -> renderer: play an emote (incoming from partner, or local feedback). */
  EmoteReceived: 'emote:received',
  /** Renderer -> main: send a mini-chat message to the partner. */
  SendChat: 'chat:send',
  /** Main -> renderer: a chat message arrived from the partner. */
  ChatReceived: 'chat:received',
  /** Renderer -> main: begin dragging the widget (follows the cursor). */
  WidgetStartDrag: 'widget:start-drag',
  /** Renderer -> main: stop dragging the widget (persists its new position). */
  WidgetEndDrag: 'widget:end-drag',
} as const

/**
 * The API surface exposed to the renderer via `window.couple` (see preload).
 * Declared here so both the preload implementation and the React code stay in
 * sync.
 */
export interface CoupleWidgetApi {
  /** Make the whole window click-through (true) or interactive (false). */
  setMouseThrough(through: boolean): void
  /** Ask the main process to pop up the native character context menu. */
  showContextMenu(): void
  /** Subscribe to actions coming from the context menu / tray. Returns an unsubscribe fn. */
  onCharacterAction(handler: (action: CharacterAction) => void): () => void
  /** Subscribe to partner presence updates. Returns an unsubscribe fn. */
  onPartnerUpdate(handler: (partner: PartnerPresence) => void): () => void
  /** Subscribe to connection-state changes. Returns an unsubscribe fn. */
  onConnectionState(handler: (state: ConnectionState) => void): () => void
  /** Read the persisted settings (settings window). */
  getSettings(): Promise<AppSettings>
  /** Persist settings; the main process reconnects with the new link. */
  saveSettings(settings: AppSettings): Promise<AppSettings>
  /** Generate a fresh, high-entropy random pairing code (not yet saved). */
  generatePairCode(): Promise<string>
  /** Close the settings window. */
  closeSettings(): void
  /** Subscribe to "online together" stat updates. Returns an unsubscribe fn. */
  onUptimeUpdate(handler: (stats: UptimeStats) => void): () => void
  /** Read the current uptime stats (for initial render). */
  getUptime(): Promise<UptimeStats>
  /** Send an emote to the partner (also echoes back as local feedback). */
  sendEmote(kind: EmoteKind): void
  /** Subscribe to emotes to play on the character. Returns an unsubscribe fn. */
  onEmote(handler: (kind: EmoteKind) => void): () => void
  /** Send a mini-chat message to the partner (shown over our character on their screen). */
  sendChat(text: string): void
  /** Subscribe to chat messages arriving from the partner. Returns an unsubscribe fn. */
  onChat(handler: (text: string) => void): () => void
  /** Begin dragging the widget; it follows the cursor until `endDrag`. */
  startDrag(): void
  /** Stop dragging the widget and persist its new position. */
  endDrag(): void
}
