/**
 * Shared visualization kit: formatters, plot chrome, tooltips and the chart
 * primitives the dashboard is built from. Every chart resolves its geometry from
 * the measured container so plot areas line up across neighbouring modules.
 */
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

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
        {title && <h2>{title}</h2>}
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
    const card = host?.closest('.home-card, .module, .card, .compare-card, .win-card')
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
    {components.map((component) => <li key={component.key} title={`Full marks at ${component.target}`}>
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
export function CumulativeChart({ series, height: fixedHeight = 360, fill = false, privacy = false }) {
  const [ref, size] = useSize()
  const [active, setActive] = useState(null)
  const width = size.width || 900
  // In fill mode the chart takes whatever height the card gives it.
  const height = fill ? Math.max(220, size.height || fixedHeight) : fixedHeight
  const pad = { top: 18, right: 10, bottom: 34, left: 54 }
  const plotWidth = Math.max(60, width - pad.left - pad.right)
  const plotHeight = Math.max(80, height - pad.top - pad.bottom)
  const values = series.map((point) => point.cumulative)
  const min = Math.min(0, ...values)
  const max = Math.max(1, ...values)
  const ticks = niceTicks(min, max, 7)
  const top = Math.max(max, ticks[ticks.length - 1] ?? max)
  const xAt = (index) => pad.left + (series.length === 1 ? plotWidth / 2 : (index / (series.length - 1)) * plotWidth)
  const yAt = (value) => pad.top + (1 - (value - min) / ((top - min) || 1)) * plotHeight
  const points = series.map((point, index) => [xAt(index), yAt(point.cumulative)])
  const line = smoothPath(points)
  const area = line ? `${line} L ${xAt(series.length - 1)} ${yAt(min)} L ${xAt(0)} ${yAt(min)} Z` : ''

  // the two longest underwater stretches get the dotted treatment
  const bands = []
  let run = null
  series.forEach((point, index) => {
    if (point.drawdown < 0) { if (!run) run = { from: index, to: index }; else run.to = index }
    else if (run) { bands.push(run); run = null }
  })
  if (run) bands.push(run)
  const highlights = bands.sort((a, b) => (b.to - b.from) - (a.to - a.from)).slice(0, 2)

  const labelEvery = Math.max(1, Math.ceil(series.length / Math.max(3, Math.floor(plotWidth / 150))))
  const track = useCallback((event) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const ratioX = Math.max(0, Math.min(1, (event.clientX - bounds.left - pad.left) / plotWidth))
    setActive(Math.round(ratioX * (series.length - 1)))
  }, [plotWidth, series.length])
  const point = active == null ? null : series[active]

  return <div className={`cume-chart${fill ? ' fill' : ''}`} ref={ref} style={fill ? undefined : { height }}>
    <svg width={width} height={height} role="img" aria-label="Daily net cumulative profit and loss" onPointerMove={track} onPointerLeave={() => setActive(null)}>
      <defs>
        <linearGradient id="cumeFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity=".7" />
          <stop offset="35%" stopColor="var(--accent)" stopOpacity=".34" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity=".02" />
        </linearGradient>
        <pattern id="cumeDots" width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="1.6" cy="1.6" r=".9" fill="currentColor" fillOpacity=".18" />
        </pattern>
      </defs>

      {ticks.map((tick) => <g key={tick}>
        <line className="cume-grid" x1={pad.left} y1={yAt(tick)} x2={pad.left + plotWidth} y2={yAt(tick)} />
        <line className="cume-tick" x1={pad.left - 7} y1={yAt(tick)} x2={pad.left - 2} y2={yAt(tick)} />
        <text className="cume-axis" x={pad.left - 12} y={yAt(tick) + 4} textAnchor="end">{compactMoney(tick, { privacy })}</text>
      </g>)}

      {highlights.map((band) => {
        const x = xAt(band.from)
        const bandWidth = Math.max(4, xAt(band.to) - x)
        return <g key={`${band.from}-${band.to}`}>
          <rect className="cume-band" x={x} y={pad.top} width={bandWidth} height={plotHeight} clipPath="url(#cumeClip)" />
          <rect className="cume-band-bar" x={x} y={pad.top + plotHeight - 1.5} width={bandWidth} height="1.5" rx=".75" />
        </g>
      })}
      <clipPath id="cumeClip"><path d={area} /></clipPath>

      {area && <path className="cume-area" d={area} />}
      {line && <path className="cume-line" d={line} vectorEffect="non-scaling-stroke" />}

      {series.map((item, index) => index % labelEvery === 0 || index === series.length - 1 ? (
        <text key={item.date} className="cume-axis" x={xAt(index)} y={height - 10} textAnchor={index === 0 ? 'start' : index === series.length - 1 ? 'end' : 'middle'}>
          {axisDate(item.date)}
        </text>
      ) : null)}

      {point && <>
        <line className="cume-cross" x1={xAt(active)} y1={pad.top} x2={xAt(active)} y2={pad.top + plotHeight} />
        <circle className="cume-focus" cx={xAt(active)} cy={yAt(point.cumulative)} r="4.5" />
      </>}
    </svg>
    <Tooltip point={point ? { x: xAt(active), y: yAt(point.cumulative) } : null} width={width}>
      {point && <>
        <div className="tip-title">{longDate(point.date)}</div>
        <TipRows rows={[
          { label: 'Cumulative', value: money(point.cumulative, { privacy }), tone: toneOf(point.cumulative) },
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
export function IntradayChart({ fills, open = '09:30', close = '16:00', height = 240, privacy = false }) {
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

  let line = `M ${xAt(open)} ${yAt(0)}`
  let level = 0
  marks.forEach((mark) => { line += ` H ${xAt(mark.time)} V ${yAt(mark.cumulative)}`; level = mark.cumulative })
  line += ` H ${xAt(close)}`
  const hours = []
  const step = plotWidth < 420 ? 120 : 60
  for (let minute = Math.ceil(start / 60) * 60; minute <= end; minute += step) hours.push(`${Math.floor(minute / 60)}:00`)
  const point = active == null ? null : marks[active]
  const zeroY = yAt(0)
  const phases = [
    { label: 'Open', from: '09:30', to: '10:30' },
    { label: 'Lunch', from: '12:00', to: '13:30' },
    { label: 'Close', from: '15:00', to: '16:00' },
  ]

  return <div className="cume-chart intraday-chart" ref={ref} style={{ height }}>
    <svg width={width} height={height} role="img" aria-label={`Intraday net P&L, closing at ${money(level, { privacy })}`}>
      <defs>
        <linearGradient id="intradayFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity=".18" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="intradayUp" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#32d583" stopOpacity=".2" />
          <stop offset="100%" stopColor="#32d583" stopOpacity=".02" />
        </linearGradient>
        <linearGradient id="intradayDown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f97066" stopOpacity=".03" />
          <stop offset="100%" stopColor="#f97066" stopOpacity=".2" />
        </linearGradient>
        <clipPath id="intradayAbove"><rect x={pad.left} y={0} width={plotWidth} height={zeroY} /></clipPath>
        <clipPath id="intradayBelow"><rect x={pad.left} y={zeroY} width={plotWidth} height={Math.max(0, height - zeroY)} /></clipPath>
      </defs>
      {phases.map((phase) => <g key={phase.label} className="intraday-phase">
        <rect x={xAt(phase.from)} y={pad.top} width={xAt(phase.to) - xAt(phase.from)} height={plotHeight} />
        <text x={(xAt(phase.from) + xAt(phase.to)) / 2} y={pad.top - 10} textAnchor="middle">{phase.label}</text>
      </g>)}
      {ticks.map((tick) => <g key={tick}>
        <line className={tick === 0 ? 'intraday-zero' : 'cume-grid'} x1={pad.left} y1={yAt(tick)} x2={pad.left + plotWidth} y2={yAt(tick)} />
        <text className="cume-axis" x={pad.left - 8} y={yAt(tick) + 4} textAnchor="end">{compactMoney(tick, { privacy })}</text>
      </g>)}
      {hours.map((hour) => <text key={hour} className="cume-axis" x={xAt(hour)} y={height - 8} textAnchor="middle">{hour}</text>)}
      <path d={`${line} V ${zeroY} H ${xAt(open)} Z`} fill="url(#intradayUp)" clipPath="url(#intradayAbove)" />
      <path d={`${line} V ${zeroY} H ${xAt(open)} Z`} fill="url(#intradayDown)" clipPath="url(#intradayBelow)" />
      {point && <line className="intraday-guide" x1={xAt(point.time)} y1={pad.top} x2={xAt(point.time)} y2={pad.top + plotHeight} />}
      <path className="cume-line" d={line} />
      {marks.map((mark, index) => {
        const size = active === index ? 12 : 9
        return <rect
          key={`${mark.symbol}-${mark.time}`}
          className={`intraday-mark ${toneOf(mark.pnl)}${active === index ? ' active' : ''}`}
          x={xAt(mark.time) - size / 2} y={yAt(mark.cumulative) - size / 2} width={size} height={size} rx={size * 0.32}
          tabIndex={0}
          aria-label={`${mark.time} ${mark.symbol} ${money(mark.pnl, { privacy })}`}
          onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(index)} onBlur={() => setActive(null)}
        />
      })}
    </svg>
    <Tooltip point={point ? { x: xAt(point.time), y: yAt(point.cumulative) } : null} width={width}>
      {point && <>
        <div className="tip-title">{point.time} · {point.symbol}</div>
        <TipRows rows={[
          { label: 'Trade', value: money(point.pnl, { privacy }), tone: toneOf(point.pnl) },
          { label: 'Running', value: money(point.cumulative, { privacy }), tone: toneOf(point.cumulative) },
        ]} />
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
export function ScoreRadar({ axes, current, compare, size = 300 }) {
  const center = size / 2
  const radius = center - 67
  const angleAt = (index) => (index / axes.length) * Math.PI * 2 - Math.PI / 2
  const pointAt = (index, ratio) => [
    center + Math.cos(angleAt(index)) * radius * Math.max(0.05, ratio),
    center + Math.sin(angleAt(index)) * radius * Math.max(0.05, ratio),
  ]
  const shape = (values) => values.map((value, index) => pointAt(index, (value ?? 0) / 100).join(',')).join(' ')
  return <div className="score-radar">
    <svg viewBox={`0 38 ${size} ${size - 76}`} width="100%" height="100%" role="img" aria-label="Overall score by component">
      <defs>
        <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="var(--accent)" stopOpacity=".16" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={center} cy={center} r={radius * 1.05} fill="url(#radarGlow)" />
      {[0.33, 0.66, 1].map((ratio) => <polygon key={ratio} className="radar-web" points={shape(axes.map(() => ratio * 100))} />)}
      {axes.map((axis, index) => {
        const [x, y] = pointAt(index, 1)
        return <line key={axis} className="radar-web" x1={center} y1={center} x2={x} y2={y} />
      })}
      {compare && <polygon className="radar-compare" points={shape(compare)} />}
      <polygon className="radar-current" points={shape(current)} />
      {axes.map((axis, index) => {
        const [x, y] = pointAt(index, 1.2)
        return <text key={`label-${axis}`} className="radar-label" x={x} y={y + 3} textAnchor={x > center + 6 ? 'start' : x < center - 6 ? 'end' : 'middle'}>{axis}</text>
      })}
    </svg>
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
        title={`${item.symbol} · ${item.win ? 'Win' : 'Loss'}`}
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
    if (weekend) return { state: 'closed', label: 'Market closed', detail: 'Weekend', minutes, weekend }
    if (minutes >= 570 && minutes < 960) return { state: 'open', label: 'Market open', detail: `Closes in ${span(960)}`, minutes, weekend }
    if (minutes >= 240 && minutes < 570) return { state: 'pre', label: 'Pre-market', detail: `Opens in ${span(570)}`, minutes, weekend }
    if (minutes >= 960 && minutes < 1200) return { state: 'post', label: 'After hours', detail: `Ends in ${span(1200)}`, minutes, weekend }
    return { state: 'closed', label: 'Market closed', detail: 'Opens 9:30 ET', minutes, weekend }
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

/** Daily P&L as dense upward bars from one baseline: height is the size of the day, colour is the result. */
export function DailyPulse({ series, privacy = false }) {
  const [ref, size] = useSize()
  const [active, setActive] = useState(null)
  const width = size.width || 520
  const height = Math.max(160, size.height || 220)
  const pad = { top: 14, bottom: 4, x: 2 }
  const plotHeight = height - pad.top - pad.bottom
  const sizes = series.map((point) => Math.abs(point.pnl))
  const max = Math.max(1, ...sizes)
  const base = pad.top + plotHeight
  const yAt = (value) => base - (value / max) * plotHeight
  const band = (width - pad.x * 2) / Math.max(1, series.length)
  const barWidth = Math.max(2.5, Math.min(28, band * 0.7))
  const point = active == null ? null : series[active]
  return <div className="daily-pulse" ref={ref}>
    <svg className={active != null ? 'is-hovering' : ''} width={width} height={height} role="img" aria-label="Size of each session's P&L, coloured by result">
      <defs>
        <linearGradient id="pulseUp" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--pos-mark)" stopOpacity="1" />
          <stop offset="1" stopColor="var(--pos-mark)" stopOpacity=".18" />
        </linearGradient>
        <linearGradient id="pulseDown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--neg-mark)" stopOpacity="1" />
          <stop offset="1" stopColor="var(--neg-mark)" stopOpacity=".18" />
        </linearGradient>
      </defs>
      <line className="pulse-zero" x1={pad.x} y1={base} x2={width - pad.x} y2={base} />
      {series.map((item, index) => {
        const x = pad.x + index * band + (band - barWidth) / 2
        const top = yAt(sizes[index])
        return <g key={item.date} onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)}>
          <rect x={pad.x + index * band} y={pad.top} width={band} height={plotHeight} fill="transparent" />
          <rect className={`pulse-bar ${toneOf(item.pnl)}${active === index ? ' is-active' : ''}`} x={x} y={top} width={barWidth} height={Math.max(2, base - top)} rx="2" />
        </g>
      })}
    </svg>
    <Tooltip point={point ? { x: pad.x + active * band + band / 2, y: yAt(sizes[active]) } : null} width={width}>
      {point && <>
        <div className="tip-title">{longDate(point.date)}</div>
        <TipRows rows={[
          { label: 'Net P&L', value: money(point.pnl, { privacy }), tone: toneOf(point.pnl) },
          { label: 'Trades', value: `${point.trades}` },
          { label: 'Win rate', value: percent(point.winRate, { decimals: 0 }) },
        ]} />
      </>}
    </Tooltip>
  </div>
}
