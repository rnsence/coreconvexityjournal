/**
 * Trades, Reports and Prop firms — built on the light workspace system used by the
 * dashboard (white cards, purple accent, green/red for results only).
 */
import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownRight, ArrowUpRight, Check, ChevronDown, ChevronLeft, Download, ChevronRight, ChevronsUpDown, Import, Plus,
  Search, Star, X,
} from 'lucide-react'
import {
  ChartState, CumulativeChart, TipRows, Tooltip, compactMoney, money, niceTicks, percent, ratio,
  smoothPath, toneOf, useEasternToday, useSize,
} from './viz'
import {
  equitySeries, groupStats, rollingWinRate, scopeByRange, streaks, summarize,
} from './analytics'
import { FlagstickIcon } from './icons'
import { AddAccountDialog, PropEntryDialog } from './dialogs'
import { PerformanceInsights, insightStats, monthCalendar } from './pages'
import { propAccounts, propTransactions, tradeLog } from './data'
import { symbolClassSlug } from './symbols'

/** Nice ticks, extended one step so the top (and bottom) gridline clears the data. */
const coverTicks = (min, max, count = 4) => {
  const ticks = niceTicks(min, max, count)
  if (ticks.length < 2) return ticks
  const step = ticks[1] - ticks[0]
  if (ticks[ticks.length - 1] < max - 1e-9) ticks.push(ticks[ticks.length - 1] + step)
  if (ticks[0] > min + 1e-9) ticks.unshift(ticks[0] - step)
  return ticks
}
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const shortDay = (iso) => {
  const date = new Date(`${iso}T00:00:00Z`)
  return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}`
}
const readStore = (key, fallback) => {
  try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback } catch { return fallback }
}
const writeStore = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
}

/* ============================================================ shared UI */

// Designs by RNSENCE Studio
function PageHead({ title, meta, actions }) {
  const today = useEasternToday()
  return <header className="home-header ws-header">
    <div className="home-greeting">
      <span className="home-date">{today.label}</span>
      <div className="greeting-plate">
        <h1>{title}</h1>
        {meta && <p className="ws-meta">{meta}</p>}
      </div>
    </div>
    {actions && <div className="home-actions">{actions}</div>}
  </header>
}

/** One white card, divided into metric cells. */
// Designs by RNSENCE Studio
function MetricStrip({ items }) {
  return <section className="metric-strip" style={{ '--cells': items.length }}>
    {items.map((item) => <div className="metric-cell" key={item.label}>
      <span className="metric-name">{item.label}</span>
      <strong className={item.tone ? `tone-${item.tone}` : undefined}>{item.value}</strong>
      {item.sub && <small>{item.sub}</small>}
      {item.line && <MetricLine line={item.line}/>}
    </div>)}
  </section>
}

const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))

/** Line visuals for a strip cell — one shape per kind of metric. */
function MetricLine({ line }) {
  if (line.type === 'dashes') {
    const total = line.total ?? 14
    const filled = Math.round(clamp01(line.share) * total)
    return <span className="ms-line dashes" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => <i key={index} className={index < filled ? 'pos' : 'neg'}/>)}
    </span>
  }
  if (line.type === 'gauge') {
    return <span className="ms-track" aria-hidden="true">
      <i className={`ms-fill ${line.tone ?? 'pos'}`} style={{ width: `${clamp01(line.share) * 100}%` }}/>
      {line.mark != null && <em className="ms-mark" style={{ left: `${clamp01(line.mark) * 100}%` }}/>}
    </span>
  }
  if (line.type === 'center') {
    const size = clamp01(Math.abs(line.share)) * 50
    return <span className="ms-track centred" aria-hidden="true">
      <i
        className={`ms-fill ${line.share >= 0 ? 'pos' : 'neg'}`}
        style={line.share >= 0 ? { left: '50%', width: `${size}%` } : { left: `${50 - size}%`, width: `${size}%` }}
      />
      <em className="ms-mark" style={{ left: '50%' }}/>
    </span>
  }
  return <span className="ms-line" aria-hidden="true">
    {line.parts.filter((part) => part.value > 0).map((part, index) =>
      <i key={index} className={part.tone} style={{ flex: part.value }}/>)}
  </span>
}

/** Builders: a split of two magnitudes, a run of dashes, a filled gauge, a zero-centred bar. */
const splitLine = (pos, neg) => ({ type: 'split', parts: [
  { tone: 'pos', value: Math.abs(pos) || 0.0001 },
  { tone: 'neg', value: Math.abs(neg) || 0.0001 },
] })
const dashLine = (part, whole, total = 14) => ({ type: 'dashes', share: (Math.abs(part) || 0) / (Math.abs(whole) || 1), total })
const gaugeLine = (part, whole, options = {}) => ({ type: 'gauge', share: (Math.abs(part) || 0) / (Math.abs(whole) || 1), ...options })
const centerLine = (value, scale) => ({ type: 'center', share: (value || 0) / (Math.abs(scale) || 1) })

function Segmented({ options, value, onChange, label, className = '' }) {
  return <div className={`ws-seg ${className}`.trim()} role="tablist" aria-label={label}>
    {options.map((option) => <button
      key={option} type="button" role="tab" aria-selected={value === option}
      className={value === option ? 'active' : ''} onClick={() => onChange(option)}
    >{option}</button>)}
  </div>
}

function Card({ title, aside, className = '', children }) {
  return <section className={`home-card ws-card ${className}`}>
    {(title || aside) && <div className="ws-card-head">
      {title && <div className="card-title">{title}</div>}
      {aside}
    </div>}
    {children}
  </section>
}

/* ============================================================ charts */

/** Horizontal bars diverging from a shared zero. */
function BarList({ rows, format }) {
  const values = rows.map((row) => row.value)
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const span = max - min || 1
  const axis = ((0 - min) / span) * 100
  return <ul className="bar-list">
    {rows.map((row) => {
      const width = (Math.abs(row.value) / span) * 100
      return <li key={row.label} title={row.hint}>
        <span className="bl-label">{row.label}{row.meta && <small>{row.meta}</small>}</span>
        <span className="bl-track">
          <i className="bl-axis" style={{ left: `${axis}%` }}/>
          <i className={`bl-bar ${toneOf(row.value)}`} style={{ left: `${row.value >= 0 ? axis : axis - width}%`, width: `${width}%` }}/>
        </span>
        <span className={`bl-value tone-${toneOf(row.value)}`}>{format(row.value)}</span>
      </li>
    })}
  </ul>
}

/** Vertical columns by category, coloured by sign, with a frosted tooltip. */
function CategoryColumns({ data, height = 220, axisFormat, tip, neutral = false, toneKey }) {
  const [ref, size] = useSize()
  const [active, setActive] = useState(null)
  const width = size.width || 480
  const pad = { top: 12, right: 6, bottom: 26, left: 48 }
  const plotWidth = Math.max(40, width - pad.left - pad.right)
  const plotHeight = Math.max(60, height - pad.top - pad.bottom)
  const values = data.map((item) => item.value)
  const ticks = coverTicks(Math.min(0, ...values), Math.max(0, ...values), 4)
  const lo = Math.min(0, ...values, ticks[0] ?? 0)
  const hi = Math.max(0, ...values, ticks[ticks.length - 1] ?? 0)
  const yAt = (value) => pad.top + (1 - (value - lo) / ((hi - lo) || 1)) * plotHeight
  const band = plotWidth / Math.max(1, data.length)
  const barWidth = Math.min(30, Math.max(8, band * 0.56))
  return <div className="cat-cols" ref={ref} style={{ height }}>
    <svg width={width} height={height} role="img">
      {ticks.map((tick) => <g key={tick}>
        <line className="cume-grid" x1={pad.left} y1={yAt(tick)} x2={pad.left + plotWidth} y2={yAt(tick)}/>
        <text className="cume-axis" x={pad.left - 10} y={yAt(tick) + 4} textAnchor="end">{axisFormat(tick)}</text>
      </g>)}
      <line className="ws-zero" x1={pad.left} y1={yAt(0)} x2={pad.left + plotWidth} y2={yAt(0)}/>
      {data.map((item, index) => {
        const x = pad.left + index * band + (band - barWidth) / 2
        const y = item.value >= 0 ? yAt(item.value) : yAt(0)
        const barHeight = Math.max(2, Math.abs(yAt(item.value) - yAt(0)))
        return <rect
          key={item.label}
          className={`ws-col ${toneKey ? item[toneKey] : neutral ? 'accent' : toneOf(item.value)}${active === index ? ' is-active' : ''}`}
          x={x} y={y} width={barWidth} height={barHeight} rx="3"
          onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)}
        />
      })}
      {data.map((item, index) => <text key={`label-${item.label}`} className="cume-axis" x={pad.left + index * band + band / 2} y={height - 8} textAnchor="middle">{item.label}</text>)}
    </svg>
    <Tooltip point={active == null ? null : { x: pad.left + active * band + band / 2, y: yAt(Math.max(0, data[active].value)) }} width={width}>
      {active != null && tip(data[active])}
    </Tooltip>
  </div>
}

/** Two series side by side per period (e.g. money spent vs payouts). */
// Designs by RNSENCE Studio
function GroupedColumns({ data, height = 240, privacy, series, netLoss = false }) {
  const [ref, size] = useSize()
  const [active, setActive] = useState(null)
  const width = size.width || 520
  const pad = { top: 12, right: 6, bottom: 26, left: 50 }
  const plotWidth = Math.max(40, width - pad.left - pad.right)
  const plotHeight = Math.max(60, height - pad.top - pad.bottom)
  const peak = Math.max(1, ...data.flatMap((item) => [...series.map((entry) => item[entry.key]), netLoss && item.net < 0 ? -item.net : 0]))
  const ticks = coverTicks(0, peak, 4)
  const hi = Math.max(peak, ticks[ticks.length - 1] ?? peak)
  const yAt = (value) => pad.top + (1 - value / hi) * plotHeight
  const band = plotWidth / Math.max(1, data.length)
  const pairGap = 3
  const barWidth = Math.min(44, band * 0.38)
  return <div className="cat-cols" ref={ref} style={{ height }}>
    <svg width={width} height={height} role="img">
      {ticks.map((tick) => <g key={tick}>
        <line className="cume-grid" x1={pad.left} y1={yAt(tick)} x2={pad.left + plotWidth} y2={yAt(tick)}/>
        <text className="cume-axis" x={pad.left - 10} y={yAt(tick) + 4} textAnchor="end">{compactMoney(tick, { privacy })}</text>
      </g>)}
      {data.map((item, index) => {
        const center = pad.left + index * band + band / 2
        return <g key={item.label} onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)}>
          <rect x={pad.left + index * band} y={pad.top} width={band} height={plotHeight} fill="transparent"/>
          {(() => {
            const bars = series.map((entry) => ({ key: entry.key, tone: entry.tone, value: item[entry.key] })).filter((bar) => !netLoss || bar.value > 0)
            if (netLoss && item.net < 0) bars.push({ key: 'net-loss', tone: 'loss', value: -item.net })
            const groupWidth = bars.length * barWidth + (bars.length - 1) * pairGap
            return bars.map((bar, position) => {
              const x = center - groupWidth / 2 + position * (barWidth + pairGap)
              return <rect key={bar.key} className={`ws-col ${bar.tone}${active === index ? ' is-active' : ''}`} x={x} y={yAt(bar.value)} width={barWidth} height={Math.max(bar.value ? 2 : 0, pad.top + plotHeight - yAt(bar.value))} rx="5"/>
            })
          })()}
          <text className="cume-axis" x={center} y={height - 8} textAnchor="middle">{item.label}</text>
        </g>
      })}
    </svg>
    <Tooltip point={active == null ? null : { x: pad.left + active * band + band / 2, y: yAt(Math.max(...series.map((entry) => data[active][entry.key]))) }} width={width}>
      {active != null && <>
        <div className="tip-title">{data[active].title}</div>
        <TipRows rows={[
          ...series.map((entry) => ({ label: entry.label, value: money(data[active][entry.key], { privacy, sign: false, decimals: 0 }) })),
          { label: 'Net', value: money(data[active].net, { privacy, decimals: 0 }), tone: toneOf(data[active].net) },
        ]}/>
      </>}
    </Tooltip>
  </div>
}

/** Smooth trend with an optional dashed reference and fill. */
function TrendLine({ points, height = 220, axisFormat, tipFormat, reference, referenceLabel, tone = 'accent', fillTo = 'min', smooth = true }) {
  const [ref, size] = useSize()
  const [active, setActive] = useState(null)
  const width = size.width || 480
  const pad = { top: 14, right: 10, bottom: 26, left: 48 }
  const plotWidth = Math.max(40, width - pad.left - pad.right)
  const plotHeight = Math.max(60, height - pad.top - pad.bottom)
  const values = points.map((point) => point.value).concat(reference ?? [])
  const ticks = coverTicks(Math.min(...values), Math.max(...values), 4)
  const lo = Math.min(...values, ticks[0] ?? 0)
  const hi = Math.max(...values, ticks[ticks.length - 1] ?? 0)
  const xAt = (index) => pad.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth)
  const yAt = (value) => pad.top + (1 - (value - lo) / ((hi - lo) || 1)) * plotHeight
  const coords = points.map((point, index) => [xAt(index), yAt(point.value)])
  const line = smooth ? smoothPath(coords) : coords.map((point, index) => `${index ? 'L' : 'M'} ${point[0].toFixed(2)} ${point[1].toFixed(2)}`).join(' ')
  const anchor = fillTo === 'zero' ? yAt(0) : pad.top + plotHeight
  const area = coords.length > 1 ? `${line} L ${coords[coords.length - 1][0]} ${anchor} L ${coords[0][0]} ${anchor} Z` : ''
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(plotWidth / 110))))
  const gradientId = `trend-${tone}`
  const point = active == null ? null : points[active]
  return <div className="trend-line" ref={ref} style={{ height }}>
    <svg
      width={width} height={height} role="img"
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect()
        const ratioX = Math.max(0, Math.min(1, (event.clientX - bounds.left - pad.left) / plotWidth))
        setActive(Math.round(ratioX * (points.length - 1)))
      }}
      onPointerLeave={() => setActive(null)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1={fillTo === 'zero' ? '1' : '0'} x2="0" y2={fillTo === 'zero' ? '0' : '1'}>
          <stop offset="0" className={`trend-stop ${tone}`} stopOpacity=".2"/>
          <stop offset="1" className={`trend-stop ${tone}`} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {ticks.map((tick) => <g key={tick}>
        <line className="cume-grid" x1={pad.left} y1={yAt(tick)} x2={pad.left + plotWidth} y2={yAt(tick)}/>
        <text className="cume-axis" x={pad.left - 10} y={yAt(tick) + 4} textAnchor="end">{axisFormat(tick)}</text>
      </g>)}
      {reference != null && <>
        <line className="ws-reference" x1={pad.left} y1={yAt(reference)} x2={pad.left + plotWidth} y2={yAt(reference)}/>
        {referenceLabel && <text className="ws-reference-label" x={pad.left + plotWidth} y={yAt(reference) - 6} textAnchor="end">{referenceLabel}</text>}
      </>}
      {area && <path d={area} fill={`url(#${gradientId})`}/>}
      {line && <path className={`trend-path ${tone}`} d={line}/>}
      {points.map((item, index) => index % labelEvery === 0 || index === points.length - 1 ? (
        <text key={`x-${index}`} className="cume-axis" x={xAt(index)} y={height - 8} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}>{item.label}</text>
      ) : null)}
      {point && <>
        <line className="cume-cross" x1={xAt(active)} y1={pad.top} x2={xAt(active)} y2={pad.top + plotHeight}/>
        <circle className={`trend-focus ${tone}`} cx={xAt(active)} cy={yAt(point.value)} r="4.5"/>
      </>}
    </svg>
    <Tooltip point={point ? { x: xAt(active), y: yAt(point.value) } : null} width={width}>
      {point && tipFormat(point)}
    </Tooltip>
  </div>
}

