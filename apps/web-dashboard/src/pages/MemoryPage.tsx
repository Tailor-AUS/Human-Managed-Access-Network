// Memory — unified review of everything the subconscious has captured.
// Filter chips per-sensor. Newest first. Polls every 15s.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Ear,
  Keyboard,
  Monitor,
  Brain,
  Folder,
  AlertTriangle,
  RefreshCw,
  Loader2,
} from 'lucide-react'
import { hman, type SensorEntry, type SensorStatus } from '../lib/hman'

type Filter = 'all' | 'audio' | 'keystrokes' | 'screen' | 'eeg'

const SENSOR_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  audio: Ear,
  keystrokes: Keyboard,
  screen: Monitor,
  eeg: Brain,
}

type Row = SensorEntry & { _sensor: string }

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = (Date.now() - then) / 1000
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(iso).toLocaleString()
}

function renderBody(row: Row) {
  switch (row._sensor) {
    case 'audio':
      return (
        <p className="text-sm text-text-primary leading-relaxed">{String(row.text ?? '')}</p>
      )
    case 'keystrokes': {
      const words = Array.isArray(row.recent_words) ? (row.recent_words as string[]) : []
      return (
        <div className="space-y-1 text-sm">
          <div className="text-text-secondary text-xs flex gap-3 flex-wrap">
            <span>{String(row.wpm ?? 0)} wpm</span>
            <span>{String(row.keys ?? 0)} keys</span>
            <span>{String(row.typos ?? 0)} typos</span>
            {Boolean(row.dictation_active) && <span className="text-blue-300">dictating</span>}
          </div>
          {words.length > 0 && (
            <p className="text-text-primary text-xs font-mono">{words.join(' ')}</p>
          )}
        </div>
      )
    }
    case 'screen':
      if (row.event === 'app_changed') {
        return (
          <p className="text-sm text-text-primary">
            <span className="text-text-secondary">→</span>{' '}
            <span className="font-medium">{String(row.active_app ?? '')}</span>
            {Boolean(row.active_window) && (
              <span className="text-text-secondary"> — {String(row.active_window)}</span>
            )}
          </p>
        )
      }
      if (row.event === 'break_start') {
        return <p className="text-sm text-amber-300">Break started</p>
      }
      return (
        <p className="text-sm text-text-secondary">
          {String(row.active_app ?? '—')}
          {typeof row.mouse_distance_10s === 'number' &&
            ` · ${row.mouse_distance_10s}px mouse · ${row.mouse_clicks_10s ?? 0} clicks`}
        </p>
      )
    case 'eeg':
      return <p className="text-sm text-text-secondary">—</p>
    default:
      return <p className="text-xs font-mono text-text-secondary">{JSON.stringify(row)}</p>
  }
}

export function MemoryPage() {
  const [status, setStatus] = useState<SensorStatus[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const sensors = await hman.sensors()
      setStatus(sensors)
      const window = 6 * 3600
      const results = await Promise.all(
        sensors.map(async (s) => {
          const rec = await hman.sensorRecent(s.name, window)
          return rec.map((e) => ({ ...e, _sensor: s.name }) as Row)
        }),
      )
      const merged = results.flat().sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
      setRows(merged.slice(0, 200))
      setError(null)
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 15000)
    return () => clearInterval(iv)
  }, [refresh])

  const filtered = useMemo(() => {
    if (filter === 'all') return rows
    return rows.filter((r) => r._sensor === filter)
  }, [rows, filter])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length }
    for (const r of rows) c[r._sensor] = (c[r._sensor] ?? 0) + 1
    return c
  }, [rows])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-text-secondary">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  const memoryDir = '~/.hman/memory'
  const availableFilters: Filter[] = ['all', ...status.map((s) => s.name as Filter)]

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-text-primary flex items-center gap-3">
            <Folder className="w-7 h-7 text-blue-400" /> Memory
          </h1>
          <p className="text-text-secondary mt-1">
            Everything the subconscious has captured. Last 6 hours across all sensors.
          </p>
        </div>
        <button
          onClick={refresh}
          className="p-2 rounded-lg border border-border hover:bg-background-secondary text-text-secondary"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/50 bg-red-900/20 p-3 flex items-start gap-3">
          <AlertTriangle className="text-red-400 shrink-0" />
          <p className="text-sm text-red-200">{error}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {availableFilters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-background-secondary border border-border text-text-secondary hover:text-text-primary'
            }`}
          >
            {f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)}
            <span className="ml-2 text-xs opacity-70">{counts[f] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-background-secondary">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-text-secondary">
            <p className="text-sm">
              Nothing captured yet in this window. Start sensors from{' '}
              <a href="/app" className="text-blue-400 hover:underline">
                Subconscious
              </a>
              .
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((row, i) => {
              const Icon = SENSOR_ICONS[row._sensor] ?? Ear
              return (
                <li key={i} className="px-5 py-3 flex gap-3">
                  <Icon className="w-4 h-4 text-text-secondary shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-text-secondary mb-1">
                      <span className="uppercase tracking-wider">{row._sensor}</span>
                      <span>·</span>
                      <span>{formatRelative(String(row.ts))}</span>
                    </div>
                    {renderBody(row)}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-text-secondary font-mono">{memoryDir}</p>
    </div>
  )
}
