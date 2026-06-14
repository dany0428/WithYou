import type { ConnectionState, EmoteKind, PresenceMessage, UptimeStats } from '../../shared/types'

// ---------------------------------------------------------------------------
// Transport abstraction (Stage 3).
//
// The connection manager talks only to this interface, so the real link to the
// partner — a hosted relay (WebSocket), or a P2P/WebRTC channel — can be dropped
// in later without touching detection, IPC, or the renderer. For now the only
// implementation is an in-process loopback used for development and testing.
// ---------------------------------------------------------------------------

export interface Transport {
  /** Open the link. Should drive `onState` as it connects. */
  start(): void
  /** Close the link and release resources. */
  stop(): void
  /** Send our presence to the partner. May be a no-op while disconnected. */
  send(message: PresenceMessage): void
  /** Send a one-shot emote to the partner. No-op while disconnected. */
  sendEmote(kind: EmoteKind): void
  /** Send a mini-chat message to the partner. No-op while disconnected. */
  sendChat(text: string): void
  /** Register the handler for presence arriving from the partner. */
  onMessage(handler: (message: PresenceMessage) => void): void
  /** Register the handler for connection-state changes. */
  onState(handler: (state: ConnectionState) => void): void
  /**
   * Register the handler for the partner coming online / going offline (i.e.
   * joining or leaving the shared room). Drives the "online together" timer.
   */
  onPartnerPresence(handler: (online: boolean) => void): void
  /** Register the handler for an emote arriving from the partner. */
  onEmote(handler: (kind: EmoteKind) => void): void
  /** Register the handler for a chat message arriving from the partner. */
  onChat(handler: (text: string) => void): void
  /**
   * Register the handler for authoritative "online together" stats pushed by the
   * link itself. Optional: only transports that own the shared timer (the relay,
   * which alone knows when *both* partners are in the room) implement this. When
   * present it supersedes the local `onPartnerPresence`-driven timer, so both
   * partners display the exact same number.
   */
  onUptime?(handler: (stats: UptimeStats) => void): void
}
