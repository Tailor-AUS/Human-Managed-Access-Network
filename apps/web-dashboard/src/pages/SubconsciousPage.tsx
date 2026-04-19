// Subconscious — home view. Master switch + live ECG-style trace per sensor.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Ear,
  Keyboard,
  Monitor,
  Brain,
  Play,
  Pause,
  Loader2,
  AlertTriangle,
  Power,
  RefreshCw,
} from 'lucide-react'
import { hman, type SensorStatus } from '../lib/hman'
import { Sparkline } from '../components/Sparkline'
import { ActivityTimeline, type AppSegment } from '../components/ActivityTimeline'

const SENSOR_META: Record<
  string,
  {
    label: string
    icon: React.ComponentType<{ className?: string }>
    tagline: string
    color: string
  }
> = {
  audio: {
    label: 'Audio',
    icon: Ear,
    tagline: 'Ambient mic → Whisper transcript, 30s chunks.',
    color: '#60a5fa', // blue
  },
  keystrokes: {
    label: 'Keystrokes',
    icon: Keyboard,
    tagline: 'Typing rhythm, WPM, dictation — no keylogging, just cadence.',
    color: '#22c55e', // green
  },
  screen: {
    label: 'Screen',
    icon: Monitor,
    tagline: 'Active app + window, mouse activity, displays.',
    color: '#a855f7', // purple
  },
  eeg: {
    label: 'EEG',
    icon: Brain,
    tagline: 'Muse S Athena band-powers + focus. Requires headband.',
    color: '#f59e0b', // amber
  },
}

const POLL_MS = 500
const TRACE_LEN = 60

type PulseRing = Record<string, number[]>

function useRingBuffer(keys: string[]): [PulseRing, (name: string, v: number) => void] {
  const [ring, setRing] = useState<PulseRing>(() =>
    Object.fromEntries(keys.map((k) => [k, []])),
  )
  const push = useCallback((name: string, v: number) => {
    setRing((prev) => {
      const cur = prev[name] ?? []
      const next = [...cur, v].slice(-TRACE_LEN)
      return { ...prev, [name]: next }
    })
  }, [])
  return [ring, push]
}

