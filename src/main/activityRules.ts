import type { ActivityStatus } from '../shared/types'

// ---------------------------------------------------------------------------
// Pure foreground-window -> activity classification.
//
// Deliberately dependency-free and side-effect-free so it can be unit-tested in
// isolation and so the rule tables are easy to read and extend. The orchestrator
// in activity.ts feeds it the foreground window; AFK is decided upstream (idle
// time) and never reaches this function.
//
// Matching is case-insensitive substring matching. `app` is the process / owner
// name (e.g. "Spotify", "chrome", "Code"); `title` is the window title, which is
// what reveals what a *browser* is actually doing (YouTube vs. Google Docs …).
// ---------------------------------------------------------------------------

export interface ForegroundWindow {
  /** Process / application name, e.g. "Spotify", "chrome", "Code". */
  app: string
  /** Window title; for browsers this carries the page (e.g. "… - YouTube"). */
  title: string
}

/** Dedicated apps whose identity alone determines the status. */
const APP_RULES: ReadonlyArray<{ status: ActivityStatus; match: string[] }> = [
  {
    status: 'music',
    match: ['spotify', 'apple music', 'itunes', 'tidal', 'deezer', 'foobar', 'aimp', 'cmus'],
  },
  {
    status: 'video',
    match: ['vlc', 'mpv', 'mpc-hc', 'potplayer', 'pot player', 'quicktime', 'netflix'],
  },
  {
    status: 'working',
    match: [
      'code', 'visual studio', 'devenv', 'word', 'winword', 'excel', 'powerpnt',
      'powerpoint', 'notion', 'obsidian', 'sublime', 'intellij', 'idea', 'pycharm',
      'webstorm', 'rider', 'goland', 'clion', 'vim', 'nvim', 'emacs', 'libreoffice',
      'acrobat', 'xcode', 'terminal', 'iterm', 'powershell', 'cmd',
    ],
  },
  {
    status: 'gaming',
    match: [
      'league of legends', 'valorant', 'minecraft', 'csgo', 'cs2', 'dota',
      'genshin', 'roblox', 'fortnite', 'overwatch', 'apex', 'rocketleague',
      'hades', 'eldenring', 'stardew',
    ],
  },
]

/** Browser process names; for these, the window title decides the status. */
const BROWSERS = [
  'chrome', 'google chrome', 'firefox', 'msedge', 'microsoft edge', 'edge',
  'safari', 'brave', 'opera', 'arc', 'vivaldi', 'chromium',
]

/** Title keyword rules, applied in order, used when the foreground app is a
 *  browser. Music is checked before video so "YouTube Music" isn't read as a
 *  plain YouTube video. */
const TITLE_RULES: ReadonlyArray<{ status: ActivityStatus; match: string[] }> = [
  { status: 'music', match: ['youtube music', 'soundcloud', 'spotify', 'bandcamp'] },
  {
    status: 'video',
    match: ['youtube', 'netflix', 'twitch', 'disney+', 'hulu', 'prime video', 'hbo', 'vimeo', 'crunchyroll'],
  },
  {
    status: 'working',
    match: ['google docs', 'google sheets', 'google slides', 'overleaf', 'github', 'gitlab', 'stack overflow', 'jira', 'confluence', 'figma'],
  },
]

const includesAny = (haystack: string, needles: string[]) =>
  needles.some((n) => haystack.includes(n))

/**
 * Classify a foreground window into an activity status. Returns `idle` when
 * nothing matches (e.g. plain web browsing, the desktop, an unknown app).
 */
export function classifyForeground(win: ForegroundWindow): ActivityStatus {
  const app = win.app.toLowerCase()
  const title = win.title.toLowerCase()

  for (const rule of APP_RULES) {
    if (includesAny(app, rule.match)) return rule.status
  }

  if (BROWSERS.some((b) => app.includes(b))) {
    for (const rule of TITLE_RULES) {
      if (includesAny(title, rule.match)) return rule.status
    }
  }

  return 'idle'
}
