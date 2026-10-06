/**
 * Shared visualization kit: formatters, plot chrome, tooltips and the chart
 * primitives the dashboard is built from. Every chart resolves its geometry from
 * the measured container so plot areas line up across neighbouring modules.
 */
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

import { symbolClassSlug, symbolMark } from './symbols'

// Title Case for headings: small joining words stay lower (except first/last); words that already carry capitals,
// digits or symbols (P&L, A+, 50K, NQ) are left exactly as written. Non-strings pass through untouched.
const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'or', 'per', 'the', 'to', 'vs', 'via', 'with'])
export function titleCase(text) {
  if (typeof text !== 'string') return text
  const words = text.split(' ')
  return words.map((word, index) => {
    if (!word || /[A-Z].*[A-Z]|[0-9&+·×−/]/.test(word) || /[A-Z]/.test(word.slice(1))) return word
    const lower = word.toLowerCase()
    if (index > 0 && index < words.length - 1 && SMALL_WORDS.has(lower)) return lower
    return word.replace(/(^|-)([a-z])/g, (_, dash, letter) => dash + letter.toUpperCase())
  }).join(' ')
}

/* ------------------------------------------------------------------ format */

export const money = (value, options = {}) => {
  const { privacy = false, sign = true, decimals = 2 } = typeof options === 'boolean' ? { privacy: options } : options
  if (privacy) return '••••••'
  if (value == null || Number.isNaN(value)) return '—'
  const prefix = sign ? (value > 0 ? '+' : value < 0 ? '−' : '') : value < 0 ? '−' : ''
  return `${prefix}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

export const compactMoney = (value, options = {}) => {
  const { privacy = false } = typeof options === 'boolean' ? { privacy: options } : options
  if (privacy) return '••••'
  if (value == null || Number.isNaN(value)) return '—'
  const abs = Math.abs(value)
  const sign = value < 0 ? '−' : ''
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`
  return `${sign}$${Math.round(abs)}`
}

export const percent = (value, options = {}) => {
  const { decimals = 1, privacy = false } = typeof options === 'boolean' ? { privacy: options } : options
  if (privacy) return '••••'
  if (value == null || Number.isNaN(value)) return '—'
  return `${value.toFixed(decimals)}%`
}

export const ratio = (value, { decimals = 2 } = {}) =>
  value == null || Number.isNaN(value) ? '—' : value.toFixed(decimals)

export const shortDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export const longDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export const toneOf = (value) => (value > 0 ? 'pos' : value < 0 ? 'neg' : 'flat')

/** Axis ticks on 1 / 2 / 2.5 / 5 steps so labels stay round and readable. */
export function niceTicks(min, max, count = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    const base = Number.isFinite(max) ? max : 0
    return [base]
  }
  const raw = (max - min) / count
  const magnitude = 10 ** Math.floor(Math.log10(Math.abs(raw) || 1))
  const normalized = raw / magnitude
  const step = (normalized > 5 ? 10 : normalized > 2.5 ? 5 : normalized > 2 ? 2.5 : normalized > 1 ? 2 : 1) * magnitude
  const first = Math.ceil(min / step) * step
  const ticks = []
  for (let value = first; value <= max + step * 0.001; value += step) ticks.push(Math.round(value * 1e6) / 1e6)
  return ticks
}

function curvePath(points) {
  if (!points.length) return ''
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index]
    const midpoint = (previous.x + point.x) / 2
    return `${path} C ${midpoint.toFixed(2)} ${previous.y.toFixed(2)}, ${midpoint.toFixed(2)} ${point.y.toFixed(2)}, ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
  }, `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`)
}

/* ------------------------------------------------------------------ layout */

export function useSize() {
  const ref = useRef(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return undefined
    const measure = () => setSize({ width: node.clientWidth, height: node.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return [ref, size]
}

/** Module shell: compact head, optional meta/actions, and the three data states. */
export function Module({ title, meta, actions, state = 'ready', minData, children, className = '', foot }) {
  return <section className={`module ${className}`}>
    {(title || actions) && <header className="module-head">
      <div className="module-label">
        {title && <h2>{titleCase(title)}</h2>}
        {meta && <span className="module-meta">{meta}</span>}
      </div>
      {actions && <div className="module-actions">{actions}</div>}
    </header>}
    {state === 'ready'
      ? children
      : <ChartState state={state} minData={minData} />}
    {state === 'ready' && foot}
  </section>
}

export function ChartState({ state, minData, detail }) {
  const copy = {
    loading: { title: 'Loading', detail: 'Reading closed trades…' },
    empty: { title: 'No trades in range', detail: 'Widen the date range or clear filters to see activity.' },
    insufficient: { title: 'Not enough data', detail: `Needs at least ${minData ?? 5} closed trades before this is meaningful.` },
  }[state] || {}
  return <div className={`chart-state ${state}`}>
    {state === 'loading'
      ? <div className="state-skeleton"><i /><i /><i /></div>
      : <div className="state-mark" aria-hidden="true" />}
    <b>{copy.title}</b>
    <span>{detail ?? copy.detail}</span>
  </div>
}

/* ----------------------------------------------------------------- tooltip */

/**
 * Chart tooltip. Sits centred directly above the hovered mark; if that would cross
 * the top edge it drops below the mark, and if it would cross the right or left
 * edge it anchors to that side of the mark instead of centring.
 */
export function Tooltip({ point, width, children, gap = 12 }) {
  const ref = useRef(null)
  const [box, setBox] = useState({ w: 0, h: 0, room: 0 })
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    // Room above the plot that still sits inside the card (its title row), so the
    // tooltip only flips when it would actually leave the card.
    const host = node.offsetParent
    // measured to the nearest box that can clip it: a card's white body when it has one, else the card
    // stat tiles let tooltips spill over their own head, so they measure to the tile itself
    const card = host?.closest('.stat-tile') ?? host?.closest('.shell-body, .home-card, .module, .card, .compare-card, .win-card')
    const room = host && card ? Math.max(0, host.getBoundingClientRect().top - card.getBoundingClientRect().top - 6) : 0
    const next = { w: node.offsetWidth, h: node.offsetHeight, room }
    setBox((current) => (current.w === next.w && current.h === next.h && current.room === next.room ? current : next))
  })
  if (!point) return null
  const w = box.w || 170
  const h = box.h || 90
  const limit = width || Infinity
  let top = point.y - h - gap
  let vertical = 'above'
  if (top < -box.room) { top = point.y + gap; vertical = 'below' }
  let left = point.x - w / 2
  let horizontal = 'center'
  if (left + w > limit) { left = point.x - w; horizontal = 'end' }
  if (left < 0) { left = point.x; horizontal = 'start' }
  left = Math.max(0, Math.min(left, limit - w))
  return <div
    ref={ref}
    className={`viz-tip is-${vertical} is-${horizontal}`}
    style={{ left, top, visibility: box.w ? 'visible' : 'hidden' }}
  >
    {children}
  </div>
}

export function TipRows({ rows }) {
  return <dl className="tip-rows">
    {rows.map((row) => <React.Fragment key={row.label}>
      <dt>{row.label}</dt>
      <dd className={row.tone ? `tone-${row.tone}` : undefined}>{row.value}</dd>
    </React.Fragment>)}
  </dl>
}

/* ------------------------------------------------------------ equity curve */

/**
 * Primary chart: cumulative P&L with a synchronised underwater subplot.
 * Neutral stroke by default; the line turns red only while equity is below its
 * starting point, and the drawdown pane is the only other red surface.
 */
export function EquityPlot({ series, height = 300, drawdownHeight = 72, privacy = false }) {
  const [ref, size] = useSize()
  const [active, setActive] = useState(null)
  const padding = { top: 14, right: 66, bottom: 20, left: 0 }
  const width = size.width || 960
  const plotWidth = Math.max(40, width - padding.left - padding.right)
  const plotHeight = Math.max(60, height - padding.top - padding.bottom)

  const values = series.map((point) => point.cumulative)
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const span = max - min || 1
  const xAt = (index) => padding.left + (series.length === 1 ? plotWidth / 2 : (index / (series.length - 1)) * plotWidth)
  const yAt = (value) => padding.top + (1 - (value - min) / span) * plotHeight
  const ticks = niceTicks(min, max, 4)

  const line = curvePath(series.map((point, index) => ({ x: xAt(index), y: yAt(point.cumulative) })))
  const trendValues = values.map((_, index) => {
    const from = Math.max(0, index - 2)
    const to = Math.min(values.length, index + 3)
    const window = values.slice(from, to)
    return window.reduce((total, value) => total + value, 0) / Math.max(1, window.length)
  })
  const trendLine = curvePath(trendValues.map((value, index) => ({ x: xAt(index), y: yAt(value) })))

  // drawdown pane
  const ddTop = height + 6
  const ddValues = series.map((point) => point.drawdown)
  const ddMin = Math.min(-1, ...ddValues)
  const ddY = (value) => ddTop + (value / ddMin) * (drawdownHeight - 16)
  const ddLine = curvePath(series.map((point, index) => ({ x: xAt(index), y: ddY(point.drawdown) })))
  const worstIndex = ddValues.indexOf(Math.min(...ddValues))

  const labelEvery = Math.max(1, Math.ceil(series.length / Math.max(3, Math.floor(plotWidth / 120))))
  const last = series[series.length - 1]

  const track = useCallback((event) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const ratioX = Math.max(0, Math.min(1, (event.clientX - bounds.left - padding.left) / plotWidth))
    setActive(Math.round(ratioX * (series.length - 1)))
  }, [plotWidth, series.length])

  const point = active == null ? null : series[active]
  const totalHeight = height + drawdownHeight + 8

  return <div className="equity-plot" ref={ref} style={{ height: totalHeight }}>
    <svg
      width={width} height={totalHeight} role="img"
      aria-label="Cumulative net profit and loss with drawdown"
      onPointerMove={track}
      onPointerLeave={() => setActive(null)}
    >
      {ticks.map((tick) => <g key={tick}>
        <line className="viz-grid" x1={padding.left} y1={yAt(tick)} x2={padding.left + plotWidth} y2={yAt(tick)} />
        {Math.abs(yAt(tick) - yAt(last?.cumulative ?? tick)) > 13 &&
          <text className="viz-axis" x={padding.left + plotWidth + 10} y={yAt(tick) + 3.5}>{compactMoney(tick, { privacy })}</text>}
      </g>)}
      <line className="viz-zero" x1={padding.left} y1={yAt(0)} x2={padding.left + plotWidth} y2={yAt(0)} />

      {trendLine && <path className="equity-trend-line" d={trendLine} vectorEffect="non-scaling-stroke" />}
      {line && <path className="equity-line" d={line} vectorEffect="non-scaling-stroke" />}
      {series.length === 1 && <circle className="equity-point" cx={xAt(0)} cy={yAt(series[0].cumulative)} r="3.5" />}

      {last && <>
        <circle className="equity-head" cx={xAt(series.length - 1)} cy={yAt(last.cumulative)} r="3" />
        <g transform={`translate(${padding.left + plotWidth + 6}, ${Math.max(padding.top + 9, Math.min(padding.top + plotHeight - 9, yAt(last.cumulative)))})`}>
          <rect className="equity-pill" x="0" y="-9" width={padding.right - 10} height="18" rx="4" />
          <text className="equity-pill-label" x={(padding.right - 10) / 2} y="3.5">{compactMoney(last.cumulative, { privacy })}</text>
        </g>
      </>}

      {ddLine && <>
        <line className="viz-zero" x1={padding.left} y1={ddTop} x2={padding.left + plotWidth} y2={ddTop} />
        <path className="drawdown-series" d={ddLine} vectorEffect="non-scaling-stroke" />
        {worstIndex >= 0 && <>
          <line className="drawdown-marker" x1={xAt(worstIndex)} y1={ddTop} x2={xAt(worstIndex)} y2={ddY(ddValues[worstIndex])} />
          <text className="viz-axis worst" x={padding.left + plotWidth + 10} y={ddTop + drawdownHeight - 22}>
            max {compactMoney(ddValues[worstIndex], { privacy })}
          </text>
        </>}
      </>}

      {series.map((item, index) => index % labelEvery === 0 || index === series.length - 1 ? (
        <text key={item.date} className="viz-axis" x={xAt(index)} y={totalHeight - 4} textAnchor={index === 0 ? 'start' : index === series.length - 1 ? 'end' : 'middle'}>
          {shortDate(item.date)}
        </text>
      ) : null)}

      {point && <>
        <line className="viz-crosshair" x1={xAt(active)} y1={padding.top} x2={xAt(active)} y2={ddTop + drawdownHeight - 16} />
        <circle className="viz-focus" cx={xAt(active)} cy={yAt(point.cumulative)} r="4" />
      </>}
    </svg>

    <Tooltip point={point ? { x: xAt(active), y: yAt(point.cumulative) } : null} width={width}>
      {point && <>
        <div className="tip-title">{longDate(point.date)}</div>
        <TipRows rows={[
          { label: 'Cumulative', value: money(point.cumulative, { privacy }), tone: toneOf(point.cumulative) },
          { label: 'Session P&L', value: money(point.pnl, { privacy }), tone: toneOf(point.pnl) },
          { label: 'Drawdown', value: money(point.drawdown, { privacy }), tone: point.drawdown < 0 ? 'neg' : 'flat' },
          { label: 'Trades', value: `${point.trades} · ${percent(point.winRate, { decimals: 0 })} win` },
        ]} />
      </>}
    </Tooltip>
  </div>
}

/* --------------------------------------------------- diverging column plot */

/** Vertical diverging columns around a zero baseline (session hours). */
export function ColumnPlot({ data, height = 190, privacy = false, valueLabel = 'Net P&L' }) {
  const [ref, size] = useSize()
  const [active, setActive] = useState(null)
  const hatchId = useId().replace(/:/g, '')
  const width = size.width || 640
  const padding = { top: 12, right: 52, bottom: 20 }
  const plotWidth = Math.max(40, width - padding.right)
  const plotHeight = Math.max(50, height - padding.top - padding.bottom)
  const values = data.map((item) => item.pnl)
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const span = max - min || 1
  const yAt = (value) => padding.top + (1 - (value - min) / span) * plotHeight
  const band = plotWidth / Math.max(data.length, 1)
  const barWidth = Math.min(32, band * 0.42)
  const ticks = niceTicks(min, max, 3)
  const average = values.reduce((total, value) => total + value, 0) / Math.max(1, values.length)
  const selected = values.indexOf(Math.max(...values))

  return <div className="column-plot" ref={ref} style={{ height }}>
    <svg width={width} height={height} role="img" aria-label={`${valueLabel} by session hour`}>
      <defs>
        <pattern id={`${hatchId}-positive`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="7" height="7" className="bar-pattern-base" />
          <line x1="0" y1="0" x2="0" y2="7" className="bar-pattern-line" />
        </pattern>
        <pattern id={`${hatchId}-negative`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="7" height="7" className="bar-pattern-base negative" />
          <line x1="0" y1="0" x2="0" y2="7" className="bar-pattern-line negative" />
        </pattern>
      </defs>
      {ticks.map((tick) => <g key={tick}>
        <line className="viz-grid" x1="0" y1={yAt(tick)} x2={plotWidth} y2={yAt(tick)} />
        <text className="viz-axis" x={plotWidth + 8} y={yAt(tick) + 3.5}>{compactMoney(tick, { privacy })}</text>
      </g>)}
      <line className="viz-zero" x1="0" y1={yAt(0)} x2={plotWidth} y2={yAt(0)} />
      <line className="column-average" x1="0" y1={yAt(average)} x2={plotWidth} y2={yAt(average)} />
      <g className="column-average-label" transform={`translate(0 ${yAt(average) - 8})`}>
        <rect width="58" height="17" rx="4" />
        <text x="29" y="11.5" textAnchor="middle">Avg {compactMoney(average, { privacy })}</text>
      </g>
      {data.map((item, index) => {
        const x = index * band + (band - barWidth) / 2
        const top = yAt(Math.max(item.pnl, 0))
        const barHeight = Math.max(1.5, Math.abs(yAt(item.pnl) - yAt(0)))
        return <rect
          key={item.label}
          className={`viz-bar ${toneOf(item.pnl)}${selected === index ? ' selected' : ''}${active === index ? ' active' : ''}`}
          x={x} y={top} width={barWidth} height={barHeight} rx="5"
          fill={selected === index ? undefined : `url(#${hatchId}-${item.pnl < 0 ? 'negative' : 'positive'})`}
          onPointerEnter={() => setActive(index)}
          onPointerLeave={() => setActive(null)}
        />
      })}
      {data.map((item, index) => index % (band >= 46 ? 1 : data.length > 9 ? 2 : 1) === 0 ? (
        <text key={`label-${item.label}`} className="viz-axis" x={index * band + band / 2} y={height - 5} textAnchor="middle">{item.label}</text>
      ) : null)}
    </svg>
    <Tooltip point={active == null ? null : { x: active * band + band / 2, y: yAt(Math.max(data[active].pnl, 0)) }} width={width}>
      {active != null && <>
        <div className="tip-title">{data[active].label}</div>
        <TipRows rows={[
          { label: valueLabel, value: money(data[active].pnl, { privacy }), tone: toneOf(data[active].pnl) },
          { label: 'Trades', value: `${data[active].trades}` },
          { label: 'Win rate', value: percent(data[active].winRate, { decimals: 0 }) },
        ]} />
      </>}
    </Tooltip>
  </div>
}

