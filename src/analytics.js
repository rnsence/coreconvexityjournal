/**
 * Derived analytics for the dashboard. Everything on the page is computed from a
 * trade list, so the same components render correctly for any dataset — including
 * the positive-only, negative-only, empty and single-trade cases.
 */

const SETUPS = [
  'Opening drive', 'VWAP reclaim', 'Trend pullback', 'Range break', 'Gap continuation',
  'Failed breakout', 'Liquidity sweep', 'Trend day add', 'Reversal fade', 'News reaction',
  'Closing drive', 'Scalp rotation',
]
export const SETUP_CODES = {
  'Opening drive': 'ORB', 'VWAP reclaim': 'VWAP', 'Trend pullback': 'PB', 'Range break': 'RNG',
  'Gap continuation': 'GAP', 'Failed breakout': 'FBO', 'Liquidity sweep': 'SWP', 'Trend day add': 'ADD',
  'Reversal fade': 'FADE', 'News reaction': 'NEWS', 'Closing drive': 'CLS', 'Scalp rotation': 'SCLP',
}
const SYMBOLS = ['NQ', 'ES', 'NVDA', 'SPY', 'TSLA', 'AMD', 'AAPL', 'META']
export const GRADES = ['A+', 'A', 'B', 'C', 'D']
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

const mulberry32 = (seed) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const PRICES = { NVDA: 118.4, SPY: 562.2, TSLA: 251.2, AMD: 158.2, AAPL: 228.9, META: 512.4, QQQ: 489.3, MSFT: 431.1 }
const TICKERS = Object.keys(PRICES)
// Entries cluster around the open, thin out over lunch, and pick up into the close.
const HOUR_WEIGHTS = [[9, 0.24], [10, 0.22], [11, 0.12], [12, 0.06], [13, 0.07], [14, 0.12], [15, 0.17]]

/**
 * Deterministic sample book that trades like a person, not a formula:
 * a persistent day-to-day "form" (good weeks, bad weeks), lognormal trade sizes,
 * occasional scratches, the odd outsized loser and runner, and overtrading on bad days.
 */
