import { useEffect, useRef, useState } from 'react'
import Character, { type CharacterHandle } from './components/Character'
import type { ActivityStatus, AnimationState, CharacterAction } from '../shared/types'

// Stage 1: the displayed character is a local placeholder. In later stages this
// name + state will be driven by the *partner's* real-time activity.
const PARTNER_NAME = 'Partner'

export default function App() {
  const characterRef = useRef<CharacterHandle>(null)
  const [state, setState] = useState<AnimationState>('idle')
  // Local activity status detected by the main process (Stage 2). Drives the
  // floating status label above the character. Later this will be the
  // *partner's* status, arriving over the network.
  const [activity, setActivity] = useState<ActivityStatus>('idle')

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

  // Activity status pushed from the main process.
  useEffect(() => {
    return window.couple.onActivityUpdate(setActivity)
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
          activity={activity}
        />
      </div>
    </div>
  )
}