/* ------------------------------------------------------ diverging row plot */

/** Horizontal diverging bars sharing one zero axis (setups, weekdays). */
export function RowPlot({ data, privacy = false, labelWidth = 62, valueWidth = 92 }) {
  const [active, setActive] = useState(null)
  const values = data.map((item) => item.pnl)
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const span = max - min || 1
  // Zero sits where the data puts it, so an all-positive book does not waste half the track.
  const axis = Math.max(4, Math.min(96, ((0 - min) / span) * 100))
  return <ul className="row-plot" style={{ '--label-w': `${labelWidth}px`, '--value-w': `${valueWidth}px`, '--axis': `${axis}%` }}>
    {data.map((item, index) => {
      const share = (Math.abs(item.pnl) / span) * 100
      return <li
        key={item.label}
        className={active === index ? 'active' : undefined}
        onPointerEnter={() => setActive(index)}
        onPointerLeave={() => setActive(null)}
      >
        <span className="row-label">{item.label}</span>
        <span className="row-track">
          <i className="row-axis" />
          <i
            className={`row-bar ${toneOf(item.pnl)}`}
            style={item.pnl >= 0
              ? { left: 'var(--axis)', width: `${share}%` }
              : { right: `calc(100% - var(--axis))`, width: `${share}%` }}
          />
        </span>
        <span className={`row-value tone-${toneOf(item.pnl)}`}>{money(item.pnl, { privacy, decimals: 0 })}</span>
        {active === index && <span className="row-tip">
          <span className="tip-title">{item.label}</span>
          <TipRows rows={[
            { label: 'Net P&L', value: money(item.pnl, { privacy }), tone: toneOf(item.pnl) },
            { label: 'Trades', value: `${item.trades}` },
            { label: 'Win rate', value: percent(item.winRate, { decimals: 0 }) },
            { label: 'Avg / trade', value: money(item.avgPnl, { privacy, decimals: 0 }) },
          ]} />
        </span>}
      </li>
    })}
  </ul>
}

/* ------------------------------------------------------------ bullet bars */

/** Component scores on a shared 0-100 scale with a target marker. */
export function BulletBars({ components }) {
  return <ul className="bullet-bars">
    {components.map((component) => <li key={component.key}>
      <span className="bullet-label">{component.key}</span>
      <span className="bullet-track">
        <i className="bullet-fill" style={{ width: `${component.value ?? 0}%` }} />
        <i className="bullet-target" style={{ left: '100%' }} />
        <i className="bullet-mid" style={{ left: '60%' }} />
      </span>
      <span className="bullet-display">{component.display}</span>
      <span className="bullet-score">{component.value == null ? '—' : Math.round(component.value)}</span>
    </li>)}
  </ul>
}

/* ----------------------------------------------------------- rolling plot */

