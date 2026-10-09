import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AArrowDown, AArrowUp, Copy, X, ArrowDownRight, Bold, Italic, List, ArrowUpRight, Bot, Settings2, Trash2, Check, ChevronLeft, ChevronRight, Download, FileImage, Info, Rocket, Scaling, Sigma, TrendingDown,
  GripVertical, Image as ImageIcon, Maximize2, MoreHorizontal, MoveRight, Pencil, Plus, Scale, Search, Send, SlidersHorizontal, Sparkles, Star, Target, TrendingUp, Wallet,
} from 'lucide-react'
import SettingsSolidIcon from '@iconify-react/basil/settings-solid'
import { Card, Metric, PageHeading, Pill } from './components'
import { BarsStaggeredIcon, ChartPieSliceIcon, PercentIcon, TargetArrowIcon } from './icons'
import { LineChart, BarChart } from './charts'
import {
  BulletBars, ChartState, ColumnPlot, SymbolToken, CumulativeChart, CumeChips, CumeKey, cumeSummary, DailyColumns, EquityPlot, HeatCalendar, Module, IntradayChart, RollingPlot, RowPlot, ScoreMeter, ScoreRadial, ScoreRings, DailyPulse, MiniBars, MiniLine, MiniRing, easternLabel, scoreBand, useEasternToday, useMarketSession, SessionLine, WinDonut, WinLines, WinPairBars, compactMoney, money, percent, ratio, shortDate, toneOf, titleCase,
} from './viz'
import {
  bySetup, byHour, byWeekday, calendarGrid, consistencyScore, edgeScore,
  equitySeries, rollingWinRate, summarize, winBuckets, winWindow,
} from './analytics'
import { accounts, activity, avgLine, calendarDays, dayEntries, trades, tradeLog, tradingDays, trendLine } from './data'
import { symbolClassSlug } from './symbols'
import { FirmLogo, TradeDrawer, firmOf } from './workspace'
import { AreaLine, Spark } from './port/tile-viz'
import { DayHeat, FactorColumns, ThresholdArea, WeekBars, WinMosaic } from './port/tile-charts'
import { NewsStrip } from './port/news-strip'
import { EarnersHeat } from './port/earners-heat'
import { Drawer, DrawerHeader } from './dialogs'
import { accountForTrade } from './port/trading-data'
import { DaySheet, TodayJournalButton } from './port/calendar-day'
import { MonthSummary } from './port/calendar-routine'

function SectionTitle({ title, subtitle, action }) {
  return <div className="section-title"><div><h2>{titleCase(title)}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

const RANGES = [
  { key: '7D', days: 7 }, { key: '30D', days: 30 }, { key: '90D', days: 90 },
  { key: 'YTD', days: null }, { key: 'All', days: null },
]

const WIN_PERIODS = ['Year', 'Month', 'Week', 'Day']

const WIN_TITLES = { donut: 'Win rate', bars: 'Wins vs losses', lines: 'Win-rate trend' }
const SHOW_WIN_ROW = false
const SHOW_DAILY_ROW = false

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

  return <section className="win-card shell chart-shell">
    <div className="shell-head compare-head">
      <span className="compare-label">{titleCase(WIN_TITLES[variant] ?? 'Win rate')}</span>
      <div className="ws-seg compact" role="tablist" aria-label="Win ratio period">
        {WIN_PERIODS.map((item) => <button
          key={item} type="button" role="tab" aria-selected={period === item}
          className={period === item ? 'active' : ''} onClick={() => setPeriod(item)}
        >{item}</button>)}
      </div>
    </div>
    <div className="shell-body">
    <div className="win-body">{body}</div>
    {variant === 'donut' && <p className="win-note">
      {change == null
        ? `No trades in the prior ${unit} to compare against`
        : <>Your win % is {Math.round(change) === 0 ? 'unchanged' : <>{change > 0 ? 'higher' : 'lower'} by <b className={change > 0 ? 'tone-pos' : 'tone-neg'}>{Math.abs(change).toFixed(0)}%</b></>} compared to
          {' '}<b className="tone-pos">{prior.wins} winning</b> / <b className="tone-neg">{prior.losses} losing</b> past {unit}</>}
    </p>}
    </div>
  </section>
}

const SCORE_TIPS = {
  'Win%': 'Tighten entry criteria — skip setups that miss a checklist rule.',
  'Profit factor': 'Cut losing trades sooner so gross losses shrink.',
  'Avg win/loss': 'Let winners run to target instead of taking early profits.',
  'Max drawdown': 'Size down after two consecutive losses to cap drawdown.',
  'Recovery': 'Protect gains after new highs — reduce size into the peak.',
  'Consistency': 'Spread profit across more days instead of one big session.',
}

/** Parts of the score the card doesn't show; the headline score still counts them. */
const HIDDEN_SCORE_AXES = ['Profit factor', 'Recovery']

function OverallScoreCard({ edge, priorEdge, axes, enough, monthly = [], switcher = null }) {
  const [view, setView] = useState('Rings')
  const rows = edge.components.map((component, index) => ({
    label: axes[index],
    value: component.value ?? 0,
    display: component.display,
    target: component.target,
    prior: priorEdge?.components[index]?.value ?? null,
  })).filter((row) => !HIDDEN_SCORE_AXES.includes(row.label))
  // each month's value for the parts on show, in the same order as the rows
  const shownIndex = axes.map((label, index) => (HIDDEN_SCORE_AXES.includes(label) ? null : index)).filter((index) => index != null)
  const radialHistory = monthly.map((month) => ({ key: month.key, label: month.label, values: shownIndex.map((index) => month.components[index]?.value ?? null) }))
  const ranked = [...rows].sort((a, b) => b.value - a.value)
  const strongest = ranked[0]
  const focus = ranked[ranked.length - 1]
  const delta = priorEdge?.score != null && edge.score != null ? edge.score - priorEdge.score : null

  return <section className="home-card radar-card dc-duo">
    <div className="score-card-head">
      <div className="card-title">{switcher ? 'Score' : 'Overall Score'}</div>
      {enough && <div className="ws-seg compact" role="tablist" aria-label="Score view">
        {['Rings', 'Breakdown'].map((option) => <button
          key={option} type="button" role="tab" aria-selected={view === option}
          className={view === option ? 'active' : ''} onClick={() => setView(option)}
        >{option}</button>)}
      </div>}
    </div>
    <div className="radar-main">

    {!enough
      ? <ChartState state="insufficient" minData={5}/>
      : <div className={`score-body view-${view.toLowerCase()}`}>
        {monthly.length > 1
          ? <ScoreRadial items={rows} history={radialHistory} title={edge.score ?? "—"} subtitle="Trading score" size={200}/>
          : <ScoreRings items={rows} title={edge.score ?? '—'} subtitle="Trading score"/>}
        {view === 'Breakdown' && <ul className="score-breakdown">
            {rows.map((row) => {
              const change = row.prior == null ? null : Math.round(row.value - row.prior)
              return <li key={row.label}>
                <div className="sb-top">
                  <span>{row.label}</span>
                  <span className="sb-num">
                    {change != null && change !== 0 && <em className={change > 0 ? 'up' : 'down'}>{change > 0 ? '+' : '−'}{Math.abs(change)}</em>}
                    <b>{Math.round(row.value)}</b>
                  </span>
                </div>
                <div className="sb-track">
                  <i className="sb-fill" style={{ width: `${row.value}%` }}/>
                  {row.prior != null && <i className="sb-prior" style={{ left: `${row.prior}%` }}/>}
                </div>
              </li>
            })}
          </ul>}</div>}
    </div>

    {/* with a switcher the meter rides in the footer row beside it */}
    {!switcher && enough && <footer className="score-foot sf-meter sf-tidy">
      <ScoreMeter value={edge.score ?? 0}/>
      <div className="sf-bottom">
        <p className="sf-caption">{delta != null ? 'vs first half' : 'Trading score · all-time'}</p>
        {delta != null
          ? <span className={`sf-shift ${delta >= 0 ? 'pos' : 'neg'}`}>
              {delta >= 0 ? <ArrowUpRight size={12} strokeWidth={2.4}/> : <ArrowDownRight size={12} strokeWidth={2.4}/>}
              {Math.abs(Math.round(delta))} pts
            </span>
          : edge.score != null && <span className="score-band">{scoreBand(edge.score)}</span>}
      </div>
    </footer>}
    {switcher && <div className="dc-panel-foot">{switcher}{enough && <div className="sf-inline sf-tidy" title={delta != null ? 'vs first half' : 'Trading score · all-time'}>
      <ScoreMeter value={edge.score ?? 0}/>
      {delta != null
        ? <span className={`sf-shift ${delta >= 0 ? 'pos' : 'neg'}`} aria-label={`${delta >= 0 ? 'Up' : 'Down'} ${Math.abs(Math.round(delta))} points vs first half`}>
            {delta >= 0 ? <ArrowUpRight size={12} strokeWidth={2.4}/> : <ArrowDownRight size={12} strokeWidth={2.4}/>}
            {Math.abs(Math.round(delta))} pts
          </span>
        : edge.score != null && <span className="score-band">{scoreBand(edge.score)}</span>}
    </div>}</div>}
  </section>
}

