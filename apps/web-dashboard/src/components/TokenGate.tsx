import { useEffect, useState } from 'react'
import { KeyRound, ShieldAlert } from 'lucide-react'
import { hman, token } from '../lib/hman'

// Wraps the member app. On first load, probes /api/health.
// If 401 → shows a token-entry gate; on success, stores the token in
// localStorage and lets the app render normally.
// If the bridge responds cleanly (or is unreachable for other reasons),
// renders the app as-is and lets downstream pages handle errors.

export function TokenGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'probing' | 'needs-token' | 'ok'>('probing')
  const [value, setValue] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const probe = async () => {
    try {
      await hman.health()
      setState('ok')
    } catch (e: any) {
      const msg = String(e?.message ?? '')
      if (msg.includes('401')) setState('needs-token')
      else setState('ok') // other errors handled by inner pages
    }
  }

  useEffect(() => {
    probe()
  }, [])

  const submit = async () => {
    const trimmed = value.trim()
    if (!trimmed) {
      setErr('Paste the bearer token your bridge was started with.')
      return
    }
    setBusy(true)
    setErr(null)
    token.set(trimmed)
    try {
      await hman.health()
      setState('ok')
    } catch (e: any) {
      token.set(null)
      setErr('Token rejected. Check it matches HMAN_AUTH_TOKEN on the bridge.')
    } finally {
      setBusy(false)
    }
  }

  if (state === 'probing') {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-text-secondary">
        Connecting to your bridge…
      </div>
    )
  }

  if (state === 'needs-token') {
    return (
      <div className="max-w-md mx-auto px-6 py-16">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Bridge requires a token</h1>
            <p className="text-sm text-text-secondary">
              This bridge is exposed over a tunnel. Enter its bearer token to continue.
            </p>
          </div>
        </div>
        <div className="relative">
          <KeyRound className="w-4 h-4 absolute left-3 top-3.5 text-text-secondary" />
          <input
            type="password"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Bearer token"
            className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-background-secondary border border-border focus:border-blue-500 focus:outline-none text-text-primary"
          />
        </div>
        {err && <p className="text-sm text-red-400 mt-2">{err}</p>}
        <button
          onClick={submit}
          disabled={busy}
          className="w-full mt-4 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-medium"
        >
          Connect
        </button>
        <p className="text-xs text-text-secondary mt-4">
          The token is generated when the bridge starts. Look for
          <code className="mx-1 px-1 rounded bg-background-secondary">HMAN_AUTH_TOKEN</code>
          in the terminal where you launched it, or in your <code>.env</code>.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