/** Rolling win rate with a 50% benchmark and a normal-range band. */
export function RollingPlot({ points, window = 20, height = 188 }) {
  const [ref, size] = useSize()
  const [active, setActive] = useState(null)
  const width = size.width || 640
  const padding = { top: 12, right: 46, bottom: 20 }
  const plotWidth = Math.max(40, width - padding.right)
  const plotHeight = Math.max(50, height - padding.top - padding.bottom)
  const values = points.map((point) => point.value)
  const min = Math.max(0, Math.floor((Math.min(50, ...values) - 6) / 5) * 5)
  const max = Math.min(100, Math.ceil((Math.max(50, ...values) + 6) / 5) * 5)
  const span = max - min || 1
  const xAt = (index) => (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth)
  const yAt = (value) => padding.top + (1 - (value - min) / span) * plotHeight
  const line = curvePath(points.map((point, index) => ({ x: xAt(index), y: yAt(point.value) })))
  const ticks = niceTicks(min, max, 3)
  const last = points[points.length - 1]

  const track = useCallback((event) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const ratioX = Math.max(0, Math.min(1, (event.clientX - bounds.left) / plotWidth))
    setActive(Math.round(ratioX * (points.length - 1)))
  }, [plotWidth, points.length])

  const point = active == null ? null : points[active]
  return <div className="rolling-plot" ref={ref} style={{ height }}>
    <svg width={width} height={height} role="img" aria-label={`Rolling ${window}-trade win rate`} onPointerMove={track} onPointerLeave={() => setActive(null)}>
      <rect className="rolling-band" x="0" y={yAt(60)} width={plotWidth} height={Math.max(0, yAt(45) - yAt(60))} />
      {ticks.map((tick) => <g key={tick}>
        <line className="viz-grid" x1="0" y1={yAt(tick)} x2={plotWidth} y2={yAt(tick)} />
        <text className="viz-axis" x={plotWidth + 8} y={yAt(tick) + 3.5}>{tick}%</text>
      </g>)}
      <line className="rolling-benchmark" x1="0" y1={yAt(50)} x2={plotWidth} y2={yAt(50)} />
      <path className="rolling-series" d={line} vectorEffect="non-scaling-stroke" />
      {last && <circle className="equity-head" cx={xAt(points.length - 1)} cy={yAt(last.value)} r="3" />}
      {point && <>
        <line className="viz-crosshair" x1={xAt(active)} y1={padding.top} x2={xAt(active)} y2={padding.top + plotHeight} />
        <circle className="viz-focus" cx={xAt(active)} cy={yAt(point.value)} r="4" />
      </>}
      {points.length > 1 && <>
        <text className="viz-axis" x="0" y={height - 5}>{shortDate(points[0].to)}</text>
        <text className="viz-axis" x={plotWidth} y={height - 5} textAnchor="end">{shortDate(points[points.length - 1].to)}</text>
      </>}
    </svg>
    <Tooltip point={point ? { x: xAt(active), y: yAt(point.value) } : null} width={width}>
      {point && <>
        <div className="tip-title">Trades {point.sequence - window + 1}–{point.sequence}</div>
        <TipRows rows={[
          { label: 'Win rate', value: percent(point.value, { decimals: 1 }), tone: point.value >= 50 ? 'pos' : 'neg' },
          { label: 'Window', value: `${shortDate(point.from)} – ${shortDate(point.to)}` },
          { label: 'Sample', value: `${window} trades` },
        ]} />
      </>}
    </Tooltip>
  </div>
}

/* -------------------------------------------------------- calendar heatmap */

/** Month heatmap: intensity by |P&L|, P&L primary, trade count secondary. */
export function HeatCalendar({ grid, privacy = false, selected, onSelect, today }) {
  const [active, setActive] = useState(null)
  return <div className="heat-calendar">
    <div className="heat-head">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="heat-grid">
      {grid.cells.map((cell) => {
        if (cell.blank) return <i key={cell.key} className="heat-blank" />
        const pnl = cell.session?.pnl ?? 0
        const intensity = cell.session ? Math.min(1, Math.abs(pnl) / grid.peak) : 0
        const level = cell.session ? Math.max(1, Math.ceil(intensity * 4)) : 0
        return <button
          key={cell.key}
          type="button"
          className={`heat-cell${cell.session ? ` ${toneOf(pnl)} level-${level}` : ' idle'}${cell.weekend ? ' weekend' : ''}${selected === cell.date ? ' selected' : ''}${today === cell.date ? ' today' : ''}`}
          onClick={() => onSelect?.(cell.date)}
          onPointerEnter={() => setActive(cell)}
          onPointerLeave={() => setActive(null)}
        >
          <span className="heat-day">{cell.day}</span>
          {cell.session && <>
            <b className="heat-value">{compactMoney(pnl, { privacy })}</b>
            <small className="heat-count">{cell.session.trades}t</small>
          </>}
          {active?.key === cell.key && cell.session && <span className="heat-tip">
            <span className="tip-title">{longDate(cell.date)}</span>
            <TipRows rows={[
              { label: 'Net P&L', value: money(pnl, { privacy }), tone: toneOf(pnl) },
              { label: 'Trades', value: `${cell.session.trades}` },
              { label: 'Win rate', value: percent(cell.session.winRate, { decimals: 0 }) },
              { label: 'Cumulative', value: money(cell.session.cumulative, { privacy }) },
            ]} />
          </span>}
        </button>
      })}
    </div>
    <div className="heat-legend">
      <span>Loss</span>
      <i className="swatch neg level-4" /><i className="swatch neg level-2" /><i className="swatch idle" /><i className="swatch pos level-2" /><i className="swatch pos level-4" />
      <span>Profit</span>
    </div>
  </div>
}

/* ===================================================================== */
/* Home dashboard primitives                                             */
/* ===================================================================== */

