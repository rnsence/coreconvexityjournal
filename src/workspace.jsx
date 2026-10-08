/**
 * Trades, Reports and Prop firms — built on the light workspace system used by the
 * dashboard (white cards, purple accent, green/red for results only).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownRight, ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, Import, Plus,
  Search, Star, X,
} from 'lucide-react'
import {
  ChartState, CumulativeChart, SymbolToken, TipRows, Tooltip, compactMoney, money, niceTicks, percent, ratio, smoothPath, toneOf, useEasternToday, useSize, titleCase,
} from './viz'
import {
  calendarGrid, equitySeries, groupStats, rollingWinRate, scopeByRange, streaks, summarize,
} from './analytics'
import { AddAccountDialog, PropEntryDialog } from './dialogs'
import { PerformanceInsights, insightStats, monthCalendar } from './pages'
import { propAccounts, propTransactions, tradeLog } from './data'
import { symbolClassSlug } from './symbols'
import { TradeCardActions } from './port/trades-card'
import { TradeDetail, TradeDetailSheet } from './port/trades-detail'
import { ManualFillsForm, recordedMessage } from './port/trades-fillsform'
import { AllMetrics } from './port/trades-metrics'
import { accountForTrade, clearFlash, peekFlash, realizedR, setFlash } from './port/trading-data'
import { Drawer, DrawerHeader, Sheet } from './dialogs'
import { Select } from './select'

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
export function PageHead({ title, meta, actions }) {
  const today = useEasternToday()
  return <header className="home-header ws-header">
    <div className="home-greeting">
      <div className="greeting-plate">
        <div className="ws-title-row">
          <h1>{titleCase(title)}</h1>
          {actions && <div className="home-actions ws-plate-actions">{actions}</div>}
        </div>
        {meta && <p className="ws-meta">{meta}</p>}
      </div>
    </div>
  </header>
}

/** One white card, divided into metric cells. */
// Designs by RNSENCE Studio
/** The firm an account name belongs to, so its mark can sit beside the name. */
export function firmOf(name = '') {
  const text = String(name)
  if (/topstep/i.test(text)) return 'Topstep'
  if (/apex/i.test(text)) return 'Apex'
  if (/myfunded/i.test(text)) return 'MyFundedFutures'
  if (/tradeify/i.test(text)) return 'Tradeify'
  if (/lucid/i.test(text)) return 'Lucid'
  if (/take profit/i.test(text)) return 'Take Profit Trader'
  return text.trim() || 'Unassigned'
}