/** Clock time `hold` minutes after an entry, capped at the 16:00 close. */
export function closeTime(hour, minute, hold) {
  const total = Math.min(15 * 60 + 59, hour * 60 + minute + hold)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function buildTradeLog({ sessions = 124, seed = 20260918 } = {}) {
  const random = mulberry32(seed)
  const normal = () => {
    const u = Math.max(1e-9, random())
    const v = random()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  const pick = (weights) => {
    let roll = random() * weights.reduce((total, [, weight]) => total + weight, 0)
    for (const [value, weight] of weights) { roll -= weight; if (roll <= 0) return value }
    return weights[weights.length - 1][0]
  }

  const end = new Date(Date.UTC(2026, 8, 18))
  const days = []
  for (let offset = 0; days.length < sessions; offset += 1) {
    const date = new Date(end.getTime() - offset * 86400000)
    const weekday = date.getUTCDay()
    if (weekday === 0 || weekday === 6) continue
    days.unshift(date)
  }

  const log = []
  let form = 0
  let regime = 0
  // Prices walk backwards from the latest session so the whole book is continuous
  // and the final day lines up with the hand-journaled prices.
  const priceByDate = new Map()
  const walking = { ...PRICES }
  for (let index = days.length - 1; index >= 0; index -= 1) {
    priceByDate.set(days[index].toISOString().slice(0, 10), { ...walking })
    TICKERS.forEach((ticker) => { walking[ticker] = Math.max(5, walking[ticker] / (1 + 0.0019 + 0.0105 * normal())) })
  }
  const lotFor = (price) => (price > 400 ? 5 : price > 150 ? 10 : 25)
  days.forEach((date, dayIndex) => {
    const level = priceByDate.get(date.toISOString().slice(0, 10))
    // Slow regime: shifts every couple of weeks (a hot month, a cold patch).
    if (dayIndex % 9 === 0) regime = 0.55 * regime + 0.55 * normal()
    form = 0.72 * form + 0.45 * normal() + 0.35 * regime
    if (dayIndex > 0 && random() < 0.1) return // sat on hands: no-trade day

    const tilt = form < -0.6 && random() < 0.5 ? 2 : 0 // bad days breed extra trades
    const count = pick([[1, 0.16], [2, 0.27], [3, 0.26], [4, 0.17], [5, 0.09], [6, 0.05]]) + tilt
    const winChance = Math.max(0.28, Math.min(0.74, 0.515 + 0.09 * form))
    const iso = date.toISOString().slice(0, 10)

    const minutesUsed = new Set()
    for (let index = 0; index < count; index += 1) {
      const hour = pick(HOUR_WEIGHTS)
      let minute = hour === 9 ? 30 + Math.floor(random() * 30) : Math.floor(random() * 60)
      while (minutesUsed.has(hour * 60 + minute)) minute = (minute + 7) % 60
      minutesUsed.add(hour * 60 + minute)

      let pnl
      const scratch = random() < 0.06
      if (scratch) {
        pnl = (random() - 0.5) * 30
      } else if (random() < winChance) {
        pnl = Math.exp(Math.log(185) + 0.62 * normal())
        if (random() < 0.035) pnl *= 2.4 + random() * 1.6 // runner
      } else {
        pnl = -Math.exp(Math.log(150) + 0.55 * normal())
        if (random() < 0.03) pnl *= 2.3 + random() * 1.3 // stop blown / oversized loser
      }
      pnl = Math.round(pnl * 100) / 100

      const symbol = TICKERS[Math.floor(random() * TICKERS.length)]
      const side = random() < 0.56 ? 'Long' : 'Short'
      // Intraday entry sits close to the day's level; size targets a varying notional.
      const entry = Math.round(level[symbol] * (1 + 0.004 * normal()) * 100) / 100
      const lot = lotFor(entry)
      const qty = Math.max(lot, Math.round((13000 + random() * 26000) / entry / lot) * lot)
      const fees = Math.round(Math.max(1, qty * 0.005) * 100) / 100
      const move = (pnl + fees) / qty
      const exit = Math.max(0.01, Math.round((side === 'Long' ? entry + move : entry - move) * 100) / 100)
      // Reconcile: the rounded exit price is what actually produced the P&L.
      pnl = Math.round(((exit - entry) * qty * (side === 'Long' ? 1 : -1) - fees) * 100) / 100
      const setup = SETUPS[Math.floor(random() * SETUPS.length)]
      // Grade scores the process, so a good trade can still lose and a sloppy one can win.
      const discipline = random() * 0.72 + (pnl > 0 ? 0.18 : 0) + (form > 0 ? 0.06 : 0)
      const grade = discipline > 0.86 ? 'A+' : discipline > 0.68 ? 'A' : discipline > 0.42 ? 'B' : discipline > 0.2 ? 'C' : 'D'

      log.push({
        id: `${iso}-${index}`,
        date: iso,
        timestamp: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute),
        hour,
        time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
        closed: closeTime(hour, minute, 5 + ((minute * 7 + qty + index * 13) % 38)),
        symbol, side, setup, code: SETUP_CODES[setup], grade,
        qty, entry, exit, fees,
        pnl,
        win: pnl > 0,
      })
    }
  })
  return log.sort((a, b) => a.timestamp - b.timestamp)
}

export const ACCOUNT_SIZE = 50000

const sum = (list, pick) => list.reduce((total, item) => total + pick(item), 0)
const mean = (list, pick) => (list.length ? sum(list, pick) / list.length : 0)

/** Headline metrics. Ratios return null when their denominator is undefined. */
export function summarize(trades) {
  const wins = trades.filter((trade) => trade.pnl > 0)
  const losses = trades.filter((trade) => trade.pnl < 0)
  const grossProfit = sum(wins, (trade) => trade.pnl)
  const grossLoss = Math.abs(sum(losses, (trade) => trade.pnl))
  const netPnl = sum(trades, (trade) => trade.pnl)
  const series = equitySeries(trades)
  const maxDrawdown = series.length ? Math.min(...series.map((point) => point.drawdown)) : 0
  const peak = series.length ? Math.max(...series.map((point) => point.cumulative)) : 0
  const sessions = series.length
  const greenSessions = series.filter((point) => point.pnl > 0).length
  return {
    trades: trades.length,
    sessions,
    netPnl,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : null,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    avgWin: wins.length ? grossProfit / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    avgWinLoss: losses.length && wins.length ? (grossProfit / wins.length) / (grossLoss / losses.length) : null,
    expectancy: trades.length ? netPnl / trades.length : null,
    maxDrawdown,
    maxDrawdownPct: (maxDrawdown / (ACCOUNT_SIZE + Math.max(0, peak))) * 100,
    recoveryFactor: maxDrawdown < 0 ? netPnl / Math.abs(maxDrawdown) : null,
    dayWinRate: sessions ? (greenSessions / sessions) * 100 : null,
    greenSessions,
  }
}

/** One point per session: cumulative equity, that day's P&L, drawdown from peak. */
export function equitySeries(trades) {
  const byDate = new Map()
  trades.forEach((trade) => {
    const bucket = byDate.get(trade.date) || { date: trade.date, pnl: 0, trades: 0, wins: 0 }
    bucket.pnl += trade.pnl
    bucket.trades += 1
    if (trade.pnl > 0) bucket.wins += 1
    byDate.set(trade.date, bucket)
  })
  let cumulative = 0
  let peak = 0
  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((bucket) => {
      cumulative += bucket.pnl
      peak = Math.max(peak, cumulative)
      return {
        ...bucket,
        pnl: Math.round(bucket.pnl * 100) / 100,
        cumulative: Math.round(cumulative * 100) / 100,
        drawdown: Math.round((cumulative - peak) * 100) / 100,
        winRate: bucket.trades ? (bucket.wins / bucket.trades) * 100 : 0,
      }
    })
}

const groupBy = (trades, keyOf) => {
  const groups = new Map()
  trades.forEach((trade) => {
    const key = keyOf(trade)
    const bucket = groups.get(key) || { key, trades: 0, wins: 0, pnl: 0 }
    bucket.trades += 1
    bucket.pnl += trade.pnl
    if (trade.pnl > 0) bucket.wins += 1
    groups.set(key, bucket)
  })
  return [...groups.values()].map((bucket) => ({
    ...bucket,
    pnl: Math.round(bucket.pnl * 100) / 100,
    winRate: bucket.trades ? (bucket.wins / bucket.trades) * 100 : 0,
    avgPnl: bucket.trades ? bucket.pnl / bucket.trades : 0,
  }))
}

/** Setups ranked by net contribution — deliberate order, not insertion order. */
export const bySetup = (trades) =>
  groupBy(trades, (trade) => trade.code)
    .map((bucket) => ({ ...bucket, label: bucket.key }))
    .sort((a, b) => b.pnl - a.pnl)

export const byGrade = (trades) => {
  const groups = groupBy(trades, (trade) => trade.grade)
  const total = trades.length || 1
  return GRADES
    .map((grade) => groups.find((bucket) => bucket.key === grade) || { key: grade, trades: 0, wins: 0, pnl: 0, winRate: 0, avgPnl: 0 })
    .map((bucket) => ({ ...bucket, share: (bucket.trades / total) * 100 }))
}

export const byHour = (trades) => {
  const groups = groupBy(trades, (trade) => trade.hour)
  const hours = groups.map((bucket) => Number(bucket.key)).sort((a, b) => a - b)
  if (!hours.length) return []
  const list = []
  for (let hour = hours[0]; hour <= hours[hours.length - 1]; hour += 1) {
    const found = groups.find((bucket) => Number(bucket.key) === hour)
    list.push(found
      ? { ...found, hour, label: `${String(hour).padStart(2, '0')}:00` }
      : { key: hour, hour, label: `${String(hour).padStart(2, '0')}:00`, trades: 0, wins: 0, pnl: 0, winRate: 0, avgPnl: 0 })
  }
  return list
}

export const byWeekday = (trades) => {
  const groups = groupBy(trades, (trade) => WEEKDAYS[(new Date(`${trade.date}T00:00:00Z`).getUTCDay() + 6) % 7] || 'Mon')
  return WEEKDAYS
    .map((day) => groups.find((bucket) => bucket.key === day) || { key: day, trades: 0, wins: 0, pnl: 0, winRate: 0, avgPnl: 0 })
    .map((bucket) => ({ ...bucket, label: bucket.key }))
}

/** Rolling win rate over the previous `window` closed trades. */
export function rollingWinRate(trades, window = 20) {
  const ordered = [...trades].sort((a, b) => a.timestamp - b.timestamp)
  if (ordered.length < window) return []
  const points = []
  for (let index = window - 1; index < ordered.length; index += 1) {
    const slice = ordered.slice(index - window + 1, index + 1)
    points.push({
      sequence: index + 1,
      value: (slice.filter((trade) => trade.pnl > 0).length / window) * 100,
      from: slice[0].date,
      to: slice[slice.length - 1].date,
    })
  }
  return points
}

/**
 * Edge score v2 — six components normalised to 0-100 against explicit "full marks"
 * thresholds, then weighted. Thresholds follow the open formula documented by the
 * LuxAlgo journal project; the weighting and presentation here are our own.
 */
export function edgeScore(stats) {
  const clamp = (value) => Math.max(0, Math.min(100, value))
  const components = [
    { key: 'Win rate', weight: 15, target: '60%', value: stats.winRate == null ? null : clamp((stats.winRate / 60) * 100), display: stats.winRate == null ? '—' : `${stats.winRate.toFixed(1)}%` },
    { key: 'Profit factor', weight: 25, target: '3.00', value: stats.profitFactor == null ? null : clamp((stats.profitFactor / 3) * 100), display: stats.profitFactor == null ? '—' : stats.profitFactor.toFixed(2) },
    { key: 'Avg win / loss', weight: 20, target: '2.50', value: stats.avgWinLoss == null ? null : clamp((stats.avgWinLoss / 2.5) * 100), display: stats.avgWinLoss == null ? '—' : stats.avgWinLoss.toFixed(2) },
    { key: 'Drawdown', weight: 15, target: 'Under 1% of account', value: clamp(100 - ((Math.abs(stats.maxDrawdownPct) - 1) / 7) * 100), display: `${Math.abs(stats.maxDrawdownPct).toFixed(1)}%` },
    { key: 'Recovery', weight: 10, target: '10× max drawdown', value: stats.recoveryFactor == null ? null : clamp((Math.log1p(Math.max(0, stats.recoveryFactor)) / Math.log1p(10)) * 100), display: stats.recoveryFactor == null ? '—' : `${stats.recoveryFactor.toFixed(2)}×` },
    { key: 'Consistency', weight: 15, target: 'Best day ≤ 15%', value: clamp(stats.consistency ?? 0), display: `${Math.round(stats.consistency ?? 0)}%` },
  ]
  const scored = components.filter((component) => component.value != null)
  const weight = scored.reduce((total, component) => total + component.weight, 0)
  const score = weight ? scored.reduce((total, component) => total + component.value * component.weight, 0) / weight : null
  return { score: score == null ? null : Math.round(score), components }
}

/**
 * Consistency: share of green sessions (full marks at 70%), discounted when a
 * single day carries too much of the profit.
 */
export function consistencyScore(series) {
  if (!series.length) return 0
  const green = series.filter((point) => point.pnl > 0)
  const hitRate = green.length / series.length
  const profit = sum(green, (point) => point.pnl)
  const concentration = profit > 0 ? Math.max(...green.map((point) => point.pnl)) / profit : 1
  const base = Math.min(1, hitRate / 0.7) * 100
  return Math.max(0, Math.min(100, base * (1 - Math.max(0, concentration - 0.12) * 1.6)))
}

/** Month grid (Monday-first) of sessions for the calendar heatmap. */
export function calendarGrid(series, year, month) {
  const byDate = new Map(series.map((point) => [point.date, point]))
  const first = new Date(Date.UTC(year, month, 1))
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const lead = (first.getUTCDay() + 6) % 7
  const cells = []
  for (let index = 0; index < lead; index += 1) cells.push({ blank: true, key: `lead-${index}` })
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
    cells.push({ key: date, date, day, weekend: weekday === 0 || weekday === 6, session: byDate.get(date) || null })
  }
  while (cells.length % 7) cells.push({ blank: true, key: `trail-${cells.length}` })
  const monthSessions = cells.filter((cell) => cell.session).map((cell) => cell.session)
  return {
    cells,
    total: sum(monthSessions, (point) => point.pnl),
    sessions: monthSessions.length,
    green: monthSessions.filter((point) => point.pnl > 0).length,
    peak: Math.max(1, ...monthSessions.map((point) => Math.abs(point.pnl))),
  }
}

