import React from 'react'

function pointsFor(data, width, height, pad = 14) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  return data.map((value, index) => ({
    x: pad + (index / Math.max(data.length - 1, 1)) * (width - pad * 2),
    y: height - pad - ((value - min) / span) * (height - pad * 2),
    value,
  }))
}

function smoothPath(points) {
  if (points.length < 2) return ''
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`
    const previous = points[index - 1]
    const before = points[index - 2] || previous
    const after = points[index + 1] || point
    const firstControlX = previous.x + (point.x - before.x) / 6
    const firstControlY = previous.y + (point.y - before.y) / 6
    const secondControlX = point.x - (after.x - previous.x) / 6
    const secondControlY = point.y - (after.y - previous.y) / 6
    return `${path} C ${firstControlX} ${firstControlY}, ${secondControlX} ${secondControlY}, ${point.x} ${point.y}`
  }, '')
}

export function LineChart({ data, color = 'var(--blue)', fill = true, height = 210, dashed, labels = [] }) {
  const width = 700
  const pts = pointsFor(data, width, height, 18)
  const line = pts.map((p) => `${p.x},${p.y}`).join(' ')
  const area = `18,${height - 18} ${line} ${width - 18},${height - 18}`
  return (
    <div className="chart-wrap" style={{ '--chart-h': `${height}px` }}>
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Performance line chart">
        {[.2, .5, .8].map((n) => <line key={n} x1="18" y1={height * n} x2={width - 18} y2={height * n} className="grid-line" />)}
        {dashed && <line x1="18" y1={height * .58} x2={width - 18} y2={height * .58} className="dash-line" />}
        {fill && <polygon points={area} fill={color} opacity=".11" />}
        <polyline points={line} fill="none" stroke={color} strokeWidth="2.3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      {labels.length > 0 && <div className="chart-labels">{labels.map((l) => <span key={l}>{l}</span>)}</div>}
    </div>
  )
}
export function BarChart({ values, height = 210, allBlue = false }) {
  const max = Math.max(...values.map(Math.abs))
  return (
    <div className="bar-chart" style={{ height }}>
      <div className="bar-zero" />
      {values.map((value, i) => {
        const size = Math.max(3, Math.abs(value) / max * 46)
        return <span key={i} className={`bar ${value >= 0 || allBlue ? 'up' : 'down'}`} style={{ height: `${size}%` }} />
      })}
    </div>
  )
}

function donutArc(startAngle, endAngle, outer, inner, center) {
  const point = (radius, angle) => [
    center + radius * Math.cos((angle - 90) * Math.PI / 180),
    center + radius * Math.sin((angle - 90) * Math.PI / 180),
  ]
  const large = endAngle - startAngle > 180 ? 1 : 0
  const [x1, y1] = point(outer, startAngle)
  const [x2, y2] = point(outer, endAngle)
  const [x3, y3] = point(inner, endAngle)
  const [x4, y4] = point(inner, startAngle)
  return `M ${x1} ${y1} A ${outer} ${outer} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4} Z`
}