/** Entry and exit plotted on one price scale. */
const clockMinutes = (clock) => { const [hours, minutes] = clock.split(':').map(Number); return hours * 60 + minutes }

/** Entry → exit as a left-to-right path with the price move between them. */
function ExecutionTrack({ trade, privacy }) {
  const moved = ((trade.exit - trade.entry) / trade.entry) * 100
  const held = trade.closed ? clockMinutes(trade.closed) - clockMinutes(trade.time) : null
  const price = (value) => (privacy ? '••••' : value.toFixed(2))
  return <div className="exec-path">
    <div className="exec-point">
      <small>Entry</small>
      <b>{price(trade.entry)}</b>
      <span>{trade.time}</span>
    </div>
    <div className={`exec-line ${trade.pnl >= 0 ? 'pos' : 'neg'}`}>
      <span className="exec-pill">{moved >= 0 ? '+' : '−'}{Math.abs(moved).toFixed(2)}%</span>
      <i/>
      {held != null && <small>{held}m held</small>}
    </div>
    <div className="exec-point right">
      <small>Exit</small>
      <b>{price(trade.exit)}</b>
      <span>{trade.closed ?? '—'}</span>
    </div>
  </div>
}

const RATING_WORDS = ['Not rated', 'Poor', 'Weak', 'Okay', 'Good', 'Excellent']
const SUGGESTED_TAGS = ['a+ setup', 'patient', 'chased', 'early exit', 'oversized', 'revenge']