// Designs by RNSENCE Studio

/** Bottom-anchored trend for a comparison cell: fine line over a rising haze. */

/* ------------------------------------------------------------ this week */

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const shiftDay = (iso, days) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }

/** Monday to Sunday of the latest traded week (the week the Daily journal opens on): each day's win rate,
 *  trade count and P&L. The latest trading day carries the black chip, as the journal marks its selected day. */
function WeekStrip({ trades, privacy }) {
  const today = useEasternToday().iso
  const anchor = tradingDays().at(-1) ?? today
  const monday = shiftDay(anchor, -((new Date(`${anchor}T12:00:00Z`).getUTCDay() + 6) % 7))
  const days = DAY_NAMES.map((name, index) => {
    const date = shiftDay(monday, index)
    const list = trades.filter((trade) => trade.date === date)
    const wins = list.filter((trade) => trade.pnl > 0).length
    const net = list.reduce((sum, trade) => sum + trade.pnl, 0)
    return { name, date, count: list.length, rate: list.length ? Math.round((wins / list.length) * 100) : 0, net, state: date === anchor ? 'today' : date > today || (!list.length && date > anchor) ? 'future' : 'past' }
  })
  // read-only: the last journaled day keeps the picked look as a fixed marker
  return <section className="hw-week" aria-label="This week">
    {days.map((day) => <div key={day.date} aria-current={day.date === anchor ? 'date' : undefined}
      className={`hw-day duo is-static is-${day.state}${day.count ? ' has-trades' : ''}${day.date === anchor ? ' is-picked' : ''}`}
      title={day.state === 'today' ? 'Last journaled day' : undefined}>
      <div className="hw-day-top shell-head">
        <b>{day.name} {day.date.slice(8).replace(/^0/, '')}</b>
        <span className="hw-day-rate">{day.count ? `${day.rate}%` : '—'}</span>
      </div>
      <small className="shell-body">
        <span>{day.count ? `${day.count} ${day.count === 1 ? 'trade' : 'trades'}` : 'No trades'}</span>
        {day.count > 0 && <em className={`tone-${toneOf(day.net)}`}>{money(day.net, { privacy, decimals: 0 })}</em>}
      </small>
    </div>)}
  </section>
}

