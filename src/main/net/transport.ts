import type { ConnectionState, PresenceMessage } from '../../shared/types'

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
  /** Register the handler for presence arriving from the partner. */
  onMessage(handler: (message: PresenceMessage) => void): void
  /** Register the handler for connection-state changes. */
  onState(handler: (state: ConnectionState) => void): void
}
