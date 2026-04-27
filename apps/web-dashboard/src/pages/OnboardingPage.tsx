import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Mic,
  MicOff,
  CheckCircle2,
  XCircle,
  Lock,
  Sparkles,
  ArrowRight,
  RefreshCw,
  ShieldCheck,
  Loader2,
  Play,
  Pause,
} from 'lucide-react'
import {
  hman,
  type EnrollmentSession,
  type SampleResult,
  type FinalizeResult,
} from '../lib/hman'
import { useAutoVoiceRecorder } from '../lib/useAutoVoiceRecorder'

type Step = 'intro' | 'passphrase' | 'recording' | 'finalizing' | 'done' | 'error'

export function OnboardingPage() {
  const [step, setStep] = useState<Step>('intro')
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [passphraseError, setPassphraseError] = useState<string | null>(null)
  const [session, setSession] = useState<EnrollmentSession | null>(null)
  const [results, setResults] = useState<SampleResult[]>([])
  const [lastResult, setLastResult] = useState<SampleResult | null>(null)
  const [finalResult, setFinalResult] = useState<FinalizeResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isEnrolled, setIsEnrolled] = useState<boolean | null>(null)
  const [uploading, setUploading] = useState(false)

  // Stable index reference for the VAD callback (doesn't trigger re-renders)
  const indexRef = useRef(0)
  const sessionIdRef = useRef<string | null>(null)
  const uploadingRef = useRef(false)

  const handleSegment = useCallback(async (blob: Blob) => {
    const sid = sessionIdRef.current
    if (!sid || uploadingRef.current) return
    uploadingRef.current = true
    setUploading(true)
    const current = indexRef.current
    try {
      const result = await hman.uploadSample(sid, current, blob)
      setLastResult(result)
      setResults(r => [...r, result])
      if (result.ok) {
        indexRef.current = current + 1
        setSession(prev =>
          prev ? { ...prev, current_index: current + 1 } : prev,
        )
      }
    } catch (e: any) {
      setError(e?.message ?? String(e))
      setStep('error')
    } finally {
      uploadingRef.current = false
      setUploading(false)
    }
  }, [])

  const rec = useAutoVoiceRecorder({
    onSegment: handleSegment,
  })

  useEffect(() => {
    hman
      .health()
      .then(h => setIsEnrolled(h.enrolled))
      .catch(() => setIsEnrolled(null))
  }, [])

  // Stop mic when leaving the recording step
  useEffect(() => {
    if (step !== 'recording') rec.stop()

  }, [step])

  const currentPrompt =
    session && session.current_index < session.prompts.length
      ? session.prompts[session.current_index]
      : null

  const completed = results.filter(r => r.ok).length
  const done = session ? completed >= session.total : false

  // Pause the mic while uploading / when done to stop it triggering on pauses
  useEffect(() => {
    if (step !== 'recording') return
    if (done) {
      rec.pause()
      return
    }
    if (uploading) {
      rec.pause()
    } else if (rec.state === 'paused') {
      rec.resume()
    }

  }, [uploading, done, step])

  const startSession = useCallback(async () => {
    setPassphraseError(null)
    if (passphrase.length < 8) {
      setPassphraseError('Minimum 8 characters')
      return
    }
    if (passphrase !== confirm) {
      setPassphraseError('Passphrases do not match')
      return
    }
    try {
      const s = await hman.startEnrollment(passphrase)
      sessionIdRef.current = s.session_id
      indexRef.current = 0
      setSession(s)
      setResults([])
      setStep('recording')
      // Start listening automatically
      setTimeout(() => {
        rec.start()
      }, 250)
    } catch (e: any) {
      setError(e?.message ?? String(e))
      setStep('error')
    }
  }, [passphrase, confirm, rec])

  const finalize = useCallback(async () => {
    if (!sessionIdRef.current) return
    setStep('finalizing')
    rec.stop()
    try {
      const r = await hman.finalize(sessionIdRef.current)
      setFinalResult(r)
      setStep('done')
    } catch (e: any) {
      setError(e?.message ?? String(e))
      setStep('error')
    }
  }, [rec])

  // ── UI ────────────────────────────────────────────────────────────

  if (step === 'intro') {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl sm:text-3xl font-semibold text-text-primary mb-2">Welcome to .HMAN</h1>
        <p className="text-text-secondary mb-8 text-base">
          Your personal subconscious. Local, encrypted, yours.
        </p>

        {isEnrolled && (
          <div className="rounded-lg border border-border bg-background-secondary p-4 mb-6 flex items-start gap-3">
            <ShieldCheck className="text-green-500 shrink-0" />
            <div>
              <p className="text-text-primary font-medium">Voice already enrolled</p>
              <p className="text-sm text-text-secondary">
                Re-enrolling will replace your existing voice identity.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4 mb-8">
          <Feature
            icon={<Mic className="text-blue-400" />}
            title="Bind your voice to the platform"
            body="You'll read ten short prompts. No buttons — just speak each one. When you pause, it advances."
          />
          <Feature
            icon={<Lock className="text-purple-400" />}
            title="Nothing leaves this machine"
            body="Your audio is processed locally using resemblyzer on your RTX 4090. No cloud. No telemetry."
          />
          <Feature
            icon={<Sparkles className="text-amber-400" />}
            title="Close Gate 5"
            body="After enrollment, .HMAN will only activate for your voice. Ambient speech, family, TV — all ignored."
          />
        </div>

        <button
          onClick={() => setStep('passphrase')}
          className="min-h-11 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium inline-flex items-center gap-2 text-base"
        >
          Begin enrollment <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    )
  }

  if (step === 'passphrase') {
    return (
      <div className="max-w-md">
        <h1 className="text-2xl sm:text-3xl font-semibold text-text-primary mb-2">Choose a passphrase</h1>
        <p className="text-text-secondary mb-6 text-base">
          Encrypts your voice identity at rest. Eight characters minimum. No recovery — lose this
          and you re-enroll.
        </p>

        <div className="space-y-4">
          <input
            type="password"
            autoFocus
            value={passphrase}
            onChange={e => setPassphrase(e.target.value)}
            placeholder="Passphrase"
            className="w-full min-h-11 px-4 py-3 rounded-lg bg-background-secondary border border-border focus:border-blue-500 focus:outline-none text-text-primary text-base"
          />
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Confirm"
            className="w-full min-h-11 px-4 py-3 rounded-lg bg-background-secondary border border-border focus:border-blue-500 focus:outline-none text-text-primary text-base"
            onKeyDown={e => e.key === 'Enter' && startSession()}
          />
          {passphraseError && <p className="text-sm text-red-400">{passphraseError}</p>}
          <button
            onClick={startSession}
            className="w-full min-h-11 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-base"
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  if (step === 'recording' && session) {
    return (
      <div className="max-w-2xl">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-semibold text-text-primary">
              {done ? 'Review' : `Prompt ${completed + 1} of ${session.total}`}
            </h1>
            <p className="text-text-secondary text-base">
              {done
                ? 'All prompts captured. Review consistency then finalize.'
                : 'Read the line out loud. It advances when you pause.'}
            </p>
          </div>
          <div className="shrink-0">
            <ProgressRing value={completed / session.total} />
          </div>
        </div>

        {!done && currentPrompt && (
          <>
            <div className="rounded-lg border border-border bg-background-secondary p-6 sm:p-8 mb-6">
              <p className="text-lg sm:text-xl text-text-primary leading-relaxed font-serif break-words">
                "{currentPrompt}"
              </p>
            </div>

            <div className="rounded-lg border border-border bg-background-secondary p-4 sm:p-6 mb-6">
              <LevelMeter level={rec.level} state={rec.state} />
              <div className="flex items-center justify-between flex-wrap gap-3 mt-4">
                <StatusBadge state={rec.state} uploading={uploading} />
                <div className="flex items-center gap-2 flex-wrap">
                  {rec.state === 'idle' && (
                    <button
                      onClick={() => rec.start()}
                      className="min-h-11 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-base font-medium inline-flex items-center gap-2"
                    >
                      <Play className="w-4 h-4" /> Start listening
                    </button>
                  )}
                  {(rec.state === 'listening' || rec.state === 'recording') && (
                    <button
                      onClick={() => rec.pause()}
                      className="min-h-11 px-3 py-2 rounded-lg bg-background border border-border text-text-secondary hover:text-text-primary text-base inline-flex items-center gap-2"
                    >
                      <Pause className="w-4 h-4" /> Pause
                    </button>
                  )}
                  {rec.state === 'paused' && (
                    <button
                      onClick={() => rec.resume()}
                      className="min-h-11 px-3 py-2 rounded-lg bg-background border border-border text-text-secondary hover:text-text-primary text-base inline-flex items-center gap-2"
                    >
                      <Play className="w-4 h-4" /> Resume
                    </button>
                  )}
                </div>
              </div>
              {rec.error && <p className="text-sm text-red-400 mt-3">{rec.error}</p>}
            </div>

            {lastResult && !lastResult.ok && (
              <div className="rounded-lg border border-amber-500/50 bg-amber-900/20 p-4 mb-6 flex items-start gap-3">
                <XCircle className="text-amber-400 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-amber-200">
                    Last sample rejected — {lastResult.reason}
                  </p>
                  <p className="text-sm text-amber-300 mt-1">
                    Just read the line again. It'll pick it up automatically.
                  </p>
                </div>
              </div>
            )}
            {lastResult && lastResult.ok && !done && (
              <div className="rounded-lg border border-green-500/50 bg-green-900/20 p-4 mb-6 flex items-start gap-3">
                <CheckCircle2 className="text-green-400 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-green-200">
                    Captured · {lastResult.duration_s.toFixed(1)}s
                  </p>
                  <p className="text-sm text-green-300">
                    RMS {lastResult.rms.toFixed(3)} · embed {lastResult.embed_ms.toFixed(0)}ms
                    {lastResult.self_similarity !== null &&
                      ` · similarity ${lastResult.self_similarity.toFixed(3)}`}
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Captured samples list */}
        {results.length > 0 && (
          <div className="rounded-lg border border-border bg-background-secondary p-4 mb-6">
            <h3 className="text-sm font-medium text-text-secondary mb-3 uppercase tracking-wider">
              Samples
            </h3>
            <div className="space-y-2">
              {results.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 text-sm py-1 border-b border-border last:border-b-0"
                >
                  {r.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  )}
                  <span className="text-text-secondary flex-1 truncate">
                    {session.prompts[r.index]?.slice(0, 50)}…
                  </span>
                  <span className="text-text-primary tabular-nums">
                    {r.duration_s.toFixed(1)}s
                  </span>
                  {r.self_similarity !== null && (
                    <span
                      className={`tabular-nums ${
                        r.self_similarity > 0.85
                          ? 'text-green-400'
                          : r.self_similarity > 0.75
                          ? 'text-amber-400'
                          : 'text-red-400'
                      }`}
                    >
                      {r.self_similarity.toFixed(2)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {done && (
          <button
            onClick={finalize}
            className="w-full min-h-11 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-base"
          >
            Finalize enrollment
          </button>
        )}
      </div>
    )
  }

  if (step === 'finalizing') {
    return (
      <div className="max-w-md text-center py-16">
        <RefreshCw className="w-8 h-8 text-blue-400 mx-auto animate-spin mb-4" />
        <h1 className="text-xl font-semibold text-text-primary">Finalizing…</h1>
        <p className="text-text-secondary mt-2">Averaging embeddings and encrypting.</p>
      </div>
    )
  }

  if (step === 'done' && finalResult) {
    const { mean, min, max } = finalResult.self_consistency
    return (
      <div className="max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <CheckCircle2 className="w-8 h-8 text-green-400 shrink-0" />
          <h1 className="text-2xl sm:text-3xl font-semibold text-text-primary">Enrolled</h1>
        </div>
        <p className="text-text-secondary mb-8">
          Your voice identity is saved locally, encrypted at rest. Gate 5 runtime verification lands
          next (Phase B).
        </p>
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Stat label="Samples used" value={String(finalResult.samples_used)} />
          <Stat
            label="Mean similarity"
            value={mean.toFixed(3)}
            tone={mean > 0.85 ? 'good' : 'warn'}
          />
          <Stat label="Min similarity" value={min.toFixed(3)} tone={min > 0.8 ? 'good' : 'warn'} />
          <Stat label="Max similarity" value={max.toFixed(3)} />
        </div>
        <div className="text-xs text-text-secondary font-mono break-all">
          {finalResult.saved_to}
        </div>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="max-w-md">
        <h1 className="text-2xl sm:text-3xl font-semibold text-red-400 mb-2">Something broke</h1>
        <p className="text-text-secondary mb-6 break-words">{error}</p>
        <button
          onClick={() => {
            setError(null)
            setStep('intro')
          }}
          className="min-h-11 px-6 py-3 rounded-lg bg-background-secondary border border-border hover:bg-background text-text-primary text-base"
        >
          Back to start
        </button>
      </div>
    )
  }

  return null
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 mt-1">{icon}</div>
      <div>
        <p className="font-medium text-text-primary">{title}</p>
        <p className="text-sm text-text-secondary">{body}</p>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'good' | 'warn' | 'neutral'
}) {
  const toneClass =
    tone === 'good'
      ? 'text-green-400'
      : tone === 'warn'
      ? 'text-amber-400'
      : 'text-text-primary'
  return (
    <div className="rounded-lg border border-border bg-background-secondary p-4">
      <p className="text-xs uppercase tracking-wider text-text-secondary">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums mt-1 ${toneClass}`}>{value}</p>
    </div>
  )
}

function ProgressRing({ value }: { value: number }) {
  const size = 56
  const stroke = 4
  const r = (size - stroke) / 2
  const c = r * 2 * Math.PI
  const pct = Math.max(0, Math.min(1, value))
  const offset = c * (1 - pct)
  return (
    <svg width={size} height={size}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="currentColor"
        className="text-border"
        strokeWidth={stroke}
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="currentColor"
        className="text-blue-500"
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="54%"
        textAnchor="middle"
        className="fill-text-primary text-xs font-medium tabular-nums"
      >
        {Math.round(pct * 100)}%
      </text>
    </svg>
  )
}

function StatusBadge({ state, uploading }: { state: string; uploading: boolean }) {
  if (uploading) {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-blue-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Processing…
      </span>
    )
  }
  switch (state) {
    case 'recording':
      return (
        <span className="inline-flex items-center gap-2 text-sm text-red-400">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Recording
        </span>
      )
    case 'listening':
      return (
        <span className="inline-flex items-center gap-2 text-sm text-green-400">
          <span className="w-2 h-2 rounded-full bg-green-500" /> Listening — speak when ready
        </span>
      )
    case 'paused':
      return (
        <span className="inline-flex items-center gap-2 text-sm text-amber-400">
          <Pause className="w-4 h-4" /> Paused
        </span>
      )
    case 'error':
      return (
        <span className="inline-flex items-center gap-2 text-sm text-red-400">
          <XCircle className="w-4 h-4" /> Error
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-2 text-sm text-text-secondary">
          <MicOff className="w-4 h-4" /> Not listening
        </span>
      )
  }
}

function LevelMeter({ level, state }: { level: number; state: string }) {
  const bars = 20
  const active = Math.round(level * bars)
  const live = state === 'recording' || state === 'listening'
  return (
    <div className="flex items-end gap-1 h-16">
      {Array.from({ length: bars }).map((_, i) => {
        const on = i < active && live
        const tone =
          state === 'recording'
            ? i > bars - 4
              ? 'bg-red-500'
              : i > bars - 8
              ? 'bg-amber-500'
              : 'bg-green-500'
            : 'bg-green-500/70'
        return (
          <div
            key={i}
            className={`flex-1 rounded-sm transition-all ${on ? tone : 'bg-background'}`}
            style={{ height: `${(i + 1) * (100 / bars)}%` }}
          />
        )
      })}
    </div>
  )
}
