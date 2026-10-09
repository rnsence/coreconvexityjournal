/**
 * §2 Trade statistics ("All metrics"): performance cells, edge score, grouped
 * breakdowns, running P&L and data coverage — computed locally from the trade log.
 */
import React, { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { groupStats } from '../analytics'
import { money, titleCase } from '../viz'
import { accountForTrade, assetClassOf, fillsFor, minutesOf, realizedR, symbolRoot } from './trading-data'
import './trades.css'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const RULE_MISTAKES = ['moved stop', 'no stop', 'oversized', 'against plan', 'overtraded']
const GRADE_STARS = { 'A+': 5, A: 4, B: 3, C: 2, D: 1 }
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
const sum = (list) => list.reduce((total, value) => total + value, 0)
const mean = (list) => (list.length ? sum(list) / list.length : null)
const stdev = (list) => {
  if (list.length < 2) return null
  const avg = mean(list)
  return Math.sqrt(sum(list.map((value) => (value - avg) ** 2)) / (list.length - 1))
}
const holdMinutes = (trade) => (trade.closed ? minutesOf(trade.closed) - minutesOf(trade.time) : null)
const holdBucket = (trade) => {
  const minutes = holdMinutes(trade)
  if (minutes == null) return 'unknown'
  return minutes < 5 ? 'Under 5m' : minutes < 15 ? '5–15m' : minutes < 30 ? '15–30m' : minutes < 60 ? '30–60m' : 'Over 1h'
}
const weekOf = (iso) => {
  const date = new Date(`${iso}T00:00:00Z`)
  const monday = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * 86400000)
  return `Week of ${monday.toISOString().slice(0, 10)}`
}
const sizeBucket = (trade) => {
  const notional = trade.qty * trade.entry * (trade.multiplier ?? 1)
  return notional < 15000 ? 'Under $15k' : notional < 25000 ? '$15k–$25k' : notional < 35000 ? '$25k–$35k' : 'Over $35k'
}

