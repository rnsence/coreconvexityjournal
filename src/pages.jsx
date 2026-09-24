import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AArrowDown, AArrowUp, Copy, X, ArrowDownRight, ArrowLeft, Bold, Italic, List, ArrowRight, ArrowUpRight, Bot, Settings2, Trash2, Check, ChevronDown, ChevronLeft, ChevronRight, Download, FileImage, Info, Rocket, Scaling, Sigma, TrendingDown,
  GripVertical, Image as ImageIcon, Maximize2, MoveRight, Pencil, Plus, Scale, Search, Send, SlidersHorizontal, Sparkles, Star, Target, TrendingUp, Wallet,
} from 'lucide-react'
import SettingsSolidIcon from '@iconify-react/basil/settings-solid'
import { Card, Metric, PageHeading, Pill } from './components'
import { BarsStaggeredIcon, ChartPieSliceIcon, PercentIcon, TargetArrowIcon } from './icons'
import { LineChart, BarChart } from './charts'
import {
  BulletBars, ChartState, ColumnPlot, CumulativeChart, DailyColumns, EquityPlot, HeatCalendar, Module,
  IntradayChart, RollingPlot, RowPlot, ScoreMeter, ScoreRadar, DailyPulse, MiniBars, MiniLine, MiniRing, easternLabel, scoreBand, useEasternToday, useMarketSession, SessionLine, WinDonut, WinLines, WinPairBars,
  compactMoney, money, percent, ratio, shortDate, toneOf,
} from './viz'
import {
  bySetup, byGrade, byHour, byWeekday, calendarGrid, consistencyScore, edgeScore,
  equitySeries, rollingWinRate, summarize, winBuckets, winWindow,
} from './analytics'
import { accounts, activity, avgLine, calendarDays, dayEntries, profile, trades, tradeLog, tradingDays, trendLine } from './data'
import { symbolClassSlug } from './symbols'


function SectionTitle({ title, subtitle, action }) {
  return <div className="section-title"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

const RANGES = [
  { key: '7D', days: 7 }, { key: '30D', days: 30 }, { key: '90D', days: 90 },
  { key: 'YTD', days: null }, { key: 'All', days: null },
]

const WIN_PERIODS = ['Year', 'Month', 'Week', 'Day']

function WinRatioCard({ trades, variant }) {
  const [period, setPeriod] = useState('Month')
  const unit = period.toLowerCase()
  const windowStats = useMemo(() => winWindow(trades, unit), [trades, unit])
  const buckets = useMemo(() => winBuckets(trades, unit, unit === 'day' ? 10 : 8), [trades, unit])
  const { now, prior } = windowStats
  const change = now.winRate != null && prior?.winRate != null ? now.winRate - prior.winRate : null
  const recentResults = useMemo(() => [...trades]
    .filter((trade) => trade.pnl !== 0)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-20)
    .map((trade) => ({ id: trade.id, symbol: trade.symbol, win: trade.pnl > 0 })), [trades])

  let body
  if (variant === 'donut') {
    body = now.wins + now.losses
      ? <WinDonut winRate={now.winRate} wins={now.wins} losses={now.losses} recent={recentResults}/>
      : <ChartState state="empty"/>
  } else {
    body = buckets.length >= 2
      ? (variant === 'bars' ? <WinPairBars buckets={buckets}/> : <WinLines buckets={buckets}/>)
      : <ChartState state="insufficient" detail={`Needs at least two ${unit}s of trades to chart a trend.`}/>
  }

  return <section className="win-card">
    <div className="compare-head">
      <span className="compare-label">Win ratio</span>
      <div className="ws-seg compact" role="tablist" aria-label="Win ratio period">
        {WIN_PERIODS.map((item) => <button
          key={item} type="button" role="tab" aria-selected={period === item}
          className={period === item ? 'active' : ''} onClick={() => setPeriod(item)}
        >{item}</button>)}
      </div>
    </div>
    <div className="win-body">{body}</div>
    <p className="win-note">
      {change == null
        ? `No trades in the prior ${unit} to compare against`
        : <>Your win % is {Math.round(change) === 0 ? 'unchanged' : <>{change > 0 ? 'higher' : 'lower'} by <b className={change > 0 ? 'tone-pos' : 'tone-neg'}>{Math.abs(change).toFixed(0)}%</b></>} compared to
          {' '}<b className="tone-pos">{prior.wins} winning</b> / <b className="tone-neg">{prior.losses} losing</b> past {unit}</>}
    </p>
  </section>
}

const SCORE_TIPS = {
  'Win%': 'Tighten entry criteria — skip setups that are not A-grade.',
  'Profit factor': 'Cut losing trades sooner so gross losses shrink.',
  'Avg win/loss': 'Let winners run to target instead of taking early profits.',
  'Max drawdown': 'Size down after two consecutive losses to cap drawdown.',
  'Recovery': 'Protect gains after new highs — reduce size into the peak.',
  'Consistency': 'Spread profit across more days instead of one big session.',
}

function OverallScoreCard({ edge, priorEdge, axes, enough }) {
  const [view, setView] = useState('Radar')
  const rows = edge.components.map((component, index) => ({
    label: axes[index],
    value: component.value ?? 0,
    display: component.display,
    target: component.target,
    prior: priorEdge?.components[index]?.value ?? null,
  }))
  const ranked = [...rows].sort((a, b) => b.value - a.value)
  const strongest = ranked[0]
  const focus = ranked[ranked.length - 1]
  const delta = priorEdge?.score != null && edge.score != null ? edge.score - priorEdge.score : null

  return <section className="home-card radar-card">
    <div className="score-card-head">
      <div className="card-title">Overall score</div>
      {enough && <div className="ws-seg compact" role="tablist" aria-label="Score view">
        {['Radar', 'Breakdown'].map((option) => <button
          key={option} type="button" role="tab" aria-selected={view === option}
          className={view === option ? 'active' : ''} onClick={() => setView(option)}
        >{option}</button>)}
      </div>}
    </div>

    {!enough
      ? <ChartState state="insufficient" minData={5}/>
      : <div className={`score-body view-${view.toLowerCase()}`}>
        <ScoreRadar axes={axes} current={rows.map((row) => row.value)} compare={priorEdge ? rows.map((row) => row.prior ?? 0) : null}/>
        {view === 'Breakdown' && <ul className="score-breakdown">
            {rows.map((row) => {
              const change = row.prior == null ? null : Math.round(row.value - row.prior)
              return <li key={row.label} title={`${row.display} now · full marks at ${row.target}`}>
                <div className="sb-top">
                  <span>{row.label}</span>
                  <span className="sb-num">
                    {change != null && change !== 0 && <em className={change > 0 ? 'up' : 'down'}>{change > 0 ? '+' : '−'}{Math.abs(change)}</em>}
                    <b>{Math.round(row.value)}</b>
                  </span>
                </div>
                <div className="sb-track">
                  <i className="sb-fill" style={{ width: `${row.value}%` }}/>
                  {row.prior != null && <i className="sb-prior" style={{ left: `${row.prior}%` }} title={`First half ${Math.round(row.prior)}`}/>}
                </div>
              </li>
            })}
          </ul>}</div>}

    {enough && <footer className="score-foot">
      <div className="sf-score">
        <strong>{edge.score ?? '—'}</strong><small>/100</small>
        {delta != null && <span className={`compare-delta ${delta >= 0 ? 'pos' : 'neg'}`}>
          {delta >= 0 ? <ArrowUpRight size={12} strokeWidth={2.4}/> : <ArrowDownRight size={12} strokeWidth={2.4}/>}
          {Math.abs(delta)} pts
        </span>}
      </div>
      {priorEdge && <div className="sf-legend">
        <span><i className="now"/>Now</span>
        <span><i className="then"/>First half</span>
      </div>}
      <div className="sf-chips">
        <span className="sf-chip strong" title={`Strongest: ${strongest.label}`}><span className="lbl">{strongest.label}</span><b>{Math.round(strongest.value)}</b></span>
        <span className="sf-chip focus" title={`Focus: ${focus.label} — ${SCORE_TIPS[focus.label]}`}><span className="lbl">{focus.label}</span><b>{Math.round(focus.value)}</b></span>
      </div>
    </footer>}
  </section>
}