export { mean, sum }

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WINDOW_DAYS = { day: 1, week: 7, month: 30, year: 365 }

const bucketKey = (iso, unit) => {
  const date = new Date(`${iso}T00:00:00Z`)
  if (unit === 'year') return { key: `${date.getUTCFullYear()}`, label: `${date.getUTCFullYear()}` }
  if (unit === 'month') return { key: iso.slice(0, 7), label: MONTH_NAMES[date.getUTCMonth()] }
  if (unit === 'week') {
    const monday = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * 86400000)
    const key = monday.toISOString().slice(0, 10)
    return { key, label: `${MONTH_NAMES[monday.getUTCMonth()]} ${monday.getUTCDate()}` }
  }
  return { key: iso, label: `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}` }
}

/** Win and loss share per calendar bucket (day / week / month / year). */
export function winBuckets(trades, unit = 'month', limit = 8) {
  const groups = new Map()
  trades.forEach((trade) => {
    const { key, label } = bucketKey(trade.date, unit)
    const bucket = groups.get(key) || { key, label, wins: 0, losses: 0 }
    if (trade.pnl > 0) bucket.wins += 1
    else if (trade.pnl < 0) bucket.losses += 1
    groups.set(key, bucket)
  })
  // A period with a handful of trades is noise, not a win rate — leave it out.
  const minTrades = unit === 'day' ? 1 : 5
  return [...groups.values()]
    .filter((bucket) => bucket.wins + bucket.losses >= minTrades)
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-limit)
    .map((bucket) => {
      const total = bucket.wins + bucket.losses || 1
      return { ...bucket, winRate: (bucket.wins / total) * 100, lossRate: (bucket.losses / total) * 100 }
    })
}