function Chip({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'green' | 'amber' | 'gray' }) {
  const cls =
    tone === 'green'
      ? 'bg-green-500/15 text-green-300'
      : tone === 'amber'
      ? 'bg-amber-500/15 text-amber-300'
      : tone === 'gray'
      ? 'bg-gray-700 text-text-secondary'
      : 'bg-background text-text-primary'
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${cls}`}>
      {children}
    </span>
  )
}

function LiveChips({ sensor }: { sensor: SensorStatus }) {
  const s = sensor.summary as Record<string, unknown>
  const chips: React.ReactNode[] = []

  switch (sensor.name) {
    case 'audio': {
      const db = (s.current_db as number) ?? -100
      const peak = (s.peak_rms_60s as number) ?? 0
      const peakDb = peak > 0 ? Math.round(20 * Math.log10(peak)) : -100
      chips.push(<Chip key="db" tone={db > -40 ? 'green' : 'default'}>{db} dB now</Chip>)
      chips.push(<Chip key="peak">peak {peakDb} dB / 60s</Chip>)
      chips.push(<Chip key="chunks">{(s.chunks_captured as number) ?? 0} chunks</Chip>)
      if (s.last_transcript) {
        chips.push(
          <span key="last" className="text-xs text-text-secondary italic truncate max-w-md">
            "{String(s.last_transcript).slice(0, 90)}"
          </span>,
        )
      }
      break
    }
    case 'keystrokes': {
      const typingActive = Boolean(s.typing_active)
      const dictating = Boolean(s.dictation_active)
      chips.push(<Chip key="wpm" tone={typingActive ? 'green' : 'default'}>{String(s.wpm ?? 0)} wpm</Chip>)
      chips.push(<Chip key="keys">{String(s.keys_10s ?? 0)} keys / 10s</Chip>)
      if (typingActive) chips.push(<Chip key="t" tone="green">typing</Chip>)
      if (dictating) chips.push(<Chip key="d" tone="green">dictating</Chip>)
      if (!typingActive && !dictating) chips.push(<Chip key="i" tone="gray">idle</Chip>)
      break
    }
    case 'screen': {
      const mons = (s.num_monitors as number) ?? 0
      const cursor = (s.cursor_monitor as number) ?? 0
      const wins = (s.num_windows as number) ?? 0
      const app = (s.active_app as string) || '—'
      const monitors = (s.monitors as { width: number; height: number }[]) ?? []
      const sizeStr = monitors.length
        ? monitors.map((m) => `${m.width}×${m.height}`).join(', ')
        : ''
      chips.push(<Chip key="m">{mons} screen{mons !== 1 ? 's' : ''}{sizeStr ? ` · ${sizeStr}` : ''}</Chip>)
      chips.push(<Chip key="w">{wins} windows</Chip>)
      if (mons > 1) chips.push(<Chip key="c" tone="green">cursor on screen {cursor + 1}</Chip>)
      chips.push(<Chip key="a">{app}</Chip>)
      if (Boolean(s.on_break)) chips.push(<Chip key="b" tone="amber">on break</Chip>)
      break
    }
    case 'eeg':
      chips.push(<Chip key="n" tone="gray">streamer not wired yet</Chip>)
      break
  }

  return <div className="flex flex-wrap items-center gap-1.5">{chips}</div>
}

export function SubconsciousPage() {
  const [sensors, setSensors] = useState<SensorStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [ring, pushPulse] = useRingBuffer(['audio', 'keystrokes', 'screen', 'eeg'])
  const [appSegments, setAppSegments] = useState<AppSegment[]>([])
  const inFlight = useRef(false)
  const lastAppRef = useRef<string | null>(null)

  const poll = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const ss = await hman.sensors()
      setSensors(ss)
      for (const s of ss) {
        const p = typeof (s as unknown as { pulse?: number }).pulse === 'number'
          ? (s as unknown as { pulse: number }).pulse
          : 0
        pushPulse(s.name, s.running ? p : 0)
      }

      // Accumulate app-transition segments from the screen sensor
      const screen = ss.find((x) => x.name === 'screen')
      if (screen?.running) {
        const app = String((screen.summary as Record<string, unknown>).active_app ?? '')
        const now = Date.now()
        if (app && app !== lastAppRef.current) {
          setAppSegments((prev) => {
            const closed = prev.map((seg, i) =>
              i === prev.length - 1 && seg.endMs > now - 1000 ? { ...seg, endMs: now } : seg,
            )
            return [...closed, { app, startMs: now, endMs: now + 500 }]
          })
          lastAppRef.current = app
        } else if (app) {
          // Extend current segment
          setAppSegments((prev) => {
            if (prev.length === 0) return prev
            const last = prev[prev.length - 1]
            const updated = { ...last, endMs: now }
            return [...prev.slice(0, -1), updated]
          })
        }
      } else {
        lastAppRef.current = null
      }

      // Drop segments older than 10 minutes to keep memory bounded
      setAppSegments((prev) => {
        const cutoff = Date.now() - 10 * 60 * 1000
        return prev.filter((s) => s.endMs > cutoff)
      })

      setError(null)
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [pushPulse])

  useEffect(() => {
    poll()
    const iv = setInterval(poll, POLL_MS)
    return () => clearInterval(iv)
  }, [poll])

  const toggleSensor = useCallback(async (name: string, running: boolean) => {
    setBusy(name)
    try {
      const s = running ? await hman.sensorStop(name) : await hman.sensorStart(name)
      setSensors((prev) => prev.map((x) => (x.name === name ? s : x)))
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(null)
    }
  }, [])

  const toggleAll = useCallback(async () => {
    const anyRunning = sensors.some((s) => s.running)
    setBusy('_all')
    try {
      const updated = anyRunning ? await hman.sensorsStopAll() : await hman.sensorsStartAll()
      setSensors(updated)
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(null)
    }
  }, [sensors])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-text-secondary">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  const anyRunning = sensors.some((s) => s.running)
  const runningCount = sensors.filter((s) => s.running).length
  const availableCount = sensors.filter((s) => s.available).length

  return (
    <div className="max-w-4xl space-y-6">
      <div className="rounded-xl border border-border bg-background-secondary p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-text-primary flex items-center gap-3">
              <Power className={`w-8 h-8 ${anyRunning ? 'text-green-400' : 'text-gray-500'}`} />
              Subconscious
            </h1>
            <p className="text-text-secondary mt-2 max-w-xl">
              Reactive, not invasive. Listens continuously, writes to a local memory store, never interrupts.
            </p>
            <p className="mt-3 text-sm text-text-secondary">
              {runningCount} of {availableCount} available sensors active
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={poll}
              className="p-2 rounded-lg border border-border hover:bg-background text-text-secondary"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={toggleAll}
              disabled={busy === '_all'}
              className={`inline-flex items-center gap-2 px-5 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                anyRunning
                  ? 'bg-background border border-border text-text-primary hover:bg-background-secondary'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              {busy === '_all' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : anyRunning ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {anyRunning ? 'Stop all' : 'Turn on subconscious'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/50 bg-red-900/20 p-3 flex items-start gap-3">
          <AlertTriangle className="text-red-400 shrink-0" />
          <p className="text-sm text-red-200">{error}</p>
        </div>
      )}

      <div className="grid gap-3">
        {sensors.map((s) => {
          const meta = SENSOR_META[s.name] ?? {
            label: s.name,
            icon: Ear,
            tagline: '',
            color: '#22c55e',
          }
          const Icon = meta.icon
          const disabled = !s.available || busy === s.name
          const values = ring[s.name] ?? []
          return (
            <div
              key={s.name}
              className={`rounded-lg border bg-background-secondary ${
                s.running ? 'border-green-500/40' : 'border-border'
              } ${!s.available ? 'opacity-60' : ''}`}
            >
              <div className="p-5 flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div
                    className={`h-10 w-10 shrink-0 rounded-lg flex items-center justify-center`}
                    style={{
                      backgroundColor: s.running ? `${meta.color}26` : undefined,
                      color: s.running ? meta.color : undefined,
                    }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-text-primary">{meta.label}</h3>
                      {!s.available && <Chip tone="gray">unavailable</Chip>}
                      {s.running && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                          live
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-secondary mt-0.5">{meta.tagline}</p>
                  </div>
                </div>
                <button
                  onClick={() => toggleSensor(s.name, s.running)}
                  disabled={disabled}
                  className={`shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 ${
                    s.running
                      ? 'bg-background border border-border text-text-primary hover:bg-background-secondary'
                      : 'bg-blue-600 hover:bg-blue-500 text-white'
                  }`}
                >
                  {busy === s.name ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : s.running ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  {s.running ? 'Stop' : 'Start'}
                </button>
              </div>

              {/* Live trace */}
              <div className="px-5 pb-3">
                <div className="rounded-md bg-background/50 p-3">
                  {s.name === 'screen' ? (
                    <ActivityTimeline
                      segments={appSegments}
                      windowMs={60_000}
                    />
                  ) : (
                    <Sparkline
                      values={values}
                      running={s.running}
                      color={meta.color}
                      width={800}
                      height={50}
                      className="w-full"
                    />
                  )}
                </div>
              </div>

              {/* Live chips */}
              <div className="px-5 pb-5">
                <LiveChips sensor={s} />
                {s.last_error && (
                  <p className="mt-2 text-xs text-amber-400 font-mono">{s.last_error}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
