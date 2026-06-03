import { useEffect, useRef, useState } from 'react'
import Character, { type CharacterHandle } from './components/Character'
import type { AnimationState, CharacterAction, PresenceStatus } from '../shared/types'

// Stage 1: the displayed character is a local placeholder. In later stages this
// name + state will be driven by the *partner's* real-time activity.
const PARTNER_NAME = 'Partner'

export default function App() {
  const characterRef = useRef<CharacterHandle>(null)
  const [state, setState] = useState<AnimationState>('idle')
  // Local presence detected by the main process (Stage 2a). Drives the floating
  // status label above the character. Later this will be the *partner's* status.
  const [presence, setPresence] = useState<PresenceStatus>('active')

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
        case 'send-heart':
          characterRef.current?.sendHeart()
          break
        case 'settings':
          // Placeholder until the settings window exists.
          console.log('[CoupleWidget] Settings requested')
          break
      }
    })
    return unsubscribe
  }, [])

  // Presence (active/afk) pushed from the main process.
  useEffect(() => {
    return window.couple.onPresenceUpdate(setPresence)
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
        onMouseEnter={() => setInteractive(true)}
        onMouseLeave={() => setInteractive(false)}
      >
        <Character
          ref={characterRef}
          name={PARTNER_NAME}
          state={state}
          presence={presence}
        />
      </div>
    </div>
  )
}