/** Every number the "Trade statistics" section shows. */
export function computeStatistics(trades, reviews) {
  const ordered = [...trades].sort((a, b) => a.timestamp - b.timestamp)
  const wins = ordered.filter((trade) => trade.pnl > 0)
  const losses = ordered.filter((trade) => trade.pnl < 0)
  const scratches = ordered.length - wins.length - losses.length
  const decided = wins.length + losses.length
  const net = sum(ordered.map((trade) => trade.pnl))
  const grossProfit = sum(wins.map((trade) => trade.pnl))
  const grossLoss = sum(losses.map((trade) => trade.pnl))
  const feeTrades = ordered.filter((trade) => !(trade.logged && !trade.fills?.length))
  let running = 0; let peak = 0; let maxDrawdown = 0
  const equity = ordered.map((trade) => {
    running += trade.pnl; peak = Math.max(peak, running)
    const drawdown = peak - running
    maxDrawdown = Math.max(maxDrawdown, drawdown)
    return { date: trade.date, pnl: trade.pnl, equity: running, drawdown }
  })
  const days = new Map()
  ordered.forEach((trade) => days.set(trade.date, (days.get(trade.date) ?? 0) + trade.pnl))
  const daily = [...days.values()]
  const riskReady = daily.length >= 10
  const dailyMean = mean(daily)
  const downside = daily.length ? Math.sqrt(sum(daily.map((value) => Math.min(0, value) ** 2)) / daily.length) : null
  let winRun = 0; let lossRun = 0; let maxWin = 0; let maxLoss = 0
  ordered.forEach((trade) => {
    if (trade.pnl > 0) { winRun += 1; lossRun = 0 } else if (trade.pnl < 0) { lossRun += 1; winRun = 0 }
    maxWin = Math.max(maxWin, winRun); maxLoss = Math.max(maxLoss, lossRun)
  })
  const rolling = ordered.slice(-20)
  const rollingDecided = rolling.filter((trade) => trade.pnl !== 0)
  const rs = feeTrades.map((trade) => realizedR(trade, reviews[trade.id])).filter((value) => value != null && Number.isFinite(value))
  const holds = ordered.map(holdMinutes).filter((value) => value != null)
  const typedRR = ordered.map((trade) => {
    const review = reviews[trade.id]
    if (!review?.stop || !review?.target) return null
    const risk = Math.abs(trade.entry - Number(review.stop))
    return risk ? Math.abs(Number(review.target) - trade.entry) / risk : null
  }).filter((value) => value != null)
  const avgWin = wins.length ? grossProfit / wins.length : null
  const avgLoss = losses.length ? grossLoss / losses.length : null
  const profitFactor = grossLoss ? grossProfit / Math.abs(grossLoss) : null
  const payoff = avgWin != null && avgLoss ? avgWin / Math.abs(avgLoss) : null
  const recovery = maxDrawdown ? net / maxDrawdown : null
  const winRate = decided ? wins.length / decided : null
  const winningDays = daily.filter((value) => value > 0).length

  const edgeParts = [
    { key: 'Profit factor', weight: 0.3, value: profitFactor, target: 2 },
    { key: 'Payoff ratio', weight: 0.2, value: payoff, target: 2 },
    { key: 'Recovery factor', weight: 0.2, value: recovery, target: 3 },
    { key: 'Win rate', weight: 0.15, value: winRate, target: 0.6 },
    { key: 'Winning-day rate', weight: 0.15, value: daily.length ? winningDays / daily.length : null, target: 0.6 },
  ].map((part) => ({ ...part, score: part.value == null ? 0 : Math.round(Math.max(0, Math.min(100, (part.value / part.target) * 100))) }))
  const minTrades = 20
  const edge = { minTrades, score: ordered.length >= minTrades ? Math.round(sum(edgeParts.map((part) => part.score * part.weight))) : null, parts: edgeParts }

  return {
    trades: ordered, count: ordered.length, wins: wins.length, losses: losses.length, scratches, decided, net, grossProfit, grossLoss,
    fees: sum(feeTrades.map((trade) => trade.fees ?? 0)), feeSample: feeTrades.length,
    winRate, profitFactor, expectancy: ordered.length ? net / ordered.length : null, avgWin, avgLoss, payoff,
    largestWin: wins.length ? Math.max(...wins.map((trade) => trade.pnl)) : null,
    largestLoss: losses.length ? Math.min(...losses.map((trade) => trade.pnl)) : null,
    edge, maxDrawdown: ordered.length ? -maxDrawdown : null, recovery,
    riskSample: daily.length,
    sharpe: riskReady && stdev(daily) ? (dailyMean / stdev(daily)) * Math.sqrt(252) : null,
    sortino: riskReady && downside ? (dailyMean / downside) * Math.sqrt(252) : null,
    calmar: riskReady && maxDrawdown ? (dailyMean * 252) / maxDrawdown : null,
    maxWin, maxLoss,
    rollingSample: rolling.length, rollingWinRate: rollingDecided.length ? rollingDecided.filter((trade) => trade.pnl > 0).length / rollingDecided.length : null,
    rSample: rs.length, avgR: mean(rs), totalR: rs.length ? sum(rs) : null,
    holdSample: holds.length, avgHold: holds.length ? mean(holds) * 60 : null,
    typedRRSample: typedRR.length, avgTypedRR: mean(typedRR),
    tradingDays: daily.length, avgDay: mean(daily), bestDay: daily.length ? Math.max(...daily) : null, worstDay: daily.length ? Math.min(...daily) : null, winningDays,
    equity, days,
  }
}

const fmtMoney = (value, privacy) => (value == null ? 'Needs data' : money(value, { privacy }))
const fmtPercent = (value) => (value == null ? 'Needs data' : `${(value * 100).toFixed(2)}%`)
const fmtPlain = (value) => (value == null ? 'Needs data' : Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }))
const fmtHold = (seconds) => {
  if (seconds == null) return 'Needs data'
  const total = Math.round(seconds)
  const parts = [Math.floor(total / 3600) && `${Math.floor(total / 3600)}h`, Math.floor((total % 3600) / 60) && `${Math.floor((total % 3600) / 60)}m`, total % 60 && `${total % 60}s`].filter(Boolean)
  return parts.length ? parts.join(' ') : '0s'
}
const perTrades = (count) => `per trade · n=${plural(count, 'trade')}`
const perDays = (count) => `per trading day · n=${plural(count, 'trading day')}`