/** Current window against the one before it, for the "past month" copy. */
export function winWindow(trades, unit = 'month') {
  const tally = (list) => {
    const wins = list.filter((trade) => trade.pnl > 0).length
    const losses = list.filter((trade) => trade.pnl < 0).length
    return { wins, losses, winRate: wins + losses ? (wins / (wins + losses)) * 100 : null }
  }
  if (!trades.length) return { now: tally([]), prior: null }
  if (unit === 'day') {
    const dates = [...new Set(trades.map((trade) => trade.date))].sort()
    const last = dates[dates.length - 1]
    const before = dates[dates.length - 2]
    return {
      now: tally(trades.filter((trade) => trade.date === last)),
      prior: before ? tally(trades.filter((trade) => trade.date === before)) : null,
    }
  }
  const days = WINDOW_DAYS[unit]
  const latest = Date.parse(`${trades[trades.length - 1].date}T00:00:00Z`)
  const cut = (offset) => new Date(latest - offset * 86400000).toISOString().slice(0, 10)
  const now = trades.filter((trade) => trade.date > cut(days))
  const prior = trades.filter((trade) => trade.date > cut(days * 2) && trade.date <= cut(days))
  return { now: tally(now), prior: prior.length ? tally(prior) : null }
}

const RANGE_DAYS = { '7D': 7, '30D': 30, '90D': 90 }
/** Trim a trade list to the topbar date range, measured back from its latest trade. */
export function scopeByRange(trades, range = 'All') {
  if (!trades.length || range === 'All') return trades
  const latest = trades.reduce((max, trade) => (trade.date > max ? trade.date : max), trades[0].date)
  if (range === 'YTD') return trades.filter((trade) => trade.date >= `${latest.slice(0, 4)}-01-01`)
  const days = RANGE_DAYS[range]
  if (!days) return trades
  const cut = new Date(Date.parse(`${latest}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10)
  return trades.filter((trade) => trade.date > cut)
}

/** Net P&L grouped by any key, with win rate and profit factor per group. */
export function groupStats(trades, keyOf) {
  const groups = new Map()
  trades.forEach((trade) => {
    const key = keyOf(trade)
    const bucket = groups.get(key) || { key, trades: 0, wins: 0, losses: 0, pnl: 0, won: 0, lost: 0 }
    bucket.trades += 1
    bucket.pnl += trade.pnl
    if (trade.pnl > 0) { bucket.wins += 1; bucket.won += trade.pnl }
    if (trade.pnl < 0) { bucket.losses += 1; bucket.lost += -trade.pnl }
    groups.set(key, bucket)
  })
  return [...groups.values()].map((bucket) => ({
    ...bucket,
    winRate: bucket.wins + bucket.losses ? (bucket.wins / (bucket.wins + bucket.losses)) * 100 : 0,
    avg: bucket.trades ? bucket.pnl / bucket.trades : 0,
    profitFactor: bucket.lost ? bucket.won / bucket.lost : null,
  }))
}

/** Longest winning and losing runs, in trades. */
export function streaks(trades) {
  let win = 0; let loss = 0; let bestWin = 0; let worstLoss = 0
  ;[...trades].sort((a, b) => a.timestamp - b.timestamp).forEach((trade) => {
    if (trade.pnl > 0) { win += 1; loss = 0 } else if (trade.pnl < 0) { loss += 1; win = 0 }
    bestWin = Math.max(bestWin, win); worstLoss = Math.max(worstLoss, loss)
  })
  return { win: bestWin, loss: worstLoss }
}
