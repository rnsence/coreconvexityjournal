/**
 * Visuals that each do one job on Reports: A and B on one chart, a tornado of every metric,
 * and a cover thumbnail per published report.
 */
import React, { useMemo, useState } from 'react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { LineChart } from '@mui/x-charts/LineChart'
import { BarChart } from '@mui/x-charts/BarChart'
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine'
import { PieChart } from '@mui/x-charts/PieChart'
import { ChartState, compactMoney, money, toneOf } from '../viz'

const INK = '#2b2f35'
const ACCENT = '#2e7cf6'
const POS = '#22c47d'
const NEG = '#f5615a'
const theme = createTheme({
  typography: { fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif' },
  palette: { primary: { main: ACCENT }, text: { primary: INK, secondary: '#667085' } },
})
const cartesian = { grid: { horizontal: true }, margin: { left: 4, right: 8, top: 12, bottom: 4 } }
const everyNth = (values, count) => { const step = Math.max(1, Math.ceil(values.length / count)); return (_, index) => index % step === 0 }
const axisDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** Per-date cumulative P&L and drawdown for one set, over a shared list of dates. */
function seriesOver(list, dates) {
  const daily = new Map()
  list.forEach((trade) => daily.set(trade.date, (daily.get(trade.date) ?? 0) + trade.pnl))
  let cum = 0, peak = 0
  const first = list.reduce((min, trade) => (!min || trade.date < min ? trade.date : min), null)
  return dates.map((date) => {
    if (!first || date < first) return { cum: null, dd: null, day: daily.get(date) ?? null }
    cum += daily.get(date) ?? 0
    peak = Math.max(peak, cum)
    return { cum, dd: cum - peak, day: daily.get(date) ?? null }
  })
}

const VIEWS = [['equity', 'Equity'], ['drawdown', 'Drawdown'], ['daily', 'Daily P&L']]
// the two compared sets: iris and cyan — distinct in hue and lightness, clear of the P&L green/red
const A_INK = '#5b5bd6', B_BLUE = '#0797b9'

export const RANGES = [['1M', 31], ['3M', 92], ['6M', 183], ['YTD', 'ytd'], ['All', null]]
/** First date included by a range, counted back from the latest trade date (null = everything). */
export function rangeStart(range, lastDate) {
  const spec = RANGES.find(([key]) => key === range)?.[1]
  if (!spec || !lastDate) return null
  return spec === 'ytd' ? `${lastDate.slice(0, 4)}-01-01` : new Date(Date.parse(`${lastDate}T12:00:00Z`) - spec * 864e5).toISOString().slice(0, 10)
}

/** One timeline, both sets, in a terminal-style chart: thin lines, right-hand axis with each set's latest value
 *  tagged on it, a view switch (equity / drawdown / daily) and a range control. A summary row closes it. */
export function DuelChart({ listA, listB, privacy, range, setRange }) {
  const [view, setView] = useState('equity')
  const dates = useMemo(() => [...new Set([...listA, ...listB].map((trade) => trade.date))].sort(), [listA, listB])
  const a = useMemo(() => seriesOver(listA, dates), [listA, dates])
  const b = useMemo(() => seriesOver(listB, dates), [listB, dates])
  const tip = (value) => (value == null ? '—' : money(value, { privacy }))
  const axisMoney = (value) => (privacy ? '••' : compactMoney(value))
  const pick = view === 'equity' ? 'cum' : view === 'drawdown' ? 'dd' : 'day'
  const story = useMemo(() => {
    let leadA = 0, leadB = 0, crosses = 0, prev = 0, gap = { size: 0, date: null, who: null }
    dates.forEach((date, i) => {
      const x = a[i]?.cum, y = b[i]?.cum
      if (x == null || y == null) return
      const diff = y - x
      if (diff > 0) leadB += 1; else if (diff < 0) leadA += 1
      if (prev && diff && Math.sign(diff) !== Math.sign(prev)) crosses += 1
      if (diff) prev = diff
      if (Math.abs(diff) > gap.size) gap = { size: Math.abs(diff), date, who: diff > 0 ? 'B' : 'A' }
    })
    return { leadA, leadB, total: leadA + leadB || 1, crosses, gap }
  }, [a, b, dates])
  if (!listA.length && !listB.length) return <ChartState state="empty" detail="Neither set has trades."/>
  const last = (series) => [...series].reverse().find((point) => point[pick] != null)?.[pick]
  const leader = story.leadB > story.leadA ? 'B' : 'A'
  const leadShare = Math.round((Math.max(story.leadA, story.leadB) / story.total) * 100)
  const endA = last(a), endB = last(b)
  return <div className="rv-duel3">
    <div className="rv-duel-bar">
      <div className="rv-switch" role="tablist" aria-label="Chart">
        {VIEWS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={view === key} className={view === key ? 'on' : ''} onClick={() => setView(key)}>{label}</button>)}
      </div>
      <div className="rv-range" role="group" aria-label="Range">
        {RANGES.map(([key]) => <button key={key} type="button" aria-pressed={range === key} className={range === key ? 'on' : ''} onClick={() => setRange(key)}>{key}</button>)}
      </div>
    </div>
    <div className="rv-duel-legend">
      <span><i className="rv-swatch a"/>Set A<b>{endA == null ? '—' : privacy ? '••••' : money(endA, { decimals: 0 })}</b></span>
      <span><i className="rv-swatch b"/>Set B<b>{endB == null ? '—' : privacy ? '••••' : money(endB, { decimals: 0 })}</b></span>
      <small>{view === 'equity' ? 'Cumulative net P&L' : view === 'drawdown' ? 'Distance below each set\'s peak' : 'Net P&L per session'} · {dates.length} sessions</small>
    </div>
    <div className="rv-duel-chart">
      <ThemeProvider theme={theme}>
        {view === 'daily'
          ? <BarChart
              height={280} {...cartesian} margin={{ ...cartesian.margin, left: 8 }} borderRadius={2}
              xAxis={[{ scaleType: 'band', data: dates, valueFormatter: axisDate, tickInterval: everyNth(dates, 7), categoryGapRatio: 0.3, barGapRatio: 0.1 }]}
              yAxis={[{ valueFormatter: axisMoney, width: 58, tickNumber: 5, position: 'right' }]}
              series={[
                { id: 'a', data: a.map((point) => point.day), color: A_INK, label: 'Set A', valueFormatter: tip },
                { id: 'b', data: b.map((point) => point.day), color: B_BLUE, label: 'Set B', valueFormatter: tip },
              ]}
              hideLegend
            ><ChartsReferenceLine y={0} lineStyle={{ stroke: 'rgba(16,24,40,.22)' }}/></BarChart>
          : <LineChart
              height={280} {...cartesian} margin={{ ...cartesian.margin, left: 8 }}
              xAxis={[{ scaleType: 'point', data: dates, valueFormatter: axisDate, tickInterval: everyNth(dates, 7) }]}
              yAxis={[{ valueFormatter: axisMoney, width: 58, tickNumber: 5, position: 'right' }]}
              series={[
                { id: 'a', data: a.map((point) => point[pick]), showMark: false, curve: 'linear', color: A_INK, label: 'Set A', valueFormatter: tip, connectNulls: false },
                { id: 'b', data: b.map((point) => point[pick]), showMark: false, curve: 'linear', color: B_BLUE, label: 'Set B', valueFormatter: tip, connectNulls: false },
              ]}
              hideLegend
              sx={{ '& .MuiLineChart-line': { strokeWidth: 1.75 } }}
            >
              <ChartsReferenceLine y={0} lineStyle={{ stroke: 'rgba(16,24,40,.22)' }}/>
            </LineChart>}
      </ThemeProvider>
    </div>
    <dl className="rv-summary">
      <div><dt>Leader</dt><dd><b className={`lead-${leader.toLowerCase()}`}>Set {leader}</b> on {leadShare}% of sessions</dd></div>
      <div><dt>Crossovers</dt><dd>{story.crosses}</dd></div>
      <div><dt>Widest gap</dt><dd>{story.gap.date ? <>{privacy ? '••••' : money(story.gap.size, { decimals: 0, sign: false })} to {story.gap.who} · {axisDate(story.gap.date)}</> : '—'}</dd></div>
      <div><dt>Range</dt><dd>{dates.length ? `${axisDate(dates[0])} – ${axisDate(dates.at(-1))}` : '—'}</dd></div>
    </dl>
  </div>
}