// Designs by RNSENCE Studio
export function Dashboard({ privacy, setPage, range = 'All', openJournal, openTrades, openLog }) {
  const [feedEnd, setFeedEnd] = useState(false)
  const [feedTab, setFeedTab] = useState('Recent')

  const probe = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('dataset')
  const source = useMemo(() => {
    if (probe === 'empty' || probe === 'loading') return []
    if (probe === 'single') return tradeLog.slice(0, 1)
    if (probe === 'positive') return tradeLog.filter((trade) => trade.pnl > 0)
    if (probe === 'negative') return tradeLog.filter((trade) => trade.pnl < 0)
    return tradeLog
  }, [probe])

  const scoped = useMemo(() => {
    if (!source.length) return []
    const latest = source[source.length - 1].date
    const option = RANGES.find((item) => item.key === range)
    if (!option || range === 'All') return source
    if (range === 'YTD') return source.filter((trade) => trade.date >= `${latest.slice(0, 4)}-01-01`)
    const cut = new Date(Date.parse(`${latest}T00:00:00Z`) - option.days * 86400000).toISOString().slice(0, 10)
    return source.filter((trade) => trade.date >= cut)
  }, [range, source])

  const series = useMemo(() => equitySeries(scoped), [scoped])
  const stats = useMemo(() => ({ ...summarize(scoped), consistency: consistencyScore(series) }), [scoped, series])
  const edge = useMemo(() => edgeScore(stats), [stats])

  const half = Math.floor(scoped.length / 2)
  const priorEdge = useMemo(() => {
    if (scoped.length < 20) return null
    const earlier = scoped.slice(0, half)
    const earlierSeries = equitySeries(earlier)
    return edgeScore({ ...summarize(earlier), consistency: consistencyScore(earlierSeries) })
  }, [scoped, half])

  const monthly = useMemo(() => {
    if (!scoped.length) return { now: summarize([]), prior: null }
    const latest = Date.parse(`${scoped[scoped.length - 1].date}T00:00:00Z`)
    const cut = (days) => new Date(latest - days * 86400000).toISOString().slice(0, 10)
    const thisMonth = scoped.filter((trade) => trade.date > cut(30))
    const lastMonth = source.filter((trade) => trade.date > cut(60) && trade.date <= cut(30))
    return { now: summarize(thisMonth), prior: lastMonth.length >= 5 ? summarize(lastMonth) : null }
  }, [scoped, source])

  const recent = useMemo(() => {
    if (feedTab === 'Best') return [...scoped].sort((a, b) => b.pnl - a.pnl).slice(0, 20)
    if (feedTab === 'Worst') return [...scoped].sort((a, b) => a.pnl - b.pnl).slice(0, 20)
    return [...scoped].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20)
  }, [scoped, feedTab])
  const easternToday = useEasternToday()
  const dateLine = easternToday.label
  const market = useMarketSession()
  const [pulseRange, setPulseRange] = useState('30D')
  const pulseDays = useMemo(() => {
    const all = equitySeries(source)
    if (!all.length) return all
    const days = { '7D': 7, '30D': 30, '90D': 90 }[pulseRange]
    const cut = new Date(Date.parse(`${all[all.length - 1].date}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10)
    return all.filter((day) => day.date > cut)
  }, [source, pulseRange])
  const pulseNet = pulseDays.reduce((total, day) => total + day.pnl, 0)
  const pulseBest = Math.max(...pulseDays.map((day) => day.pnl))
  const pulseWorst = Math.min(...pulseDays.map((day) => day.pnl))
  const pulseGreen = pulseDays.filter((day) => day.pnl > 0)
  const glance = useMemo(() => {
    if (!series.length) return null
    const last = series[series.length - 1]
    let streak = 0
    const sign = Math.sign(last.pnl)
    for (let index = series.length - 1; index >= 0 && Math.sign(series[index].pnl) === sign && sign !== 0; index -= 1) streak += 1
    const recent = series.slice(-5)
    return {
      last,
      streak, streakTone: sign > 0 ? 'pos' : 'neg',
      recentNet: recent.reduce((total, point) => total + point.pnl, 0),
      recentGreen: recent.filter((point) => point.pnl > 0).length,
      recentCount: recent.length,
      recent,
    }
  }, [series])
  const dataState = probe === 'loading' ? 'loading' : scoped.length === 0 ? 'empty' : 'ready'

  const tileSeries = series.slice(-24)
  const monthlyNet = useMemo(() => {
    const byMonth = new Map()
    series.forEach((day) => byMonth.set(day.date.slice(0, 7), (byMonth.get(day.date.slice(0, 7)) ?? 0) + day.pnl))
    return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([key, pnl]) => ({ key, pnl }))
  }, [series])
  const tiles = [
    {
      label: 'Net P&L', value: money(stats.netPnl, { privacy, decimals: 0, sign: false }), tone: toneOf(stats.netPnl),
      note: `${plural(series.length, 'session')} · avg ${money(stats.netPnl / Math.max(1, series.length), { privacy, decimals: 0 })}`,
    },
    {
      label: 'Trade win%', value: percent(stats.winRate, { decimals: 1 }),
      note: `${stats.wins}W · ${stats.losses}L`,
      chart: <TileSplit left={stats.wins} right={stats.losses}/>,
    },
    {
      label: 'Profit factor', value: ratio(stats.profitFactor),
      note: `${money(stats.grossProfit, { privacy, decimals: 0, sign: false })} won · ${money(stats.grossLoss, { privacy, decimals: 0, sign: false })} lost`,
      chart: <TileSplit left={stats.grossProfit} right={stats.grossLoss}/>,
    },
    {
      label: 'Day win%', value: percent(stats.dayWinRate, { decimals: 1 }),
      note: `${series.filter((day) => day.pnl > 0).length} of ${plural(series.length, 'day')} green`,
      chart: <TileTape sessions={series.slice(-16)}/>,
    },
  ]

  const change = (now, before, invert = false) => {
    if (before == null || now == null || before === 0) return null
    const delta = ((now - before) / Math.abs(before)) * 100
    return invert ? -delta : delta
  }
  const month = monthly.now
  const prior = monthly.prior
  const compareCards = [
    {
      label: 'Total trades', value: `${month.trades}`,
      delta: change(month.trades, prior?.trades),
      caption: prior ? <>Compared to <b>{prior.trades} trades</b> past month</> : 'No trades in the prior month',
    },
    {
      label: 'Total trades', note: '(Winning)', value: `${month.wins}`,
      delta: change(month.wins, prior?.wins),
      caption: prior ? <>Compared to <b>{prior.wins} trades</b> past month</> : 'No trades in the prior month',
    },
    {
      label: 'Net P&L', value: money(month.netPnl, { privacy, decimals: 0, sign: false }),
      delta: change(month.netPnl, prior?.netPnl),
      caption: prior ? <>Compared to <b>{money(prior.netPnl, { privacy, decimals: 0, sign: false })}</b> past month</> : 'No trades in the prior month',
    },
    {
      label: 'Profit factor', value: ratio(month.profitFactor),
      delta: change(month.profitFactor, prior?.profitFactor),
      caption: prior ? <>Compared to profit factor <b>{ratio(prior.profitFactor)}</b> past month</> : 'No trades in the prior month',
    },
  ]

  const scoreShift = priorEdge?.score != null && edge.score != null ? edge.score - priorEdge.score : null
  const radarAxes = ['Win%', 'Profit factor', 'Avg win/loss', 'Max drawdown', 'Recovery', 'Consistency']

  return <div className="page home">
    <header className="home-header">
      <div className="home-greeting">
        <span className="home-date">{dateLine}</span>
        <div className="greeting-plate">
          <h1 className="welcome-title"><span className="welcome-muted">Welcome Back,</span> {profile.name}</h1>
          <p className="page-lede">{series.length
            ? `${plural(series.length, 'session')} journaled · last trade ${shortDate(series[series.length - 1].date)}`
            : 'No sessions journaled yet — log your first trade to get started.'}</p>
        </div>
      </div>
      <div className="home-actions">
        <button className="start-day" onClick={openLog}><Plus size={15} strokeWidth={2.2}/> Log a trade</button>
      </div>
    </header>

    <div className="home-top">
      <section className="score-panel">
        <div className="score-card">
          <div className="score-head">
            <div>
              <span className="panel-caption">Your score</span>
              <strong className="score-value">{edge.score == null ? '—' : Math.round(edge.score)}<small>/100</small></strong>
            </div>
            {scoreShift != null
              ? <span className={`score-shift ${scoreShift >= 0 ? 'pos' : 'neg'}`}>
                  {scoreShift >= 0 ? <ArrowUpRight size={13} strokeWidth={2.4}/> : <ArrowDownRight size={13} strokeWidth={2.4}/>}
                  {Math.abs(Math.round(scoreShift))} pts <em>vs first half</em>
                </span>
              : edge.score != null && <span className="score-band">{scoreBand(edge.score)}</span>}
          </div>
          <ScoreMeter value={edge.score ?? 0}/>
        </div>
        <div className="tile-grid">
          {tiles.map((tile) => <div className="stat-tile" key={tile.label}>
            <span className="tile-head">
              <span className="tile-label">{tile.label}</span>
              {tile.delta != null && Number.isFinite(tile.delta) && <span className={`tile-delta ${tile.delta >= 0 ? 'pos' : 'neg'}`}>
                {tile.delta >= 0 ? '+' : '−'}{Math.abs(tile.delta).toFixed(tile.deltaUnit ? 1 : 0)}{tile.deltaUnit ? ` ${tile.deltaUnit}` : '%'}
              </span>}
            </span>
            <strong className={tile.tone ? `tone-${tile.tone}` : undefined}>{tile.value}</strong>
            {tile.note && <small className="tile-note">{tile.note}</small>}
            {tile.chart && <span className="tile-chart">{tile.chart}</span>}
          </div>)}
        </div>
      </section>

      <section className="home-card cume-card">
        <div className="card-title">Daily Net Cumulative P&L</div>
        {dataState === 'ready'
          ? <CumulativeChart series={series} height={286} fill privacy={privacy}/>
          : <ChartState state={dataState}/>}
      </section>
    </div>

    <div className="home-bottom">
      <div className="pulse-col">
        <section className="home-card">
          <div className="score-card-head">
            <div className="card-title">Net Daily P&L</div>
          <div className="ws-seg compact" role="tablist" aria-label="Daily P&L window">
            {['7D', '30D', '90D'].map((option) => <button
              key={option} type="button" role="tab" aria-selected={pulseRange === option}
              className={pulseRange === option ? 'active' : ''} onClick={() => setPulseRange(option)}
            >{option}</button>)}
          </div>
        </div>
        {dataState === 'ready'
          ? <>
              <div className="pulse-head">
                <div>
                  <strong className={`tone-${toneOf(pulseNet)}`}>{money(pulseNet, { privacy, decimals: 0 })}</strong>
                  <span className="pulse-count">/ {pulseDays.length} sessions</span>
                </div>
                <span className="pulse-note">Avg {money(pulseNet / Math.max(1, pulseDays.length), { privacy, decimals: 0 })} / day</span>
              </div>
              <DailyPulse series={pulseDays} privacy={privacy}/>
            </>
          : <ChartState state={dataState}/>}
        </section>

        {dataState === 'ready' && <section className="home-card pulse-summary">
          <dl className="pulse-stats">
            <div><dt>Best day</dt><dd className={`tone-${toneOf(pulseBest)}`}>{money(pulseBest, { privacy, decimals: 0 })}</dd></div>
            <div><dt>Worst day</dt><dd className={`tone-${toneOf(pulseWorst)}`}>{money(pulseWorst, { privacy, decimals: 0 })}</dd></div>
            <div><dt>Avg green</dt><dd className="tone-pos">{pulseGreen.length ? money(pulseGreen.reduce((t, d) => t + d.pnl, 0) / pulseGreen.length, { privacy, decimals: 0 }) : '—'}</dd></div>
            <div><dt>Green days</dt><dd>{pulseGreen.length}<small>/{pulseDays.length}</small></dd></div>
          </dl>
        </section>}
      </div>

      <OverallScoreCard edge={edge} priorEdge={priorEdge} axes={radarAxes} enough={scoped.length >= 5}/>

      <section className="home-card feed-card">
        <div className="score-card-head">
          <div className="card-title">Trades</div>
          <div className="ws-seg compact" role="tablist" aria-label="Trade feed">
            {['Recent', 'Best', 'Worst'].map((tab) => <button
              key={tab} type="button" role="tab" aria-selected={feedTab === tab}
              className={feedTab === tab ? 'active' : ''} onClick={() => { setFeedTab(tab); setFeedEnd(false) }}
            >{tab}</button>)}
          </div>
        </div>
        {recent.length
          ? <div key={feedTab} ref={(el) => { if (el && !feedEnd && el.scrollHeight <= el.clientHeight + 2) setFeedEnd(true) }} className={`feed-scroll${feedEnd ? ' at-end' : ''}`} onScroll={(event) => {
              const el = event.currentTarget
              setFeedEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 2)
            }}>
            <table className="feed-table">
              <thead><tr><th>Close Date</th><th>Symbol</th><th>Net P&L</th></tr></thead>
              <tbody>
                {recent.map((trade) => <tr key={trade.id} onClick={() => openJournal(trade.date)} title="Open this day in the journal">
                  <td>{new Date(`${trade.date}T00:00:00Z`).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'UTC' })}</td>
                  <td>{trade.symbol}</td>
                  <td className={`tone-${toneOf(trade.pnl)}`}>{money(trade.pnl, { privacy, decimals: 2 })}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
          : <ChartState state="empty"/>}
      </section>
    </div>

    <div className="compare-row">
      {compareCards.map((card) => <section className="compare-card" key={`${card.label}-${card.note ?? ''}`}>
        <div className="compare-head">
          <span className="compare-label">{card.label}{card.note && <em> {card.note}</em>}</span>
        </div>
        <div className="compare-value">
          <strong>{card.value}</strong>
          {card.delta != null && <span className={`compare-delta ${card.delta >= 0 ? 'pos' : 'neg'}`}>
            {card.delta >= 0 ? <ArrowUpRight size={14} strokeWidth={2.4}/> : <ArrowDownRight size={14} strokeWidth={2.4}/>}
            {Math.abs(card.delta).toFixed(0)}%
          </span>}
        </div>
        <small className="compare-caption">{card.caption}</small>
      </section>)}
    </div>

    <div className="win-row">
      <WinRatioCard trades={scoped} variant="donut"/>
      <WinRatioCard trades={scoped} variant="bars"/>
      <WinRatioCard trades={scoped} variant="lines"/>
    </div>
  </div>
}

function MiniCalendar({ privacy }) {
  return <div className="month-mini">
    <div className="month-mini-head">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <span key={d}>{d}</span>)}</div>
    <div className="month-mini-grid">
      {[...Array(1)].map((_, index) => <i key={`empty-${index}`}/>)}
      {calendarDays.slice(0, 30).map((day) =>
        <div key={day.day} className={day.pnl ? (day.pnl > 0 ? 'win' : 'loss') : ''}>
          <span>{day.day}</span>
          {day.pnl ? <b>{privacy ? '••••' : `${day.pnl > 0 ? '+' : '−'}$${Math.abs(day.pnl).toFixed(0)}`}</b> : null}
        </div>)}
    </div>
  </div>
}

/** Stable colour per label so a symbol or setup keeps its hue across the app. */
const labelHue = (label) => {
  let hash = 0
  for (let index = 0; index < label.length; index += 1) hash = (hash * 31 + label.charCodeAt(index)) % 360
  return hash
}

const isJournaled = (date) => {
  if (date === '2026-09-18' || ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'].includes(date)) return true
  try { return !!(localStorage.getItem(`journal-note-${date}`) || localStorage.getItem(`journal-checklist-${date}`)) } catch { return false }
}


/** Facet rows arrive as a fanned deck and unshuffle into a list on the first click. */
function RailDeck({ items, isMuted, onToggle }) {
  const [spread, setSpread] = useState(false)
  return <div className={`rail-deck${spread ? ' is-spread' : ''}`}>
    <ul
      className="rail-list" style={{ '--rows': items.length }}
      onClickCapture={(event) => { if (!spread) { event.preventDefault(); event.stopPropagation(); setSpread(true) } }}
    >
      {items.map(([label, count], index) => {
        const on = !isMuted(label)
        return <li key={label} style={{ '--i': index, '--back': items.length - 1 - index }}>
          <button type="button" className={`rail-row${on ? '' : ' off'}`} aria-pressed={on} tabIndex={spread ? 0 : -1} onClick={() => onToggle(label)}>
            <span className="rail-chip" style={{ '--hue': labelHue(label) }}>{label}</span>
            <em>{count}</em>
          </button>
        </li>
      })}
    </ul>
    <button type="button" className="rail-deck-toggle" onClick={() => setSpread(!spread)}>
      {spread ? 'Stack them' : `Spread ${items.length}`}
    </button>
  </div>
}

// Designs by RNSENCE Studio
export function CalendarPage({ privacy, openJournal, openTrades, openLog }) {
  const easternToday = useEasternToday()
  const latest = tradeLog.length ? tradeLog[tradeLog.length - 1].date : '2026-09-01'
  const anchorYear = Number(latest.slice(0, 4))
  const anchorMonth = Number(latest.slice(5, 7)) - 1
  const [monthOffset, setMonthOffset] = useState(0)
  const [weekIndex, setWeekIndex] = useState(null)
  const [view, setView] = useState('Month')
  const [filter, setFilter] = useState('All trades')
  const [query, setQuery] = useState('')
  const filters = ['All trades', 'Wins', 'Losses', 'Journaled']
  const [mutedSymbols, setMutedSymbols] = useState(() => new Set())
  const [mutedSetups, setMutedSetups] = useState(() => new Set())
  const [openFacet, setOpenFacet] = useState('symbols')
  const toggleIn = (set, value, apply) => { const next = new Set(set); if (next.has(value)) next.delete(value); else next.add(value); apply(next) }

  const month = useMemo(() => {
    const date = new Date(Date.UTC(anchorYear, anchorMonth + monthOffset, 1))
    const year = date.getUTCFullYear()
    const monthNumber = date.getUTCMonth()
    const prefix = `${year}-${String(monthNumber + 1).padStart(2, '0')}`
    const days = new Date(Date.UTC(year, monthNumber + 1, 0)).getUTCDate()
    const startsOn = (date.getUTCDay() + 6) % 7
    const previousDays = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
    const cellCount = Math.ceil((startsOn + days) / 7) * 7
    const monthTrades = tradeLog.filter((trade) => trade.date.startsWith(prefix))
    const cells = Array.from({ length: cellCount }, (_, index) => {
      if (index < startsOn) return { day: previousDays - startsOn + index + 1, outside: true, edge: 'previous' }
      if (index >= startsOn + days) return { day: index - startsOn - days + 1, outside: true, edge: 'next' }
      const day = index - startsOn + 1
      const iso = `${prefix}-${String(day).padStart(2, '0')}`
      const entries = monthTrades.filter((trade) => trade.date === iso)
      return { day, iso, outside: false, entries, pnl: entries.length ? entries.reduce((sum, trade) => sum + trade.pnl, 0) : null }
    })
    const short = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
    return {
      cells, prefix, trades: monthTrades,
      longName: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      range: `${short} 1, ${year} – ${short} ${days}, ${year}`,
      isEasternMonth: year === easternToday.year && monthNumber + 1 === easternToday.month,
    }
  }, [monthOffset, easternToday.year, easternToday.month])

  const matches = (entry) => {
    if (filter === 'Wins' && entry.pnl <= 0) return false
    if (filter === 'Losses' && entry.pnl >= 0) return false
    if (filter === 'Journaled' && !isJournaled(entry.date)) return false
    if (mutedSymbols.has(entry.symbol)) return false
    if (mutedSetups.has(entry.setup)) return false
    if (query && !entry.symbol.toLowerCase().includes(query.trim().toLowerCase())) return false
    return true
  }
  const filtered = month.trades.filter(matches)
  const monthStats = useMemo(() => {
    const byDay = new Map()
    filtered.forEach((trade) => byDay.set(trade.date, (byDay.get(trade.date) ?? 0) + trade.pnl))
    const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([iso, pnl]) => ({ iso, day: Number(iso.slice(8)), pnl, trades: filtered.filter((trade) => trade.date === iso).length }))
    const total = days.reduce((sum, day) => sum + day.pnl, 0)
    const wins = filtered.filter((trade) => trade.pnl > 0).length
    const losses = filtered.filter((trade) => trade.pnl < 0).length
    return {
      days, sessions: days.length, green: days.filter((day) => day.pnl > 0).length, total,
      average: days.length ? total / days.length : 0,
      trades: filtered.length, wins, losses,
      winRate: wins + losses ? (wins / (wins + losses)) * 100 : 0,
      best: days.length ? days.reduce((top, day) => (day.pnl > top.pnl ? day : top)) : null,
      worst: days.length ? days.reduce((low, day) => (day.pnl < low.pnl ? day : low)) : null,
      positive: days.filter((day) => day.pnl > 0).length,
      streak: days.reduce((acc, day) => { const run = day.pnl > 0 ? acc.run + 1 : 0; return { run, best: Math.max(acc.best, run) } }, { run: 0, best: 0 }).best,
      negative: days.filter((day) => day.pnl < 0).length,
    }
  }, [month, filter, query])

  const facet = (key) => {
    const counts = new Map()
    month.trades.forEach((trade) => counts.set(trade[key], (counts.get(trade[key]) ?? 0) + 1))
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }
  const symbolFacets = facet('symbol')
  const setupFacets = facet('setup').slice(0, 6)
  const weeks = Math.ceil(month.cells.length / 7)
  const currentWeek = weekIndex ?? Math.max(0, Math.floor(month.cells.findIndex((cell) => !cell.outside && cell.day === (month.isEasternMonth ? easternToday.day : 1)) / 7))
  const visibleCells = view === 'Month' ? month.cells : month.cells.slice(currentWeek * 7, currentWeek * 7 + 7)
  const step = (delta) => {
    if (view === 'Week' && currentWeek + delta >= 0 && currentWeek + delta < weeks) { setWeekIndex(currentWeek + delta); return }
    setMonthOffset(monthOffset + delta)
    setWeekIndex(view === 'Week' ? (delta > 0 ? 0 : null) : null)
  }
  const resetMonth = () => { setMonthOffset(0); setWeekIndex(null) }
  const hasFilter = filter !== 'All trades' || query

  return <div className="page calendar-page">
    <header className="cal-header">
      <div className="home-greeting">
        <span className="home-date">{easternToday.label}</span>
        <div className="greeting-plate">
          <h1>Calendar</h1>
          <p className="page-lede">{monthStats.sessions
            ? `${month.longName} · ${plural(monthStats.sessions, 'trading day')} · ${monthStats.green} green`
            : `${month.longName} · no closed trades yet`}</p>
        </div>
      </div>
      <label className="cal-search">
        <Search size={15} strokeWidth={1.8}/>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by symbol" aria-label="Filter calendar by symbol"/>
        {query && <button type="button" className="cal-search-clear" aria-label="Clear filter" onClick={() => setQuery('')}><X size={13}/></button>}
      </label>
    </header>

    <div className="cal-tabs" role="tablist">
      {filters.map((item) =>
        <button key={item} role="tab" aria-selected={filter === item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}
    </div>

    <div className="cal-layout">
    <aside className="cal-rail">
      <div className="mini-cal">
        <div className="mc-head">
          <button type="button" aria-label="Previous month" onClick={() => { setMonthOffset(monthOffset - 1); setWeekIndex(null) }}><ChevronLeft size={15}/></button>
          <strong>{month.longName}</strong>
          <button type="button" aria-label="Next month" onClick={() => { setMonthOffset(monthOffset + 1); setWeekIndex(null) }}><ChevronRight size={15}/></button>
        </div>
        <div className="mc-week">{['S','M','T','W','T','F','S'].map((day, index) => <span key={index}>{day}</span>)}</div>
        <div className="mc-grid">
          {month.cells.map((cell, index) => {
            const traded = !cell.outside && cell.entries?.length
            const today = month.isEasternMonth && !cell.outside && cell.day === easternToday.day
            return <button
              type="button" key={`${cell.edge || 'in'}-${cell.day}-${index}`}
              className={`mc-day${cell.outside ? ' out' : ''}${traded ? ` ${toneOf(cell.pnl)}` : ''}${today ? ' today' : ''}`}
              disabled={!traded}
              title={traded ? `${easternLabel(cell.iso)} · ${money(cell.pnl, { privacy, decimals: 0 })}` : undefined}
              onClick={traded ? () => openJournal(cell.iso) : undefined}
            >{cell.day}</button>
          })}
        </div>
      </div>

      <div className="rail-facets">
        <div className="ws-seg compact rail-switch" role="tablist" aria-label="Filter by">
          {[['symbols', 'Symbols', symbolFacets.length], ['setups', 'Setups', setupFacets.length]].map(([key, label, count]) => <button
            key={key} type="button" role="tab" aria-selected={openFacet === key}
            className={openFacet === key ? 'active' : ''}
            onClick={() => setOpenFacet(openFacet === key ? null : key)}
          >{label}<em>{count}</em></button>)}
        </div>

        {openFacet === 'symbols' && <RailDeck
          key="symbols" items={symbolFacets}
          isMuted={(value) => mutedSymbols.has(value)}
          onToggle={(value) => toggleIn(mutedSymbols, value, setMutedSymbols)}
        />}

        {openFacet === 'setups' && <RailDeck
          key="setups" items={setupFacets}
          isMuted={(value) => mutedSetups.has(value)}
          onToggle={(value) => toggleIn(mutedSetups, value, setMutedSetups)}
        />}
      </div>

      {(mutedSymbols.size > 0 || mutedSetups.size > 0) && <button type="button" className="rail-reset" onClick={() => { setMutedSymbols(new Set()); setMutedSetups(new Set()) }}>Show everything</button>}
    </aside>

    <div className="cal-main">
    <section className="month-board">
      <div className="board-toolbar">
        <div className="board-title"><h2>{month.longName}</h2><p>{view === 'Week' ? `Week ${currentWeek + 1} of ${weeks}` : month.range}</p></div>
        <div className="board-tools">
          <div className="board-steps">
            <button aria-label={view === 'Week' ? 'Previous week' : 'Previous month'} onClick={() => step(-1)}><ArrowLeft size={15} strokeWidth={1.8}/></button>
            <button className="board-today" onClick={resetMonth}>Today</button>
            <button aria-label={view === 'Week' ? 'Next week' : 'Next month'} onClick={() => step(1)}><ArrowRight size={15} strokeWidth={1.8}/></button>
          </div>
          <label className="board-select">
            <select value={view} aria-label="Calendar view" onChange={(event) => { setView(event.target.value); setWeekIndex(null) }}>
              <option value="Month">Month view</option>
              <option value="Week">Week view</option>
            </select>
            <ChevronDown size={14}/>
          </label>
          <button className="board-primary" onClick={openLog}><Plus size={14} strokeWidth={2.4}/> Log trade</button>
        </div>
      </div>

      <div className="month-weekdays">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <span key={d}>{d}</span>)}</div>
      <div className={`month-grid ${view === 'Week' ? 'week-view' : ''}`}>{visibleCells.map((cell, index) => {
        const entries = (cell.entries || []).filter(matches)
        const shown = entries.slice(0, 3)
        const hidden = entries.length - shown.length
        const today = month.isEasternMonth && !cell.outside && cell.day === easternToday.day
        const open = !cell.outside && cell.entries?.length ? () => openJournal(cell.iso) : null
        return <div
          key={`${cell.edge || 'current'}-${cell.day}-${index}`}
          className={`day-cell${cell.outside ? ' outside' : ''}${open ? ' has-trades' : ''}`}
          onClick={open ?? undefined}
          title={open ? `Open ${easternLabel(cell.iso)} in the journal` : undefined}
        >
          <span className={`day-number${today ? ' today' : ''}`}>{cell.day}</span>
          <div className="day-chips">
            {shown.map((entry) =>
              <span key={entry.id} className={`day-chip ${entry.pnl > 0 ? 'win' : 'loss'}`} title={`${entry.symbol} · ${entry.time}`}>
                <b>{entry.symbol}</b><small>{privacy ? '••••' : `${entry.pnl > 0 ? '+' : '−'}$${Math.abs(entry.pnl).toFixed(0)}`}</small>
              </span>)}
            {hidden > 0 && <span className="day-more">{hidden} more…</span>}
          </div>
        </div>
      })}</div>

      <div className="month-summary">
        <span>{monthStats.sessions ? `${plural(monthStats.sessions, 'trading day')} · ${monthStats.green} green` : 'No trades this month'}{hasFilter ? ' · filtered' : ''}</span>
        <strong>Month total <b className={monthStats.total >= 0 ? 'positive' : 'negative'}>{money(monthStats.total, privacy)}</b></strong>
      </div>
    </section>

    </div>
    </div>
  </div>
}



/** Calendar cells plus a display name for the month a set of trades belongs to. */
export function monthCalendar(prefix, trades) {
  const [year, monthNumber] = [Number(prefix.slice(0, 4)), Number(prefix.slice(5, 7)) - 1]
  const date = new Date(Date.UTC(year, monthNumber, 1))
  const days = new Date(Date.UTC(year, monthNumber + 1, 0)).getUTCDate()
  const startsOn = (date.getUTCDay() + 6) % 7
  const previousDays = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const cellCount = Math.ceil((startsOn + days) / 7) * 7
  const cells = Array.from({ length: cellCount }, (_, index) => {
    if (index < startsOn) return { day: previousDays - startsOn + index + 1, outside: true, edge: 'previous' }
    if (index >= startsOn + days) return { day: index - startsOn - days + 1, outside: true, edge: 'next' }
    const day = index - startsOn + 1
    const iso = `${prefix}-${String(day).padStart(2, '0')}`
    const entries = trades.filter((trade) => trade.date === iso)
    return { day, iso, outside: false, entries, pnl: entries.length ? entries.reduce((sum, trade) => sum + trade.pnl, 0) : null }
  })
  return { cells, prefix, trades, longName: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) }
}

/** Day-level roll-up behind the performance insights panel. */
export function insightStats(trades) {
  const byDay = new Map()
  trades.forEach((trade) => byDay.set(trade.date, (byDay.get(trade.date) ?? 0) + trade.pnl))
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, pnl]) => ({ iso, day: Number(iso.slice(8)), pnl, trades: trades.filter((trade) => trade.date === iso).length }))
  const total = days.reduce((sum, day) => sum + day.pnl, 0)
  const wins = trades.filter((trade) => trade.pnl > 0).length
  const losses = trades.filter((trade) => trade.pnl < 0).length
  return {
    days, sessions: days.length, green: days.filter((day) => day.pnl > 0).length, total,
    average: days.length ? total / days.length : 0,
    trades: trades.length, wins, losses,
    winRate: wins + losses ? (wins / (wins + losses)) * 100 : 0,
    best: days.length ? days.reduce((top, day) => (day.pnl > top.pnl ? day : top)) : null,
    worst: days.length ? days.reduce((low, day) => (day.pnl < low.pnl ? day : low)) : null,
    positive: days.filter((day) => day.pnl > 0).length,
    streak: days.reduce((acc, day) => { const run = day.pnl > 0 ? acc.run + 1 : 0; return { run, best: Math.max(acc.best, run) } }, { run: 0, best: 0 }).best,
    negative: days.filter((day) => day.pnl < 0).length,
  }
}

/** Month-level performance read-out: headline metrics, day range and day consistency. */
// Designs by RNSENCE Studio
export function PerformanceInsights({ month, stats, privacy, openJournal, openTrades, query = '', note = '' }) {
  return <>
    <SectionTitle title="Performance insights" subtitle={`${month.longName}${note} · closed trades, after fees`} action={<button className="text-button" onClick={() => openTrades(query)}>View trades <ArrowUpRight size={13}/></button>}/>
    {stats.sessions
      ? <div className="calendar-insights">
        <Metric label="Net P&L" value={money(stats.total, privacy)} tone={stats.total >= 0 ? 'positive' : 'negative'} detail={plural(stats.sessions, 'trading day')}/>
        <Metric label="Average daily P&L" value={money(stats.average, privacy)} tone={stats.average >= 0 ? 'positive' : 'negative'} detail="Per day with closed trades" chart={<MiniBars values={stats.days.map((day) => day.pnl)} reference={stats.average}/>}/>
        <Metric label="Trade win rate" value={percent(stats.winRate)} detail={`${plural(stats.wins, 'win')} · ${stats.losses} ${stats.losses === 1 ? 'loss' : 'losses'}`} chart={<MiniRing wins={stats.wins} losses={stats.losses}/>}/>
        <Metric label="Total closed trades" value={`${stats.trades}`} detail="Round-trip trades" chart={<MiniBars values={stats.days.map((day) => day.trades)} neutral/>}/>
        <Card className="day-range-card"><span className="eyebrow">Day range</span>
          <div className="dr-stats">
            <button type="button" className="dr-stat worst" onClick={() => openJournal(stats.worst.iso)}><span>Worst day</span><b>{money(stats.worst.pnl, privacy)}</b><small>{shortDate(stats.worst.iso)}</small></button>
            <div className="dr-stat avg"><span>Average day</span><b>{money(stats.average, privacy)}</b><small>{plural(stats.sessions, 'day')}</small></div>
            <button type="button" className="dr-stat best" onClick={() => openJournal(stats.best.iso)}><span>Best day</span><b>{money(stats.best.pnl, privacy)}</b><small>{shortDate(stats.best.iso)}</small></button>
          </div>
          {(() => {
            const low = Math.min(0, stats.worst.pnl)
            const high = Math.max(0, stats.best.pnl)
            const at = (value) => `${((value - low) / ((high - low) || 1)) * 100}%`
            return <div className="dr-scale">
              <div className="dr-track" aria-hidden="true">
                <i className="dr-fill neg" style={{ left: 0, width: at(0) }}/>
                <i className="dr-fill pos" style={{ left: at(0), right: 0 }}/>
                <i className="dr-zero" style={{ left: at(0) }}/>
                <i className="dr-avg" style={{ left: at(stats.average) }}/>
              </div>
              <div className="dr-ticks" aria-hidden="true">
                <span style={{ left: at(0) }}>$0</span>
                <span className="avg" style={{ left: at(stats.average) }}>avg</span>
              </div>
              <p className="dr-note">{stats.green} of {stats.sessions} days closed green · the average day made {money(stats.average, privacy)}</p>
            </div>
          })()}
        </Card>
        <Card className="consistency-card">
          <div className="consistency-copy">
            <span className="eyebrow">Day consistency</span>
            <strong className="big-value">{percent((stats.positive / stats.sessions) * 100)}</strong>
            <small><b className="tone-pos">{stats.positive} positive</b> · <b className="tone-neg">{stats.negative} negative</b> days</small>
            <span className="cons-streak"><span>Best streak</span><b>{plural(stats.streak, 'green day')}</b></span>
          </div>
          {(() => {
            const peak = Math.max(1, ...stats.days.map((day) => Math.abs(day.pnl)))
            const byIso = new Map(stats.days.map((day) => [day.iso, day]))
            const weeks = []
            for (let index = 0; index < month.cells.length; index += 7) weeks.push(month.cells.slice(index, index + 5))
            return <div className="cons-grid" role="img" aria-label="Green and red days across the month">
              <div className="cg-row cg-head">{['M', 'T', 'W', 'T', 'F'].map((label, index) => <span key={index}>{label}</span>)}</div>
              {weeks.map((week, row) => <div className="cg-row" key={row}>
                {week.map((cell, column) => {
                  const day = !cell.outside ? byIso.get(cell.iso) : null
                  const strength = day ? 0.35 + (Math.abs(day.pnl) / peak) * 0.65 : 0
                  return <i
                    key={column}
                    className={`cg-cell${cell.outside ? ' out' : ''}${day ? (day.pnl > 0 ? ' pos' : ' neg') : ''}`}
                    style={day ? { '--a': strength } : undefined}
                    title={day ? `${shortDate(day.iso)} · ${money(day.pnl, { privacy, decimals: 0 })}` : cell.outside ? undefined : `${shortDate(cell.iso)} · no trades`}
                    onClick={day ? () => openJournal(day.iso) : undefined}
                  />
                })}
              </div>)}
            </div>
          })()}
        </Card>
      </div>
      : <ChartState state="empty" detail="No closed trades match this month and filter."/>}
  </>
}

const DEFAULT_NOTE_HTML = [
  '<h2>Session review</h2>',
  '<div class="note-tags" contenteditable="false"><span>Selective</span><span>Patient</span><span>Late-day edge</span></div>',
  '<p>Stayed patient through the opening range and only took confirmed setups. The SPY short had the cleanest alignment with the broader market.</p>',
  '<h3>What worked</h3>',
  '<ul><li>Waited for confirmation before entry.</li><li>Kept risk consistent across positions.</li><li>Stopped after the planned session window.</li></ul>',
  '<h3>Next session</h3>',
  '<p>Write the setup and invalidation level before entering. Review execution quality separately from profit.</p>',
].join('')

/** Full-width equity sparkline that fills the base of a KPI cell. */
function TileSpark({ values, tone = 'pos' }) {
  if (values.length < 2) return null
  let running = 0
  const points = values.map((value) => (running += value))
  const min = Math.min(0, ...points)
  const max = Math.max(0, ...points)
  const span = max - min || 1
  const path = points.map((value, index) => `${index === 0 ? 'M' : 'L'} ${(index / (points.length - 1)) * 100} ${26 - ((value - min) / span) * 24}`).join(' ')
  const fillId = `spark-${tone}`
  return <svg className={`tile-spark ${tone}`} viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={tone === 'neg' ? 'var(--neg-mark)' : 'var(--pos-mark)'} stopOpacity=".45"/>
        <stop offset="1" stopColor={tone === 'neg' ? 'var(--neg-mark)' : 'var(--pos-mark)'} stopOpacity="0"/>
      </linearGradient>
    </defs>
    <path className="ts-area" d={`${path} L 100 28 L 0 28 Z`} fill={`url(#${fillId})`}/>
    <path className="ts-line" d={path} vectorEffect="non-scaling-stroke"/>
  </svg>
}

/** Two-sided proportion bar with an optional midpoint reference. */
function TileSplit({ left, right, mark }) {
  const total = Math.max(1, left + right)
  return <span className="tile-split" aria-hidden="true">
    <i className="pos" style={{ width: `${(left / total) * 100}%` }}/>
    <i className="neg" style={{ width: `${(right / total) * 100}%` }}/>
    {mark != null && <em style={{ left: `${mark}%` }}/>}
  </span>
}

/** Session tape: one tick per recent day, green up, red down. */
function TileTape({ sessions }) {
  return <span className="tile-tape" aria-hidden="true">
    {sessions.map((day) => <i key={day.date} className={toneOf(day.pnl)}/>)}
  </span>
}

/** Recent sessions as small bars — today in colour, earlier days grey, dashed line at the average day. */
function SessionRank({ sessions, current, average, width = 86, height = 34 }) {
  const values = sessions.map((item) => item.pnl)
  const low = Math.min(0, ...values, average)
  const high = Math.max(0, ...values, average)
  const span = high - low || 1
  const yAt = (value) => 2 + (1 - (value - low) / span) * (height - 4)
  const band = width / Math.max(1, sessions.length)
  const barWidth = Math.max(3, band * 0.62)
  return <svg className="session-rank" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
    {sessions.map((item, index) => {
      const top = yAt(Math.max(item.pnl, 0))
      const bottom = yAt(Math.min(item.pnl, 0))
      const tone = item.date === current ? (item.pnl >= 0 ? 'today pos' : 'today neg') : item.pnl >= 0 ? 'past' : 'past neg'
      return <rect key={item.date} className={`sr-bar ${tone}`} x={index * band + (band - barWidth) / 2} y={top} width={barWidth} height={Math.max(1.5, bottom - top)} rx="1.5"/>
    })}
    <line className="sr-avg" x1="0" x2={width} y1={yAt(average)} y2={yAt(average)}/>
  </svg>
}

const REVIEWED_DAY = '2026-09-18'
const SAMPLE_CHECKS = {
  '2026-09-14': [true, true, true, true, true], '2026-09-15': [true, true, false, true, true],
  '2026-09-16': [true, false, true, false, true], '2026-09-17': [true, true, true, true, true],
  [REVIEWED_DAY]: [true, true, true, false, true],
}
const readChecks = (date) => {
  try { return JSON.parse(localStorage.getItem(`journal-checklist-${date}`)) || SAMPLE_CHECKS[date] || null } catch { return SAMPLE_CHECKS[date] || null }
}
const blankNote = (date) => `<h2>Session review</h2><p>${new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })} — what did the market give you, and how did you trade it?</p><h3>What worked</h3><ul><li>…</li></ul><h3>Next session</h3><p>…</p>`

/** Downscales an image file to a JPEG data URL so attachments stay small enough to keep. */
function shrinkImage(file, max = 1400) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const image = new Image()
      image.onerror = reject
      image.onload = () => {
        const scale = Math.min(1, max / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(image.width * scale)
        canvas.height = Math.round(image.height * scale)
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      image.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

// Designs by RNSENCE Studio
export function JournalPage({ privacy, date = REVIEWED_DAY, setDate, openLog }) {
  const sessionFills = useMemo(() => tradeLog.filter((trade) => trade.date === date).sort((a, b) => a.time.localeCompare(b.time)), [date])
  const days = tradingDays()
  if (!sessionFills.length) {
    return <div className="page home journal">
      <header className="home-header"><div><span className="home-date">{easternLabel(date)}</span><h1>Daily journal</h1></div></header>
      <ChartState state="empty" detail="No trades on this day yet — log one to start the journal."/>
      {days.length > 0 && <button type="button" className="start-day jr-empty-cta" onClick={() => setDate?.(days[days.length - 1])}>Go to the latest session</button>}
    </div>
  }
  const dayIndex = days.indexOf(date)
  const previousDay = dayIndex > 0 ? days[dayIndex - 1] : null
  const nextDay = dayIndex >= 0 && dayIndex < days.length - 1 ? days[dayIndex + 1] : null
  const [toast, setToast] = useState(null)
  const flash = (message) => { setToast(message); window.clearTimeout(flash.timer); flash.timer = window.setTimeout(() => setToast(null), 1800) }
  const ATTACH_KEY = `journal-attachments-${date}`
  const [attachments, setAttachments] = useState(() => { try { return JSON.parse(localStorage.getItem(ATTACH_KEY)) || [] } catch { return [] } })
  const [preview, setPreview] = useState(null)
  const fileRef = useRef(null)
  const addFiles = async (files) => {
    const images = [...files].filter((file) => file.type.startsWith('image/')).slice(0, 6)
    if (!images.length) return
    const added = await Promise.all(images.map(async (file) => ({ id: `${Date.now()}-${file.name}`, name: file.name, src: await shrinkImage(file) })))
    setAttachments((current) => {
      const next = [...current, ...added]
      try { localStorage.setItem(ATTACH_KEY, JSON.stringify(next)); flash(`${added.length} screenshot${added.length > 1 ? 's' : ''} attached`) } catch { flash('Attached — too large to keep after a refresh') }
      return next
    })
  }
  const removeAttachment = (id) => setAttachments((current) => {
    const next = current.filter((item) => item.id !== id)
    try { localStorage.setItem(ATTACH_KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
    return next
  })
  const copyNote = async () => {
    try { await navigator.clipboard.writeText(noteRef.current?.innerText ?? ''); flash('Note copied') } catch { flash('Copy blocked by the browser') }
  }
  const downloadNote = () => {
    const text = `# Session review — ${easternLabel(date)}\n\n${noteRef.current?.innerText ?? ''}\n`
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }))
    link.download = `journal-${date}.md`
    link.click()
    URL.revokeObjectURL(link.href)
  }
  const [editing, setEditing] = useState(false)
  const [tableEnd, setTableEnd] = useState(false)
  const [tradesOpen, setTradesOpen] = useState(true)
  const [tradeFilter, setTradeFilter] = useState('All')
  const visibleFills = useMemo(() => sessionFills.filter((fill) =>
    tradeFilter === 'Wins' ? fill.pnl > 0 : tradeFilter === 'Losses' ? fill.pnl < 0 : true), [sessionFills, tradeFilter])
  const [timelineView, setTimelineView] = useState('Packed')
  const NOTE_KEY = `journal-note-${date}`
  const noteRef = useRef(null)
  const [noteHtml] = useState(() => {
    const fallback = date === REVIEWED_DAY ? DEFAULT_NOTE_HTML : blankNote(date)
    try { return localStorage.getItem(NOTE_KEY) || fallback } catch { return fallback }
  })
  const [noteScale, setNoteScale] = useState(() => {
    try { return Math.max(-3, Math.min(3, Number(localStorage.getItem(`${NOTE_KEY}-scale`)) || 0)) } catch { return 0 }
  })
  const [savedAt, setSavedAt] = useState(null)
  const [formats, setFormats] = useState({ bold: false, italic: false, list: false })
  const saveNote = () => {
    try { localStorage.setItem(NOTE_KEY, noteRef.current?.innerHTML ?? '') } catch { /* storage unavailable */ }
    setSavedAt(new Date())
  }
  const changeScale = (step) => setNoteScale((current) => {
    const next = Math.max(-3, Math.min(3, current + step))
    try { localStorage.setItem(`${NOTE_KEY}-scale`, String(next)) } catch { /* storage unavailable */ }
    return next
  })
  const runFormat = (command) => {
    noteRef.current?.focus()
    document.execCommand(command)
    saveNote()
    readFormats()
  }
  const readFormats = () => setFormats({
    bold: document.queryCommandState('bold'),
    italic: document.queryCommandState('italic'),
    list: document.queryCommandState('insertUnorderedList'),
  })
  useEffect(() => {
    if (!editing) return undefined
    const onSelection = () => { if (noteRef.current?.contains(document.getSelection()?.anchorNode)) readFormats() }
    document.addEventListener('selectionchange', onSelection)
    noteRef.current?.focus()
    return () => document.removeEventListener('selectionchange', onSelection)
  }, [editing])
  const day = useMemo(() => {
    const wins = sessionFills.filter((fill) => fill.pnl > 0)
    const losses = sessionFills.filter((fill) => fill.pnl < 0)
    const won = wins.reduce((sum, fill) => sum + fill.pnl, 0)
    const lost = Math.abs(losses.reduce((sum, fill) => sum + fill.pnl, 0))
    const fees = sessionFills.reduce((sum, fill) => sum + fill.fees, 0)
    const net = won - lost
    return { net, won, lost, gross: net + fees, fees, wins: wins.length, losses: losses.length, winRate: (wins.length / sessionFills.length) * 100, profitFactor: lost ? won / lost : null, best: Math.max(...sessionFills.map((fill) => fill.pnl)) }
  }, [sessionFills])

  const breakdown = useMemo(() => {
    const winners = sessionFills.filter((fill) => fill.pnl > 0)
    const losers = sessionFills.filter((fill) => fill.pnl < 0)
    const sideTotal = (side) => sessionFills.filter((fill) => fill.side === side).reduce((sum, fill) => sum + fill.pnl, 0)
    const avg = (list) => (list.length ? list.reduce((sum, fill) => sum + fill.pnl, 0) / list.length : null)
    const largestWin = winners.length ? winners.reduce((best, fill) => (fill.pnl > best.pnl ? fill : best)) : null
    const largestLoss = losers.length ? losers.reduce((worst, fill) => (fill.pnl < worst.pnl ? fill : worst)) : null
    return { largestWin, largestLoss, avgWinner: avg(winners), avgLoser: avg(losers), long: sideTotal('Long'), short: sideTotal('Short') }
  }, [sessionFills])

  // Baseline: the average trading session across the whole journal.
  const baseline = useMemo(() => {
    const sessions = equitySeries(tradeLog)
    const count = sessions.length || 1
    const trades = sessions.reduce((sum, session) => sum + session.trades, 0)
    const wins = sessions.reduce((sum, session) => sum + session.wins, 0)
    return {
      net: sessions.reduce((sum, session) => sum + session.pnl, 0) / count,
      trades: trades / count,
      winRate: trades ? (wins / trades) * 100 : null,
      bestTrade: Math.max(...tradeLog.map((trade) => trade.pnl)),
      profitFactor: summarize(tradeLog).profitFactor,
    }
  }, [])
  const JOURNAL_DAY = date
  const week = useMemo(() => {
    const sessions = new Map(equitySeries(tradeLog).map((session) => [session.date, session]))
    const anchor = Date.parse(`${JOURNAL_DAY}T00:00:00Z`)
    const monday = anchor - ((new Date(anchor).getUTCDay() + 6) % 7) * 86400000
    return Array.from({ length: 5 }, (_, index) => {
      const stamp = monday + index * 86400000
      const date = new Date(stamp).toISOString().slice(0, 10)
      const session = sessions.get(date)
      return { date, weekday: new Date(stamp).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }), dayNumber: Number(date.slice(8)), pnl: session ? session.pnl : null, trades: session?.trades ?? 0 }
    })
  }, [JOURNAL_DAY])
  const recentSessions = useMemo(() => {
    const sessions = equitySeries(tradeLog).filter((session) => session.date <= JOURNAL_DAY)
    return sessions.slice(-10)
  }, [JOURNAL_DAY])
  const weekNet = week.reduce((total, item) => total + (item.pnl ?? 0), 0)
  const ordered = [...sessionFills].sort((a, b) => a.time.localeCompare(b.time))
  const path = ordered.reduce((acc, fill) => [...acc, (acc[acc.length - 1] ?? 0) + fill.pnl], [])
  const intraday = { high: Math.max(0, ...path), low: Math.min(0, ...path), close: path[path.length - 1] ?? 0 }
  const pnlPeak = Math.max(1, ...sessionFills.map((fill) => Math.abs(fill.pnl)))
  const GRADE_POINTS = { 'A+': 4.3, A: 4, 'A-': 3.7, B: 3, C: 2, D: 1 }
  const gradeAverage = sessionFills.reduce((sum, fill) => sum + (GRADE_POINTS[fill.grade] ?? 0), 0) / sessionFills.length
  const gradeLetter = gradeAverage >= 4.15 ? 'A+' : gradeAverage >= 3.85 ? 'A' : gradeAverage >= 3.5 ? 'A−' : gradeAverage >= 3.15 ? 'B+' : gradeAverage >= 2.85 ? 'B' : gradeAverage >= 2 ? 'C' : 'D'
  const toMinutes = (time) => { const [hours, minutes] = time.split(':').map(Number); return hours * 60 + minutes }
  const times = sessionFills.map((fill) => toMinutes(fill.time))
  const lastExit = sessionFills.reduce((last, fill) => ((fill.closed ?? fill.time) > last ? (fill.closed ?? fill.time) : last), sessionFills[0]?.time ?? '09:30')
  const activeMinutes = toMinutes(lastExit) - Math.min(...times)
  const firstEntry = sessionFills.reduce((first, fill) => (toMinutes(fill.time) < toMinutes(first.time) ? fill : first)).time
  const SESSION_OPEN = 9 * 60 + 30
  const SESSION_CLOSE = 16 * 60
  const timelineAt = (minutes) => Math.max(0, Math.min(100, ((minutes - SESSION_OPEN) / (SESSION_CLOSE - SESSION_OPEN)) * 100))
  const packedRows = useMemo(() => {
    const LABEL_MINUTES = 36
    const rows = []
    ;[...sessionFills].sort((a, b) => a.time.localeCompare(b.time)).forEach((fill) => {
      const start = toMinutes(fill.time)
      const reach = Math.max(toMinutes(fill.closed ?? fill.time), start + LABEL_MINUTES)
      const row = rows.find((item) => item.reach <= start)
      if (row) { row.fills.push(fill); row.reach = reach } else rows.push({ fills: [fill], reach })
    })
    return rows.map((row) => row.fills)
  }, [sessionFills])
  const heldMinutes = sessionFills.reduce((sum, fill) => sum + (fill.closed ? toMinutes(fill.closed) - toMinutes(fill.time) : 0), 0)
  const extras = [
    { label: 'Expectancy', value: money(day.net / sessionFills.length, { privacy }), tone: toneOf(day.net), caption: 'Average net result per trade',
      viz: <span className="trade-seq" title={`${ordered.filter((fill) => fill.pnl > 0).length} winners · ${ordered.filter((fill) => fill.pnl < 0).length} losers, in order`}>{ordered.map((fill) => <i key={fill.id} className={toneOf(fill.pnl)}/>)}</span> },
    { label: 'Average grade', value: gradeLetter,
      caption: `${sessionFills.filter((fill) => ['A+', 'A', 'B'].includes(fill.grade)).length} of ${sessionFills.length} trades B or better`,
      viz: <span className="grade-bar" title={['A+', 'A', 'B', 'C', 'D'].map((grade) => `${grade}: ${sessionFills.filter((fill) => fill.grade === grade).length}`).join(' · ')}>
        {['A+', 'A', 'B', 'C', 'D'].map((grade) => {
          const count = sessionFills.filter((fill) => fill.grade === grade).length
          return count ? <i key={grade} className={`g-${grade === 'A+' ? 'ap' : grade.toLowerCase()}`} style={{ flex: count }}/> : null
        })}
      </span> },
    { label: 'Reward : risk', value: breakdown.avgWinner != null && breakdown.avgLoser ? `${(breakdown.avgWinner / Math.abs(breakdown.avgLoser)).toFixed(2)}R` : '—',
      caption: `Avg win ${money(breakdown.avgWinner ?? 0, { privacy, decimals: 0 })} · loss ${money(breakdown.avgLoser ?? 0, { privacy, decimals: 0 })}`,
      viz: <span className="rr-bar" aria-hidden="true">
        <i className="pos" style={{ flex: breakdown.avgWinner ?? 0 }}/>
        <i className="neg" style={{ flex: Math.abs(breakdown.avgLoser ?? 0) }}/>
      </span> },
    { label: 'Active window', value: `${Math.floor(activeMinutes / 60)}h ${activeMinutes % 60}m`, caption: `${firstEntry} → ${lastExit} ET`,
      viz: <span className="window-track" aria-hidden="true">
        <i className="window-span" style={{ left: `${timelineAt(toMinutes(firstEntry))}%`, width: `${timelineAt(toMinutes(lastExit)) - timelineAt(toMinutes(firstEntry))}%` }}/>
        {ordered.map((fill) => <i key={fill.id} className={`window-tick ${toneOf(fill.pnl)}`} style={{ left: `${timelineAt(toMinutes(fill.time))}%` }}/>)}
      </span> },
  ]

  const checklistRules = [
    { label: 'Followed the written plan', group: 'Plan', hue: 222 },
    { label: 'Respected every stop', group: 'Risk', hue: 268 },
    { label: 'Sized within risk limits', group: 'Sizing', hue: 199 },
    { label: 'No revenge or FOMO trades', group: 'Mindset', hue: 288 },
    { label: 'Stopped at the planned time', group: 'Process', hue: 250 },
  ]
  const checklistItems = checklistRules.map((rule) => rule.label)
  const checklistKey = `journal-checklist-${date}`
  const [checked, setChecked] = useState(() => readChecks(date) || checklistItems.map(() => false))
  const [checklistOpen, setChecklistOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(true)
  const toggleCheck = (index) => setChecked((current) => {
    const next = current.map((value, position) => (position === index ? !value : value))
    try { localStorage.setItem(checklistKey, JSON.stringify(next)) } catch { /* storage unavailable */ }
    return next
  })
  const discipline = Math.round((checked.filter(Boolean).length / checklistItems.length) * 100)
  const scoreOf = (list) => (list ? Math.round((list.filter(Boolean).length / checklistItems.length) * 100) : null)
  const disciplineWeek = week.map((item) => ({ ...item, score: item.date === JOURNAL_DAY ? discipline : item.pnl == null ? null : scoreOf(readChecks(item.date)) }))
  const disciplineScored = disciplineWeek.filter((item) => item.score != null)
  const disciplineAverage = disciplineScored.length ? Math.round(disciplineScored.reduce((sum, item) => sum + item.score, 0) / disciplineScored.length) : null
  const disciplineTone = (score) => (score >= 80 ? 'pos' : score >= 60 ? 'mid' : 'neg')

  const holds = ordered.filter((fill) => fill.closed).map((fill) => toMinutes(fill.closed) - toMinutes(fill.time))
  const avgHold = holds.length ? Math.round(holds.reduce((sum, value) => sum + value, 0) / holds.length) : null
  const longFills = sessionFills.filter((fill) => fill.side === 'Long')
  const shortFills = sessionFills.filter((fill) => fill.side === 'Short')
  const giveBack = intraday.close - intraday.high
  const keptShare = intraday.high > 0 ? Math.max(0, Math.min(1, intraday.close / intraday.high)) : 1
  const topWin = breakdown.largestWin
  const topShare = day.won && topWin ? topWin.pnl / day.won : 0
  const holdLabel = (minutes) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`)

  const tiles = [
    { label: 'Peak to close', value: money(giveBack, { privacy, decimals: 0 }), tone: giveBack < 0 ? 'neg' : null,
      caption: `Ran to ${money(intraday.high, { privacy, decimals: 0 })} · kept ${percent(keptShare * 100, { decimals: 0 })}`,
      viz: <span className="tile-line" aria-hidden="true">
        <i className="pos" style={{ flex: Math.max(keptShare, 0.02) }}/>
        {keptShare < 0.995 && <i className="neg" style={{ flex: 1 - keptShare }}/>}
      </span> },
    { label: 'Long vs short', value: `${longFills.length}L · ${shortFills.length}S`,
      caption: `Long ${money(breakdown.long, { privacy, decimals: 0 })} · short ${money(breakdown.short, { privacy, decimals: 0 })}`,
      viz: <span className="tile-line" aria-hidden="true">
        <i className={toneOf(breakdown.long)} style={{ flex: Math.max(Math.abs(breakdown.long), 1) }}/>
        <i className={toneOf(breakdown.short)} style={{ flex: Math.max(Math.abs(breakdown.short), 1) }}/>
      </span> },
    { label: 'Avg hold', value: avgHold == null ? '—' : holdLabel(avgHold),
      caption: holds.length ? `Longest ${holdLabel(Math.max(...holds))} · ${plural(sessionFills.length, 'trade')}` : `${plural(sessionFills.length, 'trade')} this session`,
      viz: <span className="tile-line" aria-hidden="true">
        {ordered.map((fill, index) => <i
          key={fill.id} className={toneOf(fill.pnl)}
          style={{ flex: Math.max(1, holds[index] ?? 1) }}
        />)}
      </span> },
    { label: 'Top trade share', value: topWin ? percent(topShare * 100, { decimals: 0 }) : '—',
      caption: topWin ? `${topWin.symbol} ${money(topWin.pnl, { privacy, decimals: 0 })} of gross profit` : 'No winners this session',
      viz: <span className="tile-line" aria-hidden="true">
        <i className="pos" style={{ flex: Math.max(topShare, 0.04) }}/>
        <i className="idle" style={{ flex: Math.max(1 - topShare, 0.04) }}/>
      </span> },
  ]

  return <div className="page home journal">
    <header className="home-header">
      <div className="home-greeting">
        <span className="home-date">{easternLabel(date)}</span>
        <div className="greeting-plate">
        <h1>Daily journal</h1>
        <p className="journal-lede">{date === REVIEWED_DAY
          ? 'A strong session built on selectivity, not activity.'
          : `${day.net >= 0 ? 'Green' : 'Red'} session · ${plural(sessionFills.length, 'trade')} · ${breakdown.largestWin ? `best ${breakdown.largestWin.symbol} ${money(breakdown.largestWin.pnl, { privacy, decimals: 0 })}` : 'no winners'}`}</p>
        </div>
      </div>
      <div className="jr-bar">
      <div className="jr-week" role="list" aria-label="This week">
        {week.map((item) => <button
          type="button" role="listitem" key={item.date}
          className={`jr-day${item.date === JOURNAL_DAY ? ' current' : ''}${item.pnl == null ? ' idle' : ` ${toneOf(item.pnl)}`}`}
          title={item.pnl == null ? `${item.weekday} · no trades` : `${item.weekday} · ${plural(item.trades, 'trade')}`}
          disabled={item.pnl == null}
          aria-current={item.date === JOURNAL_DAY ? 'date' : undefined}
          onClick={() => setDate?.(item.date)}
        >
          <span>{item.weekday}</span>
          <b>{item.dayNumber}</b>
          <small>{item.pnl == null ? '—' : money(item.pnl, { privacy, decimals: 0 })}</small>
        </button>)}
        <div className="jr-week-total">
          <span>Week</span>
          <b className={`tone-${toneOf(weekNet)}`}>{money(weekNet, { privacy, decimals: 0 })}</b>
        </div>
      </div>
        <div className="jr-nav">
          <button type="button" aria-label="Previous trading day" title={previousDay ? easternLabel(previousDay) : 'No earlier sessions'} disabled={!previousDay} onClick={() => setDate?.(previousDay)}><ChevronLeft size={16} strokeWidth={2}/></button>
          <button type="button" aria-label="Next trading day" title={nextDay ? easternLabel(nextDay) : 'Latest session'} disabled={!nextDay} onClick={() => setDate?.(nextDay)}><ChevronRight size={16} strokeWidth={2}/></button>
        </div>
      </div>
    </header>

    <div className="journal-layout">
      <div className="journal-main">
        <div className="journal-kpis">
          {tiles.map((tile) => <div className="stat-tile" key={tile.label}>
            <span className="tile-label">{tile.label}</span>
            <strong className={`tile-number${tile.tone ? ` tone-${tile.tone}` : ''}`}>{tile.value}</strong>
            <small className="tile-caption">{tile.caption}</small>
            {tile.viz}
          </div>)}
        </div>

        <section className="home-card">
          <div className="session-timeline">
            <div className="st-head">
              <span className="card-title">Session timeline</span>
              <div className="st-tools">
                <span className="st-meta">{sessionFills.length} trades · {Math.floor(heldMinutes / 60)}h {heldMinutes % 60}m in market · US Eastern</span>
                <div className="ws-seg compact" role="tablist" aria-label="Timeline view">
                  {['Packed', 'By trade'].map((option) => <button
                    key={option} type="button" role="tab" aria-selected={timelineView === option}
                    className={timelineView === option ? 'active' : ''} onClick={() => setTimelineView(option)}
                  >{option}</button>)}
                </div>
              </div>
            </div>
            {timelineView === 'Packed' && <div className="stl stl-packed" role="list">
              {packedRows.map((row, rowIndex) => <div className="stl-row full" key={rowIndex}>
                <span className="stl-lane">
                  <i className="stl-lunch" style={{ left: `${timelineAt(12 * 60)}%`, width: `${timelineAt(13 * 60 + 30) - timelineAt(12 * 60)}%` }}/>
                  {[10, 11, 12, 13, 14, 15].map((hour) => <i key={hour} className="stl-hour" style={{ left: `${timelineAt(hour * 60)}%` }}/>)}
                  {row.map((fill) => {
                    const start = timelineAt(toMinutes(fill.time))
                    const end = timelineAt(toMinutes(fill.closed ?? fill.time))
                    const held = toMinutes(fill.closed ?? fill.time) - toMinutes(fill.time)
                    return <span
                      key={fill.id} role="listitem" className="stp-item"
                      style={{ left: `${start}%`, width: `${Math.max(0.6, end - start)}%` }}
                      title={`${fill.symbol} ${fill.side} · ${fill.time} → ${fill.closed} ET · ${held}m · ${fill.setup}`}
                    >
                      <span className="stp-label">{fill.symbol} <b className={`tone-${toneOf(fill.pnl)}`}>{money(fill.pnl, { privacy, decimals: 0 })}</b></span>
                      <i className={`stl-bar ${toneOf(fill.pnl)}`}/>
                    </span>
                  })}
                </span>
              </div>)}
              <div className="stl-row full stl-axis" aria-hidden="true">
                <span className="stl-lane">
                  {['10:00', '11:00', '12:00', '13:00', '14:00', '15:00'].map((label, index) =>
                    <em key={label} className={index % 2 ? 'minor' : undefined} style={{ left: `${timelineAt(toMinutes(label))}%` }}>{label}</em>)}
                </span>
              </div>
            </div>}
            {timelineView === 'By trade' && <div className="stl" role="list">
              {ordered.map((fill) => {
                const start = timelineAt(toMinutes(fill.time))
                const end = timelineAt(toMinutes(fill.closed ?? fill.time))
                const held = toMinutes(fill.closed ?? fill.time) - toMinutes(fill.time)
                return <div className="stl-row" role="listitem" key={fill.id}>
                  <span className="stl-name"><b>{fill.symbol}</b><i className={`side-mark ${fill.side.toLowerCase()}`} title={fill.side} aria-label={fill.side}>{fill.side[0]}</i></span>
                  <span className="stl-lane">
                    <i className="stl-lunch" style={{ left: `${timelineAt(12 * 60)}%`, width: `${timelineAt(13 * 60 + 30) - timelineAt(12 * 60)}%` }}/>
                    {[10, 11, 12, 13, 14, 15].map((hour) => <i key={hour} className="stl-hour" style={{ left: `${timelineAt(hour * 60)}%` }}/>)}
                    <span
                      className={`stl-bar ${toneOf(fill.pnl)}`}
                      style={{ left: `${start}%`, width: `${Math.max(0.6, end - start)}%` }}
                      title={`${fill.symbol} ${fill.side} · ${fill.time} → ${fill.closed} ET · ${held}m · ${fill.setup}`}
                    />
                    <span className="stl-when" style={end > 72 ? { right: `${100 - start}%`, paddingRight: 8 } : { left: `${end}%`, paddingLeft: 8 }}>{fill.time}–{fill.closed} · {held}m</span>
                  </span>
                  <span className={`stl-pnl tone-${toneOf(fill.pnl)}`}>{money(fill.pnl, { privacy, decimals: 0 })}</span>
                </div>
              })}
              <div className="stl-row stl-axis" aria-hidden="true">
                <span/>
                <span className="stl-lane">
                  {['10:00', '11:00', '12:00', '13:00', '14:00', '15:00'].map((label, index) =>
                    <em key={label} className={index % 2 ? 'minor' : undefined} style={{ left: `${timelineAt(toMinutes(label))}%` }}>{label}</em>)}
                </span>
                <span/>
              </div>
            </div>}
          </div>
        </section>

        <div className="versus-row">
          {extras.map((item) => <section className="compare-card" key={item.label}>
            <div className="compare-head"><span className="compare-label">{item.label}</span></div>
            <div className="compare-value">
              <strong className={item.tone ? `tone-${item.tone}` : undefined}>{item.value}</strong>
            </div>
            <div className="compare-foot">
              <small className="compare-caption">{item.caption}</small>
              {item.viz && <span className="extra-viz">{item.viz}</span>}
            </div>
          </section>)}
        </div>

        <section className="home-card">
          <div className="card-collapse-head">
            <button type="button" className="card-collapse" aria-expanded={tradesOpen} onClick={() => setTradesOpen(!tradesOpen)}>
              <span className="card-title">Trades <span className="card-count">{visibleFills.length}</span></span>
              <span className="cc-caret-box"><ChevronDown size={14} strokeWidth={2.2} className="cc-caret"/></span>
            </button>
            <div className="ws-seg compact" role="tablist" aria-label="Filter session trades">
              {['All', 'Wins', 'Losses'].map((option) => <button
                key={option} type="button" role="tab" aria-selected={tradeFilter === option}
                className={tradeFilter === option ? 'active' : ''}
                onClick={() => { setTradeFilter(option); setTradesOpen(true); setTableEnd(false) }}
              >{option}</button>)}
            </div>
          </div>
          <div className={`card-fold${tradesOpen ? ' open' : ''}`}><div className="card-fold-inner">
          <div ref={(el) => { if (el && !tableEnd && el.scrollHeight <= el.clientHeight + 2) setTableEnd(true) }} className={`journal-table-wrap${tableEnd ? ' at-end' : ''}`} onScroll={(event) => {
            const el = event.currentTarget
            setTableEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 2)
          }}>
            <table className="feed-table journal-table">
              <thead><tr><th>Time</th><th>Symbol</th><th>Side</th><th>Setup</th><th>Qty · Entry → Exit</th><th>Grade</th><th>Net P&L</th></tr></thead>
              <tbody>
                {visibleFills.map((fill) => {
                  const held = fill.closed ? toMinutes(fill.closed) - toMinutes(fill.time) : null
                  return <tr key={fill.id} className={`jt-row ${toneOf(fill.pnl)}`}>
                    <td className="jt-time">
                      <span>{fill.time}</span>
                      {held != null && <small>{held >= 60 ? `${Math.floor(held / 60)}h ${held % 60}m` : `${held}m`}</small>}
                    </td>
                    <td className="jt-symbol">
                      <span className="jt-sym">
                        <span className={`jt-token c-${symbolClassSlug(fill.symbol)}`} aria-hidden="true">{fill.symbol.slice(0, 2)}</span>
                        <b>{fill.symbol}</b>
                      </span>
                    </td>
                    <td><span className={`jt-side ${fill.side.toLowerCase()}`}>{fill.side}</span></td>
                    <td><span className="jt-setup">{fill.setup}</span></td>
                    <td className="jt-route">
                      <span className="jt-qty">{fill.qty}</span>
                      <span className="jt-prices">{fill.entry.toFixed(2)}<i className={toneOf(fill.pnl)} aria-hidden="true"/>{fill.exit.toFixed(2)}</span>
                    </td>
                    <td><span className={`grade-chip g-${fill.grade === 'A+' ? 'ap' : fill.grade.toLowerCase()}`}>{fill.grade}</span></td>
                    <td className={`jt-pnl tone-${toneOf(fill.pnl)}`}>
                      <span className="pnl-cell">
                        <span className="pnl-bar" aria-hidden="true"><i className={toneOf(fill.pnl)} style={{ width: `${(Math.abs(fill.pnl) / pnlPeak) * 100}%` }}/></span>
                        {money(fill.pnl, { privacy })}
                      </span>
                    </td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
          </div></div>

          <div className="intraday-head">
            <div className="card-title">Intraday Net Cumulative P&L</div>
            <dl className="intraday-stats">
              <div><dt>High</dt><dd className={`tone-${toneOf(intraday.high)}`}>{money(intraday.high, { privacy, decimals: 0 })}</dd></div>
              <div><dt>Low</dt><dd className={`tone-${toneOf(intraday.low)}`}>{money(intraday.low, { privacy, decimals: 0 })}</dd></div>
              <div><dt>Close</dt><dd className={`tone-${toneOf(intraday.close)}`}>{money(intraday.close, { privacy, decimals: 0 })}</dd></div>
            </dl>
          </div>
          <IntradayChart fills={sessionFills} height={250} privacy={privacy}/>
        </section>
      </div>

      <aside className="journal-side">
      <section className="home-card journal-note">
        <div className="note-head">
          <button type="button" className="card-collapse note-collapse" aria-expanded={noteOpen} onClick={() => setNoteOpen(!noteOpen)}>
            <span className="card-title">Session note</span>
            <span className="cc-caret-box"><ChevronDown size={14} strokeWidth={2.2} className="cc-caret"/></span>
          </button>
          <div className="note-tools">
            <button className="note-button" aria-pressed={editing} onClick={() => { setNoteOpen(true); if (editing) saveNote(); setEditing(!editing) }}>
              {editing ? <Check size={14}/> : <Pencil size={14}/>} {editing ? 'Done' : 'Edit'}
            </button>
          </div>
        </div>
        <div className={`card-fold${noteOpen ? ' open' : ''}`}><div className="card-fold-inner">
        {editing && <div className="note-toolbar" role="toolbar" aria-label="Formatting">
          <button type="button" className={formats.bold ? 'on' : ''} aria-pressed={formats.bold} aria-label="Bold" title="Bold" onMouseDown={(event) => event.preventDefault()} onClick={() => runFormat('bold')}><Bold size={14} strokeWidth={2.4}/></button>
          <button type="button" className={formats.italic ? 'on' : ''} aria-pressed={formats.italic} aria-label="Italic" title="Italic" onMouseDown={(event) => event.preventDefault()} onClick={() => runFormat('italic')}><Italic size={14} strokeWidth={2.2}/></button>
          <button type="button" className={formats.list ? 'on' : ''} aria-pressed={formats.list} aria-label="Bullet list" title="Bullet list" onMouseDown={(event) => event.preventDefault()} onClick={() => runFormat('insertUnorderedList')}><List size={15} strokeWidth={2.2}/></button>
          <span className="nt-divider" aria-hidden="true"/>
          <button type="button" aria-label="Smaller text" title="Smaller text" disabled={noteScale <= -3} onMouseDown={(event) => event.preventDefault()} onClick={() => changeScale(-1)}><AArrowDown size={15} strokeWidth={2}/></button>
          <span className="nt-scale" aria-live="polite">{noteScale > 0 ? `+${noteScale}` : noteScale}</span>
          <button type="button" aria-label="Larger text" title="Larger text" disabled={noteScale >= 3} onMouseDown={(event) => event.preventDefault()} onClick={() => changeScale(1)}><AArrowUp size={15} strokeWidth={2}/></button>
        </div>}
        <article
          ref={noteRef}
          className={editing ? 'is-editing' : undefined}
          style={{ '--note-scale': noteScale }}
          contentEditable={editing}
          suppressContentEditableWarning
          spellCheck={editing}
          aria-label="Session note"
          onInput={saveNote}
          dangerouslySetInnerHTML={{ __html: noteHtml }}
        />
        <div className="note-foot">
          <span className="save-state"><Check size={13} strokeWidth={2.2}/> {savedAt ? `Saved ${savedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'Saved just now'}</span>
          <div className="note-tools">
            <button type="button" className="note-button" onClick={copyNote}><Copy size={14}/> Copy</button>
            <button type="button" className="note-button" onClick={downloadNote}><Download size={14}/> Download</button>
          </div>
        </div>
        {attachments.length > 0 && <div className="note-shots">
          {attachments.map((item) => <figure key={item.id}>
            <button type="button" className="shot-open" onClick={() => setPreview(item)} aria-label={`Open ${item.name}`}><img src={item.src} alt=""/></button>
            <button type="button" className="shot-remove" aria-label={`Remove ${item.name}`} onClick={() => removeAttachment(item.id)}><X size={12}/></button>
          </figure>)}
        </div>}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(event) => { addFiles(event.target.files); event.target.value = '' }}/>
        <button
          type="button" className="note-attach"
          onClick={() => fileRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files) }}
        ><Plus size={15}/> Attach screenshots <small>Click or drop images</small></button>
        </div></div>
        {toast && <span className="note-toast" role="status">{toast}</span>}
        {preview && <div className="shot-preview" onClick={() => setPreview(null)} role="dialog" aria-label={preview.name}>
          <img src={preview.src} alt={preview.name}/>
        </div>}
      </section>

      <section className="home-card day-breakdown">
        <div className="card-title">Day breakdown</div>
        <dl className="breakdown-list">
          <div><dt>Largest win</dt><dd className="tone-pos">{breakdown.largestWin ? money(breakdown.largestWin.pnl, { privacy }) : '—'}<small>{breakdown.largestWin?.symbol}</small></dd></div>
          <div><dt>Largest loss</dt><dd className="tone-neg">{breakdown.largestLoss ? money(breakdown.largestLoss.pnl, { privacy }) : '—'}<small>{breakdown.largestLoss?.symbol}</small></dd></div>
          <div><dt>Average winner</dt><dd className="tone-pos">{money(breakdown.avgWinner, { privacy })}</dd></div>
          <div><dt>Average loser</dt><dd className="tone-neg">{money(breakdown.avgLoser, { privacy })}</dd></div>
        </dl>
        <div className="side-split">
          <div className="side-split-head"><span>Long <b className={`tone-${toneOf(breakdown.long)}`}>{money(breakdown.long, { privacy, decimals: 0 })}</b></span><span>Short <b className={`tone-${toneOf(breakdown.short)}`}>{money(breakdown.short, { privacy, decimals: 0 })}</b></span></div>
          <div className="side-split-bar">
            <i className={toneOf(breakdown.long)} style={{ flex: Math.abs(breakdown.long) || 1 }}/>
            <i className={toneOf(breakdown.short)} style={{ flex: Math.abs(breakdown.short) || 1 }}/>
          </div>
        </div>
      </section>

      <section className="home-card checklist-card">
        <button type="button" className="checklist-head as-toggle" aria-expanded={checklistOpen} onClick={() => setChecklistOpen(!checklistOpen)}>
          <div>
            <div className="card-title">Execution checklist <ChevronDown size={14} strokeWidth={2.2} className="cc-caret"/></div>
            <span className="checklist-sub">{checked.filter(Boolean).length} of {checklistRules.length} rules kept</span>
          </div>
          <span className={`discipline-ring ${disciplineTone(discipline)}`} style={{ '--share': discipline }} role="img" aria-label={`${discipline}% discipline`}>
            <b>{discipline}<small>%</small></b>
          </span>
        </button>
        <div className={`card-fold${checklistOpen ? ' open' : ''}`}><div className="card-fold-inner">
        <ul className="checklist">
          {checklistRules.map((rule, index) => <li key={rule.label} className={checked[index] ? 'kept' : 'missed'} style={{ '--hue': rule.hue }}>
            <label>
              <input type="checkbox" checked={!!checked[index]} onChange={() => toggleCheck(index)}/>
              <span className="check-box" aria-hidden="true"><Check size={12} strokeWidth={3}/></span>
              <span className="check-label">{rule.label}</span>
              <span className="check-tag">{checked[index] ? rule.group : 'Missed'}</span>
            </label>
          </li>)}
        </ul>
        </div></div>
        <div className="checklist-foot">
          <div className="cw-head">
            <span>This week</span>
            {disciplineAverage != null && <span>Avg <b className={`tone-${disciplineTone(disciplineAverage) === 'pos' ? 'pos' : disciplineTone(disciplineAverage) === 'neg' ? 'neg' : 'mid'}`}>{disciplineAverage}%</b></span>}
          </div>
          <div className="cw-bars" aria-hidden="true">
            {disciplineWeek.map((item) => <div key={item.date} className={`cw-day${item.date === JOURNAL_DAY ? ' current' : ''}`} title={item.score == null ? item.weekday : `${item.weekday} · ${item.score}%`}>
              <span className="cw-track"><i className={item.score == null ? '' : disciplineTone(item.score)} style={{ height: `${item.score ?? 0}%` }}/></span>
              <small>{item.weekday.slice(0, 1)}</small>
            </div>)}
          </div>
        </div>
      </section>
      </aside>
    </div>
  </div>
}
