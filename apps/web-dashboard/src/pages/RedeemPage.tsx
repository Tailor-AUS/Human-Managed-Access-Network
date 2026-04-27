import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, AlertCircle, Loader2, Smartphone } from 'lucide-react'
import { hman, token } from '../lib/hman'

// Phone side of the QR pairing flow.
//
// The desktop's QR encodes <origin>/redeem?code=XXXXXX. The phone's
// camera deep-links into the SWA, this page reads ?code=, calls
// /api/pair/redeem, stores the bearer token at the same localStorage
// key TokenGate uses ('hman.bridge.token'), and redirects to onboarding.
//
// On any failure, shows the reason + a link back to /pair on desktop.

type Phase = 'redeeming' | 'success' | 'failed'

export function RedeemPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('redeeming')
  const [error, setError] = useState<string | null>(null)
  const ranOnce = useRef(false)

  useEffect(() => {
    if (ranOnce.current) return
    ranOnce.current = true

    const code = params.get('code')?.trim().toUpperCase() ?? ''
    if (!code) {
      setPhase('failed')
      setError('No pairing code in the URL.')
      return
    }

    ;(async () => {
      try {
        const { token: bearer } = await hman.pairRedeem(code)
        // Persist where TokenGate expects it.
        token.set(bearer)
        setPhase('success')
        // Brief pause so the user sees the confirmation, then onboarding.
        window.setTimeout(() => navigate('/app/onboarding', { replace: true }), 900)
      } catch (e: any) {
        const msg = String(e?.message ?? '')
        let friendly: string
        if (msg.includes('410')) {
          friendly = 'This pairing code has expired or already been used. Generate a new one on the desktop.'
        } else if (msg.includes('401')) {
          friendly = 'Pairing code not recognised. Generate a new one on the desktop.'
        } else if (msg.includes('429')) {
          friendly = 'Too many pairing attempts. Wait a minute and try again.'
        } else {
          friendly = msg || 'Pairing failed.'
        }
        setError(friendly)
        setPhase('failed')
      }
    })()
  }, [navigate, params])

  return (
    <div className="min-h-screen bg-background text-text-primary flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Pairing this phone</h1>
            <p className="text-sm text-text-secondary">
              Exchanging the code for a bridge token&hellip;
            </p>
          </div>
        </div>

        {phase === 'redeeming' && (
          <div className="rounded-xl border border-border bg-background-secondary p-8 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
            <span className="text-sm text-text-secondary">Talking to the bridge&hellip;</span>
          </div>
        )}

        {phase === 'success' && (
          <div className="rounded-xl border border-green-500/40 bg-green-900/10 p-6 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-200">Paired.</p>
              <p className="text-xs text-green-300 mt-1">
                Token stored on this device. Redirecting to onboarding&hellip;
              </p>
            </div>
          </div>
        )}

        {phase === 'failed' && (
          <div className="rounded-xl border border-red-500/40 bg-red-900/10 p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-200">Pairing failed</p>
                <p className="text-xs text-red-300 mt-1">{error}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 text-sm">
              <Link
                to="/pair"
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium"
              >
                Try again
              </Link>
              <Link
                to="/app"
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary"
              >
                Use paste-token instead
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
