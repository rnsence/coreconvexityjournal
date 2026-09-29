/**
 * Local statistics for the Reports page. The monolith asks its API for these; here
 * every number is computed from `tradeLog`, with a few deterministic enrichments
 * (account, tags, mistakes, R, hold) so every breakdown and filter has data.
 */
import { consistencyScore, edgeScore, equitySeries, streaks, summarize } from '../analytics'
import { money } from '../viz'

/* ------------------------------------------------------------ storage */

export const readStore = (key, fallback) => {
  try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback } catch { return fallback }
}
export const writeStore = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
}

/* ------------------------------------------------------------ enrichment */

const hash = (text) => {
  let value = 2166136261
  for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619)
  return value >>> 0
}

export const ACCOUNTS = ['Apex 50K', 'Topstep 150K', 'Personal cash']
export const RISK_PER_TRADE = 150
export const MISTAKE_RULES = {
  'moved stop': 'Stop stays where it was set',
  'chased entry': 'Enter only at the planned level',
  oversized: 'Risk no more than 1R per trade',
  'early exit': 'Hold to target or stop',
  'revenge trade': 'Wait 10 minutes after a loss',
}
const MISTAKES = Object.keys(MISTAKE_RULES)
const GRADE_STARS = { 'A+': 5, A: 4, B: 3, C: 2, D: 1 }
const clockMinutes = (clock) => { const [hours, minutes] = String(clock).split(':').map(Number); return hours * 60 + minutes }

const enriched = new Map()
/** One trade with the fields the monolith's filters and breakdowns expect. */
export function enrich(trade, reviews = readStore('trade-reviews', {})) {
  const review = reviews[trade.id]
  const cacheKey = `${trade.id}|${review ? JSON.stringify(review) : ''}`
  if (enriched.has(cacheKey)) return enriched.get(cacheKey)
  const seed = hash(trade.id)
  const mistakeChance = { D: 1, C: 0.6, B: 0.15 }[trade.grade] ?? 0
  const mistakes = (seed % 100) / 100 < mistakeChance ? [MISTAKES[(seed >>> 8) % MISTAKES.length]] : []
  const tags = review?.tags ?? [trade.setup.toLowerCase(), ...(trade.grade === 'A+' ? ['a+ setup'] : []), ...((seed >>> 4) % 7 === 0 ? ['patient'] : [])]
  const hold = Math.max(1, clockMinutes(trade.closed || trade.time) - clockMinutes(trade.time)) * 60
  const date = new Date(`${trade.date}T00:00:00Z`)
  const monday = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10)
  const value = {
    ...trade,
    account: ACCOUNTS[(seed >>> 12) % ACCOUNTS.length],
    direction: trade.side === 'Short' ? 'short' : 'long',
    tags, mistakes,
    rules: mistakes.map((mistake) => MISTAKE_RULES[mistake]),
    rating: review?.rating ?? GRADE_STARS[trade.grade] ?? null,
    r: Math.round((trade.pnl / RISK_PER_TRADE) * 100) / 100,
    holdSeconds: hold,
    weekday: date.getUTCDay(),
    month: trade.date.slice(0, 7),
    week: monday,
    exits: trade.qty >= 200 && seed % 3 === 0 ? 'scaled' : 'single',
    assetClass: ['ES', 'NQ'].includes(trade.symbol) ? 'future' : ['SPY', 'QQQ'].includes(trade.symbol) ? 'etf' : 'stock',
    notes: review?.notes || null,
  }
  enriched.set(cacheKey, value)
  return value
}

/* ------------------------------------------------------------ filters */

export const EMPTY_FILTER = {}
export const cleanFilter = (filter) => Object.fromEntries(Object.entries(filter || {}).filter(([, value]) => value !== undefined && value !== ''))
export const filterCount = (filter) => Object.keys(cleanFilter(filter)).length

