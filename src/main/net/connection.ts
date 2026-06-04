import type { BrowserWindow } from 'electron'
import {
  IPC,
  type ActivityStatus,
  type ConnectionState,
  type PartnerPresence,
} from '../../shared/types'
import type { Transport } from './transport'

// ---------------------------------------------------------------------------
// Connection manager (Stage 3).
//
// Bridges the three concerns: our locally-detected status goes *out* over the
// transport; the partner's presence and the connection state come *in* and are
// forwarded to the renderer (which displays the partner). Holds the last values
// so a freshly (re)loaded renderer can be reseeded via `resend()`.
// ---------------------------------------------------------------------------

/** Our own display name, sent to the partner. Comes from `COUPLE_NAME` for now;
 *  a settings UI will replace the env var later. */
const SELF_NAME = process.env.COUPLE_NAME ?? 'Me'

export interface Connection {
  /** Open the transport. */
  start(): void
  /** Close the transport. */
  stop(): void
  /** Report our latest detected status; forwarded to the partner. */
  setLocalStatus(status: ActivityStatus): void
  /** Re-send the current partner presence + connection state to the renderer. */
  resend(): void
}

export function createConnection(
  getWindow: () => BrowserWindow | null,
  transport: Transport,
): Connection {
  let partner: PartnerPresence | null = null
  let state: ConnectionState = 'connecting'
  let localStatus: ActivityStatus = 'idle'

  const sendState = () => getWindow()?.webContents.send(IPC.ConnectionState, state)
  const sendPartner = () => {
    if (partner) getWindow()?.webContents.send(IPC.PartnerUpdate, partner)
  }

  transport.onState((next) => {
    state = next
    sendState()
    // On (re)connect, immediately tell the partner where we stand.
    if (next === 'connected') transport.send({ name: SELF_NAME, status: localStatus })
  })

  transport.onMessage((message) => {
    partner = { name: message.name, status: message.status }
    sendPartner()
  })

  return {
    start() {
      transport.start()
    },
    stop() {
      transport.stop()
    },
    setLocalStatus(status) {
      localStatus = status
      transport.send({ name: SELF_NAME, status })
    },
    resend() {
      sendState()
      sendPartner()
    },
  }
}