function performanceRows(stats, privacy) {
  return [
    ['Net P&L', fmtMoney(stats.net, privacy), perTrades(stats.count)],
    ['Gross profit', fmtMoney(stats.grossProfit, privacy), perTrades(stats.wins)],
    ['Gross loss', fmtMoney(stats.grossLoss, privacy), perTrades(stats.losses)],
    ['Fees', money(stats.fees, { privacy, sign: false }), perTrades(stats.feeSample), 'trades entered as fills only'],
    ['Win rate', fmtPercent(stats.winRate), perTrades(stats.decided), `${stats.wins} wins / ${stats.losses} losses; ${stats.scratches} scratch trades excluded`],
    ['Profit factor', fmtPlain(stats.profitFactor), perTrades(stats.decided), 'Gross profit / gross loss'],
    ['Expectancy', fmtMoney(stats.expectancy, privacy), perTrades(stats.count), 'Net P&L per trade'],
    ['Average win', fmtMoney(stats.avgWin, privacy), perTrades(stats.wins)],
    ['Average loss', fmtMoney(stats.avgLoss, privacy), perTrades(stats.losses)],
    ['Payoff ratio', fmtPlain(stats.payoff), perTrades(stats.decided), 'Average win / average loss'],
    ['Largest win', fmtMoney(stats.largestWin, privacy), perTrades(stats.wins)],
    ['Largest loss', fmtMoney(stats.largestLoss, privacy), perTrades(stats.losses)],
    ['Edge score', stats.edge.score == null ? 'Needs data' : String(stats.edge.score), perTrades(stats.count), `0-100 composite; needs ${stats.edge.minTrades} trades`],
    ['Max drawdown', fmtMoney(stats.maxDrawdown, privacy), perTrades(stats.count), 'Peak to trough of running net P&L'],
    ['Recovery factor', fmtPlain(stats.recovery), perTrades(stats.count), 'Net P&L / max drawdown'],
    ['Sharpe', fmtPlain(stats.sharpe), perDays(stats.riskSample), 'daily P&L, annualised; needs 10 trading days'],
    ['Sortino', fmtPlain(stats.sortino), perDays(stats.riskSample), 'downside deviation, annualised'],
    ['Calmar', fmtPlain(stats.calmar), perDays(stats.riskSample), 'annualised net P&L / max drawdown'],
    ['Longest streaks', `${stats.maxWin} W · ${stats.maxLoss} L`, perTrades(stats.count)],
    ['Rolling win rate', fmtPercent(stats.rollingWinRate), perTrades(stats.rollingSample), `Last ${stats.rollingSample} of up to 20 trades`],
    ['Average R', fmtPlain(stats.avgR), perTrades(stats.rSample), 'realized R: trades with fills and a stop'],
    ['Total R', fmtPlain(stats.totalR), perTrades(stats.rSample)],
    ['Average hold', fmtHold(stats.avgHold), perTrades(stats.holdSample), 'first to last fill, closed trades with fills'],
    ['Average typed R:R', fmtPlain(stats.avgTypedRR), perTrades(stats.typedRRSample), `${stats.typedRRSample}/${stats.count} trades supplied R:R`],
    ['Average trading day', fmtMoney(stats.avgDay, privacy), perDays(stats.tradingDays)],
    ['Best trading day', fmtMoney(stats.bestDay, privacy), perDays(stats.tradingDays)],
    ['Worst trading day', fmtMoney(stats.worstDay, privacy), perDays(stats.tradingDays)],
    ['Winning days', String(stats.winningDays), perDays(stats.tradingDays)],
    ['Trades', String(stats.count), perTrades(stats.count)],
  ]
}