/** "05 Jun,2026" — the axis date format used across the home charts. */
export const axisDate = (iso) => {
  const date = new Date(`${iso}T00:00:00Z`)
  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${day} ${month},${date.getUTCFullYear()}`
}

/** Catmull-Rom → cubic bezier, for the soft wave in the cumulative chart. */
/** Ticker mark: the instrument's logo when we have one, otherwise its lettered token. */
export function SymbolToken({ symbol }) {
  const [failed, setFailed] = useState(false)
  const src = symbolMark(symbol)
  return <span className={`jt-token c-${symbolClassSlug(symbol)}${src && !failed ? ' has-logo' : ''}`} aria-hidden="true">
    {src && !failed
      ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)}/>
      : symbol.slice(0, 2)}
  </span>
}

export function smoothPath(points) {
  if (!points.length) return ''
  if (points.length < 3) return points.map((p, i) => `${i ? 'L' : 'M'} ${p[0]} ${p[1]}`).join(' ')
  let path = `M ${points[0][0]} ${points[0][1]}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] || points[index]
    const p1 = points[index]
    const p2 = points[index + 1]
    const p3 = points[index + 2] || p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    path += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`
  }
  return path
}

/** Score meter: five muted rating bands, filled up to the score, with a precise marker. */
const SCORE_BANDS = [
  { to: 20, label: 'Weak' }, { to: 40, label: 'Below par' }, { to: 60, label: 'Inconsistent' },
  { to: 80, label: 'Developing' }, { to: 100, label: 'Strong' },
]
export const scoreBand = (value) => (SCORE_BANDS.find((band) => value <= band.to) || SCORE_BANDS[SCORE_BANDS.length - 1]).label

export function ScoreMeter({ value = 0, max = 100 }) {
  const position = Math.max(0, Math.min(100, (value / max) * 100))
  return <div className="score-meter">
    <div className="meter-track" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
      {SCORE_BANDS.map((band, index) => {
        const from = index * 20
        const fill = Math.max(0, Math.min(1, (position - from) / 20))
        return <span key={band.label} className={`meter-band band-${index}`}>
          <i style={{ width: `${fill * 100}%` }} />
        </span>
      })}
      <span className="meter-marker" style={{ left: `${position}%` }} />
    </div>
    <div className="meter-scale">{[0, 20, 40, 60, 80, 100].map((tick) => <span key={tick}>{tick}</span>)}</div>
  </div>
}

/** Cumulative P&L: smooth accent line, soft area, dotted drawdown bands. */
// Designs by RNSENCE Studio
/** Rolling window the cumulative chart uses: about an eighth of the sessions, kept between 5 and 20. */
const rollingSpan = (series) => Math.min(20, Math.max(5, Math.round(series.length / 8)))

/** The cumulative chart's headline numbers, for cards that show them outside the chart. */
export function cumeSummary(series) {
  if (!series.length) return null
  const span = rollingSpan(series), last = series[series.length - 1], from = Math.max(0, series.length - span)
  return {
    span, net: last.cumulative,
    peak: Math.max(...series.map((point) => point.cumulative - point.drawdown)),
    drawdown: Math.min(0, ...series.map((point) => point.drawdown)),
    rolling: Math.round((last.cumulative - (from > 0 ? series[from - 1].cumulative : 0)) * 100) / 100,
  }
}

/** The cumulative chart's series key, laid out in a row for under the chart. */
// A row of chips folded into one: the first in front, the rest stacked behind it; a click fans them out
// (wrapping onto more lines when the row is wider than the parent).
function ChipStack({ items, label, className = '' }) {
  const [open, setOpen] = useState(false)
  const [widths, setWidths] = useState([])
  const [room, setRoom] = useState(0)
  const mirror = useRef(null)
  const box = useRef(null)
  const sig = items.map((item) => item.key).join('|')
  useLayoutEffect(() => {
    const measure = () => { if (mirror.current) setWidths([...mirror.current.children].map((el) => el.offsetWidth)) }
    measure()
    document.fonts?.ready.then(measure)
  }, [sig, items])
  useLayoutEffect(() => {
    const parent = box.current?.parentElement
    if (!parent) return undefined
    const read = () => { const cs = getComputedStyle(parent); setRoom(parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) }
    const observer = new ResizeObserver(read)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!open) return undefined
    const key = (event) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open])
  const limit = room > 0 ? room : Infinity
  let x = 0
  let y = 0
  let widest = 0
  const offsets = widths.map((w) => {
    if (x > 0 && x + w > limit) { x = 0; y += 32 }
    const at = [x, y]
    x += w + 6
    widest = Math.max(widest, x - 6)
    return at
  })
  return <div className={`chip-stack-wrap ${className}`} ref={box}>
    <span ref={mirror} className="chip-mirror" aria-hidden="true">{items.map((item) => <span key={item.key} className="stack-chip">{item.content}</span>)}</span>
    <button type="button" className={`chip-stack${open ? ' is-open' : ''}${widths.length ? '' : ' is-measuring'}`} aria-expanded={open}
      aria-label={open ? `Collapse ${label}` : `Show ${label}: ${items.map((item) => item.key).join(', ')}`}
      style={{ '--n': items.length, '--w0': `${widths[0] ?? 0}px`, '--wopen': `${widest}px`, '--hopen': `${y + 26}px` }} onClick={() => setOpen((value) => !value)}>
      {items.map((item, i) => <span key={item.key} className="stack-chip" style={{ '--i': i, '--ox': `${offsets[i]?.[0] ?? 0}px`, '--oy': `${offsets[i]?.[1] ?? 0}px`, '--tw': `${widths[i] ?? 0}px`, zIndex: items.length - i }}><span>{item.content}</span></span>)}
    </button>
  </div>
}

// Header stats for the cumulative chart.
export function CumeChips({ items, privacy }) {
  return <ChipStack label="stats" className="cume-chips" items={items.map((item) => ({ key: item.label,
    content: <><b className="sc-label">{item.label}</b><b className={`sc-value${item.tone ? ` tone-${item.tone}` : ''}`}>{money(item.value, { privacy, decimals: 0 })}</b></> }))}/>
}

export function CumeKey({ span }) {
  return <ul className="cume-legend" aria-label="Legend">
    <li className="stack-chip"><i className="k-net"/>Net cumulative</li>
    <li className="stack-chip"><i className="k-run"/>Rolling {span}-session net</li>
    <li className="stack-chip"><i className="k-dd"/>Drawdown</li>
  </ul>
}

export function CumulativeChart({ series, height: fixedHeight = 360, fill = false, privacy = false, side = true }) {
  const [ref, size] = useSize()
  const [active, setActive] = useState(null)
  const width = size.width || 900
  // In fill mode the chart takes whatever height the card gives it.
  const height = fill ? Math.max(220, size.height || fixedHeight) : fixedHeight
  // without the side column (key and stats shown by the card instead) the plot runs the full width
  // without the side column the card shows the key and stats, and the tooltip carries dates and values, so no axis labels
  const pad = side ? { top: 18, right: 168, bottom: 54, left: 74 } : { top: 14, right: 0, bottom: 4, left: 0 }
  const plotWidth = Math.max(60, width - pad.left - pad.right)
  const plotHeight = Math.max(80, height - pad.top - pad.bottom)

  const values = series.map((point) => point.cumulative)
  const peaks = series.map((point) => point.cumulative - point.drawdown)
  const span = rollingSpan(series)
  const rolling = series.map((point, index) => {
    const from = Math.max(0, index - span + 1)
    return Math.round((point.cumulative - (from > 0 ? series[from - 1].cumulative : 0)) * 100) / 100
  })

  // drawdown: how far below the best equity so far each session closed (0 at a new high), drawn under $0
  const under = series.map((point) => Math.min(0, point.drawdown))

  const min = Math.min(0, ...values, ...rolling)
  const max = Math.max(1, ...values, ...rolling)
  // the drawdown gets its own band along the foot of the plot, on its own scale, so it never squashes
  const band = Math.round(plotHeight * .24), bandGap = 0
  const mainHeight = plotHeight - band - bandGap
  const deepest = Math.min(-1, ...under)
  const ticks = niceTicks(min, max, 7)
  const top = Math.max(max, ticks[ticks.length - 1] ?? max)
  const xAt = (index) => pad.left + (series.length === 1 ? plotWidth / 2 : (index / (series.length - 1)) * plotWidth)
  const yAt = (value) => pad.top + (1 - (value - min) / ((top - min) || 1)) * mainHeight
  const ddTop = pad.top + mainHeight + bandGap
  const yDd = (value) => ddTop + (value / deepest) * band

  const netPoints = values.map((value, index) => [xAt(index), yAt(value)])
  const line = smoothPath(netPoints)
  const area = line ? `${line} L ${xAt(series.length - 1)} ${yAt(min)} L ${xAt(0)} ${yAt(min)} Z` : ''
  const underPath = smoothPath(under.map((value, index) => [xAt(index), Math.max(ddTop, yDd(value))]))
  const underArea = underPath ? `${underPath} L ${xAt(series.length - 1)} ${ddTop} L ${xAt(0)} ${ddTop} Z` : ''
  const runPath = smoothPath(rolling.map((value, index) => [xAt(index), yAt(value)]))
  const runArea = runPath ? `${runPath} L ${xAt(series.length - 1)} ${yAt(min)} L ${xAt(0)} ${yAt(min)} Z` : ''

  const labelEvery = Math.max(1, Math.ceil(series.length / Math.max(2, Math.floor(plotWidth / 150))))
  const dateLabels = []
  for (let index = 0; index < series.length; index += labelEvery) dateLabels.push(index)
  const lastIndex = series.length - 1
  if (lastIndex > 0) {
    // the closing label always shows, so drop the one before it when they would collide
    if (dateLabels.length && lastIndex - dateLabels[dateLabels.length - 1] < labelEvery * 0.6) dateLabels.pop()
    if (dateLabels[dateLabels.length - 1] !== lastIndex) dateLabels.push(lastIndex)
  }
  const track = useCallback((event) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const ratioX = Math.max(0, Math.min(1, (event.clientX - bounds.left - pad.left) / plotWidth))
    setActive(Math.round(ratioX * (series.length - 1)))
  }, [plotWidth, series.length])
  const point = active == null ? null : series[active]

  return <div className={`cume-chart${fill ? ' fill' : ''}`} ref={ref} style={fill ? undefined : { height }}>
    {side && <div className="cume-side">
      <ul className="cume-key">
        <li><i className="k-net"/>Net cumulative</li>
        <li><i className="k-run"/>Rolling {span}-session net</li>
        <li><i className="k-dd"/>Drawdown</li>
      </ul>
      {series.length > 0 && <dl className="cume-stats">
        <div><dt>Net</dt><dd className={`tone-${toneOf(values[lastIndex])}`}>{money(values[lastIndex], { privacy, decimals: 0 })}</dd></div>
        <div><dt>Peak</dt><dd>{money(Math.max(...peaks), { privacy, decimals: 0 })}</dd></div>
        <div><dt>Max drawdown</dt><dd className="tone-neg">{money(Math.min(0, ...series.map((point) => point.drawdown)), { privacy, decimals: 0 })}</dd></div>
        <div><dt>Rolling {span}</dt><dd className={`tone-${toneOf(rolling[lastIndex])}`}>{money(rolling[lastIndex], { privacy, decimals: 0 })}</dd></div>
      </dl>}
    </div>}
    <svg width={width} height={height} role="img" aria-label="Daily net cumulative profit and loss, rolling net and drawdown" onPointerMove={track} onPointerLeave={() => setActive(null)}>
      <defs>
        <linearGradient id="cumeFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity=".7" />
          <stop offset="35%" stopColor="var(--accent)" stopOpacity=".34" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity=".02" />
        </linearGradient>
        <linearGradient id="cumeDdFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f5615a" stopOpacity=".08" />
          <stop offset="100%" stopColor="#f5615a" stopOpacity=".42" />
        </linearGradient>
        <linearGradient id="cumeRunFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1f4fc4" stopOpacity=".55" />
          <stop offset="100%" stopColor="#1f4fc4" stopOpacity=".04" />
        </linearGradient>
      </defs>

      {ticks.map((tick) => <g key={tick}>
        <line className="cume-grid" x1={pad.left} y1={yAt(tick)} x2={pad.left + plotWidth} y2={yAt(tick)} />
        {side && <text className="cume-axis" x={pad.left - 12} y={yAt(tick) + 4} textAnchor="end">{compactMoney(tick, { privacy })}</text>}
      </g>)}

      {area && <path className="cume-area" d={area} />}
      <line className="cume-dd-base" x1={pad.left} x2={pad.left + plotWidth} y1={ddTop} y2={ddTop} />
      {underArea && <path className="cume-dd-area" d={underArea} />}
      {underPath && <path className="cume-dd" d={underPath} vectorEffect="non-scaling-stroke" />}
      {runArea && <path className="cume-run-area" d={runArea} />}
      {runPath && <path className="cume-run" d={runPath} vectorEffect="non-scaling-stroke" />}
      {line && <path className="cume-line" d={line} vectorEffect="non-scaling-stroke" />}

      {side && dateLabels.map((index) => (
        <text
          key={series[index].date} className="cume-axis" y={side ? height - 28 : height - 8}
          x={side ? xAt(index) : Math.min(width - 10, Math.max(10, xAt(index)))}
          textAnchor={index === 0 ? 'start' : index === lastIndex ? 'end' : 'middle'}
        >
          {side ? axisDate(series[index].date) : shortDate(series[index].date)}
        </text>
      ))}
      {side && <text className="cume-axis-title" x={pad.left + plotWidth / 2} y={height - 8} textAnchor="middle">Session</text>}
      {side && <text className="cume-axis-title" textAnchor="middle" transform={`rotate(-90 16 ${pad.top + plotHeight / 2}) translate(0 0)`} x="16" y={pad.top + plotHeight / 2 + 4}>Cumulative P&L</text>}

      {point && <>
        <line className="cume-cross" x1={xAt(active)} y1={pad.top} x2={xAt(active)} y2={ddTop + band} />
        {under[active] < 0 && <circle className="cume-focus dd" cx={xAt(active)} cy={yDd(under[active])} r="3.5" />}
        <circle className="cume-focus run" cx={xAt(active)} cy={yAt(rolling[active])} r="4" />
        <circle className="cume-focus" cx={xAt(active)} cy={yAt(point.cumulative)} r="4.5" />
      </>}
    </svg>
    <Tooltip point={point ? { x: xAt(active), y: yAt(point.cumulative) } : null} width={width}>
      {point && <>
        <div className="tip-title">{longDate(point.date)}</div>
        <TipRows rows={[
          { label: 'Net cumulative', value: money(point.cumulative, { privacy }), tone: toneOf(point.cumulative) },
          { label: `Rolling ${span}-session`, value: money(rolling[active], { privacy, decimals: 0 }), tone: toneOf(rolling[active]) },
          { label: 'Drawdown', value: under[active] < 0 ? money(under[active], { privacy, decimals: 0 }) : 'At a high', tone: under[active] < 0 ? 'neg' : undefined },
          { label: 'Session P&L', value: money(point.pnl, { privacy }), tone: toneOf(point.pnl) },
          { label: 'Trades', value: `${point.trades}` },
        ]} />
      </>}
    </Tooltip>
  </div>
}


const minutesOf = (clock) => { const [h, m] = clock.split(':').map(Number); return h * 60 + m }

/** Intraday running net P&L, stepping at each trade exit across the session window. */
// Designs by RNSENCE Studio
/** Polyline with softly rounded corners (quadratic joins), for step lines that shouldn't look jagged. */
function roundedPath(points, radius = 4) {
  const pts = points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y)
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let index = 1; index < pts.length - 1; index += 1) {
    const prev = pts[index - 1], at = pts[index], next = pts[index + 1]
    const inLen = Math.hypot(at.x - prev.x, at.y - prev.y), outLen = Math.hypot(next.x - at.x, next.y - at.y)
    const r = Math.min(radius, inLen / 2, outLen / 2)
    const a = { x: at.x - ((at.x - prev.x) / inLen) * r, y: at.y - ((at.y - prev.y) / inLen) * r }
    const b = { x: at.x + ((next.x - at.x) / outLen) * r, y: at.y + ((next.y - at.y) / outLen) * r }
    d += ` L ${a.x} ${a.y} Q ${at.x} ${at.y} ${b.x} ${b.y}`
  }
  const last = pts[pts.length - 1]
  return `${d} L ${last.x} ${last.y}`
}

export function IntradayChart({ fills, open = '09:30', close = '16:00', height = 240, privacy = false, onSelect }) {
  const [ref, size] = useSize()
  const [active, setActive] = useState(null)
  const width = size.width || 900
  const pad = { top: 28, right: 12, bottom: 30, left: 40 }
  const plotWidth = Math.max(60, width - pad.left - pad.right)
  const plotHeight = Math.max(80, height - pad.top - pad.bottom)
  const start = minutesOf(open)
  const end = minutesOf(close)

  let running = 0
  const marks = [...fills].sort((a, b) => minutesOf(a.time) - minutesOf(b.time)).map((fill) => {
    running += fill.pnl
    return { ...fill, cumulative: running }
  })
  const values = [0, ...marks.map((mark) => mark.cumulative)]
  const ticks = niceTicks(Math.min(0, ...values), Math.max(1, ...values), 4)
  const low = Math.min(ticks[0], ...values)
  const high = Math.max(ticks[ticks.length - 1], ...values)
  const xAt = (clock) => pad.left + ((minutesOf(clock) - start) / (end - start)) * plotWidth
  const yAt = (value) => pad.top + (1 - (value - low) / ((high - low) || 1)) * plotHeight

  // the running total steps at each exit: across at the old level, then up/down to the new one
  const vertices = [{ x: xAt(open), y: yAt(0) }]
  let level = 0
  marks.forEach((mark) => {
    vertices.push({ x: xAt(mark.time), y: yAt(level) }, { x: xAt(mark.time), y: yAt(mark.cumulative) })
    level = mark.cumulative
  })
  vertices.push({ x: xAt(close), y: yAt(level) })
  const line = roundedPath(vertices, 4)
  const zeroY = yAt(0)
  const area = `${line} L ${xAt(close)} ${zeroY} L ${xAt(open)} ${zeroY} Z`

  const hours = []
  const step = plotWidth < 420 ? 120 : 60
  for (let minute = Math.ceil(start / 60) * 60; minute <= end; minute += step) hours.push(`${Math.floor(minute / 60)}:00`)
  const point = active == null ? null : marks[active]
  const phases = [
    { label: 'Open', from: '09:30', to: '10:30' },
    { label: 'Lunch', from: '12:00', to: '13:30' },
    { label: 'Close', from: '15:00', to: '16:00' },
  ]
  const top = pad.top, bottom = pad.top + plotHeight

  return <div className="cume-chart intraday-chart" ref={ref} style={{ height }}>
    <svg width={width} height={height} role="img" aria-label={`Intraday net P&L, closing at ${money(level, { privacy })}`}>
      <defs>
        <linearGradient id="intradayUp" gradientUnits="userSpaceOnUse" x1="0" y1={top} x2="0" y2={zeroY}>
          <stop offset="0" stopColor="var(--pos-mark, #22c47d)" stopOpacity=".2" />
          <stop offset="1" stopColor="var(--pos-mark, #22c47d)" stopOpacity=".02" />
        </linearGradient>
        <linearGradient id="intradayDown" gradientUnits="userSpaceOnUse" x1="0" y1={zeroY} x2="0" y2={bottom}>
          <stop offset="0" stopColor="var(--neg-mark, #f5615a)" stopOpacity=".02" />
          <stop offset="1" stopColor="var(--neg-mark, #f5615a)" stopOpacity=".18" />
        </linearGradient>
        <clipPath id="intradayAbove"><rect x={0} y={0} width={width} height={zeroY + 1.5} /></clipPath>
        <clipPath id="intradayBelow"><rect x={0} y={zeroY + 1.5} width={width} height={Math.max(0, height - zeroY - 1.5)} /></clipPath>
      </defs>
      {phases.map((phase) => <g key={phase.label} className="intraday-phase">
        <rect x={xAt(phase.from)} y={top} width={xAt(phase.to) - xAt(phase.from)} height={plotHeight} rx="6" />
        <text x={(xAt(phase.from) + xAt(phase.to)) / 2} y={top - 10} textAnchor="middle">{phase.label}</text>
      </g>)}
      {ticks.map((tick) => <g key={tick}>
        <line className={tick === 0 ? 'intraday-zero' : 'cume-grid intraday-grid'} x1={pad.left} y1={yAt(tick)} x2={pad.left + plotWidth} y2={yAt(tick)} />
        <text className="cume-axis" x={pad.left - 8} y={yAt(tick) + 4} textAnchor="end">{compactMoney(tick, { privacy })}</text>
      </g>)}
      {hours.map((hour) => { const x = xAt(hour); return <text key={hour} className="cume-axis" x={x} y={height - 8} textAnchor={x > width - 24 ? 'end' : 'middle'}>{hour}</text> })}
      <path className="intraday-area" d={area} fill="url(#intradayUp)" clipPath="url(#intradayAbove)" />
      <path className="intraday-area" d={area} fill="url(#intradayDown)" clipPath="url(#intradayBelow)" />
      {point && <line className="intraday-guide" x1={xAt(point.time)} y1={top} x2={xAt(point.time)} y2={bottom} />}
      <path className="intraday-line pos" d={line} pathLength="1" clipPath="url(#intradayAbove)" />
      <path className="intraday-line neg" d={line} pathLength="1" clipPath="url(#intradayBelow)" />
      {marks.map((mark, index) => {
        const on = active === index
        const cx = xAt(mark.time), cy = yAt(mark.cumulative)
        return <g
          key={`${mark.symbol}-${mark.time}`}
          className={`intraday-dot ${toneOf(mark.pnl)}${on ? ' active' : ''}`}
          style={{ '--i': index }}
          tabIndex={0}
          aria-label={`${mark.time} ${mark.symbol} ${money(mark.pnl, { privacy })}`}
          role={onSelect ? 'button' : undefined}
          onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(index)} onBlur={() => setActive(null)}
          onClick={onSelect ? () => onSelect(mark.id) : undefined}
          onKeyDown={onSelect ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(mark.id) } } : undefined}
        >
          <circle className="halo" cx={cx} cy={cy} r={on ? 9 : 4} />
          <circle className="dot" cx={cx} cy={cy} r={on ? 5 : 4} />
          <circle className="hit" cx={cx} cy={cy} r="12" />
        </g>
      })}
    </svg>
    <Tooltip point={point ? { x: xAt(point.time), y: yAt(point.cumulative) } : null} width={width}>
      {point && <>
        <div className="tip-title">{point.time} · {point.symbol}</div>
        <TipRows rows={[
          { label: 'Trade', value: money(point.pnl, { privacy }), tone: toneOf(point.pnl) },
          { label: 'Running', value: money(point.cumulative, { privacy }), tone: toneOf(point.cumulative) },
        ]} />
        {onSelect && <div className="tip-hint">Click to open</div>}
      </>}
    </Tooltip>
  </div>
}

/** Net daily P&L columns with axis ticks. */
// Designs by RNSENCE Studio
export function DailyColumns({ series, height: fixedHeight = 300, fill = false, privacy = false }) {
  const [ref, size] = useSize()
  const [active, setActive] = useState(null)
  const width = size.width || 560
  // In fill mode the chart takes whatever height its card gives it.
  const height = fill ? Math.max(200, size.height || fixedHeight) : fixedHeight
  const pad = { top: 14, right: 6, bottom: 30, left: 48 }
  const plotWidth = Math.max(40, width - pad.left - pad.right)
  const plotHeight = Math.max(60, height - pad.top - pad.bottom)
  const values = series.map((point) => point.pnl)
  const min = Math.min(0, ...values)
  const max = Math.max(1, ...values)
  const ticks = niceTicks(min, max, 5)
  const lo = Math.min(min, ticks[0] ?? min)
  const hi = Math.max(max, ticks[ticks.length - 1] ?? max)
  const yAt = (value) => pad.top + (1 - (value - lo) / ((hi - lo) || 1)) * plotHeight
  const band = plotWidth / Math.max(series.length, 1)
  const barWidth = Math.min(18, Math.max(6, band * 0.52))
  const labelEvery = Math.max(1, Math.ceil(series.length / Math.max(2, Math.floor(plotWidth / 130))))

  return <div className={`daily-columns${fill ? ' fill' : ''}`} ref={ref} style={fill ? undefined : { height }}>
    <svg width={width} height={height} role="img" aria-label="Net daily profit and loss">
      {ticks.map((tick) => <g key={tick}>
        <line className="cume-grid" x1={pad.left} y1={yAt(tick)} x2={pad.left + plotWidth} y2={yAt(tick)} />
        <line className="cume-tick" x1={pad.left - 7} y1={yAt(tick)} x2={pad.left - 2} y2={yAt(tick)} />
        <text className="cume-axis" x={pad.left - 12} y={yAt(tick) + 4} textAnchor="end">{compactMoney(tick, { privacy })}</text>
      </g>)}
      {series.map((point, index) => {
        const x = pad.left + index * band + (band - barWidth) / 2
        const zero = yAt(0)
        const y = point.pnl >= 0 ? yAt(point.pnl) : zero
        const barHeight = Math.max(2, Math.abs(yAt(point.pnl) - zero))
        return <rect
          key={point.date}
          className={`daily-bar ${toneOf(point.pnl)}`}
          x={x} y={y} width={barWidth} height={barHeight} rx="2"
          onPointerEnter={() => setActive(index)}
          onPointerLeave={() => setActive(null)}
        />
      })}
      {series.map((point, index) => index % labelEvery === 0 ? (
        <text key={`x-${point.date}`} className="cume-axis" x={pad.left + index * band + band / 2} y={height - 8} textAnchor={index === 0 ? 'start' : 'middle'}>
          {axisDate(point.date)}
        </text>
      ) : null)}
    </svg>
    <Tooltip point={active == null ? null : { x: pad.left + active * band + band / 2, y: yAt(Math.max(series[active].pnl, 0)) }} width={width}>
      {active != null && <>
        <div className="tip-title">{longDate(series[active].date)}</div>
        <TipRows rows={[
          { label: 'Net P&L', value: money(series[active].pnl, { privacy }), tone: toneOf(series[active].pnl) },
          { label: 'Trades', value: `${series[active].trades}` },
          { label: 'Win rate', value: percent(series[active].winRate, { decimals: 0 }) },
        ]} />
      </>}
    </Tooltip>
  </div>
}

/** Overall score radar: current window against the previous one. */
// Designs by RNSENCE Studio
/**
 * Concentric activity rings: each part of the score is a rounded track filled clockwise
 * from 12 o'clock, the headline sits in the centre, a legend runs underneath.
 */
export function ScoreRings({ items, title, subtitle, size = 156 }) {
  const [active, setActive] = useState(null)
  const outer = size / 2 - 2
  const inner = outer * 0.6
  const gap = 3
  const band = (outer - inner - gap * (items.length - 1)) / Math.max(1, items.length)
  const c = size / 2
  const ring = (index) => outer - index * (band + gap) - band / 2
  const tones = ['#1d5fd0', '#2e7cf6', '#6ea5f8', '#a9c8fb', '#cfe0fd', '#e3edfe']
  const shown = active == null ? null : items[active]
  return <div className="score-rings">
    <div className="sr-plot" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${subtitle} ${title}`}>
        {items.map((item, index) => {
          const r = ring(index)
          const length = 2 * Math.PI * r
          const share = Math.max(0, Math.min(1, item.value / 100))
          return <g key={item.label} className={`sr-ring${active != null && active !== index ? ' is-dim' : ''}`}
            onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)}>
            <circle cx={c} cy={c} r={r} fill="none" stroke="#eef0f3" strokeWidth={band}/>
            <circle
              className="sr-fill" cx={c} cy={c} r={r} fill="none" stroke={tones[index % tones.length]} strokeWidth={band} strokeLinecap="round"
              strokeDasharray={`${Math.max(0.001, share * length)} ${length}`} transform={`rotate(-90 ${c} ${c})`}
              style={{ '--len': length, '--i': index }}
            />
            <circle cx={c} cy={c} r={r} fill="none" stroke="transparent" strokeWidth={band + gap}/>
          </g>
        })}
        <g className="sr-center">
          <text x={c} y={c - 10} textAnchor="middle" className="sr-sub">{shown ? shown.label : subtitle}</text>
          <text x={c} y={c + 14} textAnchor="middle" className="sr-title">{shown ? shown.display ?? Math.round(shown.value) : title}</text>
        </g>
      </svg>
    </div>
    <ul className="sr-legend">
      {items.map((item, index) => <li key={item.label} className={active === index ? 'is-on' : ''}
        onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)}>
        <i style={{ background: tones[index % tones.length] }}/>{item.label}<b>{Math.round(item.value)}</b>
      </li>)}
    </ul>
  </div>
}