/** Every metric as a tug of war: A grows left, B grows right; the side that's ahead is solid. */
export function Tornado({ rows }) {
  return <ol className="rv-tornado">
    {rows.map((row) => {
      const peak = Math.max(Math.abs(row.a ?? 0), Math.abs(row.b ?? 0)) || 1
      const width = (value) => (value == null ? 0 : Math.max(2, (Math.abs(value) / peak) * 100))
      return <li key={row.label} className={row.ahead ? `ahead-${row.ahead}` : ''}>
        <span className="rv-t-val a" title={row.basisA}>{row.textA}</span>
        <span className="rv-t-bar a" aria-hidden="true"><i className={row.a < 0 ? 'is-neg' : ''} style={{ '--w': `${width(row.a)}%` }}/></span>
        <span className="rv-t-label">{row.label}</span>
        <span className="rv-t-bar b" aria-hidden="true"><i className={row.b < 0 ? 'is-neg' : ''} style={{ '--w': `${width(row.b)}%` }}/></span>
        <span className="rv-t-val b" title={row.basisB}>{row.textB}</span>
        <span className="rv-t-delta">{row.delta ? <em className={`tone-${row.delta.tone}`}>{row.delta.text}</em> : <em className="none">—</em>}</span>
      </li>
    })}
  </ol>
}

