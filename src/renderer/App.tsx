import { useEffect, useRef, useState } from 'react'
import Character, { type CharacterHandle } from './components/Character'
import { formatDuration } from './util/duration'
import { MAX_CHAT_LENGTH } from '../shared/types'
import type {
  AnimationState,
  CharacterAction,
  ConnectionState,
  PartnerPresence,
  UptimeStats,
} from '../shared/types'

/** How long the partner's speech bubble lingers before fading out. */
const BUBBLE_DURATION_MS = 6000

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
  // The partner's latest message (shown as a speech bubble) and the chat composer.
  const [bubble, setBubble] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const bubbleTimer = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // The widget window is click-through by default; we only become interactive
  // while the cursor is actually over the character. This keeps the rest of the
  // 200×200 window from blocking clicks to whatever is underneath it.
  function setInteractive(interactive: boolean) {
    window.couple.setMouseThrough(!interactive)
  }

  // Send the composed message to the partner, then close + clear the composer.
  // Empty/whitespace-only drafts are ignored; we trim to the shared length cap.
  function submitChat() {
    const text = draft.trim().slice(0, MAX_CHAT_LENGTH)
    if (text) window.couple.sendChat(text)
    setDraft('')
    setComposerOpen(false)
  }

  // Context-menu / tray actions. Pet and Poke are gestures aimed at the partner,
  // so they travel over the transport (and echo back locally) just like emotes —
  // the reaction then shows on both screens.
  useEffect(() => {
    const unsubscribe = window.couple.onCharacterAction((action: CharacterAction) => {
      switch (action) {
        case 'pet':
          window.couple.sendEmote('hug')
          break
        case 'poke':
          window.couple.sendEmote('poke')
          break
        case 'message':
          // Open the chat composer (the input autofocuses via the effect below).
          setComposerOpen(true)
          break
        case 'settings':
          // Settings opens a dedicated window from the main process; nothing to
          // do in the widget renderer.
          break
      }
    })
    return unsubscribe
  }, [])

  // A chat message from the partner pops a speech bubble that auto-dismisses, and
  // nudges the character. A fresh message resets the timer.
  useEffect(
    () =>
      window.couple.onChat((text) => {
        setBubble(text)
        characterRef.current?.say()
        if (bubbleTimer.current !== null) window.clearTimeout(bubbleTimer.current)
        bubbleTimer.current = window.setTimeout(() => {
          setBubble(null)
          bubbleTimer.current = null
        }, BUBBLE_DURATION_MS)
      }),
    [],
  )

  // Focus the composer input whenever it opens, so the user can type immediately.
  useEffect(() => {
    if (composerOpen) inputRef.current?.focus()
  }, [composerOpen])

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
        className="flex w-[220px] flex-col items-center gap-1"
        onMouseEnter={() => setInteractive(true)}
        onMouseLeave={() => setInteractive(false)}
      >
        {/* Partner's latest chat as a speech bubble above the character
            (auto-dismisses; the parent clears `bubble`). */}
        {bubble && (
          <div className="pointer-events-none relative max-w-[200px] rounded-2xl bg-white px-3 py-1.5 text-xs font-medium text-gray-900 shadow-lg">
            <span className="block whitespace-pre-wrap break-words">{bubble}</span>
            <span className="absolute -bottom-1 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-white" />
          </div>
        )}

        <Character
          ref={characterRef}
          state={state}
          activity={partner.status}
          connection={connection}
          partnerOnline={uptime?.online ?? false}
        />

        {/* One compact line under the character: partner | time | 💬 message
            button. Time shows only while online; the 💬 button (always present)
            toggles the composer below. */}
        <div className="flex w-full items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-0.5 text-[11px] text-white shadow backdrop-blur-sm">
          <span className="shrink-0 font-semibold">{partner.name}</span>
          {uptime?.online && (
            <>
              <span className="shrink-0 opacity-40">|</span>
              <span className="shrink-0 whitespace-nowrap text-pink-200">
                💞 {formatDuration(uptime.totalMs)}
              </span>
            </>
          )}
          <span className="shrink-0 opacity-40">|</span>
          <button
            onClick={() => setComposerOpen((v) => !v)}
            title="Send a message"
            className="shrink-0 leading-none hover:opacity-80"
          >
            💬
          </button>
        </div>

        {/* Composer, opened by the 💬 button (or right-click "Send message…"). */}
        {composerOpen && (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              value={draft}
              maxLength={MAX_CHAT_LENGTH}
              placeholder="Say something…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitChat()
                else if (e.key === 'Escape') {
                  setDraft('')
                  setComposerOpen(false)
                }
              }}
              className="w-40 rounded-full border border-white/20 bg-black/70 px-3 py-1 text-xs text-white shadow outline-none placeholder:text-white/40"
            />
            <button
              onClick={submitChat}
              className="rounded-full bg-pink-600 px-2 py-1 text-xs font-semibold text-white shadow hover:bg-pink-500"
            >
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
