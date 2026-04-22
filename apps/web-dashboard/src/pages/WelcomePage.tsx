import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Lightbulb,
  Lock,
  Sparkles,
  PauseCircle,
  Mic,
  MonitorDown,
  Smartphone,
  ArrowRight,
  ShieldCheck,
  Check,
  ExternalLink,
  Clipboard,
  ClipboardCheck,
  Github,
  AlertCircle,
  Power,
  Ear,
  Keyboard,
  Monitor,
  Brain,
} from 'lucide-react'
import { hman, type Health } from '../lib/hman'
import { Sparkline } from '../components/Sparkline'

export function WelcomePage() {
  const [health, setHealth] = useState<Health | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    hman
      .health()
      .then(setHealth)
      .catch(() => setHealth(null))
  }, [])

  const copy = (text: string, tag: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(tag)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  const enrolled = health?.enrolled ?? false
  const bridgeOnline = health !== null

  return (
    <div className="min-h-screen bg-background text-text-primary">
      {/* Top bar */}
      <header className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-blue-400" />
          <span className="text-lg font-semibold">.HMAN</span>
          <span className="text-xs text-text-secondary ml-2">v0.1 · prototype</span>
        </div>
        <nav className="flex items-center gap-4 text-sm text-text-secondary">
          <a
            href="https://github.com/Tailor-AUS/Human-Managed-Access-Network"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-text-primary"
          >
            <Github className="w-4 h-4" /> Source
          </a>
          <Link to="/app" className="hover:text-text-primary">
            Member app
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-10 pb-16 text-center">
        <h1 className="text-5xl md:text-6xl font-semibold tracking-tight mb-6 leading-tight">
          Your personal subconscious.
          <br />
          <span className="text-text-secondary">Local. Encrypted. Yours.</span>
        </h1>
        <p className="text-xl text-text-secondary max-w-2xl mx-auto mb-10">
          .HMAN runs on your device. Not someone else&rsquo;s cloud. It listens to the signals
          only you have access to — voice, keystrokes, screen, brain — and nothing leaves without
          your explicit authorisation.
        </p>

        {/* Live-ish preview of the Subconscious page */}
        <SubconsciousPreview />

        <div className="mt-10">
          {enrolled && bridgeOnline ? (
            <Link
              to="/app"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-lg"
            >
              You&rsquo;re in — continue to your .HMAN
              <ArrowRight className="w-5 h-5" />
            </Link>
          ) : bridgeOnline ? (
            <a
              href="#install"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-lg"
            >
              Install to start
              <ArrowRight className="w-5 h-5" />
            </a>
          ) : (
            <div className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-amber-500/40 bg-amber-900/10 text-amber-300 text-sm">
              <AlertCircle className="w-4 h-4" />
              Your local .HMAN bridge isn&rsquo;t running on this device.
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-text-secondary">
          <span className="inline-flex items-center gap-1.5">
            <Check className="w-4 h-4 text-green-400" /> Runs entirely offline
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check className="w-4 h-4 text-green-400" /> Voice-bound to you alone
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check className="w-4 h-4 text-green-400" /> Reactive, never invasive
          </span>
        </div>
      </section>

      {/* Install / Sovereign roadmap */}
      <section id="install" className="max-w-5xl mx-auto px-6 py-16 scroll-mt-16">
        <h2 className="text-3xl font-semibold text-center mb-2">The sovereign roadmap</h2>
        <p className="text-text-secondary text-center max-w-xl mx-auto mb-10">
          .HMAN is incremental. Each phase closes one more gate between you and someone else&rsquo;s cloud.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Desktop */}
          <div className="rounded-xl border border-border bg-background-secondary p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400">
                <MonitorDown className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-semibold">Desktop</h3>
                <p className="text-xs text-text-secondary">Windows · macOS · Linux</p>
              </div>
              <Badge tone="shipped">Shipped</Badge>
            </div>
            <p className="text-sm text-text-secondary mb-6">
              FastAPI bridge runs on 127.0.0.1. Sensors capture voice, keystrokes, screen, and
              optionally EEG (Muse S Athena via BLE). Data stays on disk; Azure Relay provides an
              outbound-only tunnel so your browser anywhere can reach your home bridge without opening a port.
            </p>

            <div className="space-y-2 mb-6">
              <Spec label="Transport" value="Azure Relay Hybrid Connection · E2E TLS" tone="shipped" />
              <Spec label="STT" value="openai-whisper base · CPU" tone="shipped" hint="faster-whisper + CUDA planned" />
              <Spec label="Voice ID" value="resemblyzer · PBKDF2 + Fernet" tone="shipped" />
              <Spec label="EEG" value="Muse S Athena · bleak BLE streamer" tone="shipped" />
              <Spec label="LLM" value="Gemma 4 31B or Llama 3.2 3B via Ollama" tone="planned" />
              <Spec label="TTS" value="Piper · offline" tone="planned" />
            </div>

            <div className="rounded-lg bg-background border border-border p-4 mb-4">
              <p className="text-xs text-text-secondary mb-2 uppercase tracking-wider">
                Try it locally
              </p>
              <CodeBlock
                value={`git clone https://github.com/Tailor-AUS/Human-Managed-Access-Network
cd Human-Managed-Access-Network && pnpm install
cd apps/web-dashboard && npm run dev`}
                tag="desktop-dev"
                copied={copied}
                onCopy={copy}
              />
            </div>

            <div className="rounded-lg bg-background border border-border p-4 mb-4">
              <p className="text-xs text-text-secondary mb-2 uppercase tracking-wider">
                Deploy to your Azure
              </p>
              <CodeBlock
                value={`./ops/azure-deploy.ps1 -ResourceGroup rg-hman-prod -Location australiaeast`}
                tag="desktop-prod"
                copied={copied}
                onCopy={copy}
              />
            </div>

            <a
              href="https://github.com/Tailor-AUS/Human-Managed-Access-Network#readme"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"
            >
              Full setup guide <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Phone */}
          <div className="rounded-xl border border-border bg-background-secondary p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-semibold">Phone</h3>
                <p className="text-xs text-text-secondary">iOS 17+ / Android 12+</p>
              </div>
              <Badge tone="planned">Planned · Phase 5</Badge>
            </div>
            <p className="text-sm text-text-secondary mb-6">
              Companion PWA that pairs with your desktop .HMAN through the same Relay tunnel.
              Audio never leaves your home network — your phone just carries the mic, the
              transcription and thinking happen on your desktop. Wear AirPods; it becomes your
              subconscious on the move.
            </p>

            <div className="space-y-2 mb-6">
              <Spec label="AirPods" value="Live transcription via CMHeadphoneMotion" tone="planned" />
              <Spec label="Transport" value="Azure Relay (reused) · E2E TLS" tone="planned" />
              <Spec label="Install" value="PWA · no app store" tone="planned" />
              <Spec label="Latency" value="~1.5s round-trip target" tone="planned" />
            </div>

            <div className="rounded-lg bg-amber-900/10 border border-amber-500/30 p-4 mb-4 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-amber-200 font-medium">Not built yet</p>
                <p className="text-xs text-amber-300 mt-0.5">
                  Mobile PWA is Phase 5 of the roadmap — after retrieval-by-voice, local LLM, and offline TTS land.
                </p>
              </div>
            </div>

            <button
              disabled
              className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-text-secondary text-sm font-medium cursor-not-allowed opacity-60"
            >
              Join the waitlist (soon)
            </button>
          </div>
        </div>
      </section>

      {/* Five gates */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-semibold text-center mb-2">Five guarantees</h2>
        <p className="text-text-secondary text-center max-w-xl mx-auto mb-10">
          The architecture enforces these. They aren&rsquo;t promises. They&rsquo;re gates.
          If any gate leaks, you&rsquo;re the product.
        </p>

        <div className="grid md:grid-cols-2 gap-4">
          <GateCard
            icon={Lightbulb}
            name="Light Bulb Moment"
            body="Activates only when you consciously invoke it. Ambient noise, a stray word on TV, a cough — all ignored. You flip the switch."
            enforcement="Voice-triggered wake-phrase + AirPods gesture. No passive actuation."
          />
          <GateCard
            icon={Lock}
            name="Member Control"
            body="Your data, your context, your keys. Everything encrypted on your device. Nothing leaves without your explicit authorisation."
            enforcement="Passphrase-derived Fernet key. Bridge bearer token. Azure Relay is a dumb tunnel — never sees plaintext."
          />
          <GateCard
            icon={Sparkles}
            name="Extension of Thinking"
            body="It feels like a thought you're having — not an external voice. Not a chatbot. Not a product. First-person. Terse."
            enforcement="System prompt bound at enrollment. Speaks in your cadence, not a vendor's."
          />
          <GateCard
            icon={PauseCircle}
            name="Reactive & Non-Invasive"
            body="Never interrupts your life uninvited. Purely reactive. Purely silent until spoken to."
            enforcement="No notifications API. No autoplay. Pull-retrieval only."
          />
          <GateCard
            icon={Mic}
            name="Voice-Bound"
            body="Only your voice can activate .HMAN. Only you hear your subconscious. Cryptographically bound to your enrolled voiceprint."
            enforcement="resemblyzer embedding match at enrollment. Each invocation re-verified in <200ms."
            span
          />
        </div>
      </section>

      {/* Quote */}
      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <p className="text-xl md:text-2xl text-text-primary italic leading-relaxed">
          &ldquo;These five gates will tell you if .HMAN is actually working as intended,
          or if it&rsquo;s just another surveillance device wearing a friendly mask.&rdquo;
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-wrap items-center justify-between gap-4 text-sm text-text-secondary">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            <span>.HMAN platform · MIT licensed · built on PACT</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/Tailor-AUS/pact"
              target="_blank"
              rel="noreferrer"
              className="hover:text-text-primary"
            >
              PACT protocol
            </a>
            <a
              href="https://github.com/Tailor-AUS/Human-Managed-Access-Network"
              target="_blank"
              rel="noreferrer"
              className="hover:text-text-primary"
            >
              GitHub
            </a>
            <Link to="/app" className="hover:text-text-primary">
              Member app
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ── Hero preview ──────────────────────────────────────────────────
// Inline, live-ish rendering of the Subconscious UI so the landing page
// shows exactly what the product feels like. Pulses are generated
// deterministically client-side (no API round-trip needed).

interface PreviewSensor {
  name: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  tagline: string
  color: string
  generator: (t: number) => number   // 0..1 synthetic pulse
  chipLabel: string
}

const PREVIEW_SENSORS: PreviewSensor[] = [
  {
    name: 'audio',
    label: 'Audio',
    icon: Ear,
    tagline: 'Mic → 30s chunks → local Whisper.',
    color: '#60a5fa',
    generator: (t) => 0.15 + Math.abs(Math.sin(t * 0.8) * Math.sin(t * 0.3)) * 0.6,
    chipLabel: '−42 dB · 12 chunks',
  },
  {
    name: 'keystrokes',
    label: 'Keystrokes',
    icon: Keyboard,
    tagline: 'Typing cadence, no keylogging.',
    color: '#22c55e',
    generator: (t) => {
      const burst = Math.sin(t * 1.4) > 0.5 ? 0.9 : 0
      return Math.max(0, burst * (0.7 + Math.sin(t * 4) * 0.3))
    },
    chipLabel: '72 wpm · typing',
  },
  {
    name: 'screen',
    label: 'Screen',
    icon: Monitor,
    tagline: 'Active app, mouse, displays.',
    color: '#a855f7',
    generator: (t) => 0.1 + Math.abs(Math.sin(t * 0.6)) * 0.5,
    chipLabel: '2 screens · 14 windows · VS Code',
  },
  {
    name: 'eeg',
    label: 'EEG',
    icon: Brain,
    tagline: 'Muse S Athena → band powers.',
    color: '#f59e0b',
    generator: (t) => 0.3 + Math.sin(t * 2.1) * 0.15 + Math.sin(t * 5.3) * 0.12,
    chipLabel: 'connected · 256 Hz',
  },
]

function SubconsciousPreview() {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const iv = setInterval(() => setTick((n) => n + 1), 500)
    return () => clearInterval(iv)
  }, [])

  // 60-point ring buffer per sensor, generated forward in time
  const values = useMemo(() => {
    const out: Record<string, number[]> = {}
    for (const s of PREVIEW_SENSORS) {
      const arr: number[] = []
      for (let i = 0; i < 60; i++) {
        arr.push(Math.max(0, Math.min(1, s.generator((tick - (60 - i)) * 0.25))))
      }
      out[s.name] = arr
    }
    return out
  }, [tick])

  return (
    <div className="max-w-3xl mx-auto rounded-xl border border-border bg-background-secondary overflow-hidden text-left shadow-2xl">
      {/* Window chrome */}
      <div className="px-5 py-3 border-b border-border flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500/60" />
          <span className="w-3 h-3 rounded-full bg-amber-500/60" />
          <span className="w-3 h-3 rounded-full bg-green-500/60" />
        </div>
        <div className="flex-1 text-center">
          <span className="text-xs text-text-secondary font-mono">
            hman.example.com/app
          </span>
        </div>
      </div>

      {/* Master strip */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Power className="w-5 h-5 text-green-400" />
          <div>
            <p className="font-semibold text-text-primary text-sm">Subconscious</p>
            <p className="text-xs text-text-secondary">4 of 4 sensors active</p>
          </div>
        </div>
        <span className="text-xs px-3 py-1.5 rounded-md bg-background border border-border text-text-secondary">
          Stop all
        </span>
      </div>

      {/* Sensor rows */}
      <div className="divide-y divide-border">
        {PREVIEW_SENSORS.map((s) => {
          const Icon = s.icon
          return (
            <div key={s.name} className="px-5 py-3 flex items-center gap-4">
              <div
                className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${s.color}26`, color: s.color }}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="w-28 shrink-0">
                <p className="text-sm font-medium text-text-primary">{s.label}</p>
                <p className="text-[10px] text-text-secondary leading-tight truncate">
                  {s.chipLabel}
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <Sparkline
                  values={values[s.name] ?? []}
                  color={s.color}
                  running
                  height={30}
                  width={400}
                  showScale={false}
                  className="w-full"
                />
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 shrink-0">
                live
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Small primitives ──────────────────────────────────────────────

function Badge({ tone, children }: { tone: 'shipped' | 'planned'; children: React.ReactNode }) {
  const cls =
    tone === 'shipped'
      ? 'bg-green-500/15 text-green-300 border-green-500/40'
      : 'bg-amber-500/10 text-amber-300 border-amber-500/40'
  return (
    <span
      className={`ml-auto text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border ${cls}`}
    >
      {children}
    </span>
  )
}

function Spec({
  label,
  value,
  tone = 'shipped',
  hint,
}: {
  label: string
  value: string
  tone?: 'shipped' | 'planned'
  hint?: string
}) {
  const dot =
    tone === 'shipped' ? 'bg-green-400' : 'bg-amber-400'
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${dot}`}
        title={tone === 'shipped' ? 'shipped' : 'planned'}
      />
      <span className="text-text-secondary min-w-[7rem]">{label}</span>
      <span className="text-text-primary flex-1">
        {value}
        {hint && <span className="text-text-secondary text-xs ml-2">({hint})</span>}
      </span>
    </div>
  )
}

function GateCard({
  icon: Icon,
  name,
  body,
  enforcement,
  span,
}: {
  icon: React.ElementType
  name: string
  body: string
  enforcement?: string
  span?: boolean
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-background-secondary p-6 ${
        span ? 'md:col-span-2' : ''
      }`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-lg bg-green-500/10 text-green-400">
          <Icon className="w-5 h-5" />
        </div>
        <h3 className="font-semibold text-text-primary">{name}</h3>
      </div>
      <p className="text-sm text-text-secondary leading-relaxed">{body}</p>
      {enforcement && (
        <p className="mt-3 text-xs text-text-secondary font-mono border-l-2 border-green-500/30 pl-3">
          {enforcement}
        </p>
      )}
    </div>
  )
}

function CodeBlock({
  value,
  tag,
  copied,
  onCopy,
}: {
  value: string
  tag: string
  copied: string | null
  onCopy: (v: string, t: string) => void
}) {
  return (
    <div className="relative">
      <pre className="text-xs font-mono text-text-primary whitespace-pre-wrap break-all pr-10">
        {value}
      </pre>
      <button
        onClick={() => onCopy(value, tag)}
        className="absolute top-0 right-0 p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-background-secondary"
        title="Copy"
      >
        {copied === tag ? (
          <ClipboardCheck className="w-4 h-4 text-green-400" />
        ) : (
          <Clipboard className="w-4 h-4" />
        )}
      </button>
    </div>
  )
}
