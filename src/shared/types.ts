// Types shared between the Electron main process, the preload bridge, and the
// React renderer. Keep this file free of any runtime imports from either side so
// it can be imported safely everywhere.

/** Visual/animation states the character can be in. */
export type AnimationState = 'idle' | 'happy' | 'talking' | 'studying' | 'away'

/**
 * What the *local* user is doing, detected in the main process and pushed to the
 * renderer. Derived from OS input-idle time (→ `afk`) plus the foreground window
 * (→ gaming / working / music / video). `idle` is the active-but-unclassified
 * fallback. These map to placeholder text labels now; real per-status sprites
 * come later (an animator's job — see CLAUDE.md).
 */
export type ActivityStatus =
  | 'idle'
  | 'gaming'
  | 'working'
  | 'music'
  | 'video'
  | 'afk'

/** Discrete reactions triggered by user interaction (one-shot animations). */
export type ReactionKind = 'heart' | 'tilde' | 'bounce' | 'spin'

/** Actions emitted from the native right-click context menu (main -> renderer). */
export type CharacterAction = 'pet' | 'poke' | 'send-heart' | 'settings'

/** Channel names used for IPC. Centralised to avoid typos across processes. */
export const IPC = {
  /** Renderer -> main: toggle whether the window passes mouse events through. */
  SetMouseThrough: 'window:set-mouse-through',
  /** Renderer -> main: open the native character context menu. */
  ShowContextMenu: 'window:show-context-menu',
  /** Main -> renderer: a context-menu / tray action was chosen. */
  CharacterAction: 'character:action',
  /** Main -> renderer: the local user's detected activity status changed. */
  ActivityUpdate: 'activity:update',
} as const

/**
 * The API surface exposed to the renderer via `window.couple` (see preload).
 * Declared here so both the preload implementation and the React code stay in
 * sync.
 */
export interface CoupleWidgetApi {
  /** Make the whole window click-through (true) or interactive (false). */
  setMouseThrough(through: boolean): void
  /** Ask the main process to pop up the native character context menu. */
  showContextMenu(): void
  /** Subscribe to actions coming from the context menu / tray. Returns an unsubscribe fn. */
  onCharacterAction(handler: (action: CharacterAction) => void): () => void
  /** Subscribe to local activity-status changes. Returns an unsubscribe fn. */
  onActivityUpdate(handler: (status: ActivityStatus) => void): () => void
}
