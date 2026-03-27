interface Props {
  data: number[]
  width?: number
  height?: number
  positive?: boolean
  animated?: boolean
}

export default function SparkLine({ data, width = 72, height = 28, positive, animated = true }: Props) {
  if (!data || data.length < 2) return <span style={{ color: 'var(--t4)', fontSize: 9 }}>—</span>

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const last  = data[data.length - 1]
  const first = data[0]
  const up    = positive !== undefined ? positive : last >= first
  const color = up ? 'var(--green-matrix)' : 'var(--t-red)'
  const fill  = up ? 'rgba(0,255,65,0.10)' : 'rgba(255,59,59,0.10)'

  // Build area polygon
  const areaPoints = [
    `0,${height}`,
    ...pts,
    `${width},${height}`,
  ].join(' ')

  const lineId = `spk-${Math.random().toString(36).slice(2, 7)}`

  return (
    <svg
      className="sparkline-svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ overflow: 'visible' }}
    >
      <defs>
        {animated && (
          <clipPath id={lineId}>
            <rect x="0" y="0" width="0" height={height}>
              <animate attributeName="width" from="0" to={width} dur="0.8s" fill="freeze" />
            </rect>
          </clipPath>
        )}
      </defs>

      {/* Area fill */}
      <polygon points={areaPoints} fill={fill} clipPath={animated ? `url(#${lineId})` : undefined} />

      {/* Line */}
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.2"
        strokeLinejoin="round"
        strokeLinecap="round"
        clipPath={animated ? `url(#${lineId})` : undefined}
      />

      {/* End dot */}
      <circle
        cx={parseFloat(pts[pts.length - 1].split(',')[0])}
        cy={parseFloat(pts[pts.length - 1].split(',')[1])}
        r="2"
        fill={color}
        style={{ filter: `drop-shadow(0 0 3px ${color})` }}
      />
    </svg>
  )
}
