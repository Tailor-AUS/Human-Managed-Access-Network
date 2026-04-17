import { useEffect, useState } from 'react'
import {
  Lightbulb,
  Lock,
  Sparkles,
  PauseCircle,
  Mic,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Unlock,
  KeyRound,
  ShieldOff,
} from 'lucide-react'
import { hman, type GatesResponse, type Gate5Status } from '../lib/hman'

const GATE_META: Record<string, { icon: React.ElementType; description: string }> = {
  'Light Bulb Moment': {
    icon: Lightbulb,
    description:
      '.HMAN activates only when you consciously invoke it. Not ambient noise. Not a stray word on TV.',
  },
  'Member Control': {
    icon: Lock,
    description:
      'You own your data and context. Everything stays encrypted on this device. Nothing leaves without explicit authorization.',
  },
  'Extension of Thinking': {
    icon: Sparkles,
    description:
      'It feels like a thought you are having — not an external voice. Not a chatbot. Not a product.',
  },
  'Reactive and Non-Invasive': {
    icon: PauseCircle,
    description:
      'It never interrupts your life uninvited. Purely reactive. Purely silent until spoken to.',
  },
  'Voice-Bound to the Member': {
    icon: Mic,
    description:
      'Only your voice can activate .HMAN. Only you hear your subconscious.',
  },
}

