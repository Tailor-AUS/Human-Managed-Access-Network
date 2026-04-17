import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldCheck,
  ShieldAlert,
  Mic,
  Cpu,
  Lock,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { hman, type Health, type GatesResponse } from '../lib/hman'

export function DashboardPage() {
  const [health, setHealth] = useState<Health | null>(null)
  const [gates, setGates] = useState<GatesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      setLoading(true)
      const [h, g] = await Promise.all([hman.health(), hman.gates()])
      setHealth(h)
      setGates(g)
      setError(null)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 10_000)
    return () => clearInterval(t)
  }, [])

  const passing = gates?.gates.filter(g => g.passing).length ?? 0
  const total = gates?.gates.length ?? 0
  const allPass = total > 0 && passing === total

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-text-primary">.HMAN</h1>
          <p className="text-text-secondary mt-1">
            Your local subconscious. Encrypted, yours.
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
            <p className="font-medium text-red-200">Member bridge unreachable</p>
            <p className="text-sm text-red-300 mt-1">{error}</p>
            <p className="text-xs text-red-300/80 mt-2 font-mono">
              Start it: <code>python hman/api/server.py</code>
            </p>
          </div>
        </div>
      )}

      {health && gates && (
        <div
          className={`rounded-lg border p-5 mb-6 ${
            allPass
              ? 'border-green-500/40 bg-green-900/10'
              : 'border-amber-500/40 bg-amber-900/10'
          }`}
        >
          <div className="flex items-center gap-4">
            {allPass ? (
              <ShieldCheck className="w-10 h-10 text-green-400 shrink-0" />
            ) : (
              <ShieldAlert className="w-10 h-10 text-amber-400 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-lg font-medium text-text-primary">
                  {passing}/{total} gates armed
                </p>
                {allPass && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-300">
                    Sovereign
                  </span>
                )}
              </div>
              <p className="text-sm text-text-secondary">
                {allPass
                  ? '.HMAN is operating as intended. Every action checks in with you.'
                  : "Dev build. Not yet a sovereign subconscious — some gates still to close."}
              </p>
            </div>
            <Link
              to="/app/gates"
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-background-secondary border border-border hover:bg-background text-text-primary text-sm"
            >
              View gates <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {health && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <FactCard
            icon={<Cpu className="w-5 h-5 text-blue-400" />}
            label="Compute"
            value={health.gpu ? 'CUDA' : 'CPU'}
            detail={health.gpu ? 'RTX 4090 detected' : 'CPU fallback'}
          />
          <FactCard
            icon={<Mic className="w-5 h-5 text-purple-400" />}
            label="Voice identity"
            value={health.enrolled ? 'Enrolled' : 'Not enrolled'}
            detail={
              health.enrolled ? '256-dim reference encrypted at rest' : 'Run onboarding'
            }
          />
          <FactCard
            icon={<Lock className="w-5 h-5 text-green-400" />}
            label="Data residency"
            value="Local"
            detail="Nothing leaves this machine"
          />
          <FactCard
            icon={<ShieldCheck className="w-5 h-5 text-amber-400" />}
            label="Bridge"
            value={`v${health.version}`}
            detail="127.0.0.1:8765"
          />
        </div>
      )}

      {gates && (
        <div className="rounded-lg border border-border bg-background-secondary p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-text-primary">The Five Gates</h2>
            <Link
              to="/app/gates"
              className="text-sm text-text-secondary hover:text-text-primary inline-flex items-center gap-1"
            >
              Details <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {gates.gates.map(g => (
              <div
                key={g.name}
                className="flex items-center gap-3 py-2 border-b border-border last:border-b-0"
              >
                {g.passing ? (
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <span className="font-medium text-text-primary flex-1 min-w-0 truncate">
                  {g.name}
                </span>
                <span className="text-xs text-text-secondary truncate max-w-[55%]">
                  {g.detail}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {health && !health.enrolled && (
        <div className="rounded-lg border border-blue-500/40 bg-blue-900/10 p-5 flex items-center gap-4">
          <Mic className="w-6 h-6 text-blue-400 shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-text-primary">Start onboarding</p>
            <p className="text-sm text-text-secondary">
              Bind your voice. Ten prompts, two minutes. Closes Gate 5.
            </p>
          </div>
          <Link
            to="/app/onboarding"
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
          >
            Begin
          </Link>
        </div>
      )}

      <p className="mt-8 text-xs text-text-secondary italic">
        "These five gates will tell you if .HMAN is actually working as intended, or if it's
        just another surveillance device wearing a friendly mask."
      </p>
    </div>
  )
}

function FactCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-lg border border-border bg-background-secondary p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-text-secondary mb-2">
        {icon}
        {label}
      </div>
      <p className="text-xl font-semibold text-text-primary">{value}</p>
      <p className="text-xs text-text-secondary mt-1">{detail}</p>
    </div>
  )
}
