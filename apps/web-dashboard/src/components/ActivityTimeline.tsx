// Swimlane showing which app was active over a time window.
// Segments are colored per app; width is time spent. Reads from a
// transition log that the parent accumulates on each poll.

export interface AppSegment {
  app: string
  startMs: number  // absolute ms (Date.now() space)
  endMs: number    // exclusive; Date.now() if still active
}

interface ActivityTimelineProps {
  segments: AppSegment[]
  windowMs: number            // how many ms to show
  height?: number
  className?: string
}

// Stable-ish color assignment by hashing the app name
function colorFor(app: string): string {
  const palette = [
    '#60a5fa', // blue
    '#22c55e', // green
    '#a855f7', // purple
    '#f59e0b', // amber
    '#ef4444', // red
    '#06b6d4', // cyan
    '#ec4899', // pink
    '#10b981', // emerald
    '#f97316', // orange
    '#8b5cf6', // violet
  ]
  let h = 0
  for (let i = 0; i < app.length; i++) h = (h * 31 + app.charCodeAt(i)) | 0
  return palette[Math.abs(h) % palette.length]
}

export function ActivityTimeline({
  segments,
  windowMs,
  height = 36,
  className,
}: ActivityTimelineProps) {
  const now = Date.now()
  const start = now - windowMs

  // Clip segments to the visible window
  const visible = segments
    .map((s) => ({
      app: s.app,
      startMs: Math.max(s.startMs, start),
      endMs: Math.min(s.endMs, now),
    }))
    .filter((s) => s.endMs > s.startMs)

  // Aggregate totals by app for the legend (biggest first)
  const totals: Record<string, number> = {}
  for (const s of visible) {
    totals[s.app] = (totals[s.app] ?? 0) + (s.endMs - s.startMs)
  }
  const legend = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  return (
    <div className={className}>
      <svg
        viewBox="0 0 100 10"
        preserveAspectRatio="none"
        width="100%"
        height={height}
        className="rounded bg-background/40"
      >
        {visible.length === 0 ? (
          <rect x={0} y={0} width={100} height={10} fill="#1f2937" />
        ) : (
          visible.map((s, i) => {
            const xPct = ((s.startMs - start) / windowMs) * 100
            const wPct = ((s.endMs - s.startMs) / windowMs) * 100
            return (
              <rect
                key={i}
                x={xPct}
                y={0}
                width={Math.max(wPct, 0.15)}
                height={10}
                fill={colorFor(s.app)}
              >
                <title>
                  {s.app} — {Math.round((s.endMs - s.startMs) / 1000)}s
                </title>
              </rect>
            )
          })
        )}
        {/* "Now" marker */}
        <line x1={100} x2={100} y1={0} y2={10} stroke="#f3f4f6" strokeWidth={0.3} />
      </svg>
      {legend.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-secondary">
          {legend.map(([app, ms]) => (
            <span key={app} className="inline-flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-sm inline-block"
                style={{ backgroundColor: colorFor(app) }}
              />
              <span className="text-text-primary">{app}</span>
              <span>{Math.round(ms / 1000)}s</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