function breakdowns(trades, reviews) {
  const reviewOf = (trade) => reviews[trade.id] ?? {}
  const multi = (keysOf) => {
    const expanded = trades.flatMap((trade) => { const keys = keysOf(trade); return (keys.length ? keys : ['unknown']).map((key) => ({ ...trade, __key: key })) })
    return groupStats(expanded, (trade) => trade.__key)
  }
  const label = (key) => (key === 'unknown' ? 'Not recorded' : key)
  const exitStyle = (trade) => {
    const fills = fillsFor(trade)
    if (!fills.length) return 'unknown'
    const exits = fills.filter((fill) => (fill.side === 'buy') !== (fills[0].side === 'buy')).length
    return exits > 1 ? 'Scaled exits' : exits === 1 ? 'Single exit' : 'Still open'
  }
  const sortBy = (rows, order) => [...rows].sort(order ?? ((a, b) => b.trades - a.trades))
  const byKeyAsc = (a, b) => String(a.key).localeCompare(String(b.key))
  return [
    ['By account', groupStats(trades, (trade) => accountForTrade(trade)?.content.name ?? 'Unassigned')],
    ['By symbol', groupStats(trades, (trade) => trade.symbol)],
    ['By tag', multi((trade) => reviewOf(trade).tags ?? [trade.setup.toLowerCase()])],
    ['By weekday', sortBy(groupStats(trades, (trade) => new Date(`${trade.date}T00:00:00Z`).getUTCDay()), (a, b) => a.key - b.key).map((row) => ({ ...row, key: WEEKDAYS[row.key] }))],
    ['By hour', sortBy(groupStats(trades, (trade) => trade.hour), (a, b) => a.key - b.key).map((row) => ({ ...row, key: `${row.key}:00` }))],
    ['By month', sortBy(groupStats(trades, (trade) => trade.date.slice(0, 7)), byKeyAsc)],
    ['By setup', groupStats(trades, (trade) => reviewOf(trade).playbook ?? trade.setup ?? 'No setup')],
    ['By mistake', multi((trade) => reviewOf(trade).mistakes ?? [])],
    ['By rating', sortBy(groupStats(trades, (trade) => reviewOf(trade).rating || GRADE_STARS[trade.grade] || 0), (a, b) => b.key - a.key).map((row) => ({ ...row, key: row.key ? `${'★'.repeat(row.key)} (${row.key})` : 'Not rated' }))],
    ['By direction', groupStats(trades, (trade) => trade.side)],
    ['By holding time', groupStats(trades, holdBucket)],
    ['By exit style', groupStats(trades, exitStyle)],
    ['By asset class', groupStats(trades, (trade) => { const kind = assetClassOf(trade); return kind === 'etf' ? 'ETF' : kind.charAt(0).toUpperCase() + kind.slice(1) })],
    ['By underlying', groupStats(trades, (trade) => symbolRoot(trade.symbol))],
    ['By week', sortBy(groupStats(trades, (trade) => weekOf(trade.date)), byKeyAsc)],
    ['By position size', groupStats(trades, sizeBucket)],
    ['By rule broken', multi((trade) => (reviewOf(trade).mistakes ?? []).filter((mistake) => RULE_MISTAKES.includes(mistake)))],
    ['By date', sortBy(groupStats(trades, (trade) => trade.date), (a, b) => b.key.localeCompare(a.key))],
  ].map(([title, rows]) => [title, sortBy(rows.map((row) => ({ ...row, key: label(row.key) })), title.startsWith('By date') || ['By weekday', 'By hour', 'By month', 'By week', 'By rating'].includes(title) ? () => 0 : undefined)])
}

function coverage(trades, reviews) {
  const count = (test) => trades.filter(test).length
  const review = (trade) => reviews[trade.id] ?? {}
  const manual = (trade) => trade.logged && !trade.fills?.length
  return [
    ['Realized R (stop set)', count((trade) => !manual(trade))],
    ['Setup', count((trade) => review(trade).playbook !== null && (review(trade).playbook || trade.setup))],
    ['Mistakes', count((trade) => review(trade).mistakes?.length)],
    ['Rating', count((trade) => review(trade).rating > 0)],
    ['Account linked', count((trade) => accountForTrade(trade))],
    ['Trade date', count((trade) => trade.date)],
    ['Entered as fills', count((trade) => !manual(trade))],
    ['Entry price', count((trade) => trade.entry)],
    ['Exit price', count((trade) => trade.exit)],
    ['Stop price', count((trade) => review(trade).stop)],
    ['R:R', count((trade) => review(trade).stop && review(trade).target)],
    ['Hour', count((trade) => trade.hour != null)],
    ['Tags', count((trade) => review(trade).tags?.length)],
    ['Notes', count((trade) => review(trade).notes)],
  ]
}

const FOCUS = ['Show everything', 'Performance', 'Breakdowns', 'Data coverage']