export function Dashboard({ privacy, setPage, range = 'All', openJournal, openTrades, openLog }) {
  const [feedEnd, setFeedEnd] = useState(false)
  const [feedTab, setFeedTab] = useState('Recent')
  const [panelView, setPanelView] = useState('Top earners')
  const [tileInfo, setTileInfo] = useState(() => new Set())
  const toggleTileInfo = (label) => setTileInfo((prev) => { const next = new Set(prev); next.has(label) ? next.delete(label) : next.add(label); return next })

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
  const cume = useMemo(() => cumeSummary(series), [series])
  const stats = useMemo(() => ({ ...summarize(scoped), consistency: consistencyScore(series) }), [scoped, series])
  const edge = useMemo(() => edgeScore(stats), [stats])

  const half = Math.floor(scoped.length / 2)
  const priorEdge = useMemo(() => {
    if (scoped.length < 20) return null
    const earlier = scoped.slice(0, half)
    const earlierSeries = equitySeries(earlier)
    return edgeScore({ ...summarize(earlier), consistency: consistencyScore(earlierSeries) })
  }, [scoped, half])


  const recent = useMemo(() => {
    if (feedTab === 'Best') return [...scoped].sort((a, b) => b.pnl - a.pnl).slice(0, 20)
    if (feedTab === 'Worst') return [...scoped].sort((a, b) => a.pnl - b.pnl).slice(0, 20)
    return [...scoped].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20)
  }, [scoped, feedTab])
  const easternToday = useEasternToday()
  const dateLine = easternToday.label
  const market = useMarketSession()
  const [pulseRange, setPulseRange] = useState('90D')
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
  const bestSession = series.length ? Math.max(...series.map((day) => day.pnl)) : 0
  const worstSession = series.length ? Math.min(...series.map((day) => day.pnl)) : 0
  const avgSession = stats.netPnl / Math.max(1, series.length)
  const breakeven = Math.max(0, stats.trades - stats.wins - stats.losses)
  const greenDays = series.filter((day) => day.pnl > 0).length
  // win rate over the 20 trades up to each trade, for the trade win% chart
  const rollingWin = useMemo(() => {
    const ordered = [...scoped].sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)))
    // zoomed to the latest 120 trades, so the line reads as a trend rather than every wiggle
    const points = ordered.map((trade, index) => { const window = ordered.slice(Math.max(0, index - 19), index + 1); return { date: trade.date, value: (window.filter((item) => item.pnl > 0).length / window.length) * 100 } }).slice(10).slice(-120)
    return { values: points.map((point) => point.value), dates: points.map((point) => point.date) }
  }, [scoped])
  // each session's net with its gross profit and gross loss, for the net P&L week bars
  const dayGross = useMemo(() => {
    const byDay = new Map()
    scoped.forEach((trade) => { const day = byDay.get(trade.date) ?? { date: trade.date, pnl: 0, won: 0, lost: 0 }; day.pnl += trade.pnl; if (trade.pnl > 0) day.won += trade.pnl; else day.lost += -trade.pnl; byDay.set(trade.date, day) })
    return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [scoped])
  // wins, losses and breakevens per calendar month, for the trade win% mosaic
  const monthWins = useMemo(() => {
    const byMonth = new Map()
    scoped.forEach((trade) => { const key = trade.date.slice(0, 7); const m = byMonth.get(key) ?? { key, trades: 0, wins: 0, losses: 0, even: 0 }; m.trades += 1; if (trade.pnl > 0) m.wins += 1; else if (trade.pnl < 0) m.losses += 1; else m.even += 1; byMonth.set(key, m) })
    return [...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key)).map((m) => ({ ...m, label: new Date(`${m.key}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) }))
  }, [scoped])
  // gross profit, gross loss and profit factor per calendar month, for the profit factor columns
  const monthFactor = useMemo(() => {
    const byMonth = new Map()
    scoped.forEach((trade) => { const key = trade.date.slice(0, 7); const m = byMonth.get(key) ?? { key, won: 0, lost: 0 }; if (trade.pnl > 0) m.won += trade.pnl; else m.lost += -trade.pnl; byMonth.set(key, m) })
    return [...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key)).map((m) => ({ ...m, factor: m.lost ? m.won / m.lost : m.won ? Infinity : null, label: new Date(`${m.key}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) }))
  }, [scoped])
  // profit factor over the last 20 sessions at each session (capped so a loss-free stretch doesn't flatten the line)
  const rollingFactor = useMemo(() => {
    const byDay = new Map()
    scoped.forEach((trade) => { const day = byDay.get(trade.date) ?? { won: 0, lost: 0 }; if (trade.pnl > 0) day.won += trade.pnl; else day.lost += -trade.pnl; byDay.set(trade.date, day) })
    const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
    const points = days.map(([date], index) => { const window = days.slice(Math.max(0, index - 19), index + 1); const won = window.reduce((sum, [, day]) => sum + day.won, 0), lost = window.reduce((sum, [, day]) => sum + day.lost, 0); return { date, value: lost ? Math.min(4, won / lost) : 4 } }).slice(9)
    return { values: points.map((point) => point.value), dates: points.map((point) => point.date) }
  }, [scoped])
  const redDays = series.filter((day) => day.pnl < 0).length
  const tiles = [
    {
      label: 'Net P&L', value: money(stats.netPnl, { privacy, decimals: 0 }), tone: toneOf(stats.netPnl),
      sub: plural(series.length, 'session'),
      chart: <WeekBars days={dayGross} format={(value) => money(value, { privacy, decimals: 0 })}/>,
      foot: [
        { label: 'Avg / session', value: money(avgSession, { privacy, decimals: 0 }), tone: toneOf(avgSession) },
        { label: 'Best session', value: money(bestSession, { privacy, decimals: 0 }), tone: 'pos' },
        { label: 'Worst session', value: money(worstSession, { privacy, decimals: 0 }), tone: 'neg' },
      ],
    },
    {
      label: 'Win rate', value: percent(stats.winRate, { decimals: 1 }),
      sub: `${stats.wins} of ${stats.trades} trades`,
      chart: <WinMosaic months={monthWins}/>,
      foot: [
        { label: 'Winning', value: `${stats.wins}`, tone: 'pos' },
        { label: 'Breakeven', value: `${breakeven}` },
        { label: 'Losing', value: `${stats.losses}`, tone: 'neg' },
      ],
    },
    {
      label: 'Day ratio', value: percent(stats.dayWinRate, { decimals: 1 }),
      sub: `${greenDays} of ${series.length} days`,
      chart: <DayHeat days={series} format={(value) => money(value, { privacy, decimals: 0 })}/>,
      foot: [
        { label: 'Green days', value: `${greenDays}`, tone: 'pos' },
        { label: 'Red days', value: `${redDays}`, tone: 'neg' },
      ],
    },
    {
      label: 'Profit factor', value: ratio(stats.profitFactor),
      sub: 'Profit per $1 lost',
      chart: <FactorColumns months={monthFactor} format={(value) => money(value, { privacy, decimals: 0 })}/>,
      foot: [
        { label: 'Gross profit', value: money(stats.grossProfit, { privacy, decimals: 0, sign: false }), tone: 'pos' },
        { label: 'Gross loss', value: money(stats.grossLoss, { privacy, decimals: 0, sign: false }), tone: 'neg' },
      ],
    },
  ]



  // top earners: best symbols by net P&L, with their average return per trade and running P&L
  const earners = useMemo(() => {
    const groups = new Map()
    ;[...scoped].sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date))).forEach((trade) => {
      if (!groups.has(trade.symbol)) groups.set(trade.symbol, [])
      groups.get(trade.symbol).push(trade)
    })
    return [...groups.entries()].map(([symbol, list]) => {
      const net = list.reduce((sum, trade) => sum + trade.pnl, 0)
      const avgReturn = list.reduce((sum, trade) => sum + trade.pnl / (trade.qty * trade.entry), 0) / list.length * 100
      const run = list.reduce((acc, trade) => [...acc, (acc.at(-1) ?? 0) + trade.pnl], [0])
      const recent = run.slice(-Math.min(run.length, 31))
      return { symbol, net, avgReturn, trades: list.length, run: run.slice(-60), tone: recent.at(-1) - recent[0] >= 0 ? 'pos' : 'neg' }
    }).sort((a, b) => b.net - a.net).slice(0, 6)
  }, [scoped])



  const scoreShift = priorEdge?.score != null && edge.score != null ? edge.score - priorEdge.score : null
  const radarAxes = ['Win%', 'Profit factor', 'Avg win/loss', 'Max drawdown', 'Recovery', 'Consistency']
  // the score's parts for each of the last six traded months, for the radial bars
  const monthlyEdge = useMemo(() => {
    const byMonth = new Map()
    scoped.forEach((trade) => { const key = trade.date.slice(0, 7); if (!byMonth.has(key)) byMonth.set(key, []); byMonth.get(key).push(trade) })
    return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6).filter(([, list]) => list.length >= 5).map(([key, list]) => ({
      key, label: new Date(`${key}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      components: edgeScore({ ...summarize(list), consistency: consistencyScore(equitySeries(list)) }).components,
    }))
  }, [scoped])

  const panelSwitch = <div className="ws-seg compact dc-panel-switch" role="tablist" aria-label="Panel">
    {['Top earners', 'Score'].map((option) => <button
      key={option} type="button" role="tab" aria-selected={panelView === option}
      className={panelView === option ? 'active' : ''} onClick={() => setPanelView(option)}
    >{option}</button>)}
  </div>

  return <div className="page home dc">
    <div className="home-welcome">
      <h1>Dashboard</h1>
    </div>

    <WeekStrip trades={tradeLog} privacy={privacy}/>

    <div className="home-top">
      <div className="compare-row">
        <section className="home-card feed-card shell chart-shell">
          <div className="shell-head">
            <span>Trades</span>
          </div>
          <div className="shell-body">
          {recent.length
            ? <div key={feedTab} ref={(el) => { if (el && !feedEnd && el.scrollHeight <= el.clientHeight + 2) setFeedEnd(true) }} className={`feed-scroll${feedEnd ? ' at-end' : ''}`} onScroll={(event) => {
                const el = event.currentTarget
                setFeedEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 2)
              }}>
              <table className="feed-table" aria-label={`${feedTab} trades: date, symbol and net P&L`}>
                <tbody>
                  {recent.map((trade) => <tr key={trade.id} onClick={() => openJournal(trade.date)}>
                    <td className="ft-date">{shortDate(trade.date)}</td>
                    <td className="ft-sym"><span><SymbolToken symbol={trade.symbol}/>{trade.symbol}</span></td>
                    <td className={`tone-${toneOf(trade.pnl)}`}>{money(trade.pnl, { privacy, decimals: 2 })}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            : <ChartState state="empty"/>}
          </div>
          <div className="dc-panel-foot">
            <div className="ws-seg compact dc-panel-switch" role="tablist" aria-label="Trade feed">
              {['Recent', 'Best', 'Worst'].map((tab) => <button
                key={tab} type="button" role="tab" aria-selected={feedTab === tab}
                className={feedTab === tab ? 'active' : ''} onClick={() => { setFeedTab(tab); setFeedEnd(false) }}
              >{tab}</button>)}
            </div>
          </div>
        </section>
      </div>
      <section className="home-card cume-card shell chart-shell">
        <div className="shell-head">
          <span>Daily Net Cumulative P&L</span>
          {cume && <CumeChips privacy={privacy} items={[
            { label: 'Net', value: cume.net, tone: toneOf(cume.net) },
            { label: 'Peak', value: cume.peak },
            { label: 'Max drawdown', value: cume.drawdown, tone: 'neg' },
            { label: `Rolling ${cume.span}`, value: cume.rolling, tone: toneOf(cume.rolling) },
          ]}/>}
        </div>
        <div className="shell-body">
          {dataState === 'ready'
            ? <><CumulativeChart series={series} height={320} fill privacy={privacy} side={false}/><CumeKey span={cume.span}/></>
            : <ChartState state={dataState}/>}
        </div>
      </section>
    </div>

    <div className="home-wide dc-wide home-top">
      <section className="score-panel">
        <div className="tile-grid">
          {tiles.map((tile) => <div className={`stat-tile dash-tile shell${tile.foot ? ' is-flip' : ''}${tileInfo.has(tile.label) ? ' info-on' : ''}`} key={tile.label}
            {...(tile.foot ? { role: 'button', tabIndex: 0, 'aria-pressed': tileInfo.has(tile.label), 'aria-label': `${tile.label}: ${tileInfo.has(tile.label) ? 'show chart' : 'show details'}`,
              onClick: () => toggleTileInfo(tile.label), onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleTileInfo(tile.label) } } } : {})}>
            <div className="shell-head"><span>{tile.label}</span></div>
            <div className="shell-body">
            <div className="tile-main">
              <span className="dc-fig">
                <strong className={tile.tone ? `tone-${tile.tone}` : undefined}>{tile.value}</strong>
                {tile.sub && <small>{tile.sub}</small>}
              </span>
              {tile.aside}
              {tile.visual && <span className="dc-viz">{tile.visual}</span>}
            </div>
            {tile.rows && <dl className="tile-rows ruled">
              {tile.rows.map((row) => <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
                <span className="tr-bar"><i className={row.tone} style={{ width: `${Math.max(2, Math.min(100, (row.share ?? 0) * 100))}%` }}/></span>
              </div>)}
            </dl>}
            {tile.foot && <dl className="tile-rows dc-inset" aria-hidden={!tileInfo.has(tile.label)}>
              {tile.foot.map((row) => <div key={row.label}><dt>{row.label}</dt><dd className={row.tone ? `tone-${row.tone}` : undefined}>{row.value}</dd></div>)}
            </dl>}
            {tile.chart && <div className="dc-bleed">{tile.chart}</div>}
            </div>
          </div>)}
        </div>
      </section>
      {/* Top earners and the overall score share one slot; the switch sits in both heads */}
      {panelView === 'Score'
        ? <OverallScoreCard edge={edge} priorEdge={priorEdge} axes={radarAxes} enough={scoped.length >= 5} monthly={monthlyEdge} switcher={panelSwitch}/>
        : <section className="compare-card shell te-shell">
          <div className="shell-head"><span>Top earners</span><em>{range === 'All' ? 'All time' : range}</em></div>
          <div className="shell-body te-heat"><EarnersHeat trades={scoped} privacy={privacy} openTrades={openTrades}/></div>
          <div className="dc-panel-foot">{panelSwitch}</div>
        </section>}
    </div>

    <NewsStrip/>

    {/* parked: Net Daily P&L is hidden until asked to "unhide net daily" */}
    {SHOW_DAILY_ROW && <div className="home-bottom">
      <div className="pulse-col">
        <section className="home-card shell chart-shell pulse-shell">
          <div className="shell-head">
            <span>Net Daily P&L</span>
            <div className="ws-seg compact" role="tablist" aria-label="Daily P&L window">
              {['7D', '30D', '90D'].map((option) => <button
                key={option} type="button" role="tab" aria-selected={pulseRange === option}
                className={pulseRange === option ? 'active' : ''} onClick={() => setPulseRange(option)}
              >{option}</button>)}
            </div>
          </div>
          <div className="shell-body">
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
              <dl className="pulse-stats dc-inset">
                <div><dt>Best day</dt><dd className={`tone-${toneOf(pulseBest)}`}>{money(pulseBest, { privacy, decimals: 0 })}</dd></div>
                <div><dt>Worst day</dt><dd className={`tone-${toneOf(pulseWorst)}`}>{money(pulseWorst, { privacy, decimals: 0 })}</dd></div>
                <div><dt>Avg green</dt><dd className="tone-pos">{pulseGreen.length ? money(pulseGreen.reduce((t, d) => t + d.pnl, 0) / pulseGreen.length, { privacy, decimals: 0 }) : '—'}</dd></div>
                <div><dt>Green days</dt><dd>{pulseGreen.length}<small>/{pulseDays.length}</small></dd></div>
              </dl>
            </>
          : <ChartState state={dataState}/>}
          </div>
        </section>

      </div>


    </div>}

    {/* parked: the three win-rate cards are hidden until asked to "unhide bottom 3" */}
    {SHOW_WIN_ROW && <div className="win-row">
      <WinRatioCard trades={scoped} variant="donut"/>
      <WinRatioCard trades={scoped} variant="bars"/>
      <WinRatioCard trades={scoped} variant="lines"/>
    </div>}
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
function RailDeck({ items, isMuted, onToggle, symbols = false }) {
  const [spread, setSpread] = useState(false)
  const listRef = useRef(null)
  const [step, setStep] = useState(24)
  // stacked: overlap tighter as the deck grows, and keep the last chip inside the card
  useEffect(() => {
    const list = listRef.current
    if (!list || spread) return undefined
    const fit = () => {
      const chips = [...list.querySelectorAll('.rail-chip')]
      if (chips.length < 2) return
      const room = list.clientWidth - chips[chips.length - 1].getBoundingClientRect().width
      setStep(Math.max(6, Math.min(symbols ? 18 : 28, room / (chips.length - 1))))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(list)
    return () => observer.disconnect()
  }, [items, spread])
  return <div className={`rail-deck${spread ? ' is-spread' : ''}`}>
    <ul
      ref={listRef}
      className="rail-list" style={{ '--rows': items.length, '--deck-step': `${step}px` }}
      onClickCapture={(event) => { if (!spread) { event.preventDefault(); event.stopPropagation(); setSpread(true) } }}
    >
      {items.map(([label, count], index) => {
        const on = !isMuted(label)
        return <li key={label} style={{ '--i': index, '--back': items.length - 1 - index }}>
          <button type="button" className={`rail-row${on ? '' : ' off'}`} aria-pressed={on} tabIndex={spread ? 0 : -1} onClick={() => onToggle(label)}>
            {symbols
              ? <span className="rail-chip rail-sym"><SymbolToken symbol={label}/><span>{label}</span></span>
              : <span className="rail-chip" style={{ '--hue': labelHue(label) }}>{label}</span>}
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
  // the board shows whole months; the week layout stays in place behind this constant
  const view = 'Month'
  const [filter, setFilter] = useState('All trades')
  const [query, setQuery] = useState('')
  const filters = ['All trades', 'Wins', 'Losses', 'Journaled']
  const [mutedSymbols, setMutedSymbols] = useState(() => new Set())
  const [mutedSetups, setMutedSetups] = useState(() => new Set())
  const [openFacet, setOpenFacet] = useState('symbols')
  const [openDay, setOpenDay] = useState(null)
  const [dayVersion, setDayVersion] = useState(0)
  const todayIso = `${easternToday.year}-${String(easternToday.month).padStart(2, '0')}-${String(easternToday.day).padStart(2, '0')}`
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
  const hasFilter = filter !== 'All trades' || query

  return <div className="page calendar-page">
    <header className="cal-header">
      <div className="home-greeting">
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
      <div className="mini-cal duo">
        <div className="mc-head shell-head">
          <button type="button" aria-label="Previous month" onClick={() => { setMonthOffset(monthOffset - 1); setWeekIndex(null) }}><ChevronLeft size={15}/></button>
          <strong>{month.longName}</strong>
          <button type="button" aria-label="Next month" onClick={() => { setMonthOffset(monthOffset + 1); setWeekIndex(null) }}><ChevronRight size={15}/></button>
        </div>
        <div className="shell-body">
        <div className="mc-week">{['S','M','T','W','T','F','S'].map((day, index) => <span key={index}>{day}</span>)}</div>
        <div className="mc-grid">
          {month.cells.map((cell, index) => {
            const traded = !cell.outside && cell.entries?.length
            const today = month.isEasternMonth && !cell.outside && cell.day === easternToday.day
            return <button
              type="button" key={`${cell.edge || 'in'}-${cell.day}-${index}`}
              className={`mc-day${cell.outside ? ' out' : ''}${traded ? ` ${toneOf(cell.pnl)}` : ''}${today ? ' today' : ''}`}
              disabled={!traded}

              onClick={traded ? () => openJournal(cell.iso) : undefined}
            >{cell.day}</button>
          })}
        </div>
      </div>
      </div>

      <div className="rail-facets duo">
        <div className="shell-head rail-facets-head">
        <div className="ws-seg compact rail-switch" role="tablist" aria-label="Filter by">
          {[['symbols', 'Symbols', symbolFacets.length], ['setups', 'Setups', setupFacets.length]].map(([key, label, count]) => <button
            key={key} type="button" role="tab" aria-selected={openFacet === key}
            className={openFacet === key ? 'active' : ''}
            onClick={() => setOpenFacet(openFacet === key ? null : key)}
          >{label}<em>{count}</em></button>)}
        </div>
        </div>

        <div className={`card-fold${openFacet ? ' open' : ''}`}><div className="card-fold-inner"><div className="shell-body">
        {openFacet === 'symbols' && <RailDeck
          key="symbols" items={symbolFacets} symbols
          isMuted={(value) => mutedSymbols.has(value)}
          onToggle={(value) => toggleIn(mutedSymbols, value, setMutedSymbols)}
        />}

        {openFacet === 'setups' && <RailDeck
          key="setups" items={setupFacets}
          isMuted={(value) => mutedSetups.has(value)}
          onToggle={(value) => toggleIn(mutedSetups, value, setMutedSetups)}
        />}
        </div></div></div>
      </div>

      {(mutedSymbols.size > 0 || mutedSetups.size > 0) && <button type="button" className="rail-reset" onClick={() => { setMutedSymbols(new Set()); setMutedSetups(new Set()) }}>Show everything</button>}
    </aside>

    <div className="cal-main">
    <section className="month-board duo">
      <div className="board-toolbar shell-head">
        <div className="board-title"><h2>{month.longName}</h2>{view === 'Week' && <p>Week {currentWeek + 1} of {weeks}</p>}</div>
        <div className="board-tools">
          <TodayJournalButton onClick={() => setOpenDay(todayIso)}/>
          <button className="board-primary" onClick={openLog}>Log trade</button>
        </div>
      </div>

      <div className="shell-body">
      <div className="month-weekdays">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <span key={d}>{d}</span>)}</div>
      <div className={`month-grid ${view === 'Week' ? 'week-view' : ''}`}>{visibleCells.map((cell, index) => {
        const entries = (cell.entries || []).filter(matches)
        const dayNet = entries.reduce((sum, entry) => sum + entry.pnl, 0)
        const today = month.isEasternMonth && !cell.outside && cell.day === easternToday.day
        const open = !cell.outside ? () => setOpenDay(cell.iso) : null
        return <div
          key={`${cell.edge || 'current'}-${cell.day}-${index}-${dayVersion}`}
          className={`day-cell${cell.outside ? ' outside' : ''}${open ? ' has-trades' : ''}${entries.length ? ` is-${toneOf(dayNet)}` : ''}`}
          onClick={open ?? undefined}
          role={open ? 'button' : undefined}
          tabIndex={open ? 0 : undefined}
          aria-label={open ? `Open ${cell.iso}` : undefined}
          onKeyDown={open ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open() } } : undefined}

        >
          <span className={`day-number${today ? ' today' : ''}`}>{cell.day}</span>
          {entries.length > 0 && (() => {
            const net = entries.reduce((sum, entry) => sum + entry.pnl, 0)
            const symbols = [...new Set(entries.map((entry) => entry.symbol))]
            return <div className="day-sum">
              <b className={`day-net tone-${toneOf(net)}`}>{money(net, { privacy, decimals: 0 })}</b>
              <div className="day-foot">
                <span className="day-tickers" aria-label={symbols.join(', ')}>
                  {symbols.slice(0, 3).map((symbol) => <SymbolToken key={symbol} symbol={symbol}/>)}
                  {symbols.length > 3 && <em>+{symbols.length - 3}</em>}
                </span>
                <small>{entries.length} trade{entries.length === 1 ? '' : 's'}</small>
              </div>
            </div>
          })()}
        </div>
      })}</div>

      <div className="month-summary">
        <span>{monthStats.sessions ? <>{plural(monthStats.sessions, 'trading day')} · <b className="ms-green">{monthStats.green}</b> green</> : 'No trades this month'}{hasFilter ? ' · filtered' : ''}</span>
        <strong>Month total <b className={monthStats.total >= 0 ? 'positive' : 'negative'}>{money(monthStats.total, privacy)}</b></strong>
      </div>
      </div>
    </section>

    <MonthSummary trades={filtered} privacy={privacy}/>

    </div>
    </div>
    {openDay && <DaySheet key={openDay} date={openDay} privacy={privacy} onClose={() => setOpenDay(null)} onSaved={() => setDayVersion((value) => value + 1)} openJournal={openJournal}/>}
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
  '<h2>Session Review</h2>',
  '<p>Stayed patient through the opening range and only took confirmed setups. The SPY short had the cleanest alignment with the broader market.</p>',
  '<h3>What Worked</h3>',
  '<ul><li>Waited for confirmation before entry.</li><li>Kept risk consistent across positions.</li><li>Stopped after the planned session window.</li></ul>',
  '<h3>Next Session</h3>',
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
const blankNote = (date) => `<h2>Session Review</h2><p>${new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })} — what did the market give you, and how did you trade it?</p><h3>What Worked</h3><ul><li>…</li></ul><h3>Next Session</h3><p>…</p>`

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

/** The session timeline always shows at least this many lanes, so quiet days keep the same height. */
const TIMELINE_MIN_ROWS = 3

// Designs by RNSENCE Studio
export function JournalPage({ privacy, date = REVIEWED_DAY, setDate, openLog }) {
  const sessionFills = useMemo(() => tradeLog.filter((trade) => trade.date === date).sort((a, b) => a.time.localeCompare(b.time)), [date])
  const days = tradingDays()
  if (!sessionFills.length) {
    return <div className="page home journal">
      <header className="home-header"><div><h1>Daily Journal</h1></div></header>
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
  const [drawerTradeId, setDrawerTradeId] = useState(null)
  const [tradeReviews] = useState(() => { try { return JSON.parse(localStorage.getItem('trade-reviews')) ?? {} } catch { return {} } })
  const archiveTrade = (id) => {
    try {
      const archived = JSON.parse(localStorage.getItem('cc-trade-archived')) ?? []
      localStorage.setItem('cc-trade-archived', JSON.stringify([...new Set([...archived, id])]))
    } catch { /* storage unavailable */ }
  }
  const visibleFills = useMemo(() => sessionFills.filter((fill) =>
    tradeFilter === 'Wins' ? fill.pnl > 0 : tradeFilter === 'Losses' ? fill.pnl < 0 : true), [sessionFills, tradeFilter])
  const [timelineView, setTimelineView] = useState('Packed')
  const [sessionView, setSessionView] = useState('Timeline')
  const NOTE_KEY = `journal-note-${date}`
  const noteRef = useRef(null)
  const [noteHtml, setNoteHtml] = useState(() => {
    const fallback = date === REVIEWED_DAY ? DEFAULT_NOTE_HTML : blankNote(date)
    let html = fallback
    try { html = localStorage.getItem(NOTE_KEY) || fallback } catch { /* storage unavailable */ }
    return html.replace(/<div class="note-tags"[^>]*>[\s\S]*?<\/div>/g, '')
  })
  const [noteDrawer, setNoteDrawer] = useState(false)
  const [openedHtml, setOpenedHtml] = useState('')
  const openNote = () => { setOpenedHtml(noteHtml); setNoteDrawer(true) }
  const notePreview = useMemo(() => {
    const doc = new DOMParser().parseFromString(noteHtml, 'text/html')
    const title = doc.querySelector('h2')?.textContent.trim() || 'Session review'
    const body = [...doc.querySelectorAll('p, li')].map((node) => node.textContent.trim()).filter(Boolean).join(' ')
    return { title, body }
  }, [noteHtml])
  const [noteScale, setNoteScale] = useState(() => {
    try { return Math.max(-3, Math.min(3, Number(localStorage.getItem(`${NOTE_KEY}-scale`)) || 0)) } catch { return 0 }
  })
  const [savedAt, setSavedAt] = useState(null)
  const [formats, setFormats] = useState({ bold: false, italic: false, list: false })
  const saveNote = () => {
    const html = noteRef.current?.innerHTML ?? ''
    try { localStorage.setItem(NOTE_KEY, html) } catch { /* storage unavailable */ }
    setNoteHtml(html)
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
      viz: <span className="trade-seq">{ordered.map((fill) => <i key={fill.id} className={toneOf(fill.pnl)}/>)}</span> },
    { label: 'Reward : risk', value: breakdown.avgWinner != null && breakdown.avgLoser ? `${(breakdown.avgWinner / Math.abs(breakdown.avgLoser)).toFixed(2)}R` : '—',
      caption: <>Avg win <span className="tone-pos">{money(breakdown.avgWinner ?? 0, { privacy, decimals: 0 })}</span> · loss <span className="tone-neg">{money(breakdown.avgLoser ?? 0, { privacy, decimals: 0 })}</span></>,
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
  // the two columns stack independently; the shorter of the versus row and the day breakdown stretches so the next cards start level
  const layoutRef = useRef(null)
  useLayoutEffect(() => {
    const layout = layoutRef.current
    if (!layout) return undefined
    const align = () => {
      const versus = layout.querySelector('.journal-main > .versus-row'), card = layout.querySelector('.journal-side > .day-breakdown')
      if (!versus || !card) return
      versus.style.minHeight = ''; card.style.minHeight = ''
      const main = layout.querySelector('.journal-main'), side = layout.querySelector('.journal-side')
      if (Math.round(main.getBoundingClientRect().left) === Math.round(side.getBoundingClientRect().left)) return
      const diff = versus.getBoundingClientRect().bottom - card.getBoundingClientRect().bottom
      if (Math.abs(diff) < 1 || Math.abs(diff) > 160) return
      const target = diff > 0 ? card : versus
      target.style.minHeight = `${target.getBoundingClientRect().height + Math.abs(diff)}px`
    }
    align()
    const observer = new ResizeObserver(align)
    observer.observe(layout)
    ;[...layout.querySelectorAll('.journal-main > :not(.versus-row), .journal-side > :not(.day-breakdown)')].forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  })
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

  const rulesKept = checked.filter(Boolean).length
  const versusAverage = day.net - baseline.net

  // Key insights: did the day pay, how often you were right, how wins paid for losses, and whether you followed the plan.
  const tiles = [
    { label: 'Net P&L', value: money(day.net, { privacy, decimals: 0 }), tone: toneOf(day.net),
      caption: <><span className={`tone-${toneOf(versusAverage)}`}>{money(versusAverage, { privacy, decimals: 0 })}</span> vs your average day</> },
    { label: 'Win rate', value: percent(day.winRate, { decimals: 0 }), tone: day.winRate >= 50 ? 'pos' : 'neg',
      caption: <><span className="tone-pos">{day.wins} won</span> · <span className="tone-neg">{day.losses} lost</span></> },
    { label: 'Profit factor', value: day.profitFactor == null ? 'No losses' : ratio(day.profitFactor), tone: day.profitFactor == null || day.profitFactor >= 1 ? 'pos' : 'neg',
      caption: <><span className="tone-pos">Won {money(day.won, { privacy, sign: false, decimals: 0 })}</span> · <span className="tone-neg">lost {money(day.lost, { privacy, sign: false, decimals: 0 })}</span></> },
    { label: 'Rules kept', value: `${discipline}%`, tone: disciplineTone(discipline) === 'mid' ? null : disciplineTone(discipline),
      caption: <><span className="tone-accent">{rulesKept}</span> of {checklistItems.length} checklist rules</> },
  ]

  return <div className="page home journal">
    <header className="home-header">
      <div className="home-greeting">
        <div className="greeting-plate">
        <h1>Daily Journal</h1>
        <p className="journal-lede">{[plural(sessionFills.length, 'trade'), `${money(day.net, { privacy, decimals: 0 })} net`, breakdown.largestWin ? `best ${breakdown.largestWin.symbol} ${money(breakdown.largestWin.pnl, { privacy, decimals: 0 })}` : 'no winners'].join(' · ')}</p>
        </div>
      </div>
    </header>

    <div className="journal-layout" ref={layoutRef}>
      <div className="journal-main">
        <div className="journal-kpis">
          {tiles.map((tile) => <div className="stat-tile" key={tile.label}>
            <div className="tile-top">
              <strong className={`tile-number${tile.tone ? ` tone-${tile.tone}` : ''}`}>{tile.value}</strong>
              <span className="tile-label">{tile.label}</span>
            </div>
            <small className="tile-caption">{tile.caption}</small>
            {tile.viz}
          </div>)}
        </div>

        <section className="home-card duo jr-duo session-card">
          <div className="shell-head">
            <span className="card-title">Session</span>
            {/* the timeline and the intraday curve share one card; the tools on the right follow the view */}
            <div className="st-tools">
              {sessionView === 'Timeline' ? <div className="ws-seg compact" role="tablist" aria-label="Timeline layout">
                {['Packed', 'By trade'].map((option) => <button
                  key={option} type="button" role="tab" aria-selected={timelineView === option}
                  className={timelineView === option ? 'active' : ''} onClick={() => setTimelineView(option)}
                >{option}</button>)}
              </div> : <dl className="intraday-stats">
                <div><dt>High</dt><dd className={`tone-${toneOf(intraday.high)}`}>{money(intraday.high, { privacy, decimals: 0 })}</dd></div>
                <div><dt>Low</dt><dd className={`tone-${toneOf(intraday.low)}`}>{money(intraday.low, { privacy, decimals: 0 })}</dd></div>
                <div><dt>Close</dt><dd className={`tone-${toneOf(intraday.close)}`}>{money(intraday.close, { privacy, decimals: 0 })}</dd></div>
              </dl>}
              <div className="ws-seg compact" role="tablist" aria-label="Session view">
                {['Timeline', 'Intraday'].map((option) => <button
                  key={option} type="button" role="tab" aria-selected={sessionView === option}
                  className={sessionView === option ? 'active' : ''} onClick={() => setSessionView(option)}
                >{option}</button>)}
              </div>
            </div>
          </div>
          <div className="shell-body">
          {sessionView === 'Intraday' ? <div className="session-intraday">
            <IntradayChart fills={sessionFills} height={210} privacy={privacy} onSelect={setDrawerTradeId}/>
          </div> : <div className="session-timeline">
            {timelineView === 'Packed' && <div className="stl stl-packed" role="list">
              {[...packedRows, ...Array.from({ length: Math.max(0, TIMELINE_MIN_ROWS - packedRows.length) }, () => [])].map((row, rowIndex) => <div className={`stl-row full${row.length ? '' : ' is-empty'}`} key={rowIndex} aria-hidden={row.length ? undefined : true}>
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
                  <span className="stl-name"><b>{fill.symbol}</b><i className={`side-mark ${fill.side.toLowerCase()}`} aria-label={fill.side}>{fill.side[0]}</i></span>
                  <span className="stl-lane">
                    <i className="stl-lunch" style={{ left: `${timelineAt(12 * 60)}%`, width: `${timelineAt(13 * 60 + 30) - timelineAt(12 * 60)}%` }}/>
                    {[10, 11, 12, 13, 14, 15].map((hour) => <i key={hour} className="stl-hour" style={{ left: `${timelineAt(hour * 60)}%` }}/>)}
                    <span
                      className={`stl-bar ${toneOf(fill.pnl)}`}
                      style={{ left: `${start}%`, width: `${Math.max(0.6, end - start)}%` }}

                    />
                    <span className="stl-when" style={end > 72 ? { right: `${100 - start}%`, paddingRight: 8 } : { left: `${end}%`, paddingLeft: 8 }}>{fill.time}–{fill.closed} · {held}m</span>
                  </span>
                  <span className={`stl-pnl tone-${toneOf(fill.pnl)}`}>{money(fill.pnl, { privacy, decimals: 0 })}</span>
                </div>
              })}
              {Array.from({ length: Math.max(0, TIMELINE_MIN_ROWS - ordered.length) }, (_, index) => <div className="stl-row is-empty" key={`pad-${index}`} aria-hidden="true">
                <span className="stl-name"/>
                <span className="stl-lane">
                  <i className="stl-lunch" style={{ left: `${timelineAt(12 * 60)}%`, width: `${timelineAt(13 * 60 + 30) - timelineAt(12 * 60)}%` }}/>
                  {[10, 11, 12, 13, 14, 15].map((hour) => <i key={hour} className="stl-hour" style={{ left: `${timelineAt(hour * 60)}%` }}/>)}
                </span>
                <span className="stl-pnl"/>
              </div>)}
              <div className="stl-row stl-axis" aria-hidden="true">
                <span/>
                <span className="stl-lane">
                  {['10:00', '11:00', '12:00', '13:00', '14:00', '15:00'].map((label, index) =>
                    <em key={label} className={index % 2 ? 'minor' : undefined} style={{ left: `${timelineAt(toMinutes(label))}%` }}>{label}</em>)}
                </span>
                <span/>
              </div>
            </div>}
            <p className="st-meta st-foot">{sessionFills.length} trades · {Math.floor(heldMinutes / 60)}h {heldMinutes % 60}m in market · US Eastern</p>
          </div>}
          </div>
        </section>

        {drawerTradeId && <TradeDrawer
          trades={visibleFills.some((fill) => fill.id === drawerTradeId) ? visibleFills : sessionFills} selectedId={drawerTradeId} reviews={tradeReviews} privacy={privacy}
          onSelect={setDrawerTradeId} onArchive={archiveTrade} onClose={() => setDrawerTradeId(null)}
        />}

        <div className="versus-row">
          {extras.map((item) => <section className="compare-card" key={item.label}>
            <div className="compare-value">
              <strong className={item.tone ? `tone-${item.tone}` : undefined}>{item.value}</strong>
              <span className="compare-label">{titleCase(item.label)}</span>
            </div>
            <div className="compare-foot">
              <small className="compare-caption">{item.caption}</small>
              {item.viz && <span className="extra-viz">{item.viz}</span>}
            </div>
          </section>)}
        </div>

        <section className="home-card duo jr-trades">
          <div className="card-collapse-head shell-head" onClick={(event) => { if (!event.target.closest('button')) setTradesOpen(!tradesOpen) }}>
            <button type="button" className="card-collapse" aria-expanded={tradesOpen} onClick={() => setTradesOpen(!tradesOpen)}>
              <span className="card-title">Trades</span>
            </button>
            <div className="ws-seg compact" role="tablist" aria-label="Filter session trades">
              {['All', 'Wins', 'Losses'].map((option) => <button
                key={option} type="button" role="tab" aria-selected={tradeFilter === option}
                className={tradeFilter === option ? 'active' : ''}
                onClick={() => { setTradeFilter(option); setTradesOpen(true); setTableEnd(false) }}
              >{option}</button>)}
            </div>
          </div>
          <div className="shell-body"><div className={`card-fold${tradesOpen ? ' open' : ''}`}><div className="card-fold-inner">
          <div ref={(el) => { if (el && !tableEnd && el.scrollHeight <= el.clientHeight + 2) setTableEnd(true) }} className={`journal-table-wrap${tableEnd ? ' at-end' : ''}`} onScroll={(event) => {
            const el = event.currentTarget
            setTableEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 2)
          }}>
            <table className="feed-table journal-table">
              <thead><tr><th>Time</th><th>Symbol</th><th>Side</th><th>Setup</th><th className="jt-route-head"><span className="jt-route">
                <span className="jt-qty">Qty</span>
                <span className="jt-prices"><span>Entry</span><span className="jt-arrow" aria-hidden="true">→</span><span>Exit</span></span>
              </span></th><th className="jt-col-account">Account</th><th>Net P&L</th></tr></thead>
              <tbody>
                {visibleFills.map((fill) => {
                  const held = fill.closed ? toMinutes(fill.closed) - toMinutes(fill.time) : null
                  return <tr
                    key={fill.id} className={`jt-row ${toneOf(fill.pnl)}${drawerTradeId === fill.id ? ' is-selected' : ''}`}
                    tabIndex={0} aria-label={`${fill.symbol} ${fill.side} at ${fill.time}`}
                    onClick={() => setDrawerTradeId(fill.id)}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setDrawerTradeId(fill.id) } }}
                  >
                    <td className="jt-time">
                      <span>{fill.time}</span>
                      {held != null && <small>{held >= 60 ? `${Math.floor(held / 60)}h ${held % 60}m` : `${held}m`}</small>}
                    </td>
                    <td className="jt-symbol">
                      <span className="jt-sym">
                        <SymbolToken symbol={fill.symbol}/>
                        <b>{fill.symbol}</b>
                      </span>
                    </td>
                    <td><span className={`jt-side ${fill.side.toLowerCase()}`}>{fill.side}</span></td>
                    <td><span className="jt-setup">{fill.setup}</span></td>
                    <td className="jt-route">
                      <span className="jt-qty">{fill.qty}</span>
                      <span className="jt-prices"><span>{fill.entry.toFixed(2)}</span><span className={`jt-arrow ${toneOf(fill.pnl)}`} aria-hidden="true">→</span><span>{fill.exit.toFixed(2)}</span></span>
                    </td>
                    <td className="jt-col-account">{(() => {
                      const name = accountForTrade(fill)?.content.name ?? 'Unassigned'
                      return <span className="tl-account"><FirmLogo firm={firmOf(name)}/>{name}</span>
                    })()}</td>
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
          </div></div></div>
        </section>

      </div>

      <aside className="journal-side">
      {/* the day picker heads the side column, above the note */}
      <div className="jr-bar duo">
        <div className="jr-nav shell-head">
          <button type="button" aria-label="Previous trading day" disabled={!previousDay} onClick={() => setDate?.(previousDay)}><ChevronLeft size={16} strokeWidth={2}/></button>
          <span className="jr-date" aria-live="polite">{new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</span>
          <button type="button" aria-label="Next trading day" disabled={!nextDay} onClick={() => setDate?.(nextDay)}><ChevronRight size={16} strokeWidth={2}/></button>
        </div>
        <div className="shell-body">
      <div className="jr-week" role="list" aria-label="This week" style={{ '--jr-cells': week.length + 1 }}>
        {week.map((item) => <button
          type="button" role="listitem" key={item.date}
          className={`jr-day${item.date === JOURNAL_DAY ? ' current' : ''}${item.pnl == null ? ' idle' : ` ${toneOf(item.pnl)}`}`}

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
        </div>
      </div>
      <section
        className="home-card journal-note note-preview duo jr-duo" role="button" tabIndex={0}
        aria-label="Open session note" onClick={openNote}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openNote() } }}
      >
        <div className="shell-head np-head">
          <span className="card-title">Session Note</span>
          <span className="np-meta">{savedAt ? `Saved ${savedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'Saved'}</span>
        </div>
        <div className="shell-body np-body">
          <b className="np-title">{notePreview.title}</b>
          {notePreview.body && <p className="np-text">{notePreview.body}</p>}
          <span className="np-lines" aria-hidden="true"><i/><i/><i/></span>
          {attachments.length > 0 && <small className="np-shots">{attachments.length} screenshot{attachments.length === 1 ? '' : 's'}</small>}
        </div>
        {toast && <span className="note-toast" role="status">{toast}</span>}
      </section>
      {noteDrawer && <Drawer label="Session note" width={560} onClose={() => { if (editing) { saveNote(); setEditing(false) } setNoteDrawer(false) }}>
        <div className="note-drawer journal-note">
          <div className="nd-head">
            <DrawerHeader title="Session note" description={easternLabel(date)}/>
            <button className="note-button" aria-pressed={editing} onClick={() => { if (editing) saveNote(); setEditing(!editing) }}>
              {editing ? <Check size={14}/> : <Pencil size={14}/>} {editing ? 'Done' : 'Edit'}
            </button>
          </div>
        {editing && <div className="note-toolbar" role="toolbar" aria-label="Formatting">
          <button type="button" className={formats.bold ? 'on' : ''} aria-pressed={formats.bold} aria-label="Bold" onMouseDown={(event) => event.preventDefault()} onClick={() => runFormat('bold')}><Bold size={14} strokeWidth={2.4}/></button>
          <button type="button" className={formats.italic ? 'on' : ''} aria-pressed={formats.italic} aria-label="Italic" onMouseDown={(event) => event.preventDefault()} onClick={() => runFormat('italic')}><Italic size={14} strokeWidth={2.2}/></button>
          <button type="button" className={formats.list ? 'on' : ''} aria-pressed={formats.list} aria-label="Bullet list" onMouseDown={(event) => event.preventDefault()} onClick={() => runFormat('insertUnorderedList')}><List size={15} strokeWidth={2.2}/></button>
          <span className="nt-divider" aria-hidden="true"/>
          <button type="button" aria-label="Smaller text" disabled={noteScale <= -3} onMouseDown={(event) => event.preventDefault()} onClick={() => changeScale(-1)}><AArrowDown size={15} strokeWidth={2}/></button>
          <span className="nt-scale" aria-live="polite">{noteScale > 0 ? `+${noteScale}` : noteScale}</span>
          <button type="button" aria-label="Larger text" disabled={noteScale >= 3} onMouseDown={(event) => event.preventDefault()} onClick={() => changeScale(1)}><AArrowUp size={15} strokeWidth={2}/></button>
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
            dangerouslySetInnerHTML={{ __html: openedHtml }}
          />
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
          <div className="note-foot">
            <span className="save-state"><Check size={13} strokeWidth={2.2}/> {savedAt ? `Saved ${savedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'Saved'}</span>
            <div className="note-tools">
              <button type="button" className="note-button" onClick={copyNote}><Copy size={14}/> Copy</button>
              <button type="button" className="note-button" onClick={downloadNote}><Download size={14}/> Download</button>
            </div>
          </div>
        </div>
      </Drawer>}
      {preview && <div className="shot-preview" onClick={() => setPreview(null)} role="dialog" aria-label={preview.name}>
        <img src={preview.src} alt={preview.name}/>
      </div>}

      <section className="home-card day-breakdown duo jr-duo">
        <div className="shell-head"><div className="card-title">Day Breakdown</div></div>
        <div className="shell-body">
        <div className="db-rows">
          {[
            { label: 'Largest trade', left: breakdown.largestWin?.pnl, leftMeta: breakdown.largestWin?.symbol, right: breakdown.largestLoss?.pnl, rightMeta: breakdown.largestLoss?.symbol },
            { label: 'Average trade', left: breakdown.avgWinner, right: breakdown.avgLoser },
            { label: 'Long vs short', left: breakdown.long, leftMeta: 'Long', right: breakdown.short, rightMeta: 'Short', sides: true },
          ].map((row) => {
            const left = row.left ?? 0, right = row.right ?? 0
            return <div className="db-row" key={row.label}>
              <div className="db-line">
                <span className="db-side"><b className={`tone-${toneOf(left)}`}>{row.left == null ? '—' : money(left, { privacy, decimals: 0 })}</b>{row.leftMeta && <small>{row.leftMeta}</small>}</span>
                <span className="db-label">{row.label}</span>
                <span className="db-side end">{row.rightMeta && <small>{row.rightMeta}</small>}<b className={`tone-${toneOf(right)}`}>{row.right == null ? '—' : money(right, { privacy, decimals: 0 })}</b></span>
              </div>
              <span className={`db-bar${row.sides ? ' sides' : ''}`} aria-hidden="true">
                <i className={toneOf(left)} style={{ flex: Math.abs(left) || 0.0001 }}/>
                <i className={toneOf(right)} style={{ flex: Math.abs(right) || 0.0001 }}/>
              </span>
            </div>
          })}
        </div>
        </div>
      </section>

      <section className="home-card checklist-card duo jr-duo">
        <button type="button" className="shell-head checklist-head as-toggle" aria-haspopup="dialog" onClick={() => setChecklistOpen(true)}>
          <div className="card-title">Execution Checklist</div>
          <span className="cl-kept">
            <span className="checklist-sub">{checked.filter(Boolean).length} of {checklistRules.length} rules kept</span>
            <span className={`discipline-ring ${disciplineTone(discipline)}`} style={{ '--share': discipline }} role="img" aria-label={`${discipline}% discipline`}/>
          </span>
        </button>
        <div className="shell-body checklist-foot">
          <div className="cw-head">
            <span>This week</span>
            {disciplineAverage != null && <span>Avg <b className={`tone-${disciplineTone(disciplineAverage) === 'pos' ? 'pos' : disciplineTone(disciplineAverage) === 'neg' ? 'neg' : 'mid'}`}>{disciplineAverage}%</b></span>}
          </div>
          <div className="cw-bars" aria-hidden="true">
            {disciplineWeek.map((item) => <div key={item.date} className={`cw-day${item.date === JOURNAL_DAY ? ' current' : ''}`}>
              <small>{item.weekday}</small>
              <span className="cw-track"><i className={item.score == null ? '' : disciplineTone(item.score)} style={{ '--score': `${item.score ?? 0}%` }}/></span>
              <em>{item.score == null ? '—' : `${item.score}%`}</em>
            </div>)}
          </div>
        </div>
      </section>
      {checklistOpen && <Drawer label="Execution checklist" width={460} onClose={() => setChecklistOpen(false)}>
        <div className="checklist-drawer">
          <DrawerHeader title="Execution checklist" description={easternLabel(date)}/>
          <div className="cd-score">
            <span className={`discipline-ring ${disciplineTone(discipline)}`} style={{ '--share': discipline }} aria-hidden="true"/>
            <span><b>{checked.filter(Boolean).length} of {checklistRules.length}</b> rules kept · {discipline}%</span>
          </div>
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
        </div>
      </Drawer>}
      </aside>
    </div>
  </div>
}