/* ============================================================ trades */

const GRADE_STARS = { 'A+': 5, A: 4, B: 3, C: 2, D: 1 }
const PAGE_SIZE = 14
const SORTS = {
  date: (a, b) => a.timestamp - b.timestamp,
  symbol: (a, b) => a.symbol.localeCompare(b.symbol),
  pnl: (a, b) => a.pnl - b.pnl,
  qty: (a, b) => a.qty - b.qty,
}

// Designs by RNSENCE Studio
export function TradesPage({ privacy, range = 'All', initialQuery = '', openLog }) {
  const scoped = useMemo(() => scopeByRange(tradeLog, range), [range])
  const [query, setQuery] = useState(initialQuery)
  const [outcome, setOutcome] = useState('All')
  const [side, setSide] = useState('All')
  const [setup, setSetup] = useState('All setups')
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' })
  const [pageIndex, setPageIndex] = useState(0)
  const [selectedId, setSelectedId] = useState(null)
  const [reviews, setReviews] = useState(() => readStore('trade-reviews', {}))
  const [tagDraft, setTagDraft] = useState('')
  const [tagFocus, setTagFocus] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)

  const setups = useMemo(() => ['All setups', ...[...new Set(scoped.map((trade) => trade.setup))].sort()], [scoped])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = scoped.filter((trade) =>
      (!needle || trade.symbol.toLowerCase().includes(needle) || trade.setup.toLowerCase().includes(needle))
      && (outcome === 'All' || (outcome === 'Wins' ? trade.pnl > 0 : trade.pnl < 0))
      && (side === 'All' || trade.side === side)
      && (setup === 'All setups' || trade.setup === setup))
    const sorted = [...list].sort(SORTS[sort.key])
    return sort.dir === 'desc' ? sorted.reverse() : sorted
  }, [scoped, query, outcome, side, setup, sort])

  useEffect(() => { setPageIndex(0) }, [query, outcome, side, setup, sort, range])
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visible = filtered.slice(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE)
  const selected = filtered.find((trade) => trade.id === selectedId) || visible[0] || null
  const selectedIndex = selected ? filtered.indexOf(selected) : -1
  const stats = useMemo(() => summarize(filtered), [filtered])

  const review = selected ? {
    rating: GRADE_STARS[selected.grade] ?? 3, reviewed: false, notes: '', tags: [selected.setup.toLowerCase()],
    ...(reviews[selected.id] || {}),
  } : null
  const updateReview = (patch) => {
    if (!selected) return
    setReviews((current) => {
      const next = { ...current, [selected.id]: { ...review, ...patch } }
      writeStore('trade-reviews', next)
      return next
    })
  }
  const step = (delta) => {
    const next = filtered[selectedIndex + delta]
    if (!next) return
    setSelectedId(next.id)
    setPageIndex(Math.floor((selectedIndex + delta) / PAGE_SIZE))
  }
  const exportCsv = () => {
    const columns = ['date', 'time', 'closed', 'symbol', 'side', 'setup', 'qty', 'entry', 'exit', 'fees', 'pnl', 'grade']
    const escape = (value) => (/[",\n]/.test(String(value ?? '')) ? `"${String(value).replace(/"/g, '""')}"` : String(value ?? ''))
    const rows = [columns.join(','), ...filtered.map((trade) => columns.map((column) => escape(trade[column])).join(','))]
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }))
    link.download = `trades-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }
  const toggleSort = (key) => setSort((current) => ({ key, dir: current.key === key && current.dir === 'desc' ? 'asc' : 'desc' }))
  const sortIcon = (key) => sort.key === key
    ? <ChevronsUpDown size={12} className={`sort-icon ${sort.dir}`}/>
    : <ChevronsUpDown size={12} className="sort-icon idle"/>

  return <div className="page home ws-page trades-page">
    <PageHead
      title="Trades"
      meta={`${plural(scoped.length, 'closed trade')} · ${money(summarize(scoped).netPnl, { privacy })} net`}
      actions={<>
        <button className="ws-outline" onClick={exportCsv} disabled={!filtered.length}><Download size={15}/> Export CSV</button>
        <button className="start-day" onClick={openLog}><Plus size={16} strokeWidth={2.2}/> Log a trade</button>
      </>}
    />

    <MetricStrip items={[
      { label: 'Trades', value: `${stats.trades}`, sub: `${stats.wins}W · ${stats.losses}L`, line: dashLine(stats.wins, stats.trades) },
      { label: 'Win rate', value: percent(stats.winRate), sub: `${stats.wins} of ${stats.trades} trades`, line: gaugeLine(stats.winRate, 100, { mark: 0.5 }) },
      { label: 'Net P&L', value: money(stats.netPnl, { privacy }), tone: toneOf(stats.netPnl),
        sub: <><b className={`metric-emph tone-${toneOf(stats.netPnl)}`}>{money(stats.netPnl / Math.max(1, equitySeries(scoped).length), { privacy, decimals: 0 })}</b> per session</>,
        line: splitLine(stats.grossProfit, stats.grossLoss) },
      { label: 'Profit factor', value: ratio(stats.profitFactor), sub: `Avg win ${money(stats.avgWin, { privacy, decimals: 0 })} · loss ${money(-stats.avgLoss, { privacy, decimals: 0 })}`,
        line: gaugeLine(stats.profitFactor, 3, { mark: 1 / 3 }) },
      { label: 'Expectancy', value: money(stats.expectancy, { privacy }), tone: toneOf(stats.expectancy ?? 0), sub: 'Per trade',
        line: centerLine(stats.expectancy, Math.max(Math.abs(stats.avgWin), Math.abs(stats.avgLoss))) },
    ]}/>

    <div className="ws-toolbar">
      <label className="ws-search">
        <Search size={15}/>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search symbol or setup" aria-label="Search trades"/>
        {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={13}/></button>}
      </label>
      <Segmented options={['All', 'Wins', 'Losses']} value={outcome} onChange={setOutcome} label="Outcome"/>
      <Segmented options={['All', 'Long', 'Short']} value={side} onChange={setSide} label="Side"/>
      <select className="ws-select" value={setup} onChange={(event) => setSetup(event.target.value)} aria-label="Setup">
        {setups.map((option) => <option key={option}>{option}</option>)}
      </select>
      <span className="ws-count">{plural(filtered.length, 'result')}</span>
    </div>

    <div className="trades-layout">
      <Card className="trades-table-card">
        {filtered.length
          ? <>
              <div className="ws-table-wrap">
                <table className="feed-table ws-table">
                  <thead><tr>
                    <th><button type="button" onClick={() => toggleSort('date')}>Date {sortIcon('date')}</button></th>
                    <th><button type="button" onClick={() => toggleSort('symbol')}>Symbol {sortIcon('symbol')}</button></th>
                    <th>Side</th>
                    <th>Setup</th>
                    <th><button type="button" onClick={() => toggleSort('qty')}>Qty {sortIcon('qty')}</button></th>
                    <th>Entry → Exit</th>
                    <th>Grade</th>
                    <th><button type="button" onClick={() => toggleSort('pnl')}>Net P&L {sortIcon('pnl')}</button></th>
                  </tr></thead>
                  <tbody>
                    {visible.map((trade) => <tr
                      key={trade.id}
                      className={`jt-row ${toneOf(trade.pnl)}${selected?.id === trade.id ? ' is-selected' : ''}`}
                      onClick={() => setSelectedId(trade.id)}
                    >
                      <td className="jt-time"><span>{shortDay(trade.date)}</span><small>{trade.time}</small></td>
                      <td className="jt-symbol">
                        <span className="jt-sym">
                          <span className={`jt-token c-${symbolClassSlug(trade.symbol)}`} aria-hidden="true">{trade.symbol.slice(0, 2)}</span>
                          <b>{trade.symbol}</b>
                        </span>
                      </td>
                      <td><span className={`jt-side ${trade.side.toLowerCase()}`}>{trade.side}</span></td>
                      <td><span className="jt-setup">{trade.setup}</span></td>
                      <td className="jt-route"><span className="jt-qty">{trade.qty}</span></td>
                      <td className="jt-route">
                        {privacy
                          ? <span className="jt-prices">••••</span>
                          : <span className="jt-prices">{trade.entry.toFixed(2)}<i className={toneOf(trade.pnl)} aria-hidden="true"/>{trade.exit.toFixed(2)}</span>}
                      </td>
                      <td><span className={`grade-chip g-${trade.grade === 'A+' ? 'ap' : trade.grade.toLowerCase()}`}>{trade.grade}</span></td>
                      <td className={`jt-pnl tone-${toneOf(trade.pnl)}`}>{money(trade.pnl, { privacy })}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
              <div className="ws-pager">
                <span>{pageIndex * PAGE_SIZE + 1}–{Math.min(filtered.length, (pageIndex + 1) * PAGE_SIZE)} of {filtered.length}</span>
                <div>
                  <button type="button" aria-label="Previous page" disabled={pageIndex === 0} onClick={() => setPageIndex(pageIndex - 1)}><ChevronLeft size={15}/></button>
                  <span className="pager-index">{pageIndex + 1} / {pages}</span>
                  <button type="button" aria-label="Next page" disabled={pageIndex >= pages - 1} onClick={() => setPageIndex(pageIndex + 1)}><ChevronRight size={15}/></button>
                </div>
              </div>
            </>
          : <ChartState state="empty" detail="No trades match these filters."/>}
      </Card>

      <aside className="home-card trade-panel">
        {selected ? <>
          <div className="tp-head">
            <div>
              <div className="tp-title">
                <b>{selected.symbol}</b>
                <span className={`side-mark ${selected.side.toLowerCase()}`} title={selected.side} aria-label={selected.side}>{selected.side[0]}</span>
              </div>
              <small>{shortDay(selected.date)} · {selected.time} · {selected.setup}</small>
            </div>
            <div className="tp-nav">
              <button type="button" aria-label="Previous trade" disabled={selectedIndex <= 0} onClick={() => step(-1)}><ChevronLeft size={15}/></button>
              <button type="button" aria-label="Next trade" disabled={selectedIndex >= filtered.length - 1} onClick={() => step(1)}><ChevronRight size={15}/></button>
            </div>
          </div>

          <div className="tp-result">
            <strong className={`tone-${toneOf(selected.pnl)}`}>{money(selected.pnl, { privacy })}</strong>
          </div>

          <dl className="tp-figures">
            <div><dt>Gross</dt><dd>{money(selected.pnl + selected.fees, { privacy })}</dd></div>
            <div><dt>Fees</dt><dd>{money(selected.fees, { privacy, sign: false })}</dd></div>
            <div><dt>Quantity</dt><dd>{selected.qty}</dd></div>
            <div><dt>Hold time</dt><dd>{selected.closed ? `${clockMinutes(selected.closed) - clockMinutes(selected.time)}m` : '—'}</dd></div>
            <div><dt>Return</dt><dd className={`tone-${toneOf(selected.pnl)}`}>{percent((selected.pnl / (selected.qty * selected.entry)) * 100, { decimals: 2 })}</dd></div>
            <div><dt>Grade</dt><dd>{selected.grade}</dd></div>
          </dl>

          <ExecutionTrack trade={selected} privacy={privacy}/>

          <div className="tp-review">
            <div className="tp-review-head">
              <span>Review{review.notes ? <em><Check size={11} strokeWidth={3}/> saved</em> : null}</span>
              <button type="button" className={`tp-reviewed${review.reviewed ? ' on' : ''}`} aria-pressed={review.reviewed} onClick={() => updateReview({ reviewed: !review.reviewed })}>
                <Check size={13} strokeWidth={2.6}/> {review.reviewed ? 'Reviewed' : 'Mark reviewed'}
              </button>
            </div>
            <div className="tp-rating">
              <span>Execution</span>
              <div className="tp-scale" role="radiogroup" aria-label="Execution rating">
                {[1, 2, 3, 4, 5].map((value) => <button
                  key={value} type="button" role="radio" aria-checked={review.rating === value}
                  aria-label={`${value} of 5 — ${RATING_WORDS[value]}`} title={RATING_WORDS[value]}
                  className={`${value <= review.rating ? 'on' : ''} ${review.rating >= 4 ? 'good' : review.rating === 3 ? 'mid' : 'poor'}`}
                  onClick={() => updateReview({ rating: review.rating === value ? 0 : value })}
                />)}
              </div>
              <em>{RATING_WORDS[review.rating ?? 0]}</em>
            </div>
            <div className="tp-tags">
              {review.tags.map((tag) => <span key={tag} className="tp-tag">{tag}<button type="button" aria-label={`Remove ${tag}`} onClick={() => updateReview({ tags: review.tags.filter((item) => item !== tag) })}><X size={11}/></button></span>)}
              <input
                value={tagDraft} placeholder={review.tags.length ? 'Add tag…' : 'Add a tag…'} aria-label="Add tag"
                onFocus={() => setTagFocus(true)}
                onBlur={() => window.setTimeout(() => setTagFocus(false), 140)}
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && tagDraft.trim()) {
                    updateReview({ tags: [...new Set([...review.tags, tagDraft.trim().toLowerCase()])] })
                    setTagDraft('')
                  }
                }}
              />
            </div>
            {tagFocus && (() => {
              const draft = tagDraft.trim().toLowerCase()
              const suggestions = SUGGESTED_TAGS.filter((tag) => !review.tags.includes(tag) && (!draft || tag.includes(draft)))
              return suggestions.length ? <div className="tp-suggest">
                {suggestions.map((tag) => <button key={tag} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { updateReview({ tags: [...review.tags, tag] }); setTagDraft('') }}>{tag}</button>)}
              </div> : null
            })()}
            <button type="button" className={`tp-note-toggle${noteOpen ? ' open' : ''}`} aria-expanded={noteOpen} onClick={() => setNoteOpen(!noteOpen)}>
              <ChevronRight size={13} className="tp-note-caret"/>
              <span>{review.notes ? 'Note' : 'Add a note'}</span>
              {!noteOpen && review.notes && <em>{review.notes}</em>}
            </button>
            {noteOpen && <textarea
              value={review.notes} placeholder="What did you see, and would you take it again?"
              aria-label="Trade notes" autoFocus onChange={(event) => updateReview({ notes: event.target.value })}
            />}

          </div>
        </> : <ChartState state="empty" detail="Select a trade to review it."/>}
      </aside>
    </div>
  </div>
}

/* ============================================================ reports */

const REPORT_TABS = ['Overview', 'Setups', 'Symbols', 'Timing', 'Risk']
// Designs by RNSENCE Studio
export function ReportsPage({ privacy, range = 'All', openJournal, openTrades }) {
  const trades = useMemo(() => scopeByRange(tradeLog, range), [range])
  const [tab, setTab] = useState('Overview')

  const data = useMemo(() => {
    const series = equitySeries(trades)
    const stats = summarize(trades)
    const weekdayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    const weekdays = groupStats(trades, (trade) => WEEKDAY_NAMES[new Date(`${trade.date}T00:00:00Z`).getUTCDay()])
      .sort((a, b) => weekdayOrder.indexOf(a.key) - weekdayOrder.indexOf(b.key))
    const hours = groupStats(trades, (trade) => String(trade.hour).padStart(2, '0')).sort((a, b) => a.key.localeCompare(b.key))
    const months = groupStats(trades, (trade) => trade.date.slice(0, 7)).sort((a, b) => a.key.localeCompare(b.key))
    const setups = groupStats(trades, (trade) => trade.setup).sort((a, b) => b.pnl - a.pnl)
    const symbols = groupStats(trades, (trade) => trade.symbol).sort((a, b) => b.pnl - a.pnl)
    const sides = groupStats(trades, (trade) => trade.side)
    const rolling = rollingWinRate(trades, 20)
    const ordered = [...trades].sort((a, b) => b.pnl - a.pnl)
    const edges = [-Infinity, -400, -200, -100, 0, 100, 200, 400, Infinity]
    const distribution = edges.slice(0, -1).map((from, index) => {
      const to = edges[index + 1]
      const count = trades.filter((trade) => trade.pnl >= from && trade.pnl < to).length
      const label = from === -Infinity ? `<${compactMoney(to)}` : to === Infinity ? `${compactMoney(from)}+` : from === 0 ? '$0' : from > 0 ? `+${compactMoney(from)}` : compactMoney(from)
      return { label, value: count, from, to, tone: from < 0 ? 'neg' : 'pos' }
    })
    return { series, stats, weekdays, hours, months, setups, symbols, sides, rolling, best: ordered[0], worst: ordered[ordered.length - 1], distribution, streaks: streaks(trades) }
  }, [trades])

  const monthView = useMemo(() => {
    const prefix = trades.length ? trades.map((trade) => trade.date.slice(0, 7)).sort().at(-1) : null
    if (!prefix) return null
    const monthTrades = trades.filter((trade) => trade.date.startsWith(prefix))
    return { month: monthCalendar(prefix, monthTrades), stats: insightStats(monthTrades) }
  }, [trades])

  const fmt0 = (value) => money(value, { privacy, decimals: 0 })
  const moneyTip = (label) => (item) => <>
    <div className="tip-title">{label(item)}</div>
    <TipRows rows={[
      { label: 'Net P&L', value: money(item.pnl, { privacy }), tone: toneOf(item.pnl) },
      { label: 'Trades', value: `${item.trades}` },
      { label: 'Win rate', value: percent(item.winRate, { decimals: 0 }) },
    ]}/>
  </>
  const longs = data.sides.find((item) => item.key === 'Long')
  const shorts = data.sides.find((item) => item.key === 'Short')

  return <div className="page home ws-page reports-ws">
    <PageHead title="Reports" meta={`${plural(data.stats.trades, 'closed trade')} · ${plural(data.series.length, 'session')} analysed`}/>

    <div className="ws-tabs">
      <Segmented options={REPORT_TABS} value={tab} onChange={setTab} label="Report" className="compact rail-switch report-switch"/>
    </div>

    {!trades.length ? <Card><ChartState state="empty"/></Card> : <>
      {tab === 'Overview' && <>
        <MetricStrip items={[
          { label: 'Net P&L', value: money(data.stats.netPnl, { privacy }), tone: toneOf(data.stats.netPnl),
            sub: `${money(data.stats.grossProfit, { privacy, decimals: 0, sign: false })} won · ${money(data.stats.grossLoss, { privacy, decimals: 0, sign: false })} lost`,
            line: splitLine(data.stats.grossProfit, data.stats.grossLoss) },
          { label: 'Win rate', value: percent(data.stats.winRate), sub: `${data.stats.wins}W · ${data.stats.losses}L`,
            line: gaugeLine(data.stats.winRate, 100, { mark: 0.5 }) },
          { label: 'Profit factor', value: ratio(data.stats.profitFactor), sub: 'Break-even marked at 1.00',
            line: gaugeLine(data.stats.profitFactor, 3, { mark: 1 / 3 }) },
          { label: 'Expectancy', value: money(data.stats.expectancy, { privacy }), tone: toneOf(data.stats.expectancy ?? 0), sub: 'Per trade',
            line: centerLine(data.stats.expectancy, Math.max(Math.abs(data.stats.avgWin), Math.abs(data.stats.avgLoss))) },
          { label: 'Avg win / loss', value: ratio(data.stats.avgWinLoss), sub: `${fmt0(data.stats.avgWin)} vs ${fmt0(-data.stats.avgLoss)}`,
            line: splitLine(data.stats.avgWin, data.stats.avgLoss) },
          { label: 'Max drawdown', value: money(data.stats.maxDrawdown, { privacy }), tone: 'neg',
            sub: `${Math.abs(data.stats.maxDrawdownPct).toFixed(1)}% of account`,
            line: gaugeLine(data.stats.maxDrawdownPct, 100, { tone: 'neg' }) },
        ]}/>
        <div className="ws-grid two-one">
          <Card title="Monthly build-up" aside={<span className="card-note">Each bar starts where the last month closed</span>}>
            {data.months.length > 1
              ? <MonthlyWaterfall months={data.months} height={280} privacy={privacy}/>
              : <ChartState state="insufficient" minData={2}/>}
          </Card>
          <Card title="Rolling 20-trade win rate">
            {data.rolling.length > 1
              ? <TrendLine
                  points={data.rolling.filter((_, index, list) => index % Math.max(1, Math.ceil(list.length / 90)) === 0 || index === list.length - 1).map((point) => ({ label: `#${point.sequence}`, value: point.value, from: point.from, to: point.to }))}
                  height={280} reference={50} referenceLabel="50%"
                  axisFormat={(value) => `${Math.round(value)}%`}
                  tipFormat={(point) => <><div className="tip-title">Trades to {point.label}</div><TipRows rows={[{ label: 'Win rate', value: percent(point.value), tone: point.value >= 50 ? 'pos' : 'neg' }, { label: 'Window', value: `${shortDay(point.from)} – ${shortDay(point.to)}` }]}/></>}
                />
              : <ChartState state="insufficient" minData={20}/>}
          </Card>
        </div>
        <div className="ws-grid three snapshot-row">
          <Card title="Long vs short">
            <div className="ls-compare">
              {[['Long', longs], ['Short', shorts]].map(([name, group]) => <div key={name}>
                <span>{name}</span>
                <strong className={`tone-${toneOf(group?.pnl ?? 0)}`}>{fmt0(group?.pnl ?? 0)}</strong>
                <small>{plural(group?.trades ?? 0, 'trade')} · {percent(group?.winRate ?? 0, { decimals: 0 })} wins</small>
              </div>)}
            </div>
          </Card>
          {[['Best trade', data.best], ['Worst trade', data.worst]].map(([title, trade]) => <Card key={title} title={title}>
            <div className="extreme-trade">
              <strong className={`tone-${toneOf(trade.pnl)}`}>{money(trade.pnl, { privacy })}</strong>
              <span><b>{trade.symbol}</b> <span className={`side-mark ${trade.side.toLowerCase()}`} title={trade.side} aria-label={trade.side}>{trade.side[0]}</span></span>
              <small>{shortDay(trade.date)} · {trade.time} · {trade.setup}</small>
            </div>
          </Card>)}
        </div>
        {monthView && <PerformanceInsights
          month={monthView.month} stats={monthView.stats} privacy={privacy}
          openJournal={openJournal ?? (() => {})} openTrades={openTrades ?? (() => {})}
        />}
      </>}

      {(tab === 'Setups' || tab === 'Symbols') && (() => {
        const rows = tab === 'Setups' ? data.setups : data.symbols
        return <div className="ws-grid one-one">
          <Card title={`Net P&L by ${tab === 'Setups' ? 'setup' : 'symbol'}`}>
            <BarList rows={rows.map((row) => ({ label: row.key, value: row.pnl, meta: plural(row.trades, 'trade') }))} format={fmt0}/>
          </Card>
          <Card title="Breakdown">
            <div className="ws-table-wrap">
              <table className="feed-table ws-table compact">
                <thead><tr><th>{tab === 'Setups' ? 'Setup' : 'Symbol'}</th><th>Trades</th><th>Win rate</th><th>Avg / trade</th><th>Profit factor</th></tr></thead>
                <tbody>{rows.map((row) => <tr key={row.key}>
                  <td><b>{row.key}</b></td>
                  <td>{row.trades}</td>
                  <td>
                    <span className="mini-meter"><i style={{ width: `${row.winRate}%` }}/></span>
                    {percent(row.winRate, { decimals: 0 })}
                  </td>
                  <td className={`tone-${toneOf(row.avg)}`}>{fmt0(row.avg)}</td>
                  <td>{ratio(row.profitFactor)}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </Card>
        </div>
      })()}

      {tab === 'Timing' && <>
        <div className="ws-grid one-one">
          <Card title="Net P&L by weekday">
            <CategoryColumns data={data.weekdays.map((item) => ({ ...item, label: item.key, value: item.pnl }))} height={250} axisFormat={(value) => compactMoney(value, { privacy })} tip={moneyTip((item) => item.key)}/>
          </Card>
          <Card title="Net P&L by entry hour" aside={<span className="ws-hint">US Eastern</span>}>
            <CategoryColumns data={data.hours.map((item) => ({ ...item, label: `${item.key}:00`, value: item.pnl }))} height={250} axisFormat={(value) => compactMoney(value, { privacy })} tip={moneyTip((item) => `${item.key}:00 – ${item.key}:59`)}/>
          </Card>
        </div>
        <Card title="By month">
          <div className="ws-table-wrap">
            <table className="feed-table ws-table compact">
              <thead><tr><th>Month</th><th>Trades</th><th>Win rate</th><th>Profit factor</th><th>Average</th><th>Net P&L</th></tr></thead>
              <tbody>{data.months.map((row) => <tr key={row.key}>
                <td><b>{MONTH_NAMES[Number(row.key.slice(5, 7)) - 1]} {row.key.slice(0, 4)}</b></td>
                <td>{row.trades}</td>
                <td><span className="mini-meter"><i style={{ width: `${row.winRate}%` }}/></span>{percent(row.winRate, { decimals: 0 })}</td>
                <td>{ratio(row.profitFactor)}</td>
                <td className={`tone-${toneOf(row.avg)}`}>{fmt0(row.avg)}</td>
                <td className={`tone-${toneOf(row.pnl)}`}>{fmt0(row.pnl)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </Card>
      </>}

      {tab === 'Risk' && <>
        <MetricStrip items={[
          { label: 'Max drawdown', value: money(data.stats.maxDrawdown, { privacy }), tone: 'neg', sub: `${Math.abs(data.stats.maxDrawdownPct).toFixed(1)}% of account`,
            line: gaugeLine(data.stats.maxDrawdownPct, 100, { tone: 'neg' }) },
          { label: 'Recovery factor', value: data.stats.recoveryFactor == null ? '—' : `${data.stats.recoveryFactor.toFixed(2)}×`, sub: 'Net profit per unit of drawdown',
            line: gaugeLine(data.stats.recoveryFactor ?? 0, 3, { mark: 1 / 3 }) },
          { label: 'Longest win streak', value: plural(data.streaks.win, 'trade'), sub: `Best run of ${data.streaks.win + data.streaks.loss} streak trades`,
            line: dashLine(data.streaks.win, Math.max(data.streaks.win, data.streaks.loss)) },
          { label: 'Longest losing streak', value: plural(data.streaks.loss, 'trade'), sub: `Against ${plural(data.streaks.win, 'winning trade')}`,
            line: dashLine(Math.max(data.streaks.win, data.streaks.loss) - data.streaks.loss, Math.max(data.streaks.win, data.streaks.loss)) },
          { label: 'Largest loss', value: money(data.worst.pnl, { privacy }), tone: 'neg', sub: `${data.worst.symbol} · ${shortDay(data.worst.date)}`,
            line: centerLine(data.worst.pnl, Math.max(Math.abs(data.best.pnl), Math.abs(data.worst.pnl))) },
        ]}/>
        <div className="ws-grid two-one">
          <Card title="Drawdown from peak">
            <TrendLine
              points={data.series.map((point) => ({ label: shortDay(point.date), value: point.drawdown, date: point.date }))}
              height={260} tone="neg" fillTo="zero" smooth={false}
              axisFormat={(value) => compactMoney(value, { privacy })}
              tipFormat={(point) => <><div className="tip-title">{point.label}</div><TipRows rows={[{ label: 'Below peak', value: money(point.value, { privacy }), tone: point.value < 0 ? 'neg' : 'flat' }]}/></>}
            />
          </Card>
          <Card title="Trade outcome distribution">
            <CategoryColumns
              data={data.distribution} height={260} toneKey="tone"
              axisFormat={(value) => `${Math.round(value)}`}
              tip={(item) => <><div className="tip-title">{item.from === -Infinity ? `Losses beyond ${compactMoney(item.to, { privacy })}` : item.to === Infinity ? `Wins above ${compactMoney(item.from, { privacy })}` : `${compactMoney(item.from, { privacy })} to ${compactMoney(item.to, { privacy })}`}</div><TipRows rows={[{ label: 'Trades', value: `${item.value}` }, { label: 'Share', value: percent((item.value / Math.max(1, data.stats.trades)) * 100, { decimals: 0 }) }]}/></>}
            />
          </Card>
        </div>
      </>}
    </>}
  </div>
}

/* ============================================================ prop firms */

/** Firm marks live in public/assets/marks (served from /assets/marks): brand-blue glyphs on transparent, set on a white tile. */
const FIRM_LOGOS = {
  Apex: '/assets/marks/apex.png',
  Topstep: '/assets/marks/topstep.png',
  MyFundedFutures: '/assets/marks/mff.png',
  Tradeify: '/assets/marks/tradeify.png',
  Lucid: '/assets/marks/lucid.png',
  'Take Profit Trader': '/assets/marks/tpt.png',
}

function FirmLogo({ firm }) {
  const [failed, setFailed] = useState(false)
  const src = FIRM_LOGOS[firm]
  return <span className="acct-logo">
    {src && !failed
      ? <img src={src} alt={`${firm} logo`} width="34" height="34" onError={() => setFailed(true)}/>
      : firm.slice(0, 2).toUpperCase()}
  </span>
}

/** Net result per firm: every bar grows from the left, length is the size of the result, colour is its sign. */

/** Month-by-month build-up: each bar picks up where the last one closed. */
function MonthlyWaterfall({ months, height = 280, privacy = false }) {
  const [ref, size] = useSize()
  const [active, setActive] = useState(null)
  const width = size.width || 640
  const pad = { top: 16, right: 14, bottom: 30, left: 54 }
  const plotWidth = Math.max(60, width - pad.left - pad.right)
  const plotHeight = Math.max(90, height - pad.top - pad.bottom)

  let running = 0
  const steps = months.map((month) => {
    const from = running
    running += month.pnl
    return { ...month, from, to: running }
  })
  const levels = [0, ...steps.map((step) => step.to), ...steps.map((step) => step.from)]
  const ticks = niceTicks(Math.min(...levels), Math.max(...levels), 4)
  const low = Math.min(ticks[0], ...levels)
  const high = Math.max(ticks[ticks.length - 1], ...levels) * 1.04
  const yAt = (value) => pad.top + (1 - (value - low) / ((high - low) || 1)) * plotHeight
  const band = plotWidth / Math.max(1, steps.length)
  const barWidth = Math.max(6, Math.min(34, band * 0.52))
  const xAt = (index) => pad.left + index * band + band / 2
  const label = (key) => `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]}`
  const point = active == null ? null : steps[active]

  return <div className="cume-chart waterfall" ref={ref} style={{ height }}>
    <svg width={width} height={height} role="img" aria-label="Net P&L added by each month">
      {ticks.map((tick) => <g key={tick}>
        <line className={tick === 0 ? 'wf-zero' : 'cume-grid'} x1={pad.left} y1={yAt(tick)} x2={pad.left + plotWidth} y2={yAt(tick)}/>
        <text className="cume-axis" x={pad.left - 12} y={yAt(tick) + 4} textAnchor="end">{compactMoney(tick, { privacy })}</text>
      </g>)}
      {steps.map((step, index) => index === 0 ? null : (
        <line
          key={`link-${step.key}`} className="wf-link"
          x1={xAt(index - 1) + barWidth / 2} y1={yAt(step.from)} x2={xAt(index) - barWidth / 2} y2={yAt(step.from)}
        />
      ))}
      {steps.map((step, index) => {
        const top = Math.min(yAt(step.from), yAt(step.to))
        const size = Math.max(2, Math.abs(yAt(step.to) - yAt(step.from)))
        return <g key={step.key} onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)}>
          <rect x={pad.left + index * band} y={pad.top} width={band} height={plotHeight} fill="transparent"/>
          <rect
            className={`wf-bar ${toneOf(step.pnl)}${active === index ? ' is-active' : ''}`}
            x={xAt(index) - barWidth / 2} y={top} width={barWidth} height={size} rx="3"
          />
        </g>
      })}
      {steps.map((step, index) => <text key={`x-${step.key}`} className="cume-axis" x={xAt(index)} y={height - 9} textAnchor="middle">{label(step.key)}</text>)}
    </svg>
    <Tooltip point={point ? { x: xAt(active), y: Math.min(yAt(point.from), yAt(point.to)) } : null} width={width}>
      {point && <>
        <div className="tip-title">{label(point.key)} {point.key.slice(0, 4)}</div>
        <TipRows rows={[
          { label: 'Month net', value: money(point.pnl, { privacy }), tone: toneOf(point.pnl) },
          { label: 'Running total', value: money(point.to, { privacy }), tone: toneOf(point.to) },
          { label: 'Trades', value: `${point.trades} · ${percent(point.winRate, { decimals: 0 })} win` },
        ]}/>
      </>}
    </Tooltip>
  </div>
}

function FirmNetList({ rows, format }) {
  const peak = Math.max(1, ...rows.map((row) => Math.abs(row.value)))
  return <ul className="firm-net">
    {rows.map((row) => <li key={row.label}>
      <div className="fn-head">
        <FirmLogo firm={row.label}/>
        <span className="fn-name">{row.label}<small>{row.meta}</small></span>
        <span className={`fn-value tone-${toneOf(row.value)}`}>{format(row.value)}</span>
      </div>
      <span className="fn-track" aria-hidden="true">
        <i className={toneOf(row.value)} style={{ width: `${Math.max(2, (Math.abs(row.value) / peak) * 100)}%` }}/>
      </span>
    </li>)}
  </ul>
}

const TYPE_TONE = { Payout: 'pos', Evaluation: 'neutral', Subscription: 'neutral', Activation: 'neutral', Reset: 'warn' }

// Designs by RNSENCE Studio
export function PropFirmsPage({ privacy }) {
  const [dialog, setDialog] = useState(null)
  const [ledgerView, setLedgerView] = useState('All')
  const [boneyardOpen, setBoneyardOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [openAccounts, setOpenAccounts] = useState(() => new Set())
  const toggleAccount = (id) => setOpenAccounts((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const totals = useMemo(() => {
    const spent = propTransactions.filter((item) => item.amount < 0).reduce((sum, item) => sum - item.amount, 0)
    const paid = propTransactions.filter((item) => item.type === 'Payout' && item.status === 'Paid').reduce((sum, item) => sum + item.amount, 0)
    const pendingRows = propTransactions.filter((item) => item.type === 'Payout' && item.status === 'Pending').sort((a, b) => a.date.localeCompare(b.date))
    const pending = pendingRows.reduce((sum, item) => sum + item.amount, 0)
    const fundedCapital = propAccounts.filter((account) => account.phase === 'Funded' && account.status === 'Active').reduce((sum, account) => sum + account.size, 0)
    const paidIn = (month) => propTransactions.filter((item) => item.type === 'Payout' && item.status === 'Paid' && item.date.startsWith(month)).reduce((sum, item) => sum + item.amount, 0)
    const latest = [...propTransactions].sort((a, b) => b.date.localeCompare(a.date))[0]?.date.slice(0, 7)
    const priorDate = latest ? new Date(Date.UTC(Number(latest.slice(0, 4)), Number(latest.slice(5, 7)) - 2, 1)) : null
    const prior = priorDate ? priorDate.toISOString().slice(0, 7) : null
    const monthPaid = latest ? paidIn(latest) : 0
    const priorPaid = prior ? paidIn(prior) : 0
    return {
      spent, paid, pending, pendingFrom: pendingRows[0] ?? null, net: paid - spent, roi: spent ? ((paid - spent) / spent) * 100 : 0, fundedCapital,
      monthPaid, priorPaid, priorLabel: priorDate ? MONTH_NAMES[priorDate.getUTCMonth()] : '',
      monthChange: priorPaid ? ((monthPaid - priorPaid) / priorPaid) * 100 : null,
    }
  }, [])

  const monthly = useMemo(() => {
    const months = [...new Set(propTransactions.map((item) => item.date.slice(0, 7)))].sort()
    return months.map((key) => {
      const rows = propTransactions.filter((item) => item.date.startsWith(key))
      const spent = rows.filter((item) => item.amount < 0).reduce((sum, item) => sum - item.amount, 0)
      const paid = rows.filter((item) => item.type === 'Payout').reduce((sum, item) => sum + item.amount, 0)
      const month = Number(key.slice(5, 7)) - 1
      return { label: MONTH_NAMES[month], title: `${MONTH_NAMES[month]} ${key.slice(0, 4)}`, spent, paid, net: paid - spent }
    })
  }, [])

  const flow = useMemo(() => {
    const spent = monthly.reduce((sum, item) => sum + item.spent, 0)
    const paid = monthly.reduce((sum, item) => sum + item.paid, 0)
    const best = monthly.reduce((top, item) => (item.net > top.net ? item : top), monthly[0])
    const lastPayout = [...propTransactions].filter((item) => item.type === 'Payout').sort((a, b) => b.date.localeCompare(a.date))[0]
    return {
      spent, paid, best, lastPayout,
      multiple: spent ? paid / spent : null,
      average: monthly.length ? (paid - spent) / monthly.length : 0,
      paidMonths: monthly.filter((item) => item.paid > 0).length,
    }
  }, [monthly])

  const firms = useMemo(() => {
    const names = [...new Set(propTransactions.map((item) => item.firm))]
    return names.map((firm) => {
      const rows = propTransactions.filter((item) => item.firm === firm)
      const spent = rows.filter((item) => item.amount < 0).reduce((sum, item) => sum - item.amount, 0)
      const paid = rows.filter((item) => item.type === 'Payout').reduce((sum, item) => sum + item.amount, 0)
      return { label: firm, value: paid - spent, meta: `${money(spent, { privacy, sign: false, decimals: 0 })} in · ${money(paid, { privacy, sign: false, decimals: 0 })} out` }
    }).sort((a, b) => b.value - a.value)
  }, [privacy])

  const ledger = [...propTransactions]
    .filter((item) => ledgerView === 'All' || (ledgerView === 'Payouts' ? item.type === 'Payout' : item.type !== 'Payout'))
    .sort((a, b) => b.date.localeCompare(a.date))
  const active = propAccounts.filter((account) => account.status === 'Active' || account.status === 'Passed').length

  const liveAccounts = propAccounts.filter((account) => account.status !== 'Breached')
  const graveyard = propAccounts.filter((account) => account.status === 'Breached')
  const graveyardFees = graveyard.reduce((total, account) => total + (account.fee ?? 0), 0)

  const renderAccount = (account) => {
      const pnl = account.balance - account.start
      const buffer = Math.max(0, account.balance - account.floor)
      const bufferShare = Math.min(1, buffer / account.maxDrawdown)
      const bufferTone = account.status === 'Breached' ? 'neg' : bufferShare > 0.6 ? 'pos' : bufferShare > 0.3 ? 'warn' : 'neg'
      const progress = account.target ? Math.max(0, Math.min(1, pnl / (account.target - account.start))) : null
      const statusLabel = account.status === 'Breached' ? 'Breached' : account.status === 'Passed' ? 'Passed' : account.phase
      const goal = account.target ?? Math.round(account.size * 1.06)
      const open = openAccounts.has(account.id)
      const drawerId = `acct-meters-${account.id}`
      return <article key={account.id} className={`acct-card${account.status === 'Breached' ? ' is-breached' : ''}${open ? ' is-open' : ''}`}>
        <header>
          <FirmLogo firm={account.firm}/>
          <div className="acct-id">
            <b title={`${account.firm} ${account.size / 1000}K`}>{account.firm} {account.size / 1000}K</b>
            <span className="acct-sub">
              <span className={`acct-status ${statusLabel.toLowerCase()}`}>{statusLabel}</span>
              <small title={account.id}>{account.id}</small>
            </span>
          </div>
          <span className={`acct-delta ${toneOf(pnl)}`}>{money(pnl, { privacy, decimals: 0 })}</span>
        </header>
        <div className="acct-balance">
          <strong>{money(account.balance, { privacy, sign: false, decimals: 0 })}<em className="acct-goal">/{money(goal, { privacy, sign: false, decimals: 0 })}</em></strong>
          <button
            type="button" className="acct-toggle" aria-expanded={open} aria-controls={drawerId}
            aria-label={`${open ? 'Hide' : 'Show'} ${progress != null ? 'target' : 'payout'} and drawdown`}
            title={open ? 'Hide details' : 'Show details'} onClick={() => toggleAccount(account.id)}
          >
            <ChevronDown size={13} strokeWidth={2.2}/>
          </button>
        </div>
        <div className="acct-drawer" id={drawerId} inert={!open}><div className="acct-meters">
          {progress != null
            ? <div className="acct-meter">
                <div className="acct-meter-head"><span>Profit target</span><b>{money(Math.max(0, pnl), { privacy, sign: false, decimals: 0 })} <em>/ {money(account.target - account.start, { privacy, sign: false, decimals: 0 })}</em></b></div>
                <div className="acct-bar"><i className="accent" style={{ width: `${progress * 100}%` }}/></div>
              </div>
            : <div className="acct-meter">
                <div className="acct-meter-head"><span>Payout window</span><b className={account.payoutEligible ? 'tone-pos' : undefined}>{account.payoutEligible ? 'Eligible now' : 'Not yet'}</b></div>
                <div className="acct-bar"><i className="pos" style={{ width: account.payoutEligible ? '100%' : '40%' }}/></div>
              </div>}
          <div className="acct-meter">
            <div className="acct-meter-head"><span>Drawdown room</span><b>{money(buffer, { privacy, sign: false, decimals: 0 })} <em>/ {money(account.maxDrawdown, { privacy, sign: false, decimals: 0 })}</em></b></div>
            <div className="acct-bar"><i className={bufferTone} style={{ width: `${bufferShare * 100}%` }}/></div>
          </div>
        </div></div>
      </article>
  }

  return <div className="page home ws-page prop-ws">
    <PageHead
      title="Prop firms"
      meta={`${plural(propAccounts.length, 'account')} · ${active} active · ${money(totals.fundedCapital, { privacy, sign: false, decimals: 0 })} funded capital`}
      actions={<>
        <button className="ws-outline" onClick={() => setDialog('entry')}><FlagstickIcon size={14}/> Record payout</button>
        <button className="start-day" onClick={() => setDialog('account')}><Plus size={16} strokeWidth={2.2}/> Add account</button>
      </>}
    />

    <MetricStrip items={[
      { label: 'Money spent', value: money(totals.spent, { privacy, sign: false }), sub: 'Evaluations, resets & fees',
        line: gaugeLine(totals.spent, Math.max(totals.spent, totals.paid), { tone: 'neg' }) },
      { label: 'Payouts received', value: money(totals.paid, { privacy, sign: false }), tone: 'pos', line: dashLine(totals.paid, Math.max(totals.spent, totals.paid)),
        sub: totals.monthChange == null ? `${money(totals.monthPaid, { privacy, sign: false, decimals: 0 })} this month` : <>
          <span className={`compare-delta ${totals.monthChange >= 0 ? 'pos' : 'neg'}`}>
            {totals.monthChange >= 0 ? <ArrowUpRight size={13} strokeWidth={3}/> : <ArrowDownRight size={13} strokeWidth={3}/>}
            {Math.abs(Math.round(totals.monthChange))}%
          </span>
          <span title={`${money(totals.monthPaid, { privacy, sign: false, decimals: 0 })} this month vs ${money(totals.priorPaid, { privacy, sign: false, decimals: 0 })} in ${totals.priorLabel}`}>vs {totals.priorLabel} payouts</span>
        </> },
      { label: 'Net return', value: money(totals.net, { privacy }), tone: toneOf(totals.net), sub: <><b className={`metric-emph tone-${toneOf(totals.roi)}`}>{Math.round(totals.roi)}%</b> on money spent</>,
        line: centerLine(totals.net, Math.max(totals.spent, totals.paid)) },
      { label: 'Pending payout', value: money(totals.pending, { privacy, sign: false }),
        sub: totals.pendingFrom ? <>Awaiting <b className="metric-emph">{totals.pendingFrom.firm}</b> · since {shortDay(totals.pendingFrom.date)}</> : 'Nothing pending',
        line: gaugeLine(totals.pending, Math.max(totals.paid, totals.pending)) },
    ]}/>

    <div className="acct-grid">
      {liveAccounts.map((account) => renderAccount(account))}
    </div>

    {graveyard.length > 0 && <section className={`graveyard${boneyardOpen ? ' is-open' : ''}`}>
      <button
        type="button" className="grave-head" aria-expanded={boneyardOpen}
        onClick={() => setBoneyardOpen(!boneyardOpen)}
      >
        <span className="grave-title">Graveyard <em>{graveyard.length}</em></span>
        <span className="grave-meta">{money(graveyardFees, { privacy, sign: false, decimals: 0 })} in fees burned</span>
        <span className="grave-caret"><ChevronDown size={14} strokeWidth={2.2}/></span>
      </button>
      <div className="grave-body">
        {graveyard.map((account, index) => <div
          className="grave-slot" key={account.id}
          style={{ '--i': index, '--back': graveyard.length - 1 - index, zIndex: graveyard.length - index }}
        >{renderAccount(account)}</div>)}
      </div>
    </section>}


    <div className="ws-grid two-one">
      <Card title="Cash flow" aside={<div className="ws-legend"><span><i className="spent"/>Spent</span><span><i className="paid"/>Payouts</span><span><i className="loss"/>Net loss</span></div>}>
        <div className="flow-layout">
          <GroupedColumns
            data={monthly} height={260} privacy={privacy} netLoss
            series={[{ key: 'spent', label: 'Spent', tone: 'spent' }, { key: 'paid', label: 'Payouts', tone: 'paid' }]}
          />
          <aside className="flow-side">
            <div className="flow-lead">
              <span>Return on fees</span>
              <strong>{flow.multiple == null ? '—' : `${flow.multiple.toFixed(1)}×`}</strong>
              <div className="flow-split" aria-hidden="true">
                <i className="spent" style={{ flex: flow.spent || 1 }}/>
                <i className="paid" style={{ flex: flow.paid || 0.0001 }}/>
              </div>
              <small>{money(flow.spent, { privacy, sign: false, decimals: 0 })} in · {money(flow.paid, { privacy, sign: false, decimals: 0 })} out</small>
            </div>
            <dl className="flow-stats">
              <div><dt>Best month <em>{flow.best?.label}</em></dt><dd className="tone-pos">{money(flow.best?.net ?? 0, { privacy, decimals: 0 })}</dd></div>
              <div><dt>Avg per month</dt><dd className={`tone-${toneOf(flow.average)}`}>{money(flow.average, { privacy, decimals: 0 })}</dd></div>
              {flow.lastPayout && <div><dt>Last payout <em>{shortDay(flow.lastPayout.date)}</em></dt><dd className="tone-pos">{money(flow.lastPayout.amount, { privacy, decimals: 0 })}</dd></div>}
            </dl>
          </aside>
        </div>
      </Card>
      <Card title="Net by firm" className="firm-card">
        <FirmNetList rows={firms} format={(value) => money(value, { privacy, decimals: 0 })}/>
      </Card>
    </div>

    <Card title="Ledger" aside={<Segmented options={['All', 'Payouts', 'Expenses']} value={ledgerView} onChange={setLedgerView} label="Ledger view" className="cal-match"/>}>
      <div className="ws-table-wrap">
        <table className="feed-table ws-table compact ledger">
          <thead><tr><th>Date</th><th>Firm</th><th>Account</th><th>Type</th><th>Status</th><th>Amount</th></tr></thead>
          <tbody>{(showAll ? ledger : ledger.slice(0, 8)).map((item, index) => <tr key={`${item.date}-${item.account}-${index}`}>
            <td>{shortDay(item.date)}, {item.date.slice(0, 4)}</td>
            <td><b>{item.firm}</b></td>
            <td className="cell-mono">{item.account}</td>
            <td><span className={`type-chip ${TYPE_TONE[item.type] ?? 'neutral'}`}>{item.type}</span></td>
            <td>{item.type === 'Payout'
              ? <span className={`status-chip ${item.status === 'Paid' ? 'paid' : 'pending'}`}>{item.status}</span>
              : <span className="status-chip settled">Settled</span>}</td>
            <td className={`tone-${toneOf(item.amount)}`}>{money(item.amount, { privacy })}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {ledger.length > 8 && <button type="button" className="ws-more" onClick={() => setShowAll(!showAll)}>
        {showAll ? 'Show fewer' : `Show all ${ledger.length} entries`}
      </button>}
    </Card>
    {dialog === 'entry' && <PropEntryDialog onClose={() => setDialog(null)}/>}
    {dialog === 'account' && <AddAccountDialog onClose={() => setDialog(null)}/>}
  </div>
}