/** Collapsible card holding the full statistics dump. */
export function AllMetrics({ trades, reviews, privacy }) {
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(false)
  const [focus, setFocus] = useState('Show everything')
  const stats = useMemo(() => (seen ? computeStatistics(trades, reviews) : null), [seen, trades, reviews])
  const tables = useMemo(() => (seen ? breakdowns(trades, reviews) : []), [seen, trades, reviews])
  const covered = useMemo(() => (seen ? coverage(trades, reviews) : []), [seen, trades, reviews])
  const show = (section) => focus === 'Show everything' || focus === section
  return <section className={`home-card ws-card tm-card duo${open ? ' is-open' : ''}`} aria-labelledby="journal-calculations-title">
    <button type="button" className="tm-toggle shell-head" aria-expanded={open} aria-controls="tm-fold" onClick={() => { setSeen(true); setOpen(!open) }}>
      <span className="card-title" id="journal-calculations-title">All Metrics</span>
      <span className="tm-lede">Trade statistics · calculated from your trades in this range, in USD</span>
    </button>
    <div className={`card-fold${open ? ' open' : ''}`} id="tm-fold"><div className="card-fold-inner"><div className="shell-body">
    {seen && <div className="tm-body">
      <div className="tm-focus" role="group" aria-label="Calculation sections">
        {FOCUS.map((option) => <button key={option} type="button" aria-pressed={focus === option} className={focus === option ? 'on' : ''} onClick={() => setFocus(option)}>{option}</button>)}
      </div>
      {!stats.count ? <p className="tm-empty">Log a trade to populate these totals and breakdowns.</p> : <>
        {show('Performance') && <>
          <section className="tm-section">
            <header><h3>Performance</h3><span>Totals, ratios and streaks</span></header>
            <dl className="tm-grid">{performanceRows(stats, privacy).map(([name, value, basis, detail]) => <div key={name}>
              <dt>{name}</dt><dd>{value}<small>{basis}{detail ? ` · ${detail}` : ''}</small></dd>
            </div>)}</dl>
          </section>
          <section className="tm-section" aria-label="Edge score">
            <header><h3>{stats.edge.score == null ? `Edge score — needs ${stats.edge.minTrades} trades` : `Edge score ${stats.edge.score}`}</h3><span>Each part scores its value against a target, weighted</span></header>
            <div className="tm-edge">{stats.edge.parts.map((part) => <div key={part.key}>
              <span>{part.key} <small>({Math.round(part.weight * 100)}%)</small></span>
              <span className="tm-bar"><i style={{ width: `${part.score}%` }}/></span>
              <span className="tm-edge-val">{part.score} · {part.value == null ? 'n/a' : Number(part.value).toFixed(2)} of {part.target}</span>
            </div>)}</div>
          </section>
        </>}
        {show('Breakdowns') && <section className="tm-section">
          <header><h3>Breakdowns</h3><span>The same trades grouped by their fields</span></header>
          <div className="tm-tables">{tables.map(([title, rows]) => <div className="tm-table" key={title}>
            <h4>{titleCase(title)}</h4>
            {rows.length ? <div className="tm-rows">
              <div className="tm-row head"><span>Key</span><span>Trades</span><span>WR</span><span>P&L</span></div>
              {rows.slice(0, 31).map((row) => <div className="tm-row" key={row.key}>
                <strong>{row.key}</strong><span>{row.trades}</span>
                <span>{row.wins + row.losses ? `${row.winRate.toFixed(0)}%` : '—'}</span>
                <span>{money(row.pnl, { privacy })}</span>
              </div>)}
            </div> : <p className="tm-empty-rows">No grouped rows.</p>}
          </div>)}</div>
          <div className="tm-table wide">
            <h4>Running P&L</h4>
            <div className="tm-rows">{stats.equity.slice(-30).map((point, index) => <div className="tm-row four" key={index}>
              <span>{point.date ?? 'Undated'}</span><span>{money(point.pnl, { privacy })}</span>
              <span>running {money(point.equity, { privacy })}</span><span>drawdown {money(point.drawdown, { privacy, sign: false })}</span>
            </div>)}</div>
          </div>
        </section>}
        {show('Data coverage') && <section className="tm-section">
          <header><h3>Data Coverage</h3><span>Which optional trade fields have been filled in</span></header>
          <div className="tm-coverage">{covered.map(([name, present]) => <div key={name}>
            <span>{name}</span>
            <span className="tm-bar" role="progressbar" aria-valuemin={0} aria-valuemax={stats.count || 1} aria-valuenow={present}><i style={{ width: `${(present / (stats.count || 1)) * 100}%` }}/></span>
            <strong>{present}/{stats.count}</strong>
          </div>)}</div>
        </section>}
      </>}
    </div>}
    </div></div></div>
  </section>
}
