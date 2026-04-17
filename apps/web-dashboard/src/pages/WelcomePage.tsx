import { useEffect, useState } from 'react'
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
} from 'lucide-react'
import { hman, type Health } from '../lib/hman'

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
          <span className="text-xs text-text-secondary ml-2">v0.1 · first member</span>
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
      <section className="max-w-4xl mx-auto px-6 pt-16 pb-20 text-center">
        <h1 className="text-5xl md:text-6xl font-semibold tracking-tight mb-6 leading-tight">
          Your personal subconscious.
          <br />
          <span className="text-text-secondary">Local. Encrypted. Yours.</span>
        </h1>
        <p className="text-xl text-text-secondary max-w-2xl mx-auto mb-8">
          .HMAN runs on your device. Not someone else's cloud. It speaks in your voice,
          remembers your life, and never acts without your consent.
        </p>

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

        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-text-secondary">
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

      {/* Install */}
      <section id="install" className="max-w-5xl mx-auto px-6 py-16 scroll-mt-16">
        <h2 className="text-3xl font-semibold text-center mb-2">Install to your device</h2>
        <p className="text-text-secondary text-center max-w-xl mx-auto mb-10">
          Your .HMAN instance lives on the device in front of you. It never phones home.
          Nothing you say leaves the machine.
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
                <p className="text-xs text-text-secondary">Windows, macOS, Linux</p>
              </div>
            </div>
            <p className="text-sm text-text-secondary mb-6">
              Requires Node 18+, Python 3.11+, and a CUDA-capable GPU (NVIDIA RTX
              recommended). Runs Gemma 4 / Llama 3.2 locally via Ollama.
            </p>

            <div className="space-y-2 mb-6">
              <Spec label="Model" value="Gemma 4 31B or Llama 3.2 3B" />
              <Spec label="STT" value="faster-whisper (CUDA)" />
              <Spec label="TTS" value="Piper (offline)" />
              <Spec label="Voice ID" value="resemblyzer · PBKDF2 + Fernet" />
            </div>

            <div className="rounded-lg bg-background border border-border p-4 mb-4">
              <p className="text-xs text-text-secondary mb-2 uppercase tracking-wider">Quick start</p>
              <CodeBlock
                value={`git clone https://github.com/Tailor-AUS/Human-Managed-Access-Network
cd Human-Managed-Access-Network && pnpm install
cd apps/web-dashboard && npm run dev`}
                tag="desktop"
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
            </div>
            <p className="text-sm text-text-secondary mb-6">
              Companion app that pairs with your desktop .HMAN over an encrypted tunnel.
              Audio never leaves your home network. Wear AirPods; it becomes your
              subconscious on the move.
            </p>

            <div className="space-y-2 mb-6">
              <Spec label="AirPods integration" value="Live transcription via CMHeadphoneMotion" />
              <Spec label="Transport" value="Cloudflare Tunnel · E2E WebRTC" />
              <Spec label="Install" value="PWA · no app store" />
              <Spec label="Latency" value="~1.5s round-trip" />
            </div>

            <div className="rounded-lg bg-amber-900/10 border border-amber-500/30 p-4 mb-4 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-amber-200 font-medium">Coming soon</p>
                <p className="text-xs text-amber-300 mt-0.5">
                  Mobile PWA is in build. Phase 5 of the sovereign roadmap.
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
          />
          <GateCard
            icon={Lock}
            name="Member Control"
            body="Your data, your context, your keys. Everything encrypted on your device. Nothing leaves without your explicit authorisation."
          />
          <GateCard
            icon={Sparkles}
            name="Extension of Thinking"
            body="It feels like a thought you&rsquo;re having — not an external voice. Not a chatbot. Not a product. First-person. Terse."
          />
          <GateCard
            icon={PauseCircle}
            name="Reactive &amp; Non-Invasive"
            body="Never interrupts your life uninvited. Purely reactive. Purely silent until spoken to."
          />
          <GateCard
            icon={Mic}
            name="Voice-Bound"
            body="Only your voice can activate .HMAN. Only you hear your subconscious. Cryptographically bound to your enrolled voiceprint."
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
        <p className="mt-6 text-sm text-text-secondary">— Knox Hart, first member</p>
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

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-text-secondary min-w-[8rem]">{label}</span>
      <span className="text-text-primary">{value}</span>
    </div>
  )
}

function GateCard({
  icon: Icon,
  name,
  body,
  span,
}: {
  icon: React.ElementType
  name: string
  body: string
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
      <p className="text-sm text-text-secondary leading-relaxed"
         dangerouslySetInnerHTML={{ __html: body }} />
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