export function applyFilter(trades, filter = {}) {
  const f = cleanFilter(filter)
  const symbol = f.symbol?.trim().toUpperCase()
  const tag = f.tag?.trim().toLowerCase()
  const mistake = f.mistake?.trim().toLowerCase()
  const reviews = readStore('trade-reviews', {})
  return trades.map((trade) => enrich(trade, reviews)).filter((trade) =>
    (!f.account || trade.account === f.account)
    && (!f.setup || trade.setup === f.setup)
    && (!f.direction || trade.direction === f.direction)
    && (!symbol || trade.symbol === symbol)
    && (!tag || trade.tags.some((item) => item.toLowerCase().includes(tag)))
    && (!mistake || trade.mistakes.some((item) => item.includes(mistake)))
    && (!f.from || trade.date >= f.from)
    && (!f.to || trade.date <= f.to))
}

/* ------------------------------------------------------------ dimensions */

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const DIMENSIONS = {
  account: 'Account', symbol: 'Symbol', tag: 'Tag', weekday: 'Weekday', hour: 'Hour', month: 'Month',
  playbook: 'Setup', mistake: 'Mistake', rating: 'Rating', direction: 'Direction', holding: 'Holding time',
  exits: 'Exit style', asset_class: 'Asset class', underlying: 'Underlying', week: 'Week', size: 'Position size', rule: 'Rule broken',
}
const holdingBucket = (seconds) => (seconds < 300 ? 'a' : seconds < 900 ? 'b' : seconds < 1800 ? 'c' : 'd')
const HOLDING = { a: 'Under 5m', b: '5–15m', c: '15–30m', d: '30m+' }
const sizeBucket = (qty) => (qty < 50 ? 'a' : qty < 100 ? 'b' : qty < 200 ? 'c' : 'd')
const SIZES = { a: '1–49', b: '50–99', c: '100–199', d: '200+' }

/** Keys a trade falls under for a dimension (tags and mistakes can hold several). */
export function keysOf(trade, dimension) {
  switch (dimension) {
    case 'account': return [trade.account]
    case 'symbol': case 'underlying': return [trade.symbol]
    case 'tag': return trade.tags.length ? trade.tags : ['none']
    case 'weekday': return [String(trade.weekday)]
    case 'hour': return [String(trade.hour)]
    case 'month': return [trade.month]
    case 'playbook': return [trade.setup || 'none']
    case 'mistake': return trade.mistakes.length ? trade.mistakes : ['none']
    case 'rating': return [trade.rating ? String(trade.rating) : 'unrated']
    case 'direction': return [trade.direction]
    case 'holding': return [holdingBucket(trade.holdSeconds)]
    case 'exits': return [trade.exits]
    case 'asset_class': return [trade.assetClass]
    case 'week': return [trade.week]
    case 'size': return [sizeBucket(trade.qty)]
    case 'rule': return trade.rules.length ? trade.rules : ['none']
    default: return ['unknown']
  }
}

