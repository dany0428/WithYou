import { execFile } from 'node:child_process'
import type { ForegroundWindow } from './activityRules'

// ---------------------------------------------------------------------------
// Best-effort, dependency-free foreground-window query.
//
// Each platform shells out to a native tool and parses "<app>\t<title>". Any
// failure (tool missing, permission denied, headless container) resolves to
// `null` — detection simply degrades to the `idle` fallback rather than
// crashing. The first ENOENT disables further attempts so we don't repeatedly
// spawn a missing binary (e.g. in GitHub Codespaces, which has no display).
//
// A native module (active-win / get-windows) would be more robust, but it's
// ESM-only and ships platform binaries that fight the bundled-CJS main process
// and electron-builder packaging — not worth it for this slice.
// ---------------------------------------------------------------------------

const EXEC_TIMEOUT_MS = 4_000

let disabled = false

function run(cmd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: EXEC_TIMEOUT_MS, windowsHide: true }, (err, stdout) => {
      if (err) {
        // The tool isn't installed on this machine — stop trying entirely.
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') disabled = true
        resolve(null)
        return
      }
      resolve(stdout)
    })
  })
}

function parseTabbed(out: string | null): ForegroundWindow | null {
  if (!out) return null
  const line = out.trim()
  if (!line) return null
  const tab = line.indexOf('\t')
  const app = (tab === -1 ? line : line.slice(0, tab)).trim()
  const title = tab === -1 ? '' : line.slice(tab + 1).trim()
  if (!app) return null
  return { app, title }
}

// --- Windows: GetForegroundWindow via a tiny inline P/Invoke. Passed as an
// EncodedCommand (base64 UTF-16LE) to sidestep PowerShell quoting. -----------
const PS_SCRIPT = `
$ErrorActionPreference='SilentlyContinue'
Add-Type @"
using System;using System.Runtime.InteropServices;using System.Text;
public class Fg{
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h,out int p);
 [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
}
"@
$h=[Fg]::GetForegroundWindow()
$sb=New-Object System.Text.StringBuilder 512
[void][Fg]::GetWindowText($h,$sb,512)
$procId=0;[void][Fg]::GetWindowThreadProcessId($h,[ref]$procId)
$p=Get-Process -Id $procId -ErrorAction SilentlyContinue
$name=if($p){$p.ProcessName}else{''}
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
Write-Output ($name + "\`t" + $sb.ToString())
`

async function windows(): Promise<ForegroundWindow | null> {
  const encoded = Buffer.from(PS_SCRIPT, 'utf16le').toString('base64')
  return parseTabbed(
    await run('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded,
    ]),
  )
}

// --- macOS: frontmost app name (needs Automation permission, prompted once);
// window title is best-effort (needs Accessibility, often denied → blank). ----
const OSA_SCRIPT = `
tell application "System Events"
  set p to first application process whose frontmost is true
  set appName to name of p
  set winTitle to ""
  try
    set winTitle to name of front window of p
  end try
end tell
return appName & "\t" & winTitle
`

async function macos(): Promise<ForegroundWindow | null> {
  return parseTabbed(await run('osascript', ['-e', OSA_SCRIPT]))
}

// --- Linux (X11): xdotool gives the active window's title + pid; /proc gives
// the process name. Wayland and headless setups have no xdotool → null. -------
async function linux(): Promise<ForegroundWindow | null> {
  const title = (await run('xdotool', ['getactivewindow', 'getwindowname']))?.trim()
  if (title == null) return null
  const pid = (await run('xdotool', ['getactivewindow', 'getwindowpid']))?.trim()
  let app = ''
  if (pid) {
    const comm = await run('cat', [`/proc/${pid}/comm`])
    app = (comm ?? '').trim()
  }
  // Fall back to the title as the app name if /proc lookup failed.
  return parseTabbed(`${app}\t${title}`) ?? (title ? { app: title, title } : null)
}

/**
 * Resolve the current foreground window, or `null` if it can't be determined on
 * this platform/environment. Never rejects.
 */
export async function getForegroundWindow(): Promise<ForegroundWindow | null> {
  if (disabled) return null
  try {
    switch (process.platform) {
      case 'win32':
        return await windows()
      case 'darwin':
        return await macos()
      case 'linux':
        return await linux()
      default:
        disabled = true
        return null
    }
  } catch {
    return null
  }
}