/**
 * Score parts as a radial bar chart: one quarter per part, each holding a slim beam per month (oldest to latest,
 * clockwise) whose length is that month's part score over a grey track, drawn as round-ended beams. The latest
 * month is the strongest shade. Hovering a beam reads it out in the centre.
 */
export function ScoreRadial({ items, history, title, subtitle, size = 144 }) {
  const [active, setActive] = useState(null)
  const c = size / 2, r0 = size * .29, r1 = size / 2 - 2
  const tones = ['#1d5fd0', '#2e7cf6', '#6ea5f8', '#8fb8fa']
  const months = history.length
  const sector = 360 / Math.max(1, items.length), sectorGap = 12
  const step = (sector - sectorGap) / Math.max(1, months)
  // beam width from the room at the inner edge, so neighbouring beams never touch; round caps take half of it each end
  const beam = Math.max(3, Math.min(10, (2 * Math.PI * (r0 + 4) * step) / 360 - 2.5))
  const inner = r0 + 4 + beam / 2, outer = r1 - beam / 2
  const reach = (value) => inner + (outer - inner) * Math.max(0, Math.min(1, value / 100))
  const polar = (r, deg) => { const a = ((deg - 90) * Math.PI) / 180; return [c + r * Math.cos(a), c + r * Math.sin(a)] }
  const shown = active == null ? null : history[active.m].values[active.i]
  return <div className="score-rings score-radial">
    <div className="sr-plot" style={{ width: size, height: size }} onPointerLeave={() => setActive(null)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${subtitle} ${title}`}>
        {items.map((item, i) => history.map((month, m) => {
          const angle = i * sector + sectorGap / 2 + step * (m + .5)
          const [x0, y0] = polar(inner, angle), [x1, y1] = polar(outer, angle)
          const value = month.values[i]
          const [xv, yv] = polar(reach(value ?? 0), angle)
          const on = active && active.i === i && active.m === m
          return <g key={`${item.label}-${month.key}`} className={`rb-bar${active && !on ? ' is-dim' : ''}`} onPointerEnter={() => setActive({ i, m })}>
            <line x1={x0} y1={y0} x2={x1} y2={y1} strokeWidth={beam} className="rb-track"/>
            {value != null && <line
              x1={x0} y1={y0} x2={xv} y2={yv} strokeWidth={beam} stroke={tones[i % tones.length]} className="rb-fill"
              style={{ opacity: .32 + (.68 * (m + 1)) / months, '--d': `${(i * months + m) * 22}ms` }}
            />}
            <line x1={x0} y1={y0} x2={x1} y2={y1} strokeWidth={beam + 3} stroke="transparent"/>
          </g>
        }))}
        {/* the centre reads out the hovered beam over three short lines, so a long part name never reaches the beams */}
        <g className="sr-center">
          <text x={c} y={c - 11} textAnchor="middle" className="sr-sub">{active ? items[active.i].label : subtitle}</text>
          <text x={c} y={c + 11} textAnchor="middle" className="sr-title">{active ? (shown == null ? '—' : Math.round(shown)) : title}</text>
          {active && <text x={c} y={c + 25} textAnchor="middle" className="sr-sub rb-month">{history[active.m].label}</text>}
        </g>
      </svg>
    </div>
    <ul className="sr-legend">
      {items.map((item, index) => <li key={item.label} className={active?.i === index ? 'is-on' : ''}>
        <i style={{ background: tones[index % tones.length] }}/>{item.label}<b>{Math.round(item.value)}</b>
      </li>)}
    </ul>
  </div>
}

export function ScoreRadar({ axes, current, compare, score, size = 176 }) {
  const rings = axes.map((label, index) => ({
    label,
    value: Math.max(0, Math.min(100, current[index] ?? 0)),
    prior: compare ? Math.max(0, Math.min(100, compare[index] ?? 0)) : null,
  }))
  const thickness = 5.5
  const gap = 2.8
  const center = size / 2
  const radiusAt = (index) => center - 2 - thickness / 2 - index * (thickness + gap)
  const markAt = (radius, ratio) => {
    const angle = ratio * Math.PI * 2 - Math.PI / 2
    return [center + Math.cos(angle) * radius, center + Math.sin(angle) * radius]
  }

  return <div className="score-gauge">
    <div className="gauge-plot" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Overall score by component">
        <g transform={`rotate(-90 ${center} ${center})`}>
          {rings.map((ring, index) => {
            const radius = radiusAt(index)
            const circumference = 2 * Math.PI * radius
            return <g key={ring.label}>
              <circle className="gauge-track" cx={center} cy={center} r={radius} strokeWidth={thickness} />
              <circle
                className={`gauge-arc g${index}`} cx={center} cy={center} r={radius} strokeWidth={thickness} strokeLinecap="round"
                strokeDasharray={`${Math.max(0.6, (ring.value / 100) * circumference)} ${circumference}`}
              />
            </g>
          })}
        </g>
        {rings.map((ring, index) => {
          if (ring.prior == null) return null
          const [x, y] = markAt(radiusAt(index), ring.prior / 100)
          return <circle key={`prior-${ring.label}`} className="gauge-prior" cx={x} cy={y} r="1.5" />
        })}
      </svg>
      <div className="gauge-core">
        <b>{score == null ? '—' : Math.round(score)}<small>/100</small></b>
        <em>Trading score</em>
      </div>
    </div>
    <ul className="gauge-key">
      {rings.map((ring, index) => <li key={ring.label}>
        <i className={`g${index}`}/><span>{ring.label}</span><b>{Math.round(ring.value)}</b>
      </li>)}
    </ul>
  </div>
}

/* ------------------------------------------------------------ win ratio */

/** Ring gauge: win share in green, remaining loss share in grey. */
// Designs by RNSENCE Studio
export function WinDonut({ winRate, wins, losses, recent = [], size = 116 }) {
  const stroke = 9
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const share = winRate == null ? 0 : Math.max(0, Math.min(100, winRate)) / 100
  const id = useId().replace(/:/g, '')
  return <div className="win-donut">
    <div className="donut-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Win rate ${winRate == null ? 'unavailable' : `${Math.round(winRate)}%`}`}>
        <defs>
          <linearGradient id={`${id}-arc`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="var(--pos-mark)" stopOpacity="1" />
            <stop offset="1" stopColor="var(--pos-mark)" stopOpacity="1" />
          </linearGradient>
        </defs>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle className="donut-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
          <circle
            className="donut-arc" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke}
            stroke={`url(#${id}-arc)`} strokeLinecap="round"
            strokeDasharray={`${Math.max(0.5, share * circumference)} ${circumference}`}
          />
          <circle className="donut-mark" cx={size / 2} cy={stroke / 2 + 0.5} r={stroke / 2 - 2.5} />
        </g>
      </svg>
      <span className="donut-value">
        <b>{winRate == null ? '—' : Math.round(winRate)}<small>%</small></b>
        <em>Win rate</em>
      </span>
    </div>
    <dl className="donut-stats">
      <div><dt>Winning trades</dt><dd>{wins}</dd></div>
      <div><dt>Losing trades</dt><dd>{losses}</dd></div>
    </dl>
    {recent.length > 0 && <RecentResults results={recent} />}
  </div>
}