export function labelOf(dimension, key) {
  if (key === 'unknown') return 'Not recorded'
  switch (dimension) {
    case 'playbook': return key === 'none' ? 'No setup' : key
    case 'weekday': return WEEKDAY_LONG[Number(key)] ?? key
    case 'hour': return `${key}:00`
    case 'month': return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`
    case 'rating': return key === 'unrated' ? 'Not rated' : `${'★'.repeat(Number(key))} (${key})`
    case 'direction': return key === 'long' ? 'Long' : 'Short'
    case 'holding': return HOLDING[key] ?? key
    case 'size': return SIZES[key] ?? key
    case 'exits': return { single: 'Single exit', scaled: 'Scaled exits', open: 'Still open' }[key] ?? key
    case 'asset_class': return key === 'etf' ? 'ETF' : key[0].toUpperCase() + key.slice(1)
    case 'week': return `Week of ${MONTHS[Number(key.slice(5, 7)) - 1]} ${Number(key.slice(8, 10))}`
    case 'tag': return key === 'none' ? 'No tag' : key
    case 'mistake': return key === 'none' ? 'No mistake' : key
    case 'rule': return key === 'none' ? 'No rule broken' : key
    default: return key
  }
}

const NATURAL = new Set(['weekday', 'hour', 'month', 'week', 'rating', 'holding', 'size'])

/* ------------------------------------------------------------ metrics */

const sum = (list, pick) => list.reduce((total, item) => total + pick(item), 0)

/** Full statistics for a set of trades; plain JSON so a published report can freeze it. */
export function computeMetrics(input) {
  const trades = [...input].sort((a, b) => a.timestamp - b.timestamp)
  if (!trades.length) return null
  const stats = summarize(trades)
  const series = equitySeries(trades)
  const wins = trades.filter((trade) => trade.pnl > 0)
  const losses = trades.filter((trade) => trade.pnl < 0)
  const decided = wins.length + losses.length
  const days = series.map((point) => point.pnl)
  const meanDay = days.length ? sum(days, (value) => value) / days.length : 0
  const sd = days.length > 1 ? Math.sqrt(sum(days, (value) => (value - meanDay) ** 2) / (days.length - 1)) : 0
  const downside = days.length > 1 ? Math.sqrt(sum(days.filter((value) => value < 0), (value) => value ** 2) / (days.length - 1)) : 0
  const score = edgeScore({ ...stats, consistency: consistencyScore(series) }).score
  const run = streaks(trades)
  const recent = trades.slice(-20)
  const recentDecided = recent.filter((trade) => trade.pnl !== 0)
  const rs = trades.map((trade) => trade.r ?? trade.pnl / RISK_PER_TRADE)
  const round = (value) => (value == null || !Number.isFinite(value) ? null : Math.round(value * 10000) / 10000)
  return {
    trades: trades.length, wins: wins.length, losses: losses.length, scratches: trades.length - decided,
    net_pnl: round(stats.netPnl), gross_profit: round(stats.grossProfit), gross_loss: round(-stats.grossLoss),
    fees: round(sum(trades, (trade) => trade.fees || 0)),
    win_rate: decided ? round(wins.length / decided) : null,
    profit_factor: round(stats.profitFactor),
    expectancy: round(stats.expectancy),
    average_win: wins.length ? round(stats.avgWin) : null,
    average_loss: losses.length ? round(-stats.avgLoss) : null,
    payoff_ratio: round(stats.avgWinLoss),
    largest_win: wins.length ? round(Math.max(...wins.map((trade) => trade.pnl))) : null,
    largest_loss: losses.length ? round(Math.min(...losses.map((trade) => trade.pnl))) : null,
    edge_score: score,
    max_drawdown: round(stats.maxDrawdown),
    recovery_factor: round(stats.recoveryFactor),
    sharpe: sd ? round((meanDay / sd) * Math.sqrt(252)) : null,
    sortino: downside ? round((meanDay / downside) * Math.sqrt(252)) : null,
    calmar: stats.maxDrawdown < 0 ? round((meanDay * 252) / Math.abs(stats.maxDrawdown)) : null,
    streak_win: run.win, streak_loss: run.loss,
    rolling_win_rate: recentDecided.length ? round(recentDecided.filter((trade) => trade.pnl > 0).length / recentDecided.length) : null,
    rolling_sample: recentDecided.length,
    average_r: round(sum(rs, (value) => value) / rs.length),
    total_r: round(sum(rs, (value) => value)),
    average_hold_seconds: Math.round(sum(trades, (trade) => trade.holdSeconds ?? 0) / trades.length),
    trading_days: series.length,
    average_day: round(meanDay),
    best_day: round(Math.max(...days)),
    worst_day: round(Math.min(...days)),
    winning_days: series.filter((point) => point.pnl > 0).length,
  }
}

export function duration(seconds) {
  if (seconds == null) return 'Needs data'
  const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = Math.round(seconds % 60)
  const parts = [h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean)
  return parts.length ? parts.join(' ') : '0s'
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
const perTrade = (n) => `per trade · n=${plural(n, 'trade')}`
const perDay = (n) => `per trading day · n=${plural(n, 'trading day')}`

/** Display rows shared by Compare, What if and the published report. */
export function metricRows(m, { privacy = false, only } = {}) {
  if (!m) return []
  const cash = (value) => (value == null ? 'Needs data' : money(value, { privacy }))
  const pct = (value) => (value == null ? 'Needs data' : `${(value * 100).toFixed(2)}%`)
  const plain = (value) => (value == null ? 'Needs data' : value.toLocaleString('en-US', { maximumFractionDigits: 2 }))
  const decided = m.wins + m.losses
  const rows = [
    ['Net P&L', cash(m.net_pnl), perTrade(m.trades), m.net_pnl],
    ['Gross profit', cash(m.gross_profit), perTrade(m.wins)],
    ['Gross loss', cash(m.gross_loss), perTrade(m.losses)],
    ['Fees', cash(m.fees == null ? null : -m.fees), perTrade(m.trades)],
    ['Win rate', pct(m.win_rate), perTrade(decided), m.win_rate],
    ['Profit factor', plain(m.profit_factor), perTrade(decided), m.profit_factor],
    ['Expectancy', cash(m.expectancy), perTrade(m.trades), m.expectancy],
    ['Average win', cash(m.average_win), perTrade(m.wins)],
    ['Average loss', cash(m.average_loss), perTrade(m.losses)],
    ['Payoff ratio', plain(m.payoff_ratio), perTrade(decided)],
    ['Largest win', cash(m.largest_win), perTrade(m.wins)],
    ['Largest loss', cash(m.largest_loss), perTrade(m.losses)],
    ['Edge score', m.edge_score == null ? 'Needs data' : `${m.edge_score} / 100`, perTrade(m.trades)],
    ['Max drawdown', cash(m.max_drawdown), perTrade(m.trades)],
    ['Recovery factor', plain(m.recovery_factor), perTrade(m.trades)],
    ['Sharpe', plain(m.sharpe), perDay(m.trading_days)],
    ['Sortino', plain(m.sortino), perDay(m.trading_days)],
    ['Calmar', plain(m.calmar), perDay(m.trading_days)],
    ['Longest streaks', `${m.streak_win} W · ${m.streak_loss} L`, perTrade(m.trades)],
    ['Rolling win rate', pct(m.rolling_win_rate), perTrade(m.rolling_sample)],
    ['Average R', plain(m.average_r), perTrade(m.trades), m.average_r],
    ['Total R', plain(m.total_r), perTrade(m.trades)],
    ['Average hold', duration(m.average_hold_seconds), perTrade(m.trades)],
    ['Average trading day', cash(m.average_day), perDay(m.trading_days)],
    ['Best trading day', cash(m.best_day), perDay(m.trading_days)],
    ['Worst trading day', cash(m.worst_day), perDay(m.trading_days)],
    ['Winning days', `${m.winning_days}`, perDay(m.trading_days)],
    ['Trades', `${m.trades}`, perTrade(m.trades), m.trades],
  ].map(([label, value, basis, raw]) => ({ label, value, basis, raw }))
  return only ? only.map((label) => rows.find((row) => row.label === label)).filter(Boolean) : rows
}

/* ------------------------------------------------------------ breakdowns */

const groupRow = (key, dimension, trades) => {
  const wins = trades.filter((trade) => trade.pnl > 0).length
  const losses = trades.filter((trade) => trade.pnl < 0).length
  const won = sum(trades.filter((trade) => trade.pnl > 0), (trade) => trade.pnl)
  const lost = -sum(trades.filter((trade) => trade.pnl < 0), (trade) => trade.pnl)
  const net = sum(trades, (trade) => trade.pnl)
  return {
    key, label: labelOf(dimension, key), trades: trades.length,
    net_pnl: Math.round(net * 100) / 100,
    win_rate: wins + losses ? wins / (wins + losses) : null,
    expectancy: net / trades.length,
    profit_factor: lost ? won / lost : null,
    average_r: sum(trades, (trade) => trade.r) / trades.length,
    average_hold_seconds: sum(trades, (trade) => trade.holdSeconds) / trades.length,
  }
}

export function breakdown(trades, dimension) {
  const groups = new Map()
  trades.forEach((trade) => keysOf(trade, dimension).forEach((key) => {
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(trade)
  }))
  const rows = [...groups.entries()].map(([key, list]) => groupRow(key, dimension, list))
  return NATURAL.has(dimension)
    ? rows.sort((a, b) => a.key.localeCompare(b.key, 'en', { numeric: true }))
    : rows.sort((a, b) => b.net_pnl - a.net_pnl)
}

export function crossBreakdown(trades, rows, columns) {
  const cells = new Map()
  trades.forEach((trade) => keysOf(trade, rows).forEach((rowKey) => keysOf(trade, columns).forEach((colKey) => {
    const key = `${rowKey}|${colKey}`
    if (!cells.has(key)) cells.set(key, [])
    cells.get(key).push(trade)
  })))
  const sortKeys = (keys) => [...new Set(keys)].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  const rowKeys = sortKeys([...cells.keys()].map((key) => key.split('|')[0]))
  const colKeys = sortKeys([...cells.keys()].map((key) => key.split('|')[1]))
  const map = new Map([...cells.entries()].map(([key, list]) => [key, groupRow(key, rows, list)]))
  return { rowKeys, colKeys, cells: map }
}

export const REPORT_METRICS = {
  net_pnl: 'Net P&L', trades: 'Trades', win_rate: 'Win rate', expectancy: 'Expectancy',
  profit_factor: 'Profit factor', average_r: 'Average R', average_hold_seconds: 'Average hold',
}
export const SIGNED = new Set(['net_pnl', 'expectancy', 'average_r'])
export const MONEY_METRICS = new Set(['net_pnl', 'expectancy'])
export const metricValue = (row, metric) => (row?.[metric] == null ? null : Number(row[metric]))
export function formatMetric(value, metric, privacy = false) {
  if (value == null) return '—'
  if (MONEY_METRICS.has(metric)) return money(value, { privacy })
  if (metric === 'win_rate') return `${(value * 100).toFixed(1)}%`
  if (metric === 'average_hold_seconds') return duration(Math.round(value))
  if (metric === 'trades') return `${Math.round(value)}`
  return value.toFixed(2)
}

export const POINT_FIELDS = { pnl: 'P&L', r: 'Realized R', hold_seconds: 'Hold (seconds)', hour: 'Hour', rating: 'Rating' }
const pointField = (trade, field) => ({ pnl: trade.pnl, r: trade.r, hold_seconds: trade.holdSeconds, hour: trade.hour + Number(trade.time.slice(3, 5)) / 60, rating: trade.rating })[field]
export const scatterPoints = (trades, x, y) => trades
  .map((trade) => ({ x: pointField(trade, x), y: pointField(trade, y), id: trade.id, trade }))
  .filter((point) => point.x != null && point.y != null)

/* ------------------------------------------------------------ insights */

const INSIGHT_DIMENSIONS = ['playbook', 'symbol', 'weekday', 'hour', 'direction', 'holding', 'mistake', 'tag', 'account']
export function insights(trades, minSample = 5) {
  const list = applyFilter(trades, {})
  if (!list.length) return { min_sample: minSample, trades: 0, best: [], leaks: [], rules: null }
  const groups = INSIGHT_DIMENSIONS.flatMap((dimension) => breakdown(list, dimension)
    .filter((row) => row.trades >= minSample && !['none', 'unknown'].includes(row.key))
    .map((row) => ({ ...row, dimension })))
    .filter((row, _, all) => row.dimension !== 'tag' || !all.some((other) => other.dimension === 'playbook' && other.key.toLowerCase() === row.key.toLowerCase()))
  const best = INSIGHT_DIMENSIONS
    .map((dimension) => groups.filter((row) => row.dimension === dimension && row.net_pnl > 0).sort((a, b) => b.net_pnl - a.net_pnl)[0])
    .filter(Boolean).sort((a, b) => b.net_pnl - a.net_pnl).slice(0, 5)
  const leaks = groups.filter((row) => row.net_pnl < 0).sort((a, b) => a.net_pnl - b.net_pnl).slice(0, 5)
  const followed = list.filter((trade) => !trade.mistakes.length)
  const broken = list.filter((trade) => trade.mistakes.length)
  return {
    min_sample: minSample, trades: list.length, net_pnl: sum(list, (trade) => trade.pnl), best, leaks,
    rules: {
      followed_trades: followed.length, followed_net_pnl: sum(followed, (trade) => trade.pnl),
      broken_trades: broken.length, broken_net_pnl: sum(broken, (trade) => trade.pnl),
    },
  }
}

/* ------------------------------------------------------------ what if */

export function toScenario(form) {
  const scenario = {}
  const exclude = {}
  if (form.mistake?.trim()) exclude.mistake = form.mistake.trim()
  if (form.tag?.trim()) exclude.tag = form.tag.trim()
  if (Object.keys(exclude).length) scenario.exclude = exclude
  if (form.maxPerDay) scenario.max_trades_per_day = Number(form.maxPerDay)
  if (form.fixedRisk?.trim()) scenario.fixed_risk = form.fixedRisk.trim()
  if (form.dailyLoss?.trim()) scenario.daily_loss_limit = form.dailyLoss.trim()
  if (form.withoutRuleBreaks) scenario.without_rule_breaks = true
  return Object.keys(scenario).length ? scenario : null
}

export function simulate(trades, scenario) {
  const counts = { excluded: 0, rule_breaks: 0, over_daily_max: 0, after_stop: 0, without_r: 0, resized: 0 }
  let list = [...trades].sort((a, b) => a.timestamp - b.timestamp)
  if (scenario.exclude) {
    const mistake = scenario.exclude.mistake?.toLowerCase()
    const tag = scenario.exclude.tag?.toLowerCase()
    const kept = list.filter((trade) => !(mistake && trade.mistakes.some((item) => item.includes(mistake))) && !(tag && trade.tags.some((item) => item.toLowerCase().includes(tag))))
    counts.excluded = list.length - kept.length
    list = kept
  }
  if (scenario.without_rule_breaks) {
    const kept = list.filter((trade) => !trade.rules.length)
    counts.rule_breaks = list.length - kept.length
    list = kept
  }
  if (scenario.max_trades_per_day > 0) {
    const seen = new Map()
    const kept = list.filter((trade) => { const count = (seen.get(trade.date) ?? 0) + 1; seen.set(trade.date, count); return count <= scenario.max_trades_per_day })
    counts.over_daily_max = list.length - kept.length
    list = kept
  }
  const risk = Number(scenario.fixed_risk)
  if (risk > 0) {
    list = list.map((trade) => ({ ...trade, pnl: Math.round(trade.r * risk * 100) / 100 }))
    counts.resized = list.length
  }
  const limit = Number(scenario.daily_loss_limit)
  if (limit > 0) {
    const running = new Map()
    const stopped = new Set()
    const kept = list.filter((trade) => {
      if (stopped.has(trade.date)) return false
      const next = (running.get(trade.date) ?? 0) + trade.pnl
      running.set(trade.date, next)
      if (next <= -limit) stopped.add(trade.date)
      return true
    })
    counts.after_stop = list.length - kept.length
    list = kept
  }
  return { trades: list, counts, pnl_basis: 'net' }
}

/* ------------------------------------------------------------ published reports */

const PUBLISHED_KEY = 'cc-published-reports'
const SAVED_KEY = 'cc-saved-reports'
export const SAVED_LIMIT = 20
export const loadSavedReports = () => readStore(SAVED_KEY, [])
export const storeSavedReports = (list) => writeStore(SAVED_KEY, list)

const stripHtml = (html) => String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim()

/** Freeze the statistics, days, breakdowns, trades and notes as they are now. */
export function snapshot(trades, definition) {
  const list = applyFilter(trades, definition.filter).sort((a, b) => a.timestamp - b.timestamp)
  const metrics = computeMetrics(list)
  const days = equitySeries(list).map((point) => ({ date: point.date, trades: point.trades, net: point.pnl }))
  const breakdowns = Object.fromEntries(['playbook', 'symbol', 'weekday', 'direction'].map((dimension) => [dimension, list.length ? breakdown(list, dimension) : []]))
  const notes = []
  if (definition.include_notes) {
    days.forEach((day) => {
      let body = null
      try { body = localStorage.getItem(`journal-note-${day.date}`) } catch { /* storage unavailable */ }
      if (body && stripHtml(body)) notes.push({ entry_id: day.date, occurred_on: day.date, title: 'Daily journal', body: stripHtml(body) })
    })
  }
  return {
    as_of: new Date().toISOString(), pnl_basis: 'net', metrics, days, breakdowns,
    trades: definition.include_trades ? list.slice(0, 200).map((trade) => ({
      trade_id: trade.id, date: trade.date, symbol: trade.symbol, direction: trade.direction, pnl: trade.pnl, realized_r: trade.r,
      setup: trade.setup, tags: trade.tags, mistakes: trade.mistakes, rating: trade.rating, notes: trade.notes,
    })) : [],
    trades_truncated: definition.include_trades && list.length > 200,
    notes: notes.slice(0, 100), notes_truncated: notes.length > 100,
  }
}

const token = () => Array.from({ length: 24 }, () => 'abcdefghijkmnopqrstuvwxyz23456789'[Math.floor(Math.random() * 33)]).join('')
const addDays = (iso, days) => new Date(Date.parse(iso) + days * 86400000).toISOString()

function seedPublished(trades) {
  const august = { filter: { from: '2026-08-01', to: '2026-08-31' }, include_trades: true, include_notes: false }
  const opening = { filter: { setup: 'Opening drive' }, include_trades: true, include_notes: false }
  return [
    {
      report_id: 'rpt-opening-drive', title: 'Opening drive study', definition: opening,
      created_at: '2026-09-19T21:12:00.000Z', content: snapshot(trades, opening),
      shares: [{ share_id: 'sh-3', created_at: '2026-09-19T21:14:00.000Z', expires_at: '2026-09-26T21:14:00.000Z', revoked_at: '2026-09-21T13:02:00.000Z' }],
    },
    {
      report_id: 'rpt-august', title: 'August review', definition: august,
      created_at: '2026-09-01T18:20:00.000Z', content: snapshot(trades, august),
      shares: [
        { share_id: 'sh-2', created_at: '2026-09-20T09:30:00.000Z', expires_at: '2026-10-20T09:30:00.000Z', revoked_at: null },
        { share_id: 'sh-1', created_at: '2026-09-01T18:25:00.000Z', expires_at: '2026-09-08T18:25:00.000Z', revoked_at: null },
      ],
    },
  ]
}

export function loadPublished(trades) {
  const stored = readStore(PUBLISHED_KEY, null)
  if (Array.isArray(stored)) return stored
  const seeded = seedPublished(trades)
  writeStore(PUBLISHED_KEY, seeded)
  return seeded
}
export const storePublished = (list) => writeStore(PUBLISHED_KEY, list)
export const shareActive = (share) => !share.revoked_at && Date.parse(share.expires_at) > Date.now()
export function createShare(days) {
  const now = new Date().toISOString()
  return { share_id: `sh-${Date.now().toString(36)}`, created_at: now, expires_at: addDays(now, days), revoked_at: null, token: token() }
}
export const shareURL = (value) => `${location.origin}/app/shared/journal/${value}`
