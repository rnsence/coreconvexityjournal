/**
 * Local stand-in for the journal's metrics read: the same 29 rows (labels, units,
 * sample basis and detail copy) computed from the mock trade log instead of the server.
 */
import { consistencyScore, edgeScore, equitySeries, streaks, summarize } from '../analytics'
import { tradeLog } from '../data'
import { money, percent } from '../viz'

const EDGE_MIN = 20
const sumOf = (list, pick) => list.reduce((total, item) => total + pick(item), 0)
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
const plain = (value) => (value == null || !Number.isFinite(value) ? null : value.toLocaleString('en-US', { maximumFractionDigits: 2 }))
const toMinutes = (clock) => { const [hour, minute] = String(clock).split(':').map(Number); return hour * 60 + minute }

/** 1R for the book: the average losing trade across the whole log. */
export const ONE_R = (() => {
  const losses = tradeLog.filter((trade) => trade.pnl < 0)
  return losses.length ? Math.abs(sumOf(losses, (trade) => trade.pnl)) / losses.length : 150
})()
export const rOf = (trade) => trade.pnl / ONE_R

const duration = (minutes) => {
  if (minutes == null) return null
  const seconds = Math.round(minutes * 60)
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return [hours ? `${hours}h` : '', mins ? `${mins}m` : '', `${secs}s`].filter(Boolean).join(' ')
}

/** Every metric row for a set of trades. `value` is already formatted; null values read "Needs data". */
export function metricRows(trades, { privacy = false } = {}) {
  const stats = summarize(trades)
  const series = equitySeries(trades)
  const days = series.length
  const tradeBasis = `per trade · n=${plural(trades.length, 'trade')}`
  const dayBasis = `per trading day · n=${plural(days, 'trading day')}`
  const cash = (value) => (value == null ? null : money(value, { privacy }))
  const wins = trades.filter((trade) => trade.pnl > 0)
  const losses = trades.filter((trade) => trade.pnl < 0)
  const scratch = trades.length - wins.length - losses.length
  const decided = wins.length + losses.length
  const dailyPnl = series.map((point) => point.pnl)
  const meanDay = days ? sumOf(dailyPnl, (value) => value) / days : 0
  const sd = days > 1 ? Math.sqrt(sumOf(dailyPnl, (value) => (value - meanDay) ** 2) / (days - 1)) : 0
  const downside = days > 1 ? Math.sqrt(sumOf(dailyPnl, (value) => Math.min(0, value) ** 2) / (days - 1)) : 0
  const maxDd = Math.abs(stats.maxDrawdown)
  const recent = [...trades].sort((a, b) => a.timestamp - b.timestamp).slice(-20)
  const holds = trades.filter((trade) => trade.closed && trade.time).map((trade) => toMinutes(trade.closed) - toMinutes(trade.time)).filter((value) => value >= 0)
  const streak = streaks(trades)
  const edge = trades.length >= EDGE_MIN ? edgeScore({ ...stats, consistency: consistencyScore(series) }).score : null
  const best = days ? Math.max(...dailyPnl) : null
  const worst = days ? Math.min(...dailyPnl) : null
  const totalR = sumOf(trades, rOf)
  const fees = sumOf(trades, (trade) => trade.fees || 0)

  const rows = [
    ['Net P&L', cash(trades.length ? stats.netPnl : null), tradeBasis, null, stats.netPnl],
    ['Gross profit', cash(trades.length ? stats.grossProfit : null), tradeBasis, null],
    ['Gross loss', cash(trades.length ? -stats.grossLoss : null), tradeBasis, null],
    ['Fees', cash(trades.length ? -fees : null), tradeBasis, 'trades entered as fills only'],
    ['Win rate', decided ? percent((wins.length / decided) * 100, { decimals: 2 }) : null, tradeBasis, `${wins.length} wins / ${losses.length} losses; ${scratch} scratch trades excluded`],
    ['Profit factor', plain(stats.profitFactor), tradeBasis, 'Gross profit / gross loss'],
    ['Expectancy', cash(stats.expectancy), tradeBasis, 'Net P&L per trade'],
    ['Average win', cash(wins.length ? stats.avgWin : null), tradeBasis, null],
    ['Average loss', cash(losses.length ? -stats.avgLoss : null), tradeBasis, null],
    ['Payoff ratio', plain(stats.avgWinLoss), tradeBasis, 'Average win / average loss'],
    ['Largest win', cash(wins.length ? Math.max(...wins.map((trade) => trade.pnl)) : null), tradeBasis, null],
    ['Largest loss', cash(losses.length ? Math.min(...losses.map((trade) => trade.pnl)) : null), tradeBasis, null],
    ['Edge score', edge == null ? null : `${edge}`, tradeBasis, `0-100 composite; needs ${EDGE_MIN} trades`],
    ['Max drawdown', cash(trades.length ? -maxDd : null), tradeBasis, 'Peak to trough of running net P&L'],
    ['Recovery factor', plain(maxDd ? stats.netPnl / maxDd : null), tradeBasis, 'Net P&L / max drawdown'],
    ['Sharpe', plain(days >= 10 && sd ? (meanDay / sd) * Math.sqrt(252) : null), dayBasis, 'daily P&L, annualised; needs 10 trading days'],
    ['Sortino', plain(days >= 10 && downside ? (meanDay / downside) * Math.sqrt(252) : null), dayBasis, 'downside deviation, annualised'],
    ['Calmar', plain(days >= 10 && maxDd ? (meanDay * 252) / maxDd : null), dayBasis, 'annualised net P&L / max drawdown'],
    ['Longest streaks', trades.length ? `${streak.win} W · ${streak.loss} L` : null, tradeBasis, null],
    ['Rolling win rate', recent.length ? percent((recent.filter((trade) => trade.pnl > 0).length / recent.length) * 100, { decimals: 2 }) : null, tradeBasis, `Last ${recent.length} of up to 20 trades`],
    ['Average R', plain(trades.length ? totalR / trades.length : null), tradeBasis, `realized R: 1R = the book's average loss (${money(ONE_R, { privacy, sign: false })})`, trades.length ? totalR / trades.length : null],
    ['Total R', plain(trades.length ? totalR : null), tradeBasis, null],
    ['Average hold', duration(holds.length ? sumOf(holds, (value) => value) / holds.length : null), tradeBasis, 'first to last fill, closed trades with fills'],
    ['Average typed R:R', null, tradeBasis, `0/${trades.length} trades supplied R:R`],
    ['Average trading day', cash(days ? meanDay : null), dayBasis, null],
    ['Best trading day', cash(best), dayBasis, null, best],
    ['Worst trading day', cash(worst), dayBasis, null, worst],
    ['Winning days', days ? `${series.filter((point) => point.pnl > 0).length}` : null, dayBasis, null],
    ['Trades', `${trades.length}`, tradeBasis, null],
  ]
  return rows.map(([label, value, basis, detail, raw]) => ({ label, value: value ?? 'Needs data', basis, detail, raw, missing: value == null }))
}

export const pickRows = (rows, labels) => labels.map((label) => rows.find((row) => row.label === label)).filter(Boolean)