/** A published report in miniature: its own KPIs, its trading days as a heat strip, its top setups. */
export function ReportCover({ report, privacy }) {
  const content = report.content ?? {}
  const m = content.metrics
  const days = content.days ?? []
  const peak = Math.max(1, ...days.map((day) => Math.abs(day.net)))
  const setups = [...(content.breakdowns?.playbook ?? [])].sort((x, y) => Math.abs(y.net_pnl) - Math.abs(x.net_pnl)).slice(0, 3)
  const setupPeak = Math.max(1, ...setups.map((row) => Math.abs(row.net_pnl)))
  const kpis = m ? [
    ['Net', privacy ? '••••' : compactMoney(m.net_pnl), toneOf(m.net_pnl)],
    ['Trades', `${m.trades}`],
    ['Win', m.win_rate == null ? '—' : `${Math.round(m.win_rate * 100)}%`],
    ['PF', m.profit_factor == null ? '—' : m.profit_factor.toFixed(2)],
  ] : []
  // a window onto the report: a white page peeking up out of a grey panel, holding the headline figures, the days and the top setups
  return <div className="rv-cover" aria-hidden="true"><div className="rv-q-page">
    {m && <div className="rv-q-kpis">{kpis.map(([label, value, tone]) => <span key={label}><small>{label}</small><b className={tone ? `tone-${tone}` : ''}>{value}</b></span>)}</div>}
    {days.length > 0 && <div className="rv-q-days">
      {days.slice(-36).map((day) => <i key={day.date} className={day.net >= 0 ? 'p' : 'n'} style={{ '--a': (0.3 + 0.7 * Math.min(1, Math.abs(day.net) / peak)).toFixed(2) }}/>)}
    </div>}
    {setups.length > 0 && <div className="rv-q-bars">
      {setups.slice(0, 2).map((row) => <span key={row.key}><small>{row.label}</small><em><i className={row.net_pnl >= 0 ? 'p' : 'n'} style={{ '--w': `${Math.max(6, (Math.abs(row.net_pnl) / setupPeak) * 100)}%` }}/></em></span>)}
    </div>}
  </div></div>
}

const MIX = ['#0e9f6e', '#22c47d', '#5fd49e', '#97e2bd', '#c6efda']

/** Where the profit comes from: each winning group's share of gross profit, and what the losers give back. */
export function ProfitMix({ groups, privacy, onOpen }) {
  const winners = groups.filter((row) => row.net > 0).sort((x, y) => y.net - x.net)
  const losers = groups.filter((row) => row.net < 0)
  const gross = winners.reduce((sum, row) => sum + row.net, 0)
  const top = winners.slice(0, 5)
  const rest = winners.slice(5).reduce((sum, row) => sum + row.net, 0)
  const slices = [...top.map((row, index) => ({ id: row.id, label: row.label, value: row.net, trades: row.trades, color: MIX[index] })), ...(rest > 0 ? [{ id: 'other', label: `${winners.length - 5} more`, value: rest, trades: winners.slice(5).reduce((sum, row) => sum + row.trades, 0), color: '#e4e7ec' }] : [])]
  const lostTrades = losers.reduce((sum, row) => sum + row.trades, 0)
  const pct = (value) => `${Math.round((value / (gross || 1)) * 100)}%`
  if (!winners.length) return <ChartState state="empty" detail="No group made money here."/>
  return <div className="rv-mix">
    <div className="rv-mix-top">
      <div className="rv-mix-donut">
        <ThemeProvider theme={theme}>
          <PieChart height={136} width={136} margin={{ top: 0, bottom: 0, left: 0, right: 0 }} hideLegend
            series={[{ data: slices, innerRadius: 45, outerRadius: 66, paddingAngle: 1.5, cornerRadius: 3, valueFormatter: (item) => `${privacy ? '••••' : money(item.value, { decimals: 0 })} · ${pct(item.value)}` }]}
            onItemClick={(_, item) => { const slice = slices[item.dataIndex]; if (slice && slice.id !== 'other') onOpen?.(slice.id) }}/>
        </ThemeProvider>
        <span className="rv-mix-centre"><b>{privacy ? '••••' : compactMoney(gross)}</b><small>gross profit</small></span>
      </div>
      <ol className="rv-mix-list">
        {slices.map((slice) => <li key={slice.id}>
          <button type="button" disabled={slice.id === 'other'} onClick={() => onOpen?.(slice.id)}>
            <i style={{ background: slice.color }}/><span>{slice.label}</span><b>{pct(slice.value)}</b>
          </button>
        </li>)}
      </ol>
    </div>
    <div className="rv-mix-vs" aria-label="Share of profit against share of trades">
      <div className="rv-mix-bar"><span>Profit</span><span className="rv-mix-track">{slices.map((slice) => <i key={slice.id} style={{ flex: slice.value, background: slice.color }}/>)}</span></div>
      <div className="rv-mix-bar"><span>Trades</span><span className="rv-mix-track">{slices.map((slice) => <i key={slice.id} style={{ flex: slice.trades, background: slice.color }}/>)}{lostTrades > 0 && <i className="lost" style={{ flex: lostTrades }}/>}</span></div>
    </div>
  </div>
}