export function GatesPage() {
  const [data, setData] = useState<GatesResponse | null>(null)
  const [gate5, setGate5] = useState<Gate5Status | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showArmModal, setShowArmModal] = useState(false)

  const refresh = async () => {
    try {
      setLoading(true)
      const [g, g5] = await Promise.all([hman.gates(), hman.gate5Status()])
      setData(g)
      setGate5(g5)
      setError(null)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 5_000)
    return () => clearInterval(t)
  }, [])

  const passing = data?.gates.filter(g => g.passing).length ?? 0
  const total = data?.gates.length ?? 0
  const allPass = total > 0 && passing === total

  const disarm = async () => {
    await hman.gate5Lock()
    refresh()
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-text-primary">The Five Gates</h1>
          <p className="text-text-secondary mt-1">
            Every feature must pass all five. If any gate leaks, the member is the product.
          </p>
        </div>
        <button
          onClick={refresh}
          className="p-2 rounded-lg hover:bg-background-secondary text-text-secondary"
          title="Refresh"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/50 bg-red-900/20 p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="text-red-400 shrink-0" />
          <div>
            <p className="font-medium text-red-200">Bridge unreachable</p>
            <p className="text-sm text-red-300 mt-1">{error}</p>
            <p className="text-xs text-red-300 mt-2 font-mono">
              Start the member bridge: <code>python hman/api/server.py</code>
            </p>
          </div>
        </div>
      )}

      {data && (
        <>
          <div
            className={`rounded-lg border p-6 mb-6 ${
              allPass
                ? 'border-green-500/50 bg-green-900/10'
                : 'border-amber-500/50 bg-amber-900/10'
            }`}
          >
            <div className="flex items-center gap-3">
              {allPass ? (
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              ) : (
                <AlertCircle className="w-6 h-6 text-amber-400" />
              )}
              <div className="flex-1">
                <p className="font-medium text-text-primary">
                  {passing}/{total} gates passing
                </p>
                <p className="text-sm text-text-secondary">
                  {allPass
                    ? '.HMAN is operating as intended.'
                    : "Some gates are not yet armed. Until they are, treat this as a dev build, not a sovereign subconscious."}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {data.gates.map(gate => {
              const meta = GATE_META[gate.name] ?? {
                icon: Sparkles,
                description: '',
              }
              const Icon = meta.icon
              const isGate5 = gate.name === 'Voice-Bound to the Member'
              return (
                <div
                  key={gate.name}
                  className={`rounded-lg border p-5 transition-colors ${
                    gate.passing
                      ? 'border-green-500/30 bg-green-900/5'
                      : 'border-amber-500/30 bg-amber-900/5'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`p-2 rounded-lg ${
                        gate.passing
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-text-primary">{gate.name}</h3>
                        {gate.passing ? (
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-amber-400" />
                        )}
                      </div>
                      {meta.description && (
                        <p className="text-sm text-text-secondary">{meta.description}</p>
                      )}
                      <p className="text-xs text-text-secondary mt-2 font-mono">{gate.detail}</p>

                      {/* Gate 5 specific controls */}
                      {isGate5 && gate5 && (
                        <div className="mt-3 pt-3 border-t border-border">
                          {gate5.enrolled ? (
                            <div className="flex items-center justify-between flex-wrap gap-3">
                              <div className="text-xs text-text-secondary">
                                Threshold{' '}
                                <span className="text-text-primary">{gate5.threshold.toFixed(2)}</span>
                                {' · '}Accepts{' '}
                                <span className="text-green-400">{gate5.accepts}</span>
                                {' · '}Rejects{' '}
                                <span className="text-amber-400">{gate5.rejects}</span>
                                {gate5.last_activation && (
                                  <>
                                    {' · '}Last{' '}
                                    <span className="text-text-primary">
                                      {new Date(gate5.last_activation).toLocaleTimeString()}
                                    </span>
                                  </>
                                )}
                              </div>
                              {gate5.armed ? (
                                <button
                                  onClick={disarm}
                                  className="px-3 py-1.5 rounded-md text-xs border border-border hover:bg-background-secondary inline-flex items-center gap-1.5 text-text-secondary hover:text-text-primary"
                                >
                                  <ShieldOff className="w-3.5 h-3.5" /> Disarm
                                </button>
                              ) : (
                                <button
                                  onClick={() => setShowArmModal(true)}
                                  className="px-3 py-1.5 rounded-md text-xs bg-blue-600 hover:bg-blue-500 text-white inline-flex items-center gap-1.5"
                                >
                                  <Unlock className="w-3.5 h-3.5" /> Arm (unlock with passphrase)
                                </button>
                              )}
                            </div>
                          ) : (
                            <a
                              href="/onboarding"
                              className="text-xs inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
                            >
                              <Mic className="w-3.5 h-3.5" /> Enroll your voice
                            </a>
                          )}

                          {/* Recent events visualization */}
                          {gate5.recent_events.length > 0 && (
                            <div className="mt-3 flex items-center gap-0.5">
                              {gate5.recent_events.map((ev, i) => (
                                <div
                                  key={i}
                                  title={`${new Date(ev.ts).toLocaleTimeString()} · score ${ev.score}`}
                                  className={`flex-1 h-1.5 rounded-sm ${
                                    ev.passing ? 'bg-green-500' : 'bg-amber-500'
                                  }`}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-8 pt-6 border-t border-border">
            <p className="text-xs text-text-secondary italic">
              "These five gates will tell you if .HMAN is actually working as intended, or if it's
              just another surveillance device wearing a friendly mask." — Knox Hart
            </p>
          </div>
        </>
      )}

      {showArmModal && (
        <ArmModal
          onCancel={() => setShowArmModal(false)}
          onSuccess={() => {
            setShowArmModal(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function ArmModal({
  onCancel,
  onSuccess,
}: {
  onCancel: () => void
  onSuccess: () => void
}) {
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (passphrase.length < 8) {
      setErr('Passphrase must be at least 8 characters')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await hman.gate5Unlock(passphrase)
      onSuccess()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-border bg-background-secondary p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-medium text-text-primary">Arm Gate 5</h3>
            <p className="text-xs text-text-secondary">Unlock your voice reference in memory.</p>
          </div>
        </div>
        <input
          type="password"
          autoFocus
          value={passphrase}
          onChange={e => setPassphrase(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="Passphrase"
          className="w-full px-4 py-2.5 rounded-lg bg-background border border-border focus:border-blue-500 focus:outline-none text-text-primary mb-2"
        />
        {err && <p className="text-xs text-red-400 mb-2">{err}</p>}
        <p className="text-xs text-text-secondary mb-4">
          Held in memory only. Clears on bridge restart — you'll re-arm each session.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-background text-sm"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm inline-flex items-center justify-center gap-2"
          >
            {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
            Arm
          </button>
        </div>
      </div>
    </div>
  )
}
