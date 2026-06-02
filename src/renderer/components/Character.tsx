import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import { useRive } from '@rive-app/react-canvas'
import type { AnimationState, ReactionKind } from '../../shared/types'
// The cat's idle animation, authored in Rive. `?url` makes Vite emit it as an
// asset and hand us back its (hashed, production-safe) URL.
import catIdleUrl from '../../../assets/characters/cat-idle.riv?url'

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

type Transform = 'none' | 'bounce' | 'spin'

let floatId = 0

const Character = forwardRef<CharacterHandle, CharacterProps>(function Character(
  { name, state },
  ref,
) {
  const [floats, setFloats] = useState<FloatingText[]>([])
  const [transform, setTransform] = useState<Transform>('none')
  const clickTimer = useRef<number | null>(null)

  // Load + autoplay the idle Rive animation. The canvas is transparent, so it
  // composites cleanly onto the overlay window.
  const { RiveComponent } = useRive({ src: catIdleUrl, autoplay: true })

  const badge = STATE_BADGE[state]
  const isAway = state === 'away'

  function spawnFloat(kind: ReactionKind) {
    const id = floatId++
    setFloats((prev) => [...prev, { id, symbol: REACTION_SYMBOL[kind] }])
    // Clean up after the rise-and-fade animation finishes.
    window.setTimeout(() => {
      setFloats((prev) => prev.filter((f) => f.id !== id))
    }, 1200)
  }

  function react(kind: ReactionKind) {
    setTransform(kind === 'spin' || kind === 'tilde' ? 'spin' : 'bounce')
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
      setTransform('bounce')
      spawnFloat('heart')
    }, 220)
  }

  function handleDoubleClick() {
    if (clickTimer.current !== null) {
      window.clearTimeout(clickTimer.current)
      clickTimer.current = null
    }
    setTransform('spin')
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
        className="group relative h-[120px] w-[120px] cursor-pointer"
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        {/* Floating "♥" / "~" texts */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
          {floats.map((f) => (
            <span
              key={f.id}
              className="absolute text-2xl font-bold text-pink-500 drop-shadow animate-floatText"
            >
              {f.symbol}
            </span>
          ))}
        </div>

        {/* Sprite. The idle float runs on a wrapper; one-shot reactions run on the
            inner element so they compose cleanly. */}
        <div className="flex h-full w-full items-center justify-center animate-float">
          <div
            key={transform} /* restart the animation each time it changes */
            onAnimationEnd={() => setTransform('none')}
            className={[
              'relative h-[120px] w-[120px] transition-transform duration-150',
              'group-hover:scale-110',
              isAway ? 'grayscale opacity-60' : '',
              transform === 'bounce' ? 'animate-bounce1' : '',
              transform === 'spin' ? 'animate-spin1' : '',
            ].join(' ')}
          >
            <RiveComponent className="h-full w-full" />

            {/* Small state badge (talking/studying/away/happy). */}
            {badge && (
              <span className="absolute right-1 top-1 text-xl drop-shadow">
                {badge}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Name tag */}
      <div className="rounded-full bg-black/55 px-3 py-0.5 text-xs font-semibold text-white shadow">
        {name}
      </div>
    </div>
  )
})

export default Character
