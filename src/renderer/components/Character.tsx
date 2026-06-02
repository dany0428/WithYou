import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import type { AnimationState, ReactionKind } from '../../shared/types'

/** Per-state placeholder visuals. Swap these for real sprites later. */
const STATE_VISUALS: Record<
  AnimationState,
  { emoji: string; ring: string; label: string }
> = {
  idle: { emoji: '🐱', ring: 'ring-pink-300/40', label: '' },
  happy: { emoji: '😸', ring: 'ring-yellow-300/70', label: '♪' },
  talking: { emoji: '🐱', ring: 'ring-sky-300/70', label: '💬' },
  studying: { emoji: '🐱', ring: 'ring-indigo-300/70', label: '📚' },
  away: { emoji: '🐱', ring: 'ring-slate-400/40', label: '💤' },
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

  const visuals = STATE_VISUALS[state]
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
              'flex h-[96px] w-[96px] items-center justify-center rounded-full',
              'bg-white/10 backdrop-blur-[1px] ring-4 transition-transform duration-150',
              'group-hover:scale-110',
              visuals.ring,
              isAway ? 'grayscale opacity-60' : '',
              transform === 'bounce' ? 'animate-bounce1' : '',
              transform === 'spin' ? 'animate-spin1' : '',
            ].join(' ')}
          >
            <span className="text-5xl leading-none">{visuals.emoji}</span>

            {/* Small state badge (talking/studying/away/happy). */}
            {visuals.label && (
              <span className="absolute -right-1 -top-1 text-xl drop-shadow">
                {visuals.label}
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