/** Last N trade outcomes as a grid of squares (oldest → newest), with the live streak. */
function RecentResults({ results }) {
  const last = results[results.length - 1]
  let streak = 0
  for (let index = results.length - 1; index >= 0 && results[index].win === last.win; index -= 1) streak += 1
  return <div className="recent-results">
    <span className="rr-title">Last {results.length} trades</span>
    <div className="rr-grid">
      {results.map((item, index) => <i
        key={item.id ?? index}
        className={`${item.win ? 'win' : 'loss'}${index === results.length - 1 ? ' latest' : ''}`}

      />)}
    </div>
    <span className={`rr-streak ${last.win ? 'win' : 'loss'}`}>
      {streak} {last.win ? (streak === 1 ? 'win' : 'wins') : (streak === 1 ? 'loss' : 'losses')} in a row
    </span>
  </div>
}

/** Paired win/loss share columns per period. */
export function WinPairBars({ buckets, height = 150 }) {
  const [ref, size] = useSize()
  const width = size.width || 300
  const pad = { top: 16, right: 4, bottom: 22, left: 34 }
  const plotWidth = Math.max(40, width - pad.left - pad.right)
  const plotHeight = Math.max(40, height - pad.top - pad.bottom)
  const ticks = [20, 40, 60, 80]
  const yAt = (value) => pad.top + (1 - Math.min(100, value) / 90) * plotHeight
  const band = plotWidth / Math.max(buckets.length, 1)
  const barWidth = Math.min(9, band * 0.22)
  const last = buckets[buckets.length - 1]
  return <div className="win-bars" ref={ref} style={{ height }}>
    <svg width={width} height={height} role="img" aria-label="Win and loss share by period">
      <defs>
        <linearGradient id="pairWinFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--win)" stopOpacity="1" />
          <stop offset="1" stopColor="var(--win)" stopOpacity=".2" />
        </linearGradient>
        <linearGradient id="pairLossFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--loss)" stopOpacity="1" />
          <stop offset="1" stopColor="var(--loss)" stopOpacity=".2" />
        </linearGradient>
      </defs>
      {ticks.map((tick) => <g key={tick}>
        <line className="cume-grid" x1={pad.left} y1={yAt(tick)} x2={pad.left + plotWidth} y2={yAt(tick)} />
        <text className="cume-axis" x={pad.left - 8} y={yAt(tick) + 4} textAnchor="end">{tick}%</text>
      </g>)}
      {buckets.map((bucket, index) => {
        const center = pad.left + index * band + band / 2
        return <g key={bucket.key}>
          <rect className="pair-win" x={center - barWidth - 1.5} y={yAt(bucket.winRate)} width={barWidth} height={Math.max(2, pad.top + plotHeight - yAt(bucket.winRate))} rx="2" />
          <rect className="pair-loss" x={center + 1.5} y={yAt(bucket.lossRate)} width={barWidth} height={Math.max(2, pad.top + plotHeight - yAt(bucket.lossRate))} rx="2" />
          <text className="cume-axis" x={center} y={height - 5} textAnchor="middle">{bucket.label}</text>
        </g>
      })}
      {last && <text className="pair-callout" x={pad.left + (buckets.length - 1) * band + band / 2 - barWidth / 2} y={yAt(last.winRate) - 6} textAnchor="middle">{Math.round(last.winRate)}%</text>}
    </svg>
  </div>
}

