import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import { useRive } from '@rive-app/react-canvas'
import type { AnimationState, ReactionKind } from '../../shared/types'
// The cat animation, authored in Rive. `?url` makes Vite emit it as an asset and
// hand us back its (hashed, production-safe) URL.
import catIdleUrl from '../../../assets/characters/cat-idle.riv?url'

// The look-at-cursor head rig is driven by a pointer Listener inside the file's
// state machine — Rive only sees the cursor while it's over the canvas, so we
// forward the global mouse position into the canvas to make it track everywhere.
// We don't hardcode the state-machine name: it's auto-detected on load, so any
// dropped-in .riv works without code changes.

/** Per-state decoration shown over the Rive sprite. Stage 1 only has the idle
 *  loop, so the state mainly drives a small badge + an "away" dim. Later, these
 *  states will map to Rive state-machine inputs. */
const STATE_BADGE: Record<AnimationState, string> = {
  idle: '',
  happy: '♪',
  talking: '💬',
  studying: '📚',
  away: '💤',
}

const REACTION_SYMBOL: Record<ReactionKind, string> = {
  heart: '♥',
  tilde: '~',
  bounce: '♥',
  spin: '~',
}

/** Imperative handle so the parent can trigger reactions from menu/tray actions. */
export interface CharacterHandle {
  pet(): void
  poke(): void
  sendHeart(): void
}

interface CharacterProps {
  name: string
  state: AnimationState
}

interface FloatingText {
  id: number
  symbol: string
}

type Reaction = 'none' | 'bounce' | 'spin'

let floatId = 0

const Character = forwardRef<CharacterHandle, CharacterProps>(function Character(
  { name, state },
  ref,
) {
  const [floats, setFloats] = useState<FloatingText[]>([])
  const [reaction, setReaction] = useState<Reaction>('none')
  const clickTimer = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Load the file; we start playback ourselves below once we know whether it has
  // a state machine. The canvas is transparent, so it composites cleanly.
  const { rive, RiveComponent } = useRive({
    src: catIdleUrl,
    autoplay: false,
    autoBind: true,
  })

  const badge = STATE_BADGE[state]
  const isAway = state === 'away'

  // Auto-detect and play the file's state machine (so its pointer/look logic
  // runs). Fall back to the default timeline if the file has no state machine.
  useEffect(() => {
    if (!rive) return
    try {
      const names = (rive as unknown as { stateMachineNames?: string[] })
        .stateMachineNames
      if (names && names.length > 0) rive.play(names[0])
      else rive.play()
    } catch {
      /* ignore — nothing to play */
    }
  }, [rive])

  // --- Look-at-cursor: forward the global mouse position onto the Rive canvas
  // as synthetic `mousemove` events, so the state machine's pointer listener
  // tracks the cursor even when it's outside the (small) canvas. ---
  useEffect(() => {
    if (!rive) return
    const canvas = containerRef.current?.querySelector('canvas')
    if (!canvas) return
    const onMove = (e: globalThis.MouseEvent) => {
      // bubbles:false so this synthetic event doesn't loop back to window.
      canvas.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: e.clientX,
          clientY: e.clientY,
          bubbles: false,
        }),
      )
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [rive])

  function spawnFloat(kind: ReactionKind) {
    const id = floatId++
    setFloats((prev) => [...prev, { id, symbol: REACTION_SYMBOL[kind] }])
    // Clean up after the rise-and-fade animation finishes.
    window.setTimeout(() => {
      setFloats((prev) => prev.filter((f) => f.id !== id))
    }, 1200)
  }

  // Restart a one-shot reaction animation WITHOUT remounting the Rive canvas:
  // briefly clear the class, then re-apply on the next frame so the CSS
  // animation replays. (Remounting via `key` was destroying the canvas.)
  function playReaction(next: Exclude<Reaction, 'none'>) {
    setReaction('none')
    requestAnimationFrame(() => setReaction(next))
  }

  function react(kind: ReactionKind) {
    playReaction(kind === 'spin' || kind === 'tilde' ? 'spin' : 'bounce')
    spawnFloat(kind)
  }

  // Exposed to the parent (context-menu / tray driven).
  useImperativeHandle(ref, () => ({
    pet: () => react('bounce'),
    poke: () => react('spin'),
    sendHeart: () => spawnFloat('heart'),
  }))

  // Distinguish single vs double click without firing the single-click action
  // twice on a double click.
  function handleClick() {
    if (clickTimer.current !== null) return
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null
      playReaction('bounce')
      spawnFloat('heart')
    }, 220)
  }

  function handleDoubleClick() {
    if (clickTimer.current !== null) {
      window.clearTimeout(clickTimer.current)
      clickTimer.current = null
    }
    playReaction('spin')
    spawnFloat('tilde')
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault()
    window.couple.showContextMenu()
  }

  return (
    <div className="flex flex-col items-center justify-end gap-1 select-none">

      {/* Character + floating reactions */}
      <div
        ref={containerRef}
        className="group relative h-[220px] w-[220px] cursor-pointer"
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        {/* Floating "♥" / "~" texts */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
          {floats.map((f) => (
            <span
              key={f.id}
              className="absolute text-3xl font-bold text-pink-500 drop-shadow animate-floatText"
            >
              {f.symbol}
            </span>
          ))}
        </div>

        {/* Idle bob runs on this wrapper; one-shot reactions run on the inner
            element so they compose. The Rive canvas stays mounted throughout. */}
        <div className="flex h-full w-full items-center justify-center animate-float">
          <div
            onAnimationEnd={() => setReaction('none')}
            className={[
              'relative h-[220px] w-[220px] transition-transform duration-150',
              'group-hover:scale-105',
              isAway ? 'grayscale opacity-60' : '',
              reaction === 'bounce' ? 'animate-bounce1' : '',
              reaction === 'spin' ? 'animate-spin1' : '',
            ].join(' ')}
          >
            <RiveComponent className="h-full w-full" />

            {/* Small state badge (talking/studying/away/happy). */}
            {badge && (
              <span className="absolute right-2 top-2 text-2xl drop-shadow">
                {badge}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Name tag */}
      <div className="-mt-2 rounded-full bg-black/55 px-3 py-0.5 text-xs font-semibold text-white shadow">
        {name}
      </div>
    </div>
  )
})

export default Character
