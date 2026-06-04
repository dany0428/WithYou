import { useEffect, useState } from 'react'
import { formatDurationLong } from './util/duration'
import type { AppSettings, UptimeStats } from '../shared/types'

// ---------------------------------------------------------------------------
// Settings window (opened from the tray / character menu). Edits the persisted
// name / pairing code / relay URL. Saving asks the main process to persist and
// reconnect with the new link, then closes the window.
//
// This renders in a *normal* (opaque, framed) window — not the transparent
// overlay — so it paints its own dark background and is fully interactive.
// ---------------------------------------------------------------------------

const EMPTY: AppSettings = { name: '', pairCode: '', relayUrl: '' }

export default function Settings() {
  const [form, setForm] = useState<AppSettings>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uptime, setUptime] = useState<UptimeStats | null>(null)

  useEffect(() => {
    window.couple.getSettings().then((s) => {
      setForm(s)
      setLoaded(true)
    })
  }, [])

  // Live "online together" stats.
  useEffect(() => window.couple.onUptimeUpdate(setUptime), [])
  useEffect(() => {
    window.couple.getUptime().then(setUptime)
  }, [])

  const set = (key: keyof AppSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const trimmed: AppSettings = {
    name: form.name.trim(),
    pairCode: form.pairCode.trim(),
    relayUrl: form.relayUrl.trim(),
  }
  const willConnect = Boolean(trimmed.relayUrl && trimmed.pairCode)

  async function save() {
    setSaving(true)
    await window.couple.saveSettings(trimmed)
    window.couple.closeSettings()
  }

  return (
    <div className="flex h-full w-full flex-col bg-[#11131a] px-7 py-6 text-slate-100">
      <h1 className="text-lg font-semibold">Settings</h1>
      <p className="mt-1 text-xs text-slate-400">
        Connect to your partner, or leave the relay fields empty to run offline.
      </p>

      {/* "Online together" stats card. */}
      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-400">Time together</span>
          <span
            className={`flex items-center gap-1 text-[11px] ${
              uptime?.online ? 'text-emerald-300' : 'text-slate-500'
            }`}
          >
            <span className="text-[8px]">●</span>
            {uptime?.online ? 'Online now' : 'Offline'}
          </span>
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">
          {uptime ? formatDurationLong(uptime.totalMs) : '—'}
        </div>
        {uptime?.online && uptime.sessionMs >= 60_000 && (
          <div className="mt-0.5 text-xs text-slate-500">
            This session: {formatDurationLong(uptime.sessionMs)}
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-1 flex-col gap-5">
        <Field
          label="Your name"
          hint="Shown on your partner's screen."
          value={form.name}
          onChange={set('name')}
          placeholder="e.g. Dany"
        />
        <Field
          label="Pairing code"
          hint="A shared secret — both of you must enter the exact same code."
          value={form.pairCode}
          onChange={set('pairCode')}
          placeholder="e.g. dany-and-love"
        />
        <Field
          label="Relay URL"
          hint="ws:// for local dev, wss:// for a hosted relay."
          value={form.relayUrl}
          onChange={set('relayUrl')}
          placeholder="wss://your-relay.example.com"
        />

        <div
          className={`rounded-lg px-3 py-2 text-xs ${
            willConnect
              ? 'bg-emerald-500/10 text-emerald-300'
              : 'bg-slate-500/10 text-slate-400'
          }`}
        >
          {willConnect
            ? '● Online — will connect to your partner via the relay.'
            : '○ Offline — relay URL and pairing code are both required to connect.'}
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button
          onClick={() => window.couple.closeSettings()}
          className="rounded-md px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={!loaded || saving}
          className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

interface FieldProps {
  label: string
  hint: string
  value: string
  placeholder: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

function Field({ label, hint, value, placeholder, onChange }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-pink-500/60"
      />
      <span className="text-xs text-slate-500">{hint}</span>
    </label>
  )
}
