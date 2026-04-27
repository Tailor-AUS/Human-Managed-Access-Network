import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Smartphone, ShieldCheck, RefreshCw, AlertCircle } from 'lucide-react'
import { hman, type PairBegin } from '../lib/hman'

// Desktop side of the QR pairing flow.
//
// Fetches /api/pair/begin → renders the URL as a QR + the 6-digit
// code in big type underneath + a 60s countdown. Auto-refreshes 5s
// before expiry so the QR is never stale.
//
// Security: codes are in-memory on the bridge, single-use, 60s TTL.
// A leaked screenshot is harmless after a minute.

const REFRESH_LEAD_SECONDS = 5

export function PairPage() {
  const [pair, setPair] = useState<PairBegin | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now() / 1000)
  const refreshTimer = useRef<number | null>(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await hman.pairBegin()
      setPair(next)
    } catch (e: any) {
      const msg = String(e?.message ?? '')
      if (msg.includes('429')) {
        setError('Too many pairing requests. Wait a minute and try again.')
      } else {
        setError(msg || 'Failed to begin pairing.')
      }
      setPair(null)
    } finally {
      setLoading(false)
    }
  }

  // First fetch + tick clock once a second so the countdown moves
  useEffect(() => {
    refresh()
    const tick = window.setInterval(() => setNow(Date.now() / 1000), 1000)
    return () => window.clearInterval(tick)
  }, [])

  // Schedule auto-refresh REFRESH_LEAD_SECONDS before expiry
  useEffect(() => {
    if (!pair) return
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
    const msUntilRefresh = Math.max(0, (pair.expires_at - REFRESH_LEAD_SECONDS) * 1000 - Date.now())
    refreshTimer.current = window.setTimeout(refresh, msUntilRefresh)
    return () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
    }
  }, [pair?.code])

  const remaining = pair ? Math.max(0, Math.ceil(pair.expires_at - now)) : 0

  return (
    <div className="min-h-screen bg-background text-text-primary flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Pair a phone</h1>
            <p className="text-sm text-text-secondary">
              Scan the QR with your phone&rsquo;s camera. The code expires in 60s.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-900/10 p-4 mb-4 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="text-sm text-red-300">{error}</div>
          </div>
        )}

        {pair && (
          <div className="rounded-xl border border-border bg-background-secondary p-6">
            <div className="flex items-center justify-center bg-white p-4 rounded-lg">
              <QRCodeSVG value={pair.url} size={224} level="M" includeMargin={false} />
            </div>

            <div className="mt-6 text-center">
              <p className="text-xs text-text-secondary uppercase tracking-wider mb-2">
                Or enter this code manually
              </p>
              <p className="text-4xl font-mono font-semibold tracking-[0.4em] text-text-primary">
                {pair.code}
              </p>
            </div>

            <div className="mt-6 flex items-center justify-between text-sm">
              <span className="text-text-secondary">Expires in</span>
              <span
                className={
                  remaining <= 10
                    ? 'font-mono text-amber-300'
                    : 'font-mono text-text-primary'
                }
              >
                {remaining}s
              </span>
            </div>

            <button
              onClick={refresh}
              disabled={loading}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:border-blue-500/40 text-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              New code
            </button>
          </div>
        )}

        {!pair && !error && loading && (
          <div className="rounded-xl border border-border bg-background-secondary p-12 text-center text-text-secondary">
            Generating pairing code&hellip;
          </div>
        )}

        <div className="mt-6 text-xs text-text-secondary leading-relaxed flex items-start gap-2">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green-400" />
          <span>
            Pairing codes live in memory on this bridge only. They&rsquo;re never written to disk
            and a process restart invalidates outstanding codes immediately.
          </span>
        </div>

        <div className="mt-6 text-center">
          <Link to="/app" className="text-sm text-text-secondary hover:text-text-primary">
            &larr; Back to .HMAN
          </Link>
        </div>
      </div>
    </div>
  )
}