export function MetricStrip({ items }) {
  return <section className="metric-strip" style={{ '--cells': items.length }}>
    {items.map((item) => <div className={`metric-cell${item.viz ? ' has-viz' : ''}`} key={item.label}>
      <div className="metric-top">
        <strong className={item.tone ? `tone-${item.tone}` : undefined}>{item.value}</strong>
        <span className="metric-name">{item.label}</span>
      </div>
      {item.sub && <small>{item.sub}</small>}
      {item.line && <MetricLine line={item.line}/>}
      {item.viz && <span className="ms-viz" aria-hidden="true">{item.viz}</span>}
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

export function Segmented({ options, value, onChange, label, className = '' }) {
  return <div className={`ws-seg ${className}`.trim()} role="tablist" aria-label={label}>
    {options.map((option) => <button
      key={option} type="button" role="tab" aria-selected={value === option}
      className={value === option ? 'active' : ''} onClick={() => onChange(option)}
    >{option}</button>)}
  </div>
}

export function Card({ title, aside, className = '', shell = false, children }) {
  const head = (title || aside) && <div className={`ws-card-head${shell ? ' shell-head' : ''}`}>
    {title && <div className="card-title">{titleCase(title)}</div>}
    {aside}
  </div>
  return <section className={`home-card ws-card ${shell ? 'duo ' : ''}${className}`}>
    {head}
    {shell ? <div className="shell-body">{children}</div> : children}
  </section>
}

/* ============================================================ charts */

/** Horizontal bars diverging from a shared zero. */
export function BarList({ rows, format }) {
  const values = rows.map((row) => row.value)
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const span = max - min || 1
  const axis = ((0 - min) / span) * 100
  return <ul className="bar-list">
    {rows.map((row) => {
      const width = (Math.abs(row.value) / span) * 100
      return <li key={row.label}>
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
export function CategoryColumns({ data, height = 220, axisFormat, tip, neutral = false, toneKey }) {
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
export function GroupedColumns({ data, height = 240, privacy, series, netLoss = false }) {
  const [ref, size] = useSize()
  const [active, setActive] = useState(null)
  const width = size.width || 520
  // no money axis: the gridlines give scale and the tooltip gives exact figures, so the bars take the full width
  const pad = { top: 12, right: 2, bottom: 26, left: 2 }
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
export function TrendLine({ points, height = 220, axisFormat, tipFormat, reference, referenceLabel, tone = 'accent', fillTo = 'min', smooth = true }) {
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

/** Rows that fit under the blotter header on this screen, so the page has no dead space. */
function useFittedRows(ref, fallback = PAGE_SIZE) {
  const [rows, setRows] = useState(fallback)
  const tries = useRef(0)
  useEffect(() => {
    const rowHeight = () => ref.current?.querySelector('tbody tr.jt-row')?.getBoundingClientRect().height || 46
    // settle on the count that just fills the viewport, then stop
    const settle = () => {
      if (tries.current > 10) return
      const page = ref.current?.closest('.page')
      const tail = page?.lastElementChild
      if (!tail) return
      const step = rowHeight()
      const slack = window.innerHeight - tail.getBoundingClientRect().bottom - 58
      if (slack < 0) { tries.current += 1; setRows((current) => Math.max(6, current - Math.max(1, Math.ceil(-slack / step)))) }
      else if (slack > step) { tries.current += 1; setRows((current) => Math.min(60, current + Math.floor(slack / step))) }
    }
    const frame = requestAnimationFrame(settle)
    const onResize = () => { tries.current = 0; requestAnimationFrame(settle) }
    window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', onResize) }
  }, [ref, rows])
  return rows
}

const SORTS = {
  date: (a, b) => a.timestamp - b.timestamp,
  symbol: (a, b) => a.symbol.localeCompare(b.symbol),
  pnl: (a, b) => a.pnl - b.pnl,
  qty: (a, b) => a.qty - b.qty,
}

/** The trade drawer: summary with prev/next, a fills & details view, and the add-fills sheet. Shared by the blotter and the journal. */
export function TradeDrawer({ trades, selectedId, onSelect, onClose, reviews = {}, onArchive, privacy = false }) {
  const [view, setView] = useState('summary')
  const [sheet, setSheet] = useState(null)
  const index = trades.findIndex((trade) => trade.id === selectedId)
  const selected = trades[index]
  if (!selected) return null
  const step = (delta) => { const next = trades[index + delta]; if (next) onSelect(next.id) }
  const panel = <>
          <div className="tp-head">
            <div>
              <div className="tp-title">
                <SymbolToken symbol={selected.symbol}/>
                <b>{selected.symbol}</b>
                <span className={`side-mark ${selected.side.toLowerCase()}`} aria-label={selected.side}>{selected.side[0]}</span>
              </div>
              <small>{shortDay(selected.date)} · {selected.time} · {selected.setup}</small>
            </div>
            <div className="tp-nav">
              <button type="button" aria-label="Previous trade" disabled={index <= 0} onClick={() => step(-1)}><ChevronLeft size={15}/></button>
              <button type="button" aria-label="Next trade" disabled={index >= trades.length - 1} onClick={() => step(1)}><ChevronRight size={15}/></button>
            </div>
          </div>

          <div className="tp-result">
            <strong className={`tone-${toneOf(selected.pnl)}`}>{money(selected.pnl, { privacy })}</strong>
          </div>

          <TradeCardActions
            trade={selected} review={reviews[selected.id]}
            onAddFills={() => setSheet('fills')} onDetail={() => setView('detail')}
            onArchive={() => { onArchive?.(selected.id); onClose() }}
          />

          <dl className="tp-figures">
            <div><dt>Gross</dt><dd>{money(selected.pnl + selected.fees, { privacy })}</dd></div>
            <div><dt>Fees</dt><dd>{money(selected.fees, { privacy, sign: false })}</dd></div>
            <div><dt>Quantity</dt><dd>{selected.qty}</dd></div>
            <div><dt>Hold time</dt><dd>{selected.closed ? `${clockMinutes(selected.closed) - clockMinutes(selected.time)}m` : '—'}</dd></div>
            <div><dt>Return</dt><dd className={`tone-${toneOf(selected.pnl)}`}>{percent((selected.pnl / (selected.qty * selected.entry)) * 100, { decimals: 2 })}</dd></div>
          </dl>

          <ExecutionTrack trade={selected} privacy={privacy}/>

        </>

  return <>
    <Drawer label={`${selected.symbol} trade`} viewKey={view} width={440} onClose={() => { setView('summary'); onClose() }}>
      {view === 'detail'
        ? <div className="dw-trade">
            <DrawerHeader
              title={<span className="tp-title">
                <SymbolToken symbol={selected.symbol}/>
                <b>{selected.symbol}</b>
                <span className={`side-mark ${selected.side.toLowerCase()}`} aria-label={selected.side}>{selected.side[0]}</span>
              </span>}
              description={`${shortDay(selected.date)} · ${selected.time} · ${selected.setup} · ${selected.qty} @ ${selected.entry}`}
              onBack={() => setView('summary')}
            />
            <TradeDetail trade={selected} review={reviews[selected.id]} privacy={privacy}/>
          </div>
        : <div className="trade-panel dw-trade">{panel}</div>}
    </Drawer>
    {sheet === 'fills' && <Sheet title={`Add fills to ${selected.symbol ?? 'this trade'}`} subtitle="Replace the typed P&L with the fills it came from." onClose={() => setSheet(null)} width={580} className="tr-sheet">
      <ManualFillsForm
        trade={selected} privacy={privacy} onCancel={() => setSheet(null)}
        onSaved={(batch) => setFlash('trades', { selectedId: selected.id, message: recordedMessage(batch) })}
      />
    </Sheet>}
  </>
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
  const [selectedId, setSelectedId] = useState(() => peekFlash('trades')?.selectedId ?? null)
  const [reviews, setReviews] = useState(() => readStore('trade-reviews', {}))
  const [tagDraft, setTagDraft] = useState('')
  const [tagFocus, setTagFocus] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [archived, setArchived] = useState(() => readStore('cc-trade-archived', []))
  const [drawerOpen, setDrawerOpen] = useState(false)
  const tableRef = useRef(null)
  const [flash] = useState(() => peekFlash('trades'))
  useEffect(() => { clearFlash('trades') }, [])
  const active = useMemo(() => scoped.filter((trade) => !archived.includes(trade.id)), [scoped, archived])

  const setups = useMemo(() => ['All setups', ...[...new Set(active.map((trade) => trade.setup))].sort()], [active])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = active.filter((trade) =>
      (!needle || trade.symbol.toLowerCase().includes(needle) || trade.setup.toLowerCase().includes(needle))
      && (outcome === 'All' || (outcome === 'Wins' ? trade.pnl > 0 : trade.pnl < 0))
      && (side === 'All' || trade.side === side)
      && (setup === 'All setups' || trade.setup === setup))
    const sorted = [...list].sort(SORTS[sort.key])
    return sort.dir === 'desc' ? sorted.reverse() : sorted
  }, [active, query, outcome, side, setup, sort])

  useEffect(() => { setPageIndex(0) }, [query, outcome, side, setup, sort, range])
  const pageSize = useFittedRows(tableRef)
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const visible = filtered.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize)
  const selected = filtered.find((trade) => trade.id === selectedId) || null
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
  const patchReview = (id, patch) => setReviews((current) => {
    const next = { ...current, [id]: { ...(current[id] || {}), ...patch } }
    writeStore('trade-reviews', next)
    return next
  })
  const archiveTrade = (id) => {
    const next = [...archived, id]
    setArchived(next)
    writeStore('cc-trade-archived', next)
    setSelectedId(null)
  }
  const exportCsv = () => {
    const columns = ['date', 'time', 'closed', 'symbol', 'side', 'setup', 'qty', 'entry', 'exit', 'fees', 'pnl']
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
        <button className="ws-outline" onClick={exportCsv} disabled={!filtered.length}>Export CSV</button>
        <button className="start-day" onClick={openLog}>Log a trade</button>
      </>}
    />

    <MetricStrip items={[
      { label: 'Trades', value: `${stats.trades}`, sub: <>{stats.wins}<span className="ms-pos">W</span> · {stats.losses}<span className="ms-neg">L</span></>, line: dashLine(stats.wins, stats.trades) },
      { label: 'Win rate', value: percent(stats.winRate), sub: <><span className="ms-pos">{stats.wins}</span> of {stats.trades} trades</>, line: gaugeLine(stats.winRate, 100, { mark: 0.5 }) },
      { label: 'Net P&L', value: money(stats.netPnl, { privacy }), tone: toneOf(stats.netPnl),
        sub: <><b className={`metric-emph tone-${toneOf(stats.netPnl)}`}>{money(stats.netPnl / Math.max(1, equitySeries(scoped).length), { privacy, decimals: 0 })}</b> per session</>,
        line: splitLine(stats.grossProfit, stats.grossLoss) },
      { label: 'Profit factor', value: ratio(stats.profitFactor), sub: <>Avg win <span className="ms-pos">{money(stats.avgWin, { privacy, decimals: 0 })}</span> · loss <span className="ms-neg">{money(-stats.avgLoss, { privacy, decimals: 0 })}</span></>,
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
      <Select className="ws-select" value={setup} onChange={(event) => setSetup(event.target.value)} aria-label="Setup">
        {setups.map((option) => <option key={option}>{option}</option>)}
      </Select>
      <span className="ws-count">
        {archived.length > 0 && <button type="button" className="tl-restore" onClick={() => { setArchived([]); writeStore('cc-trade-archived', []) }}>{plural(archived.length, 'archived trade')} · Restore</button>}
        {plural(filtered.length, 'result')}
      </span>
    </div>

    {flash?.message && <p className="tl-status" role="status">{flash.message}</p>}

    <div className="trades-layout">
      <Card shell title="History" className="trades-table-card">
        {filtered.length
          ? <>
              <div className="ws-table-wrap" ref={tableRef}>
                <table className="feed-table ws-table">
                  <thead><tr>
                    <th><button type="button" onClick={() => toggleSort('date')}>Date {sortIcon('date')}</button></th>
                    <th><button type="button" onClick={() => toggleSort('symbol')}>Symbol {sortIcon('symbol')}</button></th>
                    <th>Side</th>
                    <th>Setup</th>
                    <th><button type="button" onClick={() => toggleSort('qty')}>Qty {sortIcon('qty')}</button></th>
                    <th><span className="jt-prices head"><span>Entry</span><span className="jt-arrow" aria-hidden="true">→</span><span>Exit</span></span></th>
                    <th className="tl-col-account">Account</th>
                    <th className="tl-col-r">R</th>
                    <th><button type="button" onClick={() => toggleSort('pnl')}>Net P&L</button></th>
                  </tr></thead>
                  <tbody>
                    <tr className="tl-gap" aria-hidden="true"><td colSpan={9}/></tr>
                    {visible.map((trade) => <tr
                      key={trade.id}
                      className={`jt-row ${toneOf(trade.pnl)}${selected?.id === trade.id ? ' is-selected' : ''}`}
                      onClick={() => { setSelectedId(trade.id); setDrawerOpen(true) }}
                    >
                      <td className="jt-time"><span>{shortDay(trade.date)}</span><small>{trade.time}</small></td>
                      <td className="jt-symbol">
                        <span className="jt-sym">
                          <SymbolToken symbol={trade.symbol}/>
                          <b>{trade.symbol}</b>
                        </span>
                      </td>
                      <td><span className={`jt-side ${trade.side.toLowerCase()}`}>{trade.side}</span></td>
                      <td><span className="jt-setup">{trade.setup}</span></td>
                      <td className="jt-route"><span className="jt-qty">{trade.qty}</span></td>
                      <td className="jt-route">
                        {privacy
                          ? <span className="jt-prices">••••</span>
                          : <span className="jt-prices"><span>{trade.entry.toFixed(2)}</span><span className={`jt-arrow ${toneOf(trade.pnl)}`} aria-hidden="true">→</span><span>{trade.exit.toFixed(2)}</span></span>}
                      </td>
                      <td className="tl-col-account">{(() => {
                        const name = accountForTrade(trade)?.content.name ?? 'Unassigned'
                        return <span className="tl-account"><FirmLogo firm={firmOf(name)}/>{name}</span>
                      })()}</td>
                      <td className="tl-col-r">{(() => { const value = trade.logged && !trade.fills?.length ? null : realizedR(trade, reviews[trade.id]); return value == null ? '' : <span className={`tl-r tone-${toneOf(value)}`}>{value.toFixed(2)}R</span> })()}</td>
                      <td className={`jt-pnl tone-${toneOf(trade.pnl)}`}>{money(trade.pnl, { privacy })}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
            </>
          : <ChartState state="empty" detail="No trades match these filters."/>}
      </Card>

      {filtered.length > 0 && <div className="ws-pager">
        <span>Showing <b>{pageIndex * pageSize + 1}–{Math.min(filtered.length, (pageIndex + 1) * pageSize)}</b> of <b>{filtered.length}</b> trades</span>
        <div>
          <button type="button" aria-label="Previous page" disabled={pageIndex === 0} onClick={() => setPageIndex(pageIndex - 1)}><ChevronLeft size={15}/></button>
          <span className="pager-index">Page <b>{pageIndex + 1}</b> of {pages}</span>
          <button type="button" aria-label="Next page" disabled={pageIndex >= pages - 1} onClick={() => setPageIndex(pageIndex + 1)}><ChevronRight size={15}/></button>
        </div>
      </div>}

    </div>

    <AllMetrics trades={active} reviews={reviews} privacy={privacy}/>

    {selected && drawerOpen && <TradeDrawer
      trades={filtered} selectedId={selected.id} reviews={reviews} privacy={privacy}
      onSelect={(id) => { setSelectedId(id); setPageIndex(Math.floor(filtered.findIndex((trade) => trade.id === id) / pageSize)) }}
      onArchive={archiveTrade} onClose={() => { setDrawerOpen(false); setSelectedId(null) }}
    />}
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
          { label: 'Win rate', value: percent(data.stats.winRate), sub: <>{data.stats.wins}<span className="ms-pos">W</span> · {data.stats.losses}<span className="ms-neg">L</span></>,
            line: gaugeLine(data.stats.winRate, 100, { mark: 0.5 }) },
          { label: 'Profit factor', value: ratio(data.stats.profitFactor), sub: 'Break-even marked at 1.00',
            line: gaugeLine(data.stats.profitFactor, 3, { mark: 1 / 3 }) },
          { label: 'Expectancy', value: money(data.stats.expectancy, { privacy }), tone: toneOf(data.stats.expectancy ?? 0), sub: 'Per trade',
            line: centerLine(data.stats.expectancy, Math.max(Math.abs(data.stats.avgWin), Math.abs(data.stats.avgLoss))) },
          { label: 'Avg win / loss', value: ratio(data.stats.avgWinLoss), sub: <><span className="ms-pos">{fmt0(data.stats.avgWin)}</span> vs <span className="ms-neg">{fmt0(-data.stats.avgLoss)}</span></>,
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
              <span><b>{trade.symbol}</b> <span className={`side-mark ${trade.side.toLowerCase()}`} aria-label={trade.side}>{trade.side[0]}</span></span>
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

/** Short firm names for tight spots. */
const FIRM_SHORT = { MyFundedFutures: 'MFF', 'Take Profit Trader': 'TPT' }
const firmShort = (firm) => FIRM_SHORT[firm] ?? firm

export function FirmLogo({ firm }) {
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

/**
 * Tick track: a row of thin ticks, as many as fit the width, coloured left to right by `parts` ({ value, tone }) on a
 * shared `scale`; the rest stay grey. Any part above zero shows at least one tick, so small amounts never vanish.
 */
function TickTrack({ parts, scale }) {
  const ref = useRef(null)
  const [count, setCount] = useState(20)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const fit = () => setCount(Math.max(8, Math.min(24, Math.floor((el.clientWidth + 4) / 14))))
    fit(); const observer = new ResizeObserver(fit); observer.observe(el); return () => observer.disconnect()
  }, [])
  const tones = []
  parts.forEach(({ value, tone }) => {
    if (!(value > 0) || !scale) return
    const ticks = Math.max(1, Math.round((value / scale) * count))
    for (let i = 0; i < ticks && tones.length < count; i += 1) tones.push(tone)
  })
  return <span ref={ref} className="fn-ticks" aria-hidden="true">
    {Array.from({ length: count }, (_, i) => <i key={i} className={tones[i] ?? ''}/>)}
  </span>
}

function FirmNetList({ rows, format }) {
  // one scale for the whole list: the biggest amount any firm paid out or cost
  const scale = Math.max(1, ...rows.map((row) => Math.max(row.paid ?? 0, row.spent ?? 0)))
  return <ul className="firm-net">
    {rows.map((row) => <li key={row.label}>
      <div className="fn-head">
        <FirmLogo firm={row.label}/>
        <span className="fn-name">{row.label}<small>{row.meta}</small></span>
        <span className={`fn-value tone-${toneOf(row.value)}`}>{format(row.value)}</span>
      </div>
      {/* green = profit, then red = fees; a firm still short shows what it's paid back in grey before the red */}
      <TickTrack scale={scale} parts={row.paid >= row.spent ? [{ value: row.paid - row.spent, tone: 'pos' }, { value: row.spent, tone: 'neg' }] : [{ value: row.paid, tone: 'paid' }, { value: row.spent - row.paid, tone: 'neg' }]}/>
    </li>)}
  </ul>
}

const TYPE_TONE = { Payout: 'pos', Evaluation: 'neutral', Subscription: 'neutral', Activation: 'neutral', Reset: 'warn' }

// Designs by RNSENCE Studio
/** Month of prop-firm cash movement: payouts credited, fees charged, quiet days left blank. */
function PayoutCalendar({ grid, privacy = false, today, footer }) {
  return <div className="payout-cal">
    <div className="pc-head">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="pc-grid">
      {grid.cells.map((cell) => {
        if (cell.blank) return <i key={cell.key} className="pc-blank" aria-hidden="true"/>
        const day = cell.session
        const tone = day ? toneOf(day.pnl) : null
        return <div key={cell.key} className={`pc-cell${day ? ` has-entry ${tone}` : ''}${cell.weekend ? ' weekend' : ''}${today === cell.date ? ' today' : ''}`}>
          <span className="pc-day">{cell.day}</span>
          {day && <span className="pc-foot-line">
            <b className="pc-amount">{compactMoney(day.pnl, { privacy })}</b>
            <small className="pc-count" aria-label={day.trades === 1 ? '1 trade' : `${day.trades} trades`} title={day.trades === 1 ? '1 trade' : `${day.trades} trades`}>{day.trades}</small>
          </span>}
        </div>
      })}
    </div>
    {footer && <div className="pc-foot">{footer}</div>}
  </div>
}

/** House payout rules per account, derived from its size and phase. */
export function payoutRules(account, taken) {
  const tier = account.size >= 150000 ? 'large' : account.size >= 100000 ? 'mid' : 'small'
  const perPayout = { large: 5000, mid: 2500, small: 1500 }[tier]
  const phaseCap = account.phase === 'Funded' ? null : { large: 25000, mid: 20000, small: 10000 }[tier]
  const runway = { large: 5, mid: 4, small: 3 }[tier]
  const monthly = perPayout * 2
  return {
    perPayout,
    phaseCap,
    runway,
    taken: Math.min(taken, runway),
    uncapped: account.phase === 'Funded' && taken >= runway,
    cadence: account.phase === 'Funded' ? '90 / 10 · every 14 d' : '100% first $10K, then 90 / 10',
    monthly,
    netMonthly: Math.round(monthly * (account.phase === 'Funded' ? 0.9 : 1)),
    state: account.phase === 'Funded' ? 'Live' : account.status === 'Passed' ? 'Funded' : 'Evaluation',
  }
}

/** What each account is allowed to withdraw: per-payout size, runway to uncapped, and the monthly ceiling. */
function PayoutCaps({ accounts, payouts, privacy }) {
  const [view, setView] = useState('Caps')
  const month = [...payouts].sort((a, b) => b.date.localeCompare(a.date))[0]?.date.slice(0, 7) ?? ''
  const rows = accounts.map((account) => {
    const mine = payouts.filter((item) => item.account === account.id && item.type === 'Payout')
    const drawn = mine.filter((item) => item.date.startsWith(month)).reduce((total, item) => total + item.amount, 0)
    return { account, drawn, taken: mine.length, rules: payoutRules(account, mine.length) }
  })
  return <ul className="firm-net caps-net">
    {rows.map(({ account, drawn, rules }) => {
      const cap = (value) => money(value, { privacy, sign: false, decimals: 0 })
      // one answer per row: what's still available this month; the payout rules sit in the hover title
      const left = Math.max(0, rules.monthly - drawn)
      return <li key={account.id} title={`${cap(rules.perPayout)} per payout · ${rules.taken} of ${rules.runway} payouts taken`}>
        <div className="fn-head">
          <FirmLogo firm={account.firm}/>
          <span className="fn-name">
            <span className="caps-name">{account.firm} {account.size / 1000}K<span className={`caps-state ${rules.state.split(' ')[0].toLowerCase()}`}>{rules.state}</span></span>
            <small>{cap(drawn)} of {cap(rules.monthly)} this month</small>
          </span>
          <span className={`fn-value caps-left${left === 0 ? ' is-maxed' : ''}`}>{left === 0 ? 'Maxed' : <>{cap(left)} <em>left</em></>}</span>
        </div>
        {/* the whole track is this month's cap; the fill is what's drawn so far */}
        <TickTrack scale={rules.monthly} parts={[{ value: drawn, tone: 'drawn' }]}/>
      </li>
    })}
  </ul>
}

/** Most a trader can take home this month across every account's payout cap. */
const capsTakeHome = (accounts, payouts) => accounts.reduce((total, account) => {
  const taken = payouts.filter((item) => item.account === account.id && item.type === 'Payout').length
  return total + payoutRules(account, taken).netMonthly
}, 0)

const ledgerKey = (item) => `${item.date}-${item.account}-${item.type}-${item.amount}`
const longDay = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const entryStatus = (item) => (item.type === 'Payout' ? item.status : 'Settled')

/** One ledger entry in the drawer: the amount, where it sits in the account, and the firm's running total. */
function LedgerDetail({ entry, index, total, onStep, onPick, privacy, dir = 'pick' }) {
  const account = propAccounts.find((item) => item.id === entry.account)
  const firmRows = propTransactions.filter((item) => item.firm === entry.firm)
  const spent = firmRows.filter((item) => item.amount < 0).reduce((sum, item) => sum - item.amount, 0)
  const paid = firmRows.filter((item) => item.type === 'Payout').reduce((sum, item) => sum + item.amount, 0)
  const history = propTransactions.filter((item) => item.account === entry.account).sort((a, b) => b.date.localeCompare(a.date))
  const status = entryStatus(entry)
  const fmt = (value, options = {}) => money(value, { privacy, ...options })
  const swap = `lg-swap ${dir}`
  const key = ledgerKey(entry)
  return <div className="trade-panel dw-trade dw-ledger">
    <div className="tp-head">
      <div key={`head-${key}`} className={swap}>
        <div className="tp-title"><FirmLogo firm={entry.firm}/><b>{entry.firm}</b></div>
        <small>{longDay(entry.date)} · {entry.type}</small>
      </div>
      <div className="tp-nav">
        <button type="button" aria-label="Previous entry" disabled={index <= 0} onClick={() => onStep(-1)}><ChevronLeft size={15}/></button>
        <button type="button" aria-label="Next entry" disabled={index >= total - 1} onClick={() => onStep(1)}><ChevronRight size={15}/></button>
      </div>
    </div>

    <div key={`body-${key}`} className={`lg-body ${swap}`}>
    <div className="tp-result">
      <strong className={`tone-${toneOf(entry.amount)}`}>{fmt(entry.amount)}</strong>
      <span className={`status-chip ${status.toLowerCase()}`}>{status}</span>
    </div>

    <dl className="tp-figures">
      <div className="lg-wide"><dt>Account</dt><dd className="lg-mono">{entry.account}</dd></div>
      <div><dt>Size</dt><dd className="lg-tagged">{account ? <>{account.size / 1000}K<span className={`caps-state ${account.phase.toLowerCase()}`}>{account.phase}</span></> : '—'}</dd></div>
      {entry.type !== 'Activation' && <div><dt>Account status</dt><dd>{account ? <span className={`lg-status ${account.status.toLowerCase()}`}>{account.status}</span> : '—'}</dd></div>}
      <div><dt>Entry</dt><dd><span className={`type-chip ${TYPE_TONE[entry.type] ?? 'neutral'}`}>{entry.type}</span></dd></div>
    </dl>

    <section className="lg-firm">
      <div className="lg-firm-head"><span>{entry.firm} to date</span><b className={`tone-${toneOf(paid - spent)}`}>{fmt(paid - spent, { decimals: 0 })}</b></div>
      <div className="lg-split" aria-hidden="true">
        <i className="spent" style={{ flex: spent || 0.0001 }}/>
        <i className="paid" style={{ flex: paid || 0.0001 }}/>
      </div>
      <small>{fmt(spent, { sign: false, decimals: 0 })} in · {fmt(paid, { sign: false, decimals: 0 })} out · {firmRows.length} {firmRows.length === 1 ? 'entry' : 'entries'}</small>
    </section>

    {history.length > 1 && <section className="lg-history">
      <span className="lg-label">This account</span>
      <ul>
        {history.map((item) => <li key={ledgerKey(item)}>
          <button type="button" className={item === entry ? 'is-current' : ''} aria-current={item === entry ? 'true' : undefined} onClick={() => onPick(item)}>
            <span className="lg-when">{shortDay(item.date)}</span>
            <span className="lg-type">{item.type}</span>
            <span className={`lg-amt tone-${toneOf(item.amount)}`}>{fmt(item.amount, { decimals: 0 })}</span>
          </button>
        </li>)}
      </ul>
    </section>}
    </div>
  </div>
}

/** What a prop account card and its drawer show: P&L, the room left before the floor, and progress to target. */
function accountFigures(account) {
  const pnl = account.balance - account.start
  const buffer = Math.max(0, account.balance - account.floor)
  const bufferShare = Math.min(1, buffer / account.maxDrawdown)
  const bufferTone = account.status === 'Breached' ? 'neg' : bufferShare > 0.6 ? 'pos' : bufferShare > 0.3 ? 'warn' : 'neg'
  const progress = account.target ? Math.max(0, Math.min(1, pnl / (account.target - account.start))) : null
  const statusLabel = account.status === 'Breached' ? 'Breached' : account.status === 'Passed' ? 'Passed' : account.phase
  const goal = account.target ?? Math.round(account.size * 1.06)
  return { pnl, buffer, bufferShare, bufferTone, progress, statusLabel, goal }
}

/** Drawer for one prop account: balance, its rules as meters, and every ledger entry on it. */
function AccountDetail({ account, index, total, onStep, onEntry, privacy, dir = 'pick' }) {
  const { pnl, buffer, bufferShare, bufferTone, progress, statusLabel, goal } = accountFigures(account)
  const history = propTransactions.filter((item) => item.account === account.id).sort((a, b) => b.date.localeCompare(a.date))
  const fmt = (value, options = {}) => money(value, { privacy, ...options })
  const swap = `lg-swap ${dir}`
  return <div className="trade-panel dw-trade dw-ledger dw-account">
    <div className="tp-head">
      <div key={`head-${account.id}`} className={swap}>
        <div className="tp-title"><FirmLogo firm={account.firm}/><b>{account.firm} {account.size / 1000}K</b></div>
        <small className="lg-mono">{account.id}</small>
      </div>
      <div className="tp-nav">
        <button type="button" aria-label="Previous account" disabled={index <= 0} onClick={() => onStep(-1)}><ChevronLeft size={15}/></button>
        <button type="button" aria-label="Next account" disabled={index >= total - 1} onClick={() => onStep(1)}><ChevronRight size={15}/></button>
      </div>
    </div>

    <div key={`body-${account.id}`} className={`lg-body ${swap}`}>
    <div className="tp-result">
      <strong>{fmt(account.balance, { sign: false, decimals: 0 })}</strong>
      <span className={`acct-status ${statusLabel.toLowerCase()}`}>{statusLabel}</span>
    </div>

    <dl className="tp-figures">
      <div><dt>P&L</dt><dd className={`tone-${toneOf(pnl)}`}>{fmt(pnl, { decimals: 0 })}</dd></div>
      <div><dt>Started at</dt><dd>{fmt(account.start, { sign: false, decimals: 0 })}</dd></div>
      <div><dt>{account.target ? 'Target' : 'Goal'}</dt><dd>{fmt(goal, { sign: false, decimals: 0 })}</dd></div>
      <div><dt>Floor</dt><dd>{fmt(account.floor, { sign: false, decimals: 0 })}</dd></div>
    </dl>

    <div className="acct-meters">
      {progress != null
        ? <div className="acct-meter">
            <div className="acct-meter-head"><span>Profit target</span><b>{fmt(Math.max(0, pnl), { sign: false, decimals: 0 })} <em>/ {fmt(account.target - account.start, { sign: false, decimals: 0 })}</em></b></div>
            <div className="acct-bar"><i className="accent" style={{ width: `${progress * 100}%` }}/></div>
          </div>
        : <div className="acct-meter">
            <div className="acct-meter-head"><span>Payout window</span><b className={account.payoutEligible ? 'tone-pos' : undefined}>{account.payoutEligible ? 'Eligible now' : 'Not yet'}</b></div>
            <div className="acct-bar"><i className="pos" style={{ width: account.payoutEligible ? '100%' : '40%' }}/></div>
          </div>}
      <div className="acct-meter">
        <div className="acct-meter-head"><span>Drawdown room</span><b>{fmt(buffer, { sign: false, decimals: 0 })} <em>/ {fmt(account.maxDrawdown, { sign: false, decimals: 0 })}</em></b></div>
        <div className="acct-bar"><i className={bufferTone} style={{ width: `${bufferShare * 100}%` }}/></div>
      </div>
    </div>

    {history.length > 0 && <section className="lg-history">
      <span className="lg-label">Ledger</span>
      <ul>
        {history.map((item) => <li key={ledgerKey(item)}>
          <button type="button" onClick={() => onEntry(item)}>
            <span className="lg-when">{shortDay(item.date)}</span>
            <span className="lg-type">{item.type}</span>
            <span className={`lg-amt tone-${toneOf(item.amount)}`}>{fmt(item.amount, { decimals: 0 })}</span>
          </button>
        </li>)}
      </ul>
    </section>}
    </div>
  </div>
}

export function PropFirmsPage({ privacy }) {
  const easternToday = useEasternToday()
  const [dialog, setDialog] = useState(null)
  const [ledgerView, setLedgerView] = useState('All')
  const [boneyardOpen, setBoneyardOpen] = useState(false)
  const [ledgerEnd, setLedgerEnd] = useState(false)
  const [entryKey, setEntryKey] = useState(null)
  const [entryDir, setEntryDir] = useState('pick')
  const ledgerRef = useRef(null)
  const [accountId, setAccountId] = useState(null)
  const [accountDir, setAccountDir] = useState('pick')

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
    const names = [...new Set([...propAccounts.map((account) => account.firm), ...propTransactions.map((item) => item.firm)])]
    return names.map((firm) => {
      const rows = propTransactions.filter((item) => item.firm === firm)
      const spent = rows.filter((item) => item.amount < 0).reduce((sum, item) => sum - item.amount, 0)
      const paid = rows.filter((item) => item.type === 'Payout').reduce((sum, item) => sum + item.amount, 0)
      return { label: firm, value: paid - spent, paid, spent, meta: `${paid ? `${money(paid, { privacy, sign: false, decimals: 0 })} paid` : 'No payouts yet'} · ${money(spent, { privacy, sign: false, decimals: 0 })} spent` }
    }).sort((a, b) => b.value - a.value)
  }, [privacy])

  const ledger = [...propTransactions]
    .filter((item) => ledgerView === 'All' || (ledgerView === 'Payouts' ? item.type === 'Payout' : item.type !== 'Payout'))
    .sort((a, b) => b.date.localeCompare(a.date))
  useEffect(() => {
    if (!entryKey) return
    const at = ledger.findIndex((item) => ledgerKey(item) === entryKey)
    const row = ledgerRef.current?.querySelectorAll('tbody tr')[at]
    const wrap = ledgerRef.current
    if (!row || !wrap) return
    const top = row.offsetTop - wrap.querySelector('thead').offsetHeight - 4
    if (top < wrap.scrollTop || row.offsetTop + row.offsetHeight > wrap.scrollTop + wrap.clientHeight) wrap.scrollTo({ top: Math.max(0, top - 40), behavior: 'smooth' })
  }, [entryKey])
  // a new view starts from the top, with the fade back on if it runs past eight rows
  useEffect(() => { setLedgerEnd(false); ledgerRef.current?.scrollTo({ top: 0 }) }, [ledgerView])
  const active = propAccounts.filter((account) => account.status === 'Active' || account.status === 'Passed').length

  // payouts less fees, per day, so the calendar reflects prop accounts only
  const propDays = useMemo(() => {
    const byDate = new Map()
    propTransactions.forEach((item) => {
      const day = byDate.get(item.date) ?? { date: item.date, pnl: 0, trades: 0 }
      day.pnl += item.amount
      day.trades += 1
      byDate.set(item.date, day)
    })
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [])
  const [propMonth, setPropMonth] = useState(() => {
    const latest = [...propTransactions].sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? new Date().toISOString().slice(0, 10)
    return { year: Number(latest.slice(0, 4)), month: Number(latest.slice(5, 7)) - 1 }
  })
  const propGrid = useMemo(() => calendarGrid(propDays, propMonth.year, propMonth.month), [propDays, propMonth])
  const propMonthStats = useMemo(() => {
    const key = `${propMonth.year}-${String(propMonth.month + 1).padStart(2, '0')}`
    const rows = propTransactions.filter((item) => item.date.startsWith(key))
    const paid = rows.filter((item) => item.type === 'Payout')
    const fees = rows.filter((item) => item.type !== 'Payout')
    const best = paid.reduce((top, item) => (top && top.amount >= item.amount ? top : item), null)
    return {
      paidTotal: paid.reduce((total, item) => total + item.amount, 0),
      feeTotal: Math.abs(fees.reduce((total, item) => total + item.amount, 0)),
      payouts: paid.length,
      best,
      pending: rows.filter((item) => item.type === 'Payout' && item.status === 'Pending').length,
    }
  }, [propMonth])
  const shiftPropMonth = (delta) => setPropMonth(({ year, month }) => {
    const next = month + delta
    return { year: year + Math.floor(next / 12), month: ((next % 12) + 12) % 12 }
  })

  const liveAccounts = propAccounts.filter((account) => account.status !== 'Breached')
  const graveyard = propAccounts.filter((account) => account.status === 'Breached')
  const graveyardFees = graveyard.reduce((total, account) => total + (account.fee ?? 0), 0)

  const renderAccount = (account) => {
      const { statusLabel, goal } = accountFigures(account)
      const openAccount = () => { setAccountDir('pick'); setAccountId(account.id) }
      return <article
        key={account.id} className={`acct-card${account.status === 'Breached' ? ' is-breached' : ''}`}
        role="button" tabIndex={0} aria-haspopup="dialog" aria-label={`${account.firm} ${account.size / 1000}K account details`}
        onClick={openAccount}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAccount() } }}
      >
        <header>
          <FirmLogo firm={account.firm}/>
          <div className="acct-id">
            <b>{account.firm} {account.size / 1000}K</b>
            <span className="acct-sub">
              <span className={`acct-status ${statusLabel.toLowerCase()}`}>{statusLabel}</span>
              <small>{account.id}</small>
            </span>
          </div>
          <div className="acct-balance">
            <strong>{money(account.balance, { privacy, sign: false, decimals: 0 })}<em className="acct-goal">/{money(goal, { privacy, sign: false, decimals: 0 })}</em></strong>
          </div>
        </header>
      </article>
  }

  return <div className="page home ws-page prop-ws">
    <PageHead
      title="Prop firms"
      meta={`${plural(propAccounts.length, 'account')} · ${active} active · ${money(totals.fundedCapital, { privacy, sign: false, decimals: 0 })} funded capital`}
      actions={<>
        <button className="ws-outline" onClick={() => setDialog('entry')}>Record payout</button>
        <button className="start-day" onClick={() => setDialog('account')}>Add account</button>
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
          <span>vs {totals.priorLabel} payouts</span>
        </> },
      { label: 'Net return', value: money(totals.net, { privacy }), tone: toneOf(totals.net), sub: <>
          <span className={`compare-delta ${totals.roi >= 0 ? 'pos' : 'neg'}`}>
            {totals.roi >= 0 ? <ArrowUpRight size={13} strokeWidth={3}/> : <ArrowDownRight size={13} strokeWidth={3}/>}
            {Math.abs(Math.round(totals.roi))}%
          </span>
          <span>on money spent</span>
        </>,
        line: centerLine(totals.net, Math.max(totals.spent, totals.paid)) },
      { label: 'Pending payout', value: money(totals.pending, { privacy, sign: false }),
        sub: totals.pendingFrom ? <>Awaiting <b className="metric-emph">{totals.pendingFrom.firm}</b> · since {shortDay(totals.pendingFrom.date)}</> : 'Nothing pending',
        line: gaugeLine(totals.pending, Math.max(totals.paid, totals.pending)) },
    ]}/>

    <div className="acct-grid">
      {liveAccounts.map((account) => renderAccount(account))}
    </div>
    {(() => {
      // live and breached accounts step within their own group
      const group = liveAccounts.some((account) => account.id === accountId) ? liveAccounts : propAccounts.filter((account) => account.status === 'Breached')
      const index = group.findIndex((account) => account.id === accountId)
      if (index < 0) return null
      const account = group[index]
      return <Drawer label={`${account.firm} ${account.size / 1000}K account`} viewKey="account" width={420} onClose={() => setAccountId(null)}>
        <AccountDetail
          account={account} index={index} total={group.length} privacy={privacy} dir={accountDir}
          onStep={(delta) => { const next = group[index + delta]; if (next) { setAccountDir(delta > 0 ? 'next' : 'prev'); setAccountId(next.id) } }}
          onEntry={(item) => { setAccountId(null); setLedgerView('All'); setEntryDir('pick'); setEntryKey(ledgerKey(item)) }}
        />
      </Drawer>
    })()}



    <div className="ws-grid two-one flow-row">
      <Card shell title="Cash flow">
        <div className="flow-layout">
          <div className="flow-chart">
          <GroupedColumns
            data={monthly} height={224} privacy={privacy} netLoss
            series={[{ key: 'spent', label: 'Spent', tone: 'spent' }, { key: 'paid', label: 'Payouts', tone: 'paid' }]}
          />
            <div className="ws-legend flow-legend"><span><i className="spent"/>Spent</span><span><i className="paid"/>Payouts</span><span><i className="loss"/>Net loss</span></div>
          </div>
          <aside className="flow-side">
            <div className="flow-lead">
              <span>Return on fees</span>
              <strong>{flow.multiple == null ? '—' : `${flow.multiple.toFixed(1)}×`}</strong>
              {/* one solid line split by share: fees in (grey), then payouts out (blue) */}
              <span className="flow-split" aria-hidden="true"><i className="in" style={{ flexGrow: flow.spent }}/><i className="out" style={{ flexGrow: flow.paid }}/></span>
              <small>{money(flow.spent, { privacy, sign: false, decimals: 0 })} in · {money(flow.paid, { privacy, sign: false, decimals: 0 })} out</small>
            </div>
            <dl className="flow-stats">
              <div><dt>Best month <em>{flow.best?.label}</em></dt><dd className="tone-pos">{money(flow.best?.net ?? 0, { privacy, decimals: 0 })}</dd></div>
              <div><dt>Avg per month <em>YoY</em></dt><dd className={`tone-${toneOf(flow.average)}`}>{money(flow.average, { privacy, decimals: 0 })}</dd></div>
              {flow.lastPayout && <div><dt>Last payout <em>{shortDay(flow.lastPayout.date)}</em></dt><dd className="tone-pos">{money(flow.lastPayout.amount, { privacy, decimals: 0 })}</dd></div>}
            </dl>
          </aside>
        </div>
      </Card>
      <Card shell title="Net by firm" className="firm-card">
        <FirmNetList rows={firms} format={(value) => money(value, { privacy, decimals: 0 })}/>
      </Card>
      <Card
        shell title="Payout caps" className="caps-card"
        aside={<span className="ws-hint caps-hint"><b className="tone-pos">{money(capsTakeHome(liveAccounts, propTransactions), { privacy, sign: false, decimals: 0 })}</b> max this month · {liveAccounts.filter((account) => account.phase === 'Funded').length} funded</span>}
      >
        <PayoutCaps accounts={liveAccounts} payouts={propTransactions} privacy={privacy}/>
      </Card>
    </div>



    <div className="ws-grid halves ledger-row">
    <Card shell title="Ledger" aside={<Segmented options={['All', 'Payouts', 'Expenses']} value={ledgerView} onChange={setLedgerView} label="Ledger view" className="cal-match"/>}>
      <div
        className={`ws-table-wrap lg-scroll${ledger.length > 8 && !ledgerEnd ? ' has-more' : ''}`} ref={ledgerRef}
        onScroll={(event) => { const el = event.currentTarget; setLedgerEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 2) }}
      >
        <table className="feed-table ws-table compact ledger">
          <thead><tr><th>Date</th><th>Firm</th><th>Account</th><th>Type</th><th>Status</th><th>Amount</th></tr></thead>
          <tbody>{ledger.map((item, index) => <tr
            key={`${item.date}-${item.account}-${index}`}
            className={`lg-row${entryKey === ledgerKey(item) ? ' is-selected' : ''}`}
            tabIndex={0} aria-label={`${item.firm} ${item.type}, ${shortDay(item.date)}`}
            onClick={() => { setEntryDir('pick'); setEntryKey(ledgerKey(item)) }}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setEntryDir('pick'); setEntryKey(ledgerKey(item)) } }}
          >
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
    </Card>
    {(() => {
      const index = ledger.findIndex((item) => ledgerKey(item) === entryKey)
      if (index < 0) return null
      const entry = ledger[index]
      return <Drawer label={`${entry.firm} ${entry.type}`} viewKey="ledger" width={420} onClose={() => setEntryKey(null)}>
        <LedgerDetail
          entry={entry} index={index} total={ledger.length} privacy={privacy} dir={entryDir}
          onStep={(delta) => { const next = ledger[index + delta]; if (next) { setEntryDir(delta > 0 ? 'next' : 'prev'); setEntryKey(ledgerKey(next)) } }}
          onPick={(item) => { if (!ledger.includes(item)) setLedgerView('All'); setEntryDir('pick'); setEntryKey(ledgerKey(item)) }}
        />
      </Drawer>
    })()}

    <Card
      shell title="Payout calendar" className="prop-cal-card"
      aside={<div className="pc-tools">
        <div className="pc-legend">
          <span><i className="pos"/>Payout</span>
          <span><i className="neg"/>Fee</span>
        </div>
        <div className="pc-month">
          <button type="button" aria-label="Previous month" onClick={() => shiftPropMonth(-1)}><ChevronLeft size={15}/></button>
          <span>{MONTH_NAMES[propMonth.month].slice(0, 3)} {propMonth.year}</span>
          <button type="button" aria-label="Next month" onClick={() => shiftPropMonth(1)}><ChevronRight size={15}/></button>
        </div>
      </div>}
    >
      <div className="prop-cal-summary">
        <span><em>Net</em><b className={`tone-${toneOf(propGrid.total)}`}>{money(propGrid.total, { privacy, decimals: 0 })}</b></span>
        <span><em>Paid out</em><b className="tone-pos">{money(propMonthStats.paidTotal, { privacy, sign: false, decimals: 0 })}</b></span>
        <span><em>Fees</em><b className="tone-neg">{money(propMonthStats.feeTotal, { privacy, sign: false, decimals: 0 })}</b></span>
        <span><em>Payouts</em><b>{propMonthStats.payouts}{propMonthStats.pending > 0 && <small> · {propMonthStats.pending} pending</small>}</b></span>
        <span><em>Biggest</em><b className={propMonthStats.best ? 'tone-pos' : undefined}>{propMonthStats.best ? money(propMonthStats.best.amount, { privacy, sign: false, decimals: 0 }) : '—'}{propMonthStats.best && <small title={propMonthStats.best.firm}> · {firmShort(propMonthStats.best.firm)}</small>}</b></span>
      </div>
      <PayoutCalendar
        grid={propGrid} privacy={privacy} today={easternToday.iso}
      />
    </Card>
    </div>

    {graveyard.length > 0 && <section className={`graveyard duo${boneyardOpen ? ' is-open' : ''}`}>
      <button
        type="button" className="grave-head shell-head" aria-expanded={boneyardOpen} aria-controls="grave-fold"
        onClick={() => setBoneyardOpen(!boneyardOpen)}
      >
        <span className="grave-title">Graveyard</span>
        <span className="grave-meta">{money(graveyardFees, { privacy, sign: false, decimals: 0 })} in fees burned</span>
        <span className="cc-caret-box"><ChevronDown size={14} strokeWidth={2.2}/></span>
      </button>
      <div className={`card-fold${boneyardOpen ? ' open' : ''}`} id="grave-fold"><div className="card-fold-inner"><div className="shell-body">
        <div className="grave-body">
          {graveyard.map((account, index) => <div
            className="grave-slot" key={account.id}
            style={{ '--i': index, '--back': graveyard.length - 1 - index, zIndex: graveyard.length - index }}
          >{renderAccount(account)}</div>)}
        </div>
      </div></div></div>
    </section>}

    {dialog === 'entry' && <PropEntryDialog onClose={() => setDialog(null)}/>}
    {dialog === 'account' && <AddAccountDialog onClose={() => setDialog(null)}/>}
  </div>
}

