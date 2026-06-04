import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import { useRive } from '@rive-app/react-canvas'
import type {
  ActivityStatus,
  AnimationState,
  ConnectionState,
  EmoteKind,
  ReactionKind,
} from '../../shared/types'
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

/** Text shown in the floating status label above the character. An empty string
 *  hides the label (`idle` needs no annotation). These are placeholder labels —
 *  real per-status sprites (headphones, glasses, popcorn, sleeping…) are an
 *  animator's job; this slice only wires up the text. */
const ACTIVITY_LABEL: Record<ActivityStatus, string> = {
  idle: '',
  gaming: '🎮 Playing a game',
  working: '📚 Studying / working',
  music: '🎧 Listening to music',
  video: '🍿 Watching a video',
  afk: '💤 Away',
}

const REACTION_SYMBOL: Record<ReactionKind, string> = {
  heart: '♥',
  tilde: '~',
  bounce: '♥',
  spin: '~',
}

/** Emoji shown floating up when an emote is sent/received. */
const EMOTE_EMOJI: Record<EmoteKind, string> = {
  heart: '❤️',
  kiss: '😘',
  hug: '🤗',
  laugh: '😂',
  sad: '🥺',
  wave: '👋',
}

/** Imperative handle so the parent can trigger reactions from menu/tray actions. */
export interface CharacterHandle {
  pet(): void
  poke(): void
  /** Play an emote (sent to / received from the partner). */
  playEmote(kind: EmoteKind): void
}

interface CharacterProps {
  name: string
  state: AnimationState
  /** The partner's detected activity status. */
  activity: ActivityStatus
  /** Our link state to the relay; distinguishes "connecting" from "offline". */
  connection: ConnectionState
  /** Whether the partner is actually present (online and reachable). */
  partnerOnline: boolean
}

interface FloatingText {
  id: number
  symbol: string
}

type Reaction = 'none' | 'bounce' | 'spin'

let floatId = 0

const Character = forwardRef<CharacterHandle, CharacterProps>(function Character(
  { name, state, activity, connection, partnerOnline },
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
  // The partner's activity is only meaningful while they're actually online.
  // Show "Connecting" only while our own link is still coming up; otherwise the
  // partner being absent reads as "Offline". Online + idle shows no label.
  const statusLabel =
    connection === 'connecting'
      ? '… Connecting'
      : partnerOnline
        ? ACTIVITY_LABEL[activity]
        : '⚪ Offline'
  // Dim the sprite when the partner is offline, in the explicit 'away' state, or AFK.
  const isAway = !partnerOnline || state === 'away' || activity === 'afk'

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

  function spawnSymbol(symbol: string) {
    const id = floatId++
    setFloats((prev) => [...prev, { id, symbol }])
    // Clean up after the rise-and-fade animation finishes.
    window.setTimeout(() => {
      setFloats((prev) => prev.filter((f) => f.id !== id))
    }, 1200)
  }

  const spawnFloat = (kind: ReactionKind) => spawnSymbol(REACTION_SYMBOL[kind])

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
    playEmote: (kind: EmoteKind) => {
      spawnSymbol(EMOTE_EMOJI[kind])
      playReaction('bounce')
    },
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

      {/* Floating status label, hovering above the character: the partner's
          activity when they're online, otherwise Connecting/Offline. Hidden when
          online + idle; reserves no space so the character stays anchored. */}
      {statusLabel && (
        <div className="pointer-events-none animate-float rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white shadow backdrop-blur-sm">
          {statusLabel}
        </div>
      )}

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