/** Win share against loss share as two lines over periods. */
export function WinLines({ buckets, height = 150 }) {
  const [ref, size] = useSize()
  const width = size.width || 300
  const pad = { top: 12, right: 8, bottom: 22, left: 34 }
  const plotWidth = Math.max(40, width - pad.left - pad.right)
  const plotHeight = Math.max(40, height - pad.top - pad.bottom)
  const values = buckets.flatMap((bucket) => [bucket.winRate, bucket.lossRate])
  const lo = Math.max(0, Math.floor((Math.min(...values) - 6) / 10) * 10)
  const hi = Math.min(100, Math.ceil((Math.max(...values) + 6) / 10) * 10)
  const ticks = niceTicks(lo, hi, 3)
  const xAt = (index) => pad.left + (buckets.length === 1 ? plotWidth / 2 : (index / (buckets.length - 1)) * plotWidth)
  const yAt = (value) => pad.top + (1 - (value - lo) / ((hi - lo) || 1)) * plotHeight
  const winPoints = buckets.map((bucket, index) => [xAt(index), yAt(bucket.winRate)])
  const lossPoints = buckets.map((bucket, index) => [xAt(index), yAt(bucket.lossRate)])
  const winLine = smoothPath(winPoints)
  const lossLine = smoothPath(lossPoints)
  const base = pad.top + plotHeight
  const area = (line, points) => (points.length > 1 ? `${line} L ${points[points.length - 1][0]} ${base} L ${points[0][0]} ${base} Z` : '')
  return <div className="win-lines" ref={ref} style={{ height }}>
    <svg width={width} height={height} role="img" aria-label="Win and loss share trend">
      <defs>
        <linearGradient id="winLineFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--win)" stopOpacity=".16" /><stop offset="1" stopColor="var(--win)" stopOpacity="0" /></linearGradient>
        <linearGradient id="lossLineFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--loss)" stopOpacity=".12" /><stop offset="1" stopColor="var(--loss)" stopOpacity="0" /></linearGradient>
        <linearGradient id="winEdgeFade" gradientUnits="userSpaceOnUse" x1={pad.left} y1="0" x2={pad.left + plotWidth} y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.07" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.93" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="winEdgeMask"><rect x={pad.left} y="0" width={plotWidth} height={height} fill="url(#winEdgeFade)" /></mask>
      </defs>
      {ticks.map((tick) => <g key={tick}>
        <line className="cume-grid" x1={pad.left} y1={yAt(tick)} x2={pad.left + plotWidth} y2={yAt(tick)} />
        <text className="cume-axis" x={pad.left - 8} y={yAt(tick) + 4} textAnchor="end">{tick}%</text>
      </g>)}
      <g mask="url(#winEdgeMask)">
        <path d={area(lossLine, lossPoints)} fill="url(#lossLineFill)" />
        <path d={area(winLine, winPoints)} fill="url(#winLineFill)" />
        <path className="line-loss" d={lossLine} />
        <path className="line-win" d={winLine} />
      </g>
      {buckets.map((bucket, index) => <text key={bucket.key} className="cume-axis" x={xAt(index)} y={height - 5} textAnchor={index === 0 ? 'start' : index === buckets.length - 1 ? 'end' : 'middle'}>{bucket.label}</text>)}
    </svg>
  </div>
}

/** Compact per-session P&L strip for summary cards (green up, red down). */
export function SessionBars({ sessions, height = 72, privacy = false }) {
  const [ref, size] = useSize()
  const [active, setActive] = useState(null)
  const width = size.width || 280
  const peak = Math.max(1, ...sessions.map((session) => Math.abs(session.pnl)))
  const mid = height / 2
  const band = width / Math.max(sessions.length, 1)
  const barWidth = Math.min(14, band * 0.56)
  const point = active == null ? null : sessions[active]
  return <div className="session-bars" ref={ref} style={{ height }}>
    <svg width={width} height={height} role="img" aria-label="Net P&L by trading day">
      <line className="session-zero" x1="0" y1={mid} x2={width} y2={mid} />
      {sessions.map((session, index) => {
        const magnitude = Math.max(2, (Math.abs(session.pnl) / peak) * (mid - 4))
        return <rect
          key={session.label}
          className={`session-bar ${toneOf(session.pnl)}${active === index ? ' active' : ''}`}
          x={index * band + (band - barWidth) / 2}
          y={session.pnl >= 0 ? mid - magnitude : mid}
          width={barWidth} height={magnitude} rx="2"
          onPointerEnter={() => setActive(index)}
          onPointerLeave={() => setActive(null)}
        />
      })}
    </svg>
    {point && <span className="session-tip" style={{ left: active * band + band / 2 }}>
      <b>{point.label}</b> <span className={`tone-${toneOf(point.pnl)}`}>{money(point.pnl, { privacy, decimals: 0 })}</span>
    </span>}
  </div>
}

/** Compact cumulative line across sessions, one marker per day coloured by result. */
export function SessionLine({ sessions, height = 76, privacy = false }) {
  const [ref, size] = useSize()
  const [active, setActive] = useState(null)
  const width = size.width || 280
  const pad = { top: 8, bottom: 8, x: 6 }
  let running = 0
  const points = sessions.map((session) => ({ ...session, cumulative: (running += session.pnl) }))
  const values = points.map((point) => point.cumulative)
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const span = max - min || 1
  const xAt = (index) => pad.x + (points.length === 1 ? (width - pad.x * 2) / 2 : (index / (points.length - 1)) * (width - pad.x * 2))
  const yAt = (value) => pad.top + (1 - (value - min) / span) * (height - pad.top - pad.bottom)
  const coords = points.map((point, index) => [xAt(index), yAt(point.cumulative)])
  const line = smoothPath(coords)
  const area = coords.length > 1 ? `${line} L ${coords[coords.length - 1][0]} ${yAt(0)} L ${coords[0][0]} ${yAt(0)} Z` : ''
  const point = active == null ? null : points[active]
  return <div className="session-line" ref={ref} style={{ height }}>
    <svg width={width} height={height} role="img" aria-label="Cumulative P&L across the month's trading days"
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect()
        const ratioX = Math.max(0, Math.min(1, (event.clientX - bounds.left - pad.x) / (width - pad.x * 2)))
        setActive(Math.round(ratioX * (points.length - 1)))
      }}
      onPointerLeave={() => setActive(null)}
    >
      <defs>
        <linearGradient id="sessionLineFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--green)" stopOpacity=".16" />
          <stop offset="1" stopColor="var(--green)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line className="session-zero" x1="0" y1={yAt(0)} x2={width} y2={yAt(0)} />
      {area && <path d={area} fill="url(#sessionLineFill)" />}
      {line && <path className="session-path" d={line} />}
      {coords.map(([x, y], index) => <circle key={points[index].label} className={`session-dot ${toneOf(points[index].pnl)}${active === index ? ' active' : ''}`} cx={x} cy={y} r={active === index ? 4.5 : 3} />)}
    </svg>
    <Tooltip point={point ? { x: xAt(active), y: yAt(point.cumulative) } : null} width={width} gap={10}>
      {point && <>
        <div className="tip-title">{point.label}</div>
        <TipRows rows={[
          { label: 'Day P&L', value: money(point.pnl, { privacy, decimals: 0 }), tone: toneOf(point.pnl) },
          { label: 'Month to date', value: money(point.cumulative, { privacy, decimals: 0 }), tone: toneOf(point.cumulative) },
        ]} />
      </>}
    </Tooltip>
  </div>
}

/* ---------------------------------------------------------- eastern clock */

const EASTERN = 'America/New_York'
const easternParts = (date) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN, weekday: 'long', day: '2-digit', month: 'short', year: 'numeric',
  }).formatToParts(date).map((part) => [part.type, part.value]))
  const numeric = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN, day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(date).map((part) => [part.type, part.value]))
  return {
    label: `${parts.weekday}, ${parts.day} ${parts.month} ${parts.year}`,
    iso: `${numeric.year}-${numeric.month}-${numeric.day}`,
    year: Number(numeric.year), month: Number(numeric.month), day: Number(numeric.day),
  }
}