/** Edge map: each group by win rate (across) and average P&L per trade (up); dot size is how often it's traded. */
export function EdgeMap({ groups, privacy, onOpen }) {
  const [hover, setHover] = useState(null)
  const points = groups.filter((row) => row.trades > 0 && row.winRate != null).map((row) => ({ ...row, per: row.net / row.trades }))
  if (points.length < 2) return <ChartState state="empty" detail="Needs two or more groups with trades."/>
  const W = 280, H = 268, pad = { l: 8, r: 8, t: 10, b: 10 }
  const wins = points.map((p) => p.winRate)
  const xlo = Math.min(0.4, ...wins) - 0.04, xhi = Math.max(0.6, ...wins) + 0.04
  const pers = points.map((p) => p.per)
  const span = Math.max(1, Math.max(...pers) - Math.min(0, ...pers))
  const ylo = Math.min(0, ...pers) - span * 0.14, yhi = Math.max(0, ...pers) + span * 0.14
  const most = Math.max(...points.map((p) => p.trades))
  const x = (v) => pad.l + ((v - xlo) / (xhi - xlo)) * (W - pad.l - pad.r)
  const y = (v) => pad.t + (1 - (v - ylo) / (yhi - ylo)) * (H - pad.t - pad.b)
  const r = (n) => 4 + Math.sqrt(n / most) * 9
  const tip = hover && points.find((p) => p.id === hover)
  return <div className="rv-edge">
    <div className="rv-edge-plot">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Win rate against average P&L per trade for each group" onMouseLeave={() => setHover(null)}>
      <rect className="rv-edge-q good" x={x(0.5)} y={pad.t} width={W - pad.r - x(0.5)} height={y(0) - pad.t} rx="8"/>
      <line className="rv-edge-axis" x1={x(0.5)} x2={x(0.5)} y1={pad.t} y2={H - pad.b}/>
      <line className="rv-edge-axis" x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)}/>
      {points.sort((a, b) => b.trades - a.trades).map((p) => <circle key={p.id} className={`rv-edge-dot ${p.per >= 0 ? 'pos' : 'neg'}${hover === p.id ? ' on' : ''}`}
        cx={x(p.winRate)} cy={y(p.per)} r={r(p.trades)} tabIndex={0} role="button" aria-label={`${p.label}: ${Math.round(p.winRate * 100)}% won, ${privacy ? 'hidden' : money(p.per)} per trade`}
        onMouseEnter={() => setHover(p.id)} onFocus={() => setHover(p.id)} onBlur={() => setHover(null)} onClick={() => onOpen?.(p.id)}
        onKeyDown={(event) => { if (event.key === 'Enter') onOpen?.(p.id) }}/>)}
    </svg>
    {tip && <div className="rv-edge-tip" style={{
      // sits just above the dot's top edge (radius-aware), nudged inward near the card's sides
      left: `${Math.min(78, Math.max(22, (x(tip.winRate) / W) * 100))}%`,
      top: `${((y(tip.per) - r(tip.trades)) / H) * 100}%`,
    }}>
      <b>{tip.label}</b>
      <span>{Math.round(tip.winRate * 100)}% won · {tip.trades} trades</span>
      <span className={tip.per >= 0 ? 'tone-pos' : 'tone-neg'}>{privacy ? '••••' : money(tip.per)} per trade</span>
    </div>}
    </div>
    <div className="rv-edge-legend"><span>Win rate →</span><span>↑ Per trade</span><span><i/>size = trades</span></div>
  </div>
}

export { POS, NEG }
