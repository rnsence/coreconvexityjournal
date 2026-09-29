/**
 * Small line visuals for metric-strip cells: one minimal mark per figure, drawn in once.
 * Shared by the calendar's month summary and the dashboard.
 */
import React, { useId } from 'react'
import { useSize } from '../viz'

const W = 148, H = 16
export const POS = '#22c47d', NEG = '#f5615a', IDLE = '#e4e7ec'
const box = { className: 'sv', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' }

export const LINE_POS = '#74e960', LINE_NEG = '#f5615a', LINE_REST = '#ebeaf1'

/** Smooth path through points (Catmull-Rom as cubic Béziers), clamped to the plot so small charts never clip. */
export function curvePath(points, top, bottom) {
  const clamp = (v) => Math.max(top, Math.min(bottom, v))
  return points.map((p, i) => {
    if (!i) return `M${p[0].toFixed(1)},${p[1].toFixed(1)}`
    const p0 = points[i - 2] ?? points[i - 1], p1 = points[i - 1], p3 = points[i + 1] ?? p
    const c1 = [p1[0] + (p[0] - p0[0]) / 6, clamp(p1[1] + (p[1] - p0[1]) / 6)]
    const c2 = [p[0] - (p3[0] - p1[0]) / 6, clamp(p[1] - (p3[1] - p1[1]) / 6)]
    return `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p[0].toFixed(1)},${p[1].toFixed(1)}`
  }).join('')
}

/**
 * The app's line chart: a smooth 3px line drawn at real pixel size, a ringed marker with a soft halo on the
 * current point, and an optional light remainder after it (what came next). Fills its container.
 */
/** Average into at most `count` buckets so a long series draws as a calm wave; the first and last values are kept exact. */
export function resample(values, count) {
  if (values.length <= count || count < 3) return values
  const out = [values[0]]
  const inner = count - 2, span = (values.length - 2) / inner
  for (let k = 0; k < inner; k += 1) {
    const from = 1 + Math.floor(k * span), to = Math.max(from + 1, 1 + Math.floor((k + 1) * span))
    const slice = values.slice(from, to)
    out.push(slice.reduce((sum, v) => sum + v, 0) / slice.length)
  }
  out.push(values.at(-1))
  return out
}

export function RefLine({ values: raw, rest: rawRest = [], tone = 'pos', label, density = 16, plain = false }) {
  const [ref, size] = useSize()
  const id = useId().replace(/:/g, '')
  const W = size.width || 160, H = size.height || 36
  const room = Math.max(4, Math.round(W / density))
  const restShare = rawRest.length / (raw.length + rawRest.length)
  const values = resample(raw, Math.max(3, Math.round(room * (1 - restShare))))
  const rest = rawRest.length ? resample(rawRest, Math.max(2, Math.round(room * restShare))) : []
  const all = [...values, ...rest]
  const color = tone === 'neg' ? LINE_NEG : LINE_POS
  const lo = Math.min(...all), hi = Math.max(...all)
  const ring = 6, pad = plain ? 3 : ring + 3
  const right = rest.length || plain ? 0 : pad + 6
  const x = (i) => (i / Math.max(1, all.length - 1)) * (W - right)
  const y = (v) => pad + (1 - (v - lo) / ((hi - lo) || 1)) * (H - pad * 2)
  const pts = all.map((v, i) => [x(i), y(v)])
  const m = values.length - 1
  const past = curvePath(pts.slice(0, m + 1), pad, H - pad)
  const after = rest.length ? curvePath(pts.slice(m), pad, H - pad) : null
  return <div className="rl" ref={ref} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    {size.width > 0 && all.length > 1 && <svg width={W} height={H}>
      <defs>
        <radialGradient id={`${id}-halo`}><stop offset="0" stopColor={color} stopOpacity=".42"/><stop offset=".55" stopColor={color} stopOpacity=".16"/><stop offset="1" stopColor={color} stopOpacity="0"/></radialGradient>
      </defs>
      {after && <path d={after} className="rl-rest" stroke={LINE_REST}/>}
      <path d={past} className={`rl-line${plain ? ' is-plain' : ''}`} stroke={color} pathLength="1"/>
      {!plain && <circle cx={pts[m][0]} cy={pts[m][1]} r={ring * 2.6} fill={`url(#${id}-halo)`} className="rl-halo"/>}
      {!plain && <circle cx={pts[m][0]} cy={pts[m][1]} r={ring - 1.5} className="rl-dot" stroke={color}/>}
    </svg>}
  </div>
}

export const AREA_POS = '#32d583', AREA_NEG = '#f97066'

/** Price-card sparkline: a lively 2.5px line over a fill that fades to nothing, drawn at real pixel size. */
export function AreaLine({ values: raw, tone = 'pos', density = 7 }) {
  const [ref, size] = useSize()
  const id = useId().replace(/:/g, '')
  const W = size.width || 140, H = size.height || 44
  const values = resample(raw, Math.max(6, Math.round(W / density)))
  const color = tone === 'neg' ? AREA_NEG : AREA_POS
  const lo = Math.min(...values), hi = Math.max(...values)
  const top = 3, bottom = H
  const x = (i) => (i / Math.max(1, values.length - 1)) * W
  const y = (v) => top + (1 - (v - lo) / ((hi - lo) || 1)) * (H - top - 8)
  const pts = values.map((v, i) => [x(i), y(v)])
  const line = curvePath(pts, top, H - 8)
  return <div className="al" ref={ref} aria-hidden="true">
    {size.width > 0 && values.length > 1 && <svg width={W} height={H}>
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".34"/><stop offset=".6" stopColor={color} stopOpacity=".1"/><stop offset="1" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={`${line}L${W},${bottom}L0,${bottom}Z`} fill={`url(#${id}-fill)`} className="al-fill"/>
      <path d={line} className="al-line" stroke={color} pathLength="1"/>
    </svg>}
  </div>
}

/** Running total by day, in the app's line style, marked where it ends. */
export function Spark({ values, plain = false }) {
  const run = values.reduce((acc, value) => [...acc, (acc.at(-1) ?? 0) + value], [0])
  return <RefLine values={run} tone={run.at(-1) >= 0 ? 'pos' : 'neg'} plain={plain}/>
}

/** A filled track with a tick at the 50% line. */
export function Meter({ share }) {
  const value = Math.max(0, Math.min(1, share)), y = H / 2 - 3
  return <svg {...box}>
    <rect x="0" y={y} width={W} height="6" rx="3" fill={IDLE}/>
    <rect className="sv-grow-x" x="0" y={y} width={Math.max(4, W * value)} height="6" rx="3" fill={value >= 0.5 ? POS : NEG}/>
    <rect x={W / 2 - 1} y={y - 3} width="2" height="12" rx="1" fill="rgba(16,24,40,.3)"/>
  </svg>
}

/** Money won against money lost as one split bar. */
export function Split({ won, lost }) {
  const total = (won + lost) || 1, gap = 3, wW = Math.max(4, (won / total) * (W - gap)), y = H / 2 - 3
  return <svg {...box}>
    <rect className="sv-grow-x" x="0" y={y} width={wW} height="6" rx="3" fill={POS}/>
    <rect className="sv-grow-x" x={wW + gap} y={y} width={Math.max(4, W - wW - gap)} height="6" rx="3" fill={NEG}/>
  </svg>
}

/** A track filled from the middle: right for positive, left for negative. */
export function Centered({ share }) {
  const value = Math.max(-1, Math.min(1, share)), y = H / 2 - 3, half = W / 2, len = Math.max(3, Math.abs(value) * half)
  return <svg {...box}>
    <rect x="0" y={y} width={W} height="6" rx="3" fill={IDLE}/>
    <rect className="sv-grow-x" x={value >= 0 ? half : half - len} y={y} width={len} height="6" rx="3" fill={value >= 0 ? POS : NEG}/>
    <rect x={half - 1} y={y - 3} width="2" height="12" rx="1" fill="rgba(16,24,40,.3)"/>
  </svg>
}

/** A plain filled track in one colour. */
export function Fill({ share, color }) {
  const y = H / 2 - 3
  return <svg {...box}>
    <rect x="0" y={y} width={W} height="6" rx="3" fill={IDLE}/>
    <rect className="sv-grow-x" x="0" y={y} width={Math.max(4, Math.max(0, Math.min(1, share)) * W)} height="6" rx="3" fill={color}/>
  </svg>
}

/** One short dash per trading day, green when the day finished up. */
export function Dashes({ values }) {
  const gap = 3, w = (W - gap * (values.length - 1)) / Math.max(1, values.length), y = H / 2 - 3
  return <svg {...box}>
    {values.map((value, index) => <rect key={index} className="sv-dot" style={{ '--i': index }} x={index * (w + gap)} y={y} width={w} height="6" rx="3" fill={value > 0 ? POS : value < 0 ? NEG : IDLE}/>)}
  </svg>
}