/** "Tuesday, 22 Sep 2026" formatting for any ISO date, read in US Eastern time. */
export const easternLabel = (iso) => easternParts(new Date(`${iso}T12:00:00Z`)).label

/** Today's date in US Eastern time (EST/EDT), rolling over at midnight ET. */
export function useEasternToday() {
  const [today, setToday] = useState(() => easternParts(new Date()))
  useEffect(() => {
    const tick = () => setToday((current) => {
      const next = easternParts(new Date())
      return next.iso === current.iso ? current : next
    })
    const timer = setInterval(tick, 30000)
    return () => clearInterval(timer)
  }, [])
  return today
}

/** US equities session state in Eastern time, refreshed every 30s. */
export function useMarketSession() {
  const read = () => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: EASTERN, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date()).map((part) => [part.type, part.value]))
    const minutes = (Number(parts.hour) % 24) * 60 + Number(parts.minute)
    const weekend = parts.weekday === 'Sat' || parts.weekday === 'Sun'
    const span = (to) => { const left = Math.max(0, to - minutes); return left >= 60 ? `${Math.floor(left / 60)}h ${left % 60}m` : `${left}m` }
    if (weekend) return { state: 'closed', label: 'Market closed', detail: 'Weekend', minutes, weekend, weekday: parts.weekday }
    if (minutes >= 570 && minutes < 960) return { state: 'open', label: 'Market open', detail: `Closes in ${span(960)}`, minutes, weekend, weekday: parts.weekday }
    if (minutes >= 240 && minutes < 570) return { state: 'pre', label: 'Pre-market', detail: `Opens in ${span(570)}`, minutes, weekend, weekday: parts.weekday }
    if (minutes >= 960 && minutes < 1200) return { state: 'post', label: 'After hours', detail: `Ends in ${span(1200)}`, minutes, weekend, weekday: parts.weekday }
    return { state: 'closed', label: 'Market closed', detail: 'Opens 9:30 ET', minutes, weekend, weekday: parts.weekday }
  }
  const [session, setSession] = useState(read)
  useEffect(() => {
    const timer = setInterval(() => setSession(read()), 30000)
    return () => clearInterval(timer)
  }, [])
  return session
}

/* ---------------------------------------------------- metric-card charts */

/** Tiny running-total line, filled toward zero. */
export function MiniLine({ values, width = 116, height = 44 }) {
  if (!values.length) return null
  let running = 0
  const series = values.map((value) => (running += value))
  const min = Math.min(0, ...series)
  const max = Math.max(0, ...series)
  const span = max - min || 1
  const pad = 3
  const xAt = (index) => pad + (series.length === 1 ? (width - pad * 2) / 2 : (index / (series.length - 1)) * (width - pad * 2))
  const yAt = (value) => pad + (1 - (value - min) / span) * (height - pad * 2)
  const coords = series.map((value, index) => [xAt(index), yAt(value)])
  const line = smoothPath(coords)
  const zero = yAt(0)
  const tone = series[series.length - 1] >= 0 ? 'pos' : 'neg'
  const last = coords[coords.length - 1]
  return <svg className={`mini-chart mini-line ${tone}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
    <defs>
      <linearGradient id={`miniLine-${tone}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" className="mini-stop" stopOpacity=".22" />
        <stop offset="1" className="mini-stop" stopOpacity="0" />
      </linearGradient>
    </defs>
    <line className="mini-zero" x1={pad} y1={zero} x2={width - pad} y2={zero} />
    {coords.length > 1 && <path d={`${line} L ${last[0]} ${zero} L ${coords[0][0]} ${zero} Z`} fill={`url(#miniLine-${tone})`} />}
    <path className="mini-path" d={line} />
    <circle className="mini-end" cx={last[0]} cy={last[1]} r="2.6" />
  </svg>
}

/** Tiny diverging bars, with an optional dashed reference (e.g. the average). */
export function MiniBars({ values, reference, neutral = false, width = 116, height = 44 }) {
  if (!values.length) return null
  const min = Math.min(0, ...values, reference ?? 0)
  const max = Math.max(0, ...values, reference ?? 0)
  const span = max - min || 1
  const pad = 2
  const yAt = (value) => pad + (1 - (value - min) / span) * (height - pad * 2)
  const band = (width - pad * 2) / values.length
  const barWidth = Math.max(2, Math.min(7, band * 0.62))
  return <svg className="mini-chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
    {!neutral && <line className="mini-zero" x1={pad} y1={yAt(0)} x2={width - pad} y2={yAt(0)} />}
    {values.map((value, index) => {
      const top = yAt(Math.max(value, 0))
      const bottom = yAt(Math.min(value, 0))
      return <rect
        key={index}
        className={`mini-bar ${neutral ? 'neutral' : value >= 0 ? 'pos' : 'neg'}`}
        x={pad + index * band + (band - barWidth) / 2} y={top}
        width={barWidth} height={Math.max(1.5, bottom - top)} rx="1.2"
      />
    })}
    {reference != null && <line className="mini-ref" x1={pad} y1={yAt(reference)} x2={width - pad} y2={yAt(reference)} />}
  </svg>
}

/** Tiny win/loss ring. */
export function MiniRing({ wins, losses, size = 44 }) {
  const total = wins + losses
  const stroke = 6
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const share = total ? wins / total : 0
  return <svg className="mini-chart mini-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
    <circle className="ring-loss" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
    <circle
      className="ring-win" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke}
      strokeDasharray={`${share * circumference} ${circumference}`}
      transform={`rotate(-90 ${size / 2} ${size / 2})`}
    />
  </svg>
}

/** Daily P&L as thin upward bars from one baseline, with a dotted run-rate trend across the window. */
/** Column with a rounded cap and a flat foot that only softens its corners, so it sits on the baseline. */
function columnPath(x, y, width, height, cap, foot) {
  const r = Math.min(cap, width / 2, height / 2)
  const f = Math.min(foot, width / 2, Math.max(0, height - r))
  const bottom = y + height
  return `M${x},${bottom - f}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + width - r}A${r},${r} 0 0 1 ${x + width},${y + r}`
    + `V${bottom - f}A${f},${f} 0 0 1 ${x + width - f},${bottom}H${x + f}A${f},${f} 0 0 1 ${x},${bottom - f}Z`
}

export function DailyPulse({ series, privacy = false }) {
  const [ref, size] = useSize()
  const [active, setActive] = useState(null)
  const width = size.width || 520
  const height = Math.max(160, size.height || 220)
  const pad = { top: 12, bottom: 42, left: 62, right: 6 }
  const plotWidth = Math.max(60, width - pad.left - pad.right)
  const plotHeight = Math.max(60, height - pad.top - pad.bottom)
  const sizes = series.map((point) => Math.abs(point.pnl))
  const window = Math.min(7, Math.max(3, Math.round(series.length / 6)))
  const runRate = sizes.map((_, index) => {
    const slice = sizes.slice(Math.max(0, index - window + 1), index + 1)
    return slice.reduce((total, value) => total + value, 0) / Math.max(1, slice.length)
  })
  const ticks = niceTicks(0, Math.max(1, ...sizes, ...runRate), 3)
  const max = Math.max(1, ...sizes, ...runRate, ...ticks)
  const base = pad.top + plotHeight
  const yAt = (value) => base - (value / max) * plotHeight
  const band = plotWidth / Math.max(1, series.length)
  const barWidth = Math.max(3, Math.min(12, band * 0.6))
  const labelStep = Math.max(1, Math.round((series.length - 1) / Math.max(1, Math.min(5, Math.floor(plotWidth / 92)) - 1)))
  const trend = smoothPath(runRate.map((value, index) => [pad.left + index * band + band / 2, yAt(value)]))
  const point = active == null ? null : series[active]
  return <div className="daily-pulse" ref={ref}>
    <svg className={active != null ? 'is-hovering' : ''} width={width} height={height} role="img" aria-label="Size of each session's P&L, coloured by result, with the rolling run rate">
      {ticks.map((tick) => <g key={tick}>
        <line className="pulse-grid" x1={pad.left} y1={yAt(tick)} x2={pad.left + plotWidth} y2={yAt(tick)}/>
        <text className="pulse-axis" x={pad.left - 10} y={yAt(tick) + 3.5} textAnchor="end">{compactMoney(tick, { privacy })}</text>
      </g>)}
      <line className="pulse-zero" x1={pad.left} y1={base} x2={pad.left + plotWidth} y2={base} />
      {series.map((item, index) => index % labelStep === 0 ? (
        <text key={`x-${item.date}`} className="pulse-axis" x={pad.left + index * band + band / 2} y={height - 24} textAnchor="middle">{shortDate(item.date)}</text>
      ) : null)}
      <text className="pulse-axis-title" x={pad.left + plotWidth / 2} y={height - 6} textAnchor="middle">Session</text>
      <text className="pulse-axis-title" textAnchor="middle" transform={`rotate(-90 16 ${pad.top + plotHeight / 2})`} x="16" y={pad.top + plotHeight / 2 + 4}>Net P&L</text>
      {series.map((item, index) => {
        const x = pad.left + index * band + (band - barWidth) / 2
        const top = yAt(sizes[index])
        return <path key={item.date} className={`pulse-bar ${toneOf(item.pnl)}${active === index ? ' is-active' : ''}`} d={columnPath(x, top, barWidth, Math.max(2, base - top), Math.min(4, barWidth / 2), 1.5)} />
      })}
      <path className="pulse-trend" d={trend} vectorEffect="non-scaling-stroke" />
      {series.map((item, index) => <rect
        key={`hit-${item.date}`} x={pad.left + index * band} y={pad.top} width={band} height={plotHeight} fill="transparent"
        onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)}
      />)}
    </svg>
    <Tooltip point={point ? { x: pad.left + active * band + band / 2, y: yAt(sizes[active]) } : null} width={width}>
      {point && <>
        <div className="tip-title">{longDate(point.date)}</div>
        <TipRows rows={[
          { label: 'Net P&L', value: money(point.pnl, { privacy }), tone: toneOf(point.pnl) },
          { label: `Run rate (${window}d)`, value: money(runRate[active], { privacy, decimals: 0 }) },
          { label: 'Trades', value: `${point.trades}` },
          { label: 'Win rate', value: percent(point.winRate, { decimals: 0 }) },
        ]} />
      </>}
    </Tooltip>
  </div>
}
