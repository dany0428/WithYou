import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import { useRive, Layout, Fit, Alignment } from '@rive-app/react-canvas'
import type {
  ActivityStatus,
  AnimationState,
  ConnectionState,
  EmoteKind,
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

/** Emoji shown floating up when an emote is sent/received. */
const EMOTE_EMOJI: Record<EmoteKind, string> = {
  heart: '❤️',
  kiss: '😘',
  hug: '🤗',
  laugh: '😂',
  sad: '🥺',
  wave: '👋',
  poke: '👉',
}

/** Imperative handle so the parent can play an emote on the character. */
export interface CharacterHandle {
  /** Play an emote (sent to / received from the partner). */
  playEmote(kind: EmoteKind): void
  /** Nudge the character when the partner says something (a chat arrived). */
  say(): void
  /** Throw a festive burst for an anniversary / milestone day. */
  celebrate(): void
}

/** Festive symbols thrown up when a milestone day is celebrated. */
const CELEBRATION_BURST = ['🎉', '💕', '🎂', '✨', '🎉', '💗']

interface CharacterProps {
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

/** Pixels the cursor must travel before a press counts as a drag (not a click). */
const DRAG_THRESHOLD = 4

let floatId = 0

const Character = forwardRef<CharacterHandle, CharacterProps>(function Character(
  { state, activity, connection, partnerOnline },
  ref,
) {
  const [floats, setFloats] = useState<FloatingText[]>([])
  const [reaction, setReaction] = useState<Reaction>('none')
  const clickTimer = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Drag bookkeeping: where the press started (screen px) and whether it grew
  // into a real drag, so we can swallow the click-to-poke that follows a move.
  const dragOrigin = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)

  // Load the file; we start playback ourselves below once we know whether it has
  // a state machine. The canvas is transparent, so it composites cleanly.
  const { rive, RiveComponent } = useRive({
    src: catIdleUrl,
    autoplay: false,
    autoBind: true,
    // Sit the cat on the bottom of its canvas (instead of centered) so there's no
    // empty gap below its feet — the sprite floated above the bottom otherwise.
    layout: new Layout({ fit: Fit.Contain, alignment: Alignment.BottomCenter }),
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

  // Restart a one-shot reaction animation WITHOUT remounting the Rive canvas:
  // briefly clear the class, then re-apply on the next frame so the CSS
  // animation replays. (Remounting via `key` was destroying the canvas.)
  function playReaction(next: Exclude<Reaction, 'none'>) {
    setReaction('none')
    requestAnimationFrame(() => setReaction(next))
  }

  // Exposed to the parent so incoming/echoed emotes play on the character.
  useImperativeHandle(ref, () => ({
    playEmote: (kind: EmoteKind) => {
      spawnSymbol(EMOTE_EMOJI[kind])
      playReaction('bounce')
    },
    say: () => playReaction('bounce'),
    celebrate: () => {
      // Stagger the burst so the symbols rise in a little sequence, not a clump.
      CELEBRATION_BURST.forEach((sym, i) =>
        window.setTimeout(() => spawnSymbol(sym), i * 180),
      )
      playReaction('bounce')
    },
  }))

  // --- Drag the whole widget by grabbing the character. The main process moves
  // the window to follow the cursor; here we only decide press-vs-drag so a real
  // drag doesn't also fire the click-to-poke. ---
  const onDragMove = useCallback((e: globalThis.MouseEvent) => {
    const d = dragOrigin.current
    if (!d || d.moved) return
    if (Math.hypot(e.screenX - d.x, e.screenY - d.y) > DRAG_THRESHOLD) d.moved = true
  }, [])

  const onDragEnd = useCallback(() => {
    const d = dragOrigin.current
    dragOrigin.current = null
    window.removeEventListener('mousemove', onDragMove)
    window.removeEventListener('mouseup', onDragEnd)
    window.couple.endDrag()
    // If it moved, swallow the click that the browser fires right after mouseup.
    if (d?.moved) {
      suppressClick.current = true
      window.setTimeout(() => (suppressClick.current = false), 0)
    }
  }, [onDragMove])

  function handleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return // left button only; right-click opens the menu
    dragOrigin.current = { x: e.screenX, y: e.screenY, moved: false }
    window.couple.startDrag()
    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup', onDragEnd)
  }

  // Clean up stray listeners if we unmount mid-press.
  useEffect(
    () => () => {
      window.removeEventListener('mousemove', onDragMove)
      window.removeEventListener('mouseup', onDragEnd)
    },
    [onDragMove, onDragEnd],
  )

  // Clicking the partner's character pokes them; a double-click sends a heart.
  // Both travel to the partner over the transport and echo back as local
  // feedback, so the reaction shows on *both* screens. The single-click timer
  // keeps a double-click from also firing the single-click poke.
  function handleClick() {
    // A press that turned into a drag isn't a poke.
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    if (clickTimer.current !== null) return
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null
      window.couple.sendEmote('poke')
    }, 220)
  }

  function handleDoubleClick() {
    if (clickTimer.current !== null) {
      window.clearTimeout(clickTimer.current)
      clickTimer.current = null
    }
    window.couple.sendEmote('heart')
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
        className="group relative h-[170px] w-[220px] cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
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
              'relative h-[170px] w-[220px] transition-transform duration-150',
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
    </div>
  )
})

export default Character
