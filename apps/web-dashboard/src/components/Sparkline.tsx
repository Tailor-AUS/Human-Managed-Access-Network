// Scrolling ECG-style trace. Accepts an array of values in 0..1 and
// renders a line from left (oldest) to right (newest). Designed to be
// fed a ring buffer updated every ~500ms.

interface SparklineProps {
  values: number[]        // newest last, each in 0..1
  width?: number
  height?: number
  color?: string          // line colour
  running?: boolean       // draw a dimmed baseline when false
  showScale?: boolean     // show 0/1 scale gridlines
  className?: string
}

export function Sparkline({
  values,
  width = 300,
  height = 56,
  color = '#22c55e',
  running = true,
  showScale = true,
  className,
}: SparklineProps) {
  const maxPoints = 60
  const padded: number[] =
    values.length >= maxPoints
      ? values.slice(values.length - maxPoints)
      : [...Array(maxPoints - values.length).fill(0), ...values]

  const stepX = width / (maxPoints - 1)
  const y = (v: number) => height - 2 - Math.max(0, Math.min(1, v)) * (height - 4)

  // Build the path
  let d = `M 0 ${y(padded[0])}`
  for (let i = 1; i < padded.length; i++) {
    d += ` L ${i * stepX} ${y(padded[i])}`
  }

  // Area under the curve (for a gentle fill)
  const area =
    d +
    ` L ${(padded.length - 1) * stepX} ${height} L 0 ${height} Z`

  const currentV = padded[padded.length - 1] ?? 0
  const lineColor = running ? color : '#4b5563'
  const fillColor = running ? color : '#4b5563'

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
    >
      {showScale && (
        <>
          {/* Mid gridline */}
          <line
            x1={0}
            x2={width}
            y1={height / 2}
            y2={height / 2}
            stroke="#374151"
            strokeDasharray="2 4"
            strokeWidth={1}
          />
        </>
      )}
      {/* Area fill */}
      <path d={area} fill={fillColor} opacity={running ? 0.12 : 0.04} />
      {/* Line */}
      <path
        d={d}
        fill="none"
        stroke={lineColor}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* "Now" marker dot */}
      {running && (
        <circle
          cx={(padded.length - 1) * stepX}
          cy={y(currentV)}
          r={3}
          fill={color}
        >
          <animate
            attributeName="r"
            values="3;5;3"
            dur="1.2s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="1;0.6;1"
            dur="1.2s"
            repeatCount="indefinite"
          />
        </circle>
      )}
    </svg>
  )
}
