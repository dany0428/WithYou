import { useEffect, useRef, useState } from 'react'
import Character, { type CharacterHandle } from './components/Character'
import { formatDuration } from './util/duration'
import type {
  AnimationState,
  CharacterAction,
  ConnectionState,
  PartnerPresence,
  UptimeStats,
} from '../shared/types'

export default function App() {
  const characterRef = useRef<CharacterHandle>(null)
  const [state, setState] = useState<AnimationState>('idle')
  // The displayed character represents the PARTNER (Stage 3). Their presence and
  // the link state arrive from the main process over the connection.
  const [partner, setPartner] = useState<PartnerPresence>({
    name: 'Partner',
    status: 'idle',
  })
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [uptime, setUptime] = useState<UptimeStats | null>(null)

  // The widget window is click-through by default; we only become interactive
  // while the cursor is actually over the character. This keeps the rest of the
  // 200×200 window from blocking clicks to whatever is underneath it.
  function setInteractive(interactive: boolean) {
    window.couple.setMouseThrough(!interactive)
  }

  // React to context-menu / tray actions coming from the main process.
  useEffect(() => {
    const unsubscribe = window.couple.onCharacterAction((action: CharacterAction) => {
      switch (action) {
        case 'pet':
          setState('happy')
          characterRef.current?.pet()
          window.setTimeout(() => setState('idle'), 1500)
          break
        case 'poke':
          characterRef.current?.poke()
          break
        case 'settings':
          // Settings now opens a dedicated window from the main process; nothing
          // to do in the widget renderer.
          break
      }
    })
    return unsubscribe
  }, [])

  // Emotes (from the partner, or local feedback on send) play on the character.
  useEffect(
    () => window.couple.onEmote((kind) => characterRef.current?.playEmote(kind)),
    [],
  )

  // Partner presence + connection state pushed from the main process.
  useEffect(() => window.couple.onPartnerUpdate(setPartner), [])
  useEffect(() => window.couple.onConnectionState(setConnection), [])

  // "Online together" stats: live updates + an initial snapshot on mount.
  useEffect(() => window.couple.onUptimeUpdate(setUptime), [])
  useEffect(() => {
    window.couple.getUptime().then(setUptime)
  }, [])

  // Browser-preview demo: let the control panel switch animation states. Harmless
  // under Electron, where nothing dispatches this event.
  useEffect(() => {
    const handler = (e: Event) =>
      setState((e as CustomEvent<AnimationState>).detail)
    window.addEventListener('couple:set-state', handler)
    return () => window.removeEventListener('couple:set-state', handler)
  }, [])

  return (
    // Fill the window; pin the character to the bottom-right corner.
    <div className="flex h-full w-full items-end justify-end p-1">
      {/* Only this wrapper toggles interactivity, so transparent areas stay
          click-through. */}
      <div
        className="flex flex-col items-center gap-1"
        onMouseEnter={() => setInteractive(true)}
        onMouseLeave={() => setInteractive(false)}
      >
        <Character
          ref={characterRef}
          name={partner.name}
          state={state}
          activity={partner.status}
          connection={connection}
          partnerOnline={uptime?.online ?? false}
        />
        {/* "Online together" badge — only while the partner is actually online. */}
        {uptime?.online && (
          <div className="pointer-events-none rounded-full bg-pink-600/80 px-2 py-0.5 text-[10px] font-semibold text-white shadow backdrop-blur-sm">
            💞 {formatDuration(uptime.totalMs)}
          </div>
        )}
      </div>
    </div>
  )
}
