/**
 * Dashboard: stat tiles → performance (equity + daily) beside the trading score →
 * last 30 days vs prior → trades beside win rate. Charts are MUI X, themed to the app.
 */
import React, { useMemo, useState } from 'react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { LineChart } from '@mui/x-charts/LineChart'
import { BarChart } from '@mui/x-charts/BarChart'
import { PieChart } from '@mui/x-charts/PieChart'
import { Gauge } from '@mui/x-charts/Gauge'
import { SparkLineChart } from '@mui/x-charts/SparkLineChart'
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine'
import { Card, PageHead, Segmented, TradeDrawer } from '../workspace'
import { ChartState, SymbolToken, compactMoney, money, percent, ratio, shortDate, toneOf } from '../viz'
import { consistencyScore, edgeScore, equitySeries, scopeByRange, summarize, winBuckets, winWindow } from '../analytics'
import { profile, tradeLog } from '../data'
import './dashboard.css'

const POS = '#22c47d'
const NEG = '#f5615a'
const ACCENT = '#2e7cf6'
const INK_FAINT = '#98a2b3'

const theme = createTheme({
  typography: { fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif' },
  palette: { primary: { main: ACCENT }, text: { primary: '#2b2f35', secondary: '#667085' } },
})

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
const SCORE_TIPS = {
  'Win rate': 'Tighten entry criteria — skip setups that miss a checklist rule.',
  'Profit factor': 'Cut losing trades sooner so gross losses shrink.',
  'Avg win / loss': 'Let winners run to target instead of taking early profits.',
  Drawdown: 'Size down after two consecutive losses to cap drawdown.',
  Recovery: 'Protect gains after new highs — reduce size into the peak.',
  Consistency: 'Spread profit across more days instead of one big session.',
}
const RANGE_DAYS = { '30D': 30, '90D': 90 }
const WIN_UNITS = ['Year', 'Month', 'Week', 'Day']

/** Axis and grid styling shared by every cartesian chart. */
const cartesian = {
  grid: { horizontal: true },
  margin: { left: 4, right: 8, top: 12, bottom: 4 },
}
/** Tick filter that keeps about `count` evenly spaced labels. */
const everyNth = (values, count) => { const step = Math.max(1, Math.ceil(values.length / count)); return (value, index) => index % step === 0 }
const shortAxisDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

// Designs by RNSENCE Studio
export function Dashboard({ privacy, range = 'All', openTrades }) {
  const scoped = useMemo(() => scopeByRange(tradeLog, range), [range])
  const series = useMemo(() => equitySeries(scoped), [scoped])
  const stats = useMemo(() => ({ ...summarize(scoped), consistency: consistencyScore(series) }), [scoped, series])
  const edge = useMemo(() => edgeScore(stats), [stats])
  const priorEdge = useMemo(() => {
    if (scoped.length < 20) return null
    const earlier = scoped.slice(0, Math.floor(scoped.length / 2))
    return edgeScore({ ...summarize(earlier), consistency: consistencyScore(equitySeries(earlier)) })
  }, [scoped])
  const scoreShift = priorEdge?.score != null && edge.score != null ? edge.score - priorEdge.score : null
  const fmt = (value, options = {}) => money(value, { privacy, decimals: 0, ...options })
  const axisMoney = (value) => (privacy ? '••' : compactMoney(value))

  if (!scoped.length) return <div className="page home ws-page d3">
    <PageHead title={`Welcome back, ${profile.name}`} meta="No sessions journaled yet — log your first trade to get started."/>
    <ChartState state="empty" detail="Log a trade to see your dashboard."/>
  </div>

  const green = series.filter((day) => day.pnl > 0)
  const red = series.filter((day) => day.pnl < 0)
  const best = Math.max(...series.map((day) => day.pnl))
  const worst = Math.min(...series.map((day) => day.pnl))
  const breakeven = Math.max(0, stats.trades - stats.wins - stats.losses)

  return <ThemeProvider theme={theme}>
    <div className="page home ws-page d3">
      <PageHead
        title={`Welcome back, ${profile.name}`}
        meta={`${plural(series.length, 'session')} journaled · last trade ${shortDate(series[series.length - 1].date)}`}
      />

      <section className="d3-tiles">
        <Tile label="Net P&L" value={fmt(stats.netPnl)} tone={toneOf(stats.netPnl)}
          visual={<SparkLineChart data={series.map((day) => day.cumulative)} height={44} area curve="natural" color={stats.netPnl >= 0 ? POS : NEG} className="d3-spark"/>}
          rows={[['Avg / session', fmt(stats.netPnl / series.length), toneOf(stats.netPnl)], ['Best session', fmt(best), 'pos'], ['Worst session', fmt(worst), 'neg']]}/>
        <Tile label="Win rate" value={percent(stats.winRate, { decimals: 1 })}
          visual={<HalfGauge value={stats.winRate ?? 0}/>}
          rows={[['Winning', `${stats.wins}`, 'pos'], ['Breakeven', `${breakeven}`], ['Losing', `${stats.losses}`, 'neg']]}/>
        <Tile label="Day ratio" value={percent(stats.dayWinRate, { decimals: 1 })}
          visual={<HalfGauge value={stats.dayWinRate ?? 0}/>}
          rows={[['Green days', `${green.length}`, 'pos'], ['Red days', `${red.length}`, 'neg']]}/>
        <Tile label="Profit factor" value={ratio(stats.profitFactor)}
          visual={<SparkLineChart data={rollingFactor(series)} height={44} curve="natural" color={ACCENT} className="d3-spark"/>}
          rows={[['Gross profit', fmt(stats.grossProfit, { sign: false }), 'pos'], ['Gross loss', fmt(stats.grossLoss, { sign: false }), 'neg']]}/>
      </section>

      <div className="d3-row d3-perf">
        <Performance series={series} privacy={privacy} fmt={fmt} axisMoney={axisMoney}/>
        <ScoreCard edge={edge} shift={scoreShift}/>
      </div>

      <Recent30 trades={scoped} series={series} privacy={privacy} fmt={fmt}/>

      <div className="d3-row d3-bottom">
        <TradesCard trades={scoped} privacy={privacy} openTrades={openTrades}/>
        <WinCard trades={scoped}/>
      </div>
    </div>
  </ThemeProvider>
}

/* ------------------------------------------------------------ tiles */

function Tile({ label, value, tone, visual, rows }) {
  return <div className="d3-tile">
    <div className="d3-tile-top">
      <div className="d3-tile-fig">
        <strong className={tone === 'neg' ? 'tone-neg' : undefined}>{value}</strong>
        <span>{label}</span>
      </div>
      <div className="d3-tile-viz" aria-hidden="true">{visual}</div>
    </div>
    <dl className="d3-rows">
      {rows.map(([name, figure, rowTone]) => <div key={name}><dt>{name}</dt><dd className={rowTone ? `tone-${rowTone}` : undefined}>{figure}</dd></div>)}
    </dl>
  </div>
}

/** A small half-circle gauge, green from 50% up. */
function HalfGauge({ value }) {
  return <Gauge
    value={Math.round(value)} startAngle={-90} endAngle={90} innerRadius="74%" outerRadius="100%" cornerRadius="50%"
    width={88} height={48} text="" className={`d3-gauge ${value >= 50 ? 'is-pos' : 'is-neg'}`}
  />
}

const rollingFactor = (series) => {
  let won = 0
  let lost = 0
  return series.map((day) => {
    if (day.pnl > 0) won += day.pnl
    if (day.pnl < 0) lost += Math.abs(day.pnl)
    return lost ? Math.round((won / lost) * 100) / 100 : 0
  })
}

/* ------------------------------------------------------------ performance */

function Performance({ series, privacy, fmt, axisMoney }) {
  const [view, setView] = useState('Cumulative')
  const [span, setSpan] = useState('All')
  const shown = useMemo(() => {
    if (!RANGE_DAYS[span]) return series
    const cut = new Date(Date.parse(`${series[series.length - 1].date}T00:00:00Z`) - RANGE_DAYS[span] * 86400000).toISOString().slice(0, 10)
    return series.filter((day) => day.date > cut)
  }, [series, span])
  const dates = shown.map((day) => day.date)
  let peak = -Infinity
  const highs = shown.map((day) => (peak = Math.max(peak, day.cumulative)))
  const greens = shown.filter((day) => day.pnl > 0)
  const net = shown.reduce((sum, day) => sum + day.pnl, 0)
  const tip = (value) => (value == null ? '' : privacy ? '••••' : money(value))

  return <Card
    title="Performance" className="d3-card d3-performance"
    aside={<div className="d3-tools">
      <Segmented options={['Cumulative', 'Daily']} value={view} onChange={setView} label="Performance view"/>
      <Segmented options={['30D', '90D', 'All']} value={span} onChange={setSpan} label="Performance range"/>
    </div>}
  >
    <div className="d3-headline">
      <strong className={`tone-${toneOf(net)}`}>{fmt(net)}</strong>
      <span>{plural(shown.length, 'session')} · {fmt(net / Math.max(1, shown.length))} / day</span>
      {view === 'Cumulative' && <span className="d3-legend"><i className="line"/>Net cumulative<i className="dash"/>High-water mark</span>}
    </div>
    <div className="d3-chart">
      {view === 'Cumulative'
        ? <LineChart
            height={280} {...cartesian}
            xAxis={[{ scaleType: 'point', data: dates, valueFormatter: shortAxisDate, tickInterval: everyNth(dates, 8) }]}
            yAxis={[{ valueFormatter: axisMoney, width: 48, tickNumber: 5 }]}
            series={[
              { id: 'cum', data: shown.map((day) => day.cumulative), area: true, showMark: false, curve: 'monotoneX', color: ACCENT, label: 'Net cumulative', valueFormatter: tip, baseline: 'min' },
              { id: 'hwm', data: highs, showMark: false, curve: 'stepAfter', color: '#b9ccf5', label: 'High-water mark', valueFormatter: tip },
            ]}
            hideLegend
            sx={{ '& .MuiLineChart-line[data-series="hwm"]': { strokeDasharray: '4 4', strokeWidth: 1.5 }, '& .MuiLineChart-area[data-series="cum"]': { fill: "url('#d3-area')", filter: 'none', opacity: 1 } }}
          >
            <defs><linearGradient id="d3-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={ACCENT} stopOpacity=".18"/><stop offset="1" stopColor={ACCENT} stopOpacity="0"/></linearGradient></defs>
            <ChartsReferenceLine y={0} lineStyle={{ stroke: 'rgba(16,24,40,.16)' }}/>
          </LineChart>
        : <BarChart
            height={280} {...cartesian} borderRadius={4}
            xAxis={[{ scaleType: 'band', data: dates, valueFormatter: shortAxisDate, tickInterval: everyNth(dates, 8), categoryGapRatio: 0.35 }]}
            yAxis={[{ valueFormatter: axisMoney, width: 48, tickNumber: 5, colorMap: { type: 'piecewise', thresholds: [0], colors: [NEG, POS] } }]}
            series={[{ data: shown.map((day) => day.pnl), label: 'Session P&L', valueFormatter: tip }]}
            hideLegend
          >
            <ChartsReferenceLine y={0} lineStyle={{ stroke: 'rgba(16,24,40,.16)' }}/>
          </BarChart>}
    </div>
    <dl className="d3-foot">
      <div><dt>Best day</dt><dd className="tone-pos">{fmt(Math.max(...shown.map((day) => day.pnl)))}</dd></div>
      <div><dt>Worst day</dt><dd className="tone-neg">{fmt(Math.min(...shown.map((day) => day.pnl)))}</dd></div>
      <div><dt>Avg green day</dt><dd className="tone-pos">{fmt(greens.reduce((sum, day) => sum + day.pnl, 0) / Math.max(1, greens.length))}</dd></div>
      <div><dt>Green days</dt><dd>{greens.length}<small>/{shown.length}</small></dd></div>
    </dl>
  </Card>
}

/* ------------------------------------------------------------ trading score */

function ScoreCard({ edge, shift }) {
  const parts = edge.components.filter((part) => part.value != null)
  const ranked = [...parts].sort((a, b) => b.value - a.value)
  const strongest = ranked[0]
  const focus = ranked[ranked.length - 1]
  return <Card
    title="Trading score" className="d3-card d3-score"
    aside={shift != null && <span className={`d3-shift tone-${shift >= 0 ? 'pos' : 'neg'}`}>{shift >= 0 ? '↑' : '↓'} {Math.abs(shift)} pts vs first half</span>}
  >
    <div className="d3-gauge-wrap">
      <Gauge
        value={edge.score ?? 0} startAngle={-110} endAngle={110} innerRadius="80%" outerRadius="100%" cornerRadius="50%"
        height={150} text={({ value }) => `${value}`} className="d3-score-gauge"
      />
      <span className="d3-gauge-sub">out of 100</span>
    </div>
    <ul className="d3-parts">
      {parts.map((part) => <li key={part.key}>
        <span>{part.key}</span>
        <span className="d3-track" aria-hidden="true"><i className={part.value >= 70 ? 'pos' : part.value >= 40 ? 'mid' : 'neg'} style={{ width: `${Math.max(3, part.value)}%` }}/></span>
        <b>{part.display}</b>
      </li>)}
    </ul>
    {strongest && focus && <div className="d3-insights">
      <div><span className="pos">Strongest</span><b>{strongest.key}</b><small>Target {strongest.target}</small></div>
      <div><span className="warn">Focus</span><b>{focus.key}</b><small>{SCORE_TIPS[focus.key] ?? `Target ${focus.target}`}</small></div>
    </div>}
  </Card>
}

/* ------------------------------------------------------------ last 30 days */

function Recent30({ trades, series, privacy, fmt }) {
  const latest = Date.parse(`${trades[trades.length - 1].date}T00:00:00Z`)
  const cut = (days) => new Date(latest - days * 86400000).toISOString().slice(0, 10)
  const now = summarize(trades.filter((trade) => trade.date > cut(30)))
  const priorTrades = trades.filter((trade) => trade.date > cut(60) && trade.date <= cut(30))
  const prior = priorTrades.length >= 5 ? summarize(priorTrades) : null
  const days = series.filter((day) => day.date > cut(30))
  const change = (a, b) => (b == null || a == null || !b ? null : ((a - b) / Math.abs(b)) * 100)
  let running = 0
  const cells = [
    { label: 'Trades', value: `${now.trades}`, was: prior && `${prior.trades}`, delta: change(now.trades, prior?.trades), line: days.map((day) => day.trades) },
    { label: 'Winning trades', value: `${now.wins}`, was: prior && `${prior.wins}`, delta: change(now.wins, prior?.wins), line: days.map((day) => day.wins) },
    { label: 'Net P&L', value: fmt(now.netPnl), was: prior && fmt(prior.netPnl), delta: change(now.netPnl, prior?.netPnl), line: days.map((day) => (running += day.pnl)) },
    { label: 'Profit factor', value: ratio(now.profitFactor), was: prior && ratio(prior.profitFactor), delta: change(now.profitFactor, prior?.profitFactor), line: rollingFactor(days) },
  ]
  const form = series.slice(-20)
  let streak = 0
  const last = form[form.length - 1]?.pnl >= 0
  for (let index = form.length - 1; index >= 0 && (form[index].pnl >= 0) === last; index -= 1) streak += 1

  return <Card title="Last 30 days" className="d3-card d3-recent" aside={<span className="ws-hint">vs the 30 days before</span>}>
    <div className="d3-compare">
      {cells.map((cell) => <div key={cell.label} className="d3-cmp">
        <div className="d3-cmp-top">
          <span>{cell.label}</span>
          {cell.delta != null && <em className={cell.delta >= 0 ? 'pos' : 'neg'}>{cell.delta >= 0 ? '↑' : '↓'} {Math.abs(Math.round(cell.delta))}%</em>}
        </div>
        <strong>{cell.value}</strong>
        <small>{cell.was ? `was ${cell.was}` : 'No prior data'}</small>
        <SparkLineChart data={cell.line.length ? cell.line : [0]} height={34} curve="natural" area color={cell.delta == null || cell.delta >= 0 ? POS : NEG} className="d3-spark"/>
      </div>)}
      <div className="d3-cmp d3-form">
        <div className="d3-cmp-top"><span>Recent form</span></div>
        <strong>{form.filter((day) => day.pnl > 0).length}<small> green of {form.length}</small></strong>
        <small>{streak} {last ? 'green' : 'red'} in a row</small>
        <span className="d3-form-strip" aria-label={`Last ${form.length} sessions`}>
          {form.map((day) => <i key={day.date} className={day.pnl >= 0 ? 'pos' : 'neg'} title={`${shortAxisDate(day.date)} ${privacy ? '' : money(day.pnl)}`}/>)}
        </span>
      </div>
    </div>
  </Card>
}

/* ------------------------------------------------------------ trades */

function TradesCard({ trades, privacy, openTrades }) {
  const [tab, setTab] = useState('Recent')
  const [openId, setOpenId] = useState(null)
  const list = useMemo(() => {
    if (tab === 'Best') return [...trades].sort((a, b) => b.pnl - a.pnl).slice(0, 7)
    if (tab === 'Worst') return [...trades].sort((a, b) => a.pnl - b.pnl).slice(0, 7)
    return [...trades].sort((a, b) => b.timestamp - a.timestamp).slice(0, 7)
  }, [trades, tab])
  return <Card title="Trades" className="d3-card d3-trades" aside={<Segmented options={['Recent', 'Best', 'Worst']} value={tab} onChange={setTab} label="Trades view"/>}>
    <ul className="d3-list">
      {list.map((trade) => <li key={trade.id}>
        <button type="button" className={openId === trade.id ? 'is-selected' : ''} onClick={() => setOpenId(trade.id)}>
          <SymbolToken symbol={trade.symbol}/>
          <span className="d3-name"><b>{trade.symbol}</b><small>{shortDate(trade.date)} · {trade.setup}</small></span>
          <span className={`d3-side ${trade.side.toLowerCase()}`}>{trade.side}</span>
          <span className={`d3-pnl tone-${toneOf(trade.pnl)}`}>{money(trade.pnl, { privacy })}</span>
        </button>
      </li>)}
    </ul>
    <button type="button" className="ws-more" onClick={() => openTrades?.()}>View all trades</button>
    {openId && <TradeDrawer trades={list} selectedId={openId} privacy={privacy} onSelect={setOpenId} onClose={() => setOpenId(null)}/>}
  </Card>
}

/* ------------------------------------------------------------ win rate */

function WinCard({ trades }) {
  const [view, setView] = useState('Rate')
  const [period, setPeriod] = useState('Month')
  const unit = period.toLowerCase()
  const { now, prior } = useMemo(() => winWindow(trades, unit), [trades, unit])
  const buckets = useMemo(() => winBuckets(trades, unit, unit === 'day' ? 10 : 8), [trades, unit])
  const change = now.winRate != null && prior?.winRate != null ? now.winRate - prior.winRate : null
  const recent = [...trades].filter((trade) => trade.pnl !== 0).sort((a, b) => a.timestamp - b.timestamp).slice(-20)

  return <Card
    title="Win rate" className="d3-card d3-win"
    aside={<div className="d3-tools">
      <Segmented options={['Rate', 'Wins vs losses', 'Trend']} value={view} onChange={setView} label="Win rate view"/>
      <Segmented options={WIN_UNITS} value={period} onChange={setPeriod} label="Win rate period"/>
    </div>}
  >
    <div className="d3-win-body">
      {view === 'Rate' && (now.wins + now.losses
        ? <div className="d3-rate">
            <div className="d3-donut">
              <PieChart
                height={170} width={170} hideLegend
                margin={{ top: 0, bottom: 0, left: 0, right: 0 }}
                series={[{ data: [{ id: 'w', value: now.wins, label: 'Winning', color: POS }, { id: 'l', value: now.losses, label: 'Losing', color: NEG }], innerRadius: 58, outerRadius: 80, paddingAngle: 2, cornerRadius: 5 }]}
              />
              <span className="d3-donut-mid"><b>{Math.round(now.winRate ?? 0)}%</b><small>this {unit}</small></span>
            </div>
            <dl className="d3-rate-rows">
              <div><dt>Winning trades</dt><dd className="tone-pos">{now.wins}</dd></div>
              <div><dt>Losing trades</dt><dd className="tone-neg">{now.losses}</dd></div>
              <div className="d3-dots-row"><dt>Last 20</dt><dd><span className="d3-dots">{recent.map((trade) => <i key={trade.id} className={trade.pnl > 0 ? 'pos' : 'neg'}/>)}</span></dd></div>
            </dl>
          </div>
        : <ChartState state="empty"/>)}
      {view !== 'Rate' && (buckets.length >= 2
        ? view === 'Wins vs losses'
          ? <BarChart
              height={210} {...cartesian} borderRadius={4}
              xAxis={[{ scaleType: 'band', data: buckets.map((bucket) => bucket.label), categoryGapRatio: 0.45, barGapRatio: 0.2 }]}
              yAxis={[{ width: 44, valueFormatter: (value) => `${value}%`, max: 100, tickNumber: 4 }]}
              series={[
                { data: buckets.map((bucket) => Math.round(bucket.winRate)), label: 'Wins', color: POS, valueFormatter: (value) => `${value}%` },
                { data: buckets.map((bucket) => Math.round(bucket.lossRate)), label: 'Losses', color: NEG, valueFormatter: (value) => `${value}%` },
              ]}
              hideLegend
            />
          : <LineChart
              height={210} {...cartesian}
              xAxis={[{ scaleType: 'point', data: buckets.map((bucket) => bucket.label) }]}
              yAxis={[{ width: 44, valueFormatter: (value) => `${value}%`, min: 0, max: 100, tickNumber: 4 }]}
              series={[{ data: buckets.map((bucket) => Math.round(bucket.winRate)), label: 'Win rate', color: POS, curve: 'monotoneX', area: true, valueFormatter: (value) => `${value}%` }]}
              hideLegend
              sx={{ '& .MuiAreaElement-root': { fillOpacity: 0.12 } }}
            >
              <ChartsReferenceLine y={50} label="50%" labelAlign="end" lineStyle={{ stroke: 'rgba(16,24,40,.2)', strokeDasharray: '3 3' }} labelStyle={{ fontSize: 10, fill: INK_FAINT }}/>
            </LineChart>
        : <ChartState state="insufficient" detail={`Needs at least two ${unit}s of trades to chart a trend.`}/>)}
    </div>
    <p className="d3-note">
      {change == null
        ? `No trades in the prior ${unit} to compare against.`
        : <>Win rate is <b className={change >= 0 ? 'tone-pos' : 'tone-neg'}>{change >= 0 ? 'up' : 'down'} {Math.abs(change).toFixed(0)} pts</b> on the prior {unit} ({prior.wins} won / {prior.losses} lost).</>}
    </p>
  </Card>
}
