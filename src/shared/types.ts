// Types shared between the Electron main process, the preload bridge, and the
// React renderer. Keep this file free of any runtime imports from either side so
// it can be imported safely everywhere.

/** Visual/animation states the character can be in. */
export type AnimationState = 'idle' | 'happy' | 'talking' | 'studying' | 'away'

/**
 * Detected presence of the *local* user, derived from OS input-idle time in the
 * main process. Stage 2a only distinguishes active vs. away-from-keyboard; later
 * slices add richer activity statuses (gaming / working / music / video …).
 */
export type PresenceStatus = 'active' | 'afk'

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
  /** Main -> renderer: the local user's presence (active/afk) changed. */
  PresenceUpdate: 'presence:update',
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
  /** Subscribe to local presence changes (active/afk). Returns an unsubscribe fn. */
  onPresenceUpdate(handler: (status: PresenceStatus) => void): () => void
}
