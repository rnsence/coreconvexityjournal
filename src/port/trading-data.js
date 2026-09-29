/**
 * Local stand-ins for the journal owner's trading maths: sample fills, price bars,
 * FIFO P&L, grouping flat-to-flat, prop-rule status and position sizing. Everything is
 * derived from `tradeLog` / `propAccounts` and a few localStorage keys owned by the port.
 */
import { propAccounts, tradeLog } from '../data'

/* ------------------------------------------------------------------ storage */

export const readJSON = (key, fallback) => {
  try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback } catch { return fallback }
}
export const writeJSON = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
}
export const notifyData = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('journal:data')) }

export const KEYS = {
  reviews: 'trade-reviews', archived: 'cc-trade-archived', logged: 'cc-logged-trades',
  batches: 'cc-import-batches', ungrouped: 'cc-ungrouped-fills', accounts: 'cc-journal-accounts',
  connections: 'cc-broker-connections', groupings: 'cc-trade-groupings',
}

/* ------------------------------------------------------------------ helpers */

export const hashOf = (text) => {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619) }
  return hash >>> 0
}
export const seeded = (text) => {
  let seed = hashOf(text) || 1
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export const round = (value, places = 2) => Math.round(value * 10 ** places) / 10 ** places
export const uid = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
const pad2 = (value) => String(value).padStart(2, '0')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `YYYY-MM-DDTHH:MM:SS` (journal clock, no zone) → "Sep 18, 2026, 15:23:00". */
export const stamp = (iso) => {
  if (!iso) return ''
  const [date, time = '00:00:00'] = iso.split('T')
  const [year, month, day] = date.split('-').map(Number)
  return `${MONTHS[month - 1]} ${day}, ${year}, ${time.slice(0, 8)}`
}
export const clockOf = (iso) => (iso ? iso.split('T')[1].slice(0, 5) : '')
export const minutesOf = (clock) => { const [hours, minutes] = clock.split(':').map(Number); return hours * 60 + minutes }
export const clockFrom = (minutes) => `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`

/** 120 → "2m", 0 → "0s", 3661 → "1h 1m 1s"; null → "Needs data". */
export function duration(seconds) {
  if (seconds == null) return 'Needs data'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = Math.round(seconds % 60)
  const parts = []
  if (hours) parts.push(`${hours}h`)
  if (minutes) parts.push(`${minutes}m`)
  if (rest || !parts.length) parts.push(`${rest}s`)
  return parts.join(' ')
}
/** 125 → "2:05", 3723 → "1:02:03". */
export const atLabel = (seconds) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return hours ? `${hours}:${pad2(minutes)}:${pad2(rest)}` : `${minutes}:${pad2(rest)}`
}
/** "" → null, "90" → 90, "2:05" → 125, "1m" → NaN. */
export const parseAt = (text) => {
  const value = String(text ?? '').trim()
  if (!value) return null
  if (!/^\d+(:\d{1,2}){0,2}$/.test(value)) return NaN
  return value.split(':').reduce((total, part) => total * 60 + Number(part), 0)
}

/* ------------------------------------------------------------------ instruments */

/** Point value per contract for common futures roots. Stocks and ETFs are 1. */
export const POINT_VALUES = { ES: 50, MES: 5, NQ: 20, MNQ: 2, YM: 5, MYM: 0.5, RTY: 50, M2K: 5, CL: 1000, MCL: 100, GC: 100, MGC: 10, SI: 5000, ZB: 1000, ZN: 1000, '6E': 125000 }
export const symbolRoot = (symbol = '') => {
  const clean = String(symbol).toUpperCase().replace(/^.*:/, '').replace(/\s+/g, '').replace(/!$/, '').replace(/1$/, '')
  const match = clean.match(/^([A-Z0-9]{1,4}?)([FGHJKMNQUVXZ])(\d{1,4})$/)
  return match && POINT_VALUES[match[1]] ? match[1] : clean in POINT_VALUES ? clean : clean
}
export const isFuture = (symbol) => symbolRoot(symbol) in POINT_VALUES
export const pointValueFor = (symbol, overrides = {}) => {
  const root = symbolRoot(symbol)
  return Number(overrides[root] ?? POINT_VALUES[root] ?? 1)
}
export const assetClassOf = (trade) => trade.assetClass ?? (isFuture(trade.symbol) ? 'future' : ['SPY', 'QQQ', 'IWM', 'DIA'].includes(trade.symbol) ? 'etf' : 'stock')
/** "ES=50, MNQ=2" → { ES: '50', MNQ: '2' } — incomplete pairs dropped, roots upper-cased. */
export const parsePoints = (text) => Object.fromEntries(String(text || '').split(',')
  .map((pair) => pair.split('=').map((part) => part.trim()))
  .filter(([root, value]) => root && value)
  .map(([root, value]) => [root.toUpperCase(), value]))

/* ------------------------------------------------------------------ accounts */

const statusFromSeed = (account) => {
  if (account.status === 'Breached') return account.phase === 'Funded' ? 'blown' : 'failed-eval'
  return account.phase === 'Funded' ? 'funded' : 'active'
}
export const STATUS_LABELS = { active: 'in evaluation', funded: 'funded', blown: 'blown', 'failed-eval': 'failed evaluation' }

/** Journal accounts seeded from the prop firm book plus one personal account. */
export function seedAccounts() {
  const prop = propAccounts.map((account) => ({
    id: account.id, revision: 1, archived: false,
    content: {
      name: `${account.firm} ${account.size / 1000}K`, size: String(account.size), type: 'prop', firm: account.firm,
      buffer: String(account.maxDrawdown), drawdown_mode: 'trailing', drawdown_locks_at_start: false,
      daily_limit: account.dailyLossLimit ? String(account.dailyLossLimit) : null,
      profit_target: account.target ? String(account.target - account.start) : null,
      payout_buffer: account.phase === 'Funded' ? String(Math.round(account.maxDrawdown + 100)) : null,
      split: account.phase === 'Funded' ? '0.9' : null,
      status: statusFromSeed(account), status_date: account.closed ?? null, status_notes: null, hwm_pnl: '0',
    },
    seed: { balance: account.balance, peak: account.floor + account.maxDrawdown, phase: account.phase },
  }))
  return [...prop, {
    id: 'personal-cash', revision: 1, archived: false,
    content: { name: 'Personal cash', size: '25000', type: 'personal', firm: null, buffer: null, drawdown_mode: 'trailing', drawdown_locks_at_start: false, daily_limit: null, profit_target: null, payout_buffer: null, split: null, status: 'active', status_date: null, status_notes: null, hwm_pnl: '0' },
    seed: { balance: null, peak: null },
  }]
}
let accountCache = { raw: undefined, list: null }
export const loadAccounts = () => {
  let raw = null
  try { raw = localStorage.getItem(KEYS.accounts) } catch { /* storage unavailable */ }
  if (accountCache.list && accountCache.raw === raw) return accountCache.list
  let list = null
  try { list = raw ? JSON.parse(raw) : null } catch { list = null }
  accountCache = { raw, list: list ?? seedAccounts() }
  return accountCache.list
}
export const saveAccounts = (list) => writeJSON(KEYS.accounts, list)

/** Accounts a sample trade can belong to: open (not blown) seed accounts. */
let tradePool = null
const tradeAccounts = () => (tradePool ??= seedAccounts().filter((account) => !['blown', 'failed-eval'].includes(account.content.status)))
export function accountForTrade(trade) {
  const all = loadAccounts()
  if (trade.account) return all.find((account) => account.id === trade.account) ?? null
  const pool = tradeAccounts()
  const pick = pool[hashOf(trade.id) % pool.length]
  return all.find((account) => account.id === pick.id) ?? pick
}

/* ------------------------------------------------------------------ fills */

const isoAt = (date, clock, seconds = 0) => `${date}T${clock}:${pad2(seconds)}`

/** The fills behind a trade: stored ones for imported / converted trades, otherwise a sample set. */
export function fillsFor(trade) {
  if (trade.fills?.length) return trade.fills
  if (trade.logged) return []
  const random = seeded(trade.id)
  const buy = trade.side === 'Long'
  // Fees chosen so the fills reproduce the journal's net P&L to the cent.
  const implied = round((trade.exit - trade.entry) * trade.qty * (buy ? 1 : -1) - trade.pnl)
  const feeTotal = implied >= 0 && Math.abs(implied - trade.fees) < 5 ? implied : trade.fees
  const entryFee = round(feeTotal / 2)
  const exitFee = round(feeTotal - entryFee)
  const secondsIn = Math.floor(random() * 50)
  const entry = { id: `${trade.id}-f1`, side: buy ? 'buy' : 'sell', quantity: trade.qty, price: trade.entry, fee: entryFee, currency: 'USD', executed_at: isoAt(trade.date, trade.time, secondsIn), source: 'import', file_name: `statement-${trade.date.slice(0, 7)}.csv`, row_number: 2 + (hashOf(trade.id) % 60), source_execution_id: String(80000000 + (hashOf(trade.id) % 9999999)) }
  const closed = trade.closed || trade.time
  const scaled = trade.qty % 2 === 0 && trade.qty >= 2 && random() < 0.42 && minutesOf(closed) - minutesOf(trade.time) >= 4
  if (!scaled) {
    return [entry, { ...entry, id: `${trade.id}-f2`, side: buy ? 'sell' : 'buy', price: trade.exit, fee: exitFee, executed_at: isoAt(trade.date, closed, Math.floor(random() * 50)), row_number: entry.row_number + 1, source_execution_id: String(Number(entry.source_execution_id) + 1) }]
  }
  const half = trade.qty / 2
  const spread = round(Math.max(0.01, Math.abs(trade.exit - trade.entry) * 0.35))
  const firstPrice = round(trade.exit - (trade.pnl >= 0 ? 1 : -1) * (buy ? spread : -spread))
  const secondPrice = round(2 * trade.exit - firstPrice)
  const midClock = clockFrom(Math.round((minutesOf(trade.time) + minutesOf(closed)) / 2))
  const exitSide = buy ? 'sell' : 'buy'
  return [
    entry,
    { ...entry, id: `${trade.id}-f2`, side: exitSide, quantity: half, price: firstPrice, fee: round(exitFee / 2), executed_at: isoAt(trade.date, midClock, Math.floor(random() * 50)), row_number: entry.row_number + 1, source_execution_id: String(Number(entry.source_execution_id) + 1) },
    { ...entry, id: `${trade.id}-f3`, side: exitSide, quantity: half, price: secondPrice, fee: round(exitFee - round(exitFee / 2)), executed_at: isoAt(trade.date, closed, Math.floor(random() * 50)), row_number: entry.row_number + 2, source_execution_id: String(Number(entry.source_execution_id) + 2) },
  ]
}

/** FIFO realized P&L for one trade's fills. */
export function fifo(fills, multiplier = 1) {
  const ordered = [...fills].sort((a, b) => a.executed_at.localeCompare(b.executed_at))
  if (!ordered.length) return null
  const dir = ordered[0].side === 'buy' ? 1 : -1
  const lots = []
  let gross = 0; let fees = 0; let entryQty = 0; let entryCost = 0; let exitQty = 0; let exitCost = 0; let exits = 0; let reversal = false
  const roles = new Map()
  ordered.forEach((fill) => {
    const qty = Number(fill.quantity); const price = Number(fill.price)
    fees += Number(fill.fee) || 0
    const opening = (fill.side === 'buy' ? 1 : -1) === dir
    if (opening) { lots.push({ qty, price }); entryQty += qty; entryCost += qty * price; roles.set(fill.id, 'entry'); return }
    let left = qty
    while (left > 1e-9 && lots.length) {
      const lot = lots[0]
      const take = Math.min(lot.qty, left)
      gross += (price - lot.price) * take * multiplier * dir
      lot.qty -= take; left -= take
      if (lot.qty <= 1e-9) lots.shift()
    }
    if (left > 1e-9) reversal = true
    exits += 1; exitQty += qty - left; exitCost += (qty - left) * price
    roles.set(fill.id, 'exit')
  })
  const open = lots.reduce((total, lot) => total + lot.qty, 0)
  const first = ordered[0].executed_at; const last = ordered[ordered.length - 1].executed_at
  const secondsBetween = (Date.parse(`${last}Z`) - Date.parse(`${first}Z`)) / 1000
  let exitIndex = 0
  const exitCount = [...roles.values()].filter((role) => role === 'exit').length
  const roleOf = Object.fromEntries(ordered.map((fill) => {
    if (roles.get(fill.id) !== 'exit') return [fill.id, 'Entry']
    exitIndex += 1
    return [fill.id, exitCount === 1 ? 'Exit' : `Partial exit ${exitIndex} of ${exitCount}`]
  }))
  return {
    direction: dir === 1 ? 'long' : 'short', reversal, open, closed: open <= 1e-9,
    entryQty, averageEntry: entryQty ? entryCost / entryQty : null,
    exitQty, averageExit: exitQty ? exitCost / exitQty : null, exits,
    gross: round(gross, 6), fees: round(fees, 6), net: round(gross - fees, 6),
    holdingSeconds: open <= 1e-9 ? secondsBetween : null, roleOf, first, last,
  }
}

/* ------------------------------------------------------------------ plan & review */

export const readReviews = () => readJSON(KEYS.reviews, {})
/** Sample plan: a stop that risks about $100–$240 on the position, and a 2R target. */
export function samplePlan(trade) {
  const risk = 100 + (hashOf(`${trade.id}-risk`) % 140)
  const mult = trade.multiplier ?? 1
  const distance = Math.max(0.01, round(risk / (trade.qty * mult)))
  const dir = trade.side === 'Long' ? 1 : -1
  return { stop: round(trade.entry - dir * distance), target: round(trade.entry + dir * distance * 2) }
}
export const stopFor = (trade, review) => {
  const typed = Number(review?.stop)
  return review?.stop != null && review.stop !== '' && Number.isFinite(typed) ? typed : samplePlan(trade).stop
}
/** Realized R = net P&L / (|avg entry − stop| × qty × multiplier). */
export function realizedR(trade, review) {
  const stop = stopFor(trade, review)
  const risk = Math.abs(trade.entry - stop) * trade.qty * (trade.multiplier ?? 1)
  return risk > 0 ? trade.pnl / risk : null
}

/** Position sizer: risk per unit = |entry − stop| × point value; quantity rounded down. */
export function sizePosition({ entry, stop, symbol, mode, budget, balance }) {
  const entryPrice = Number(entry); const stopPrice = Number(stop); const amount = Number(budget)
  if (!(entryPrice > 0) || !Number.isFinite(stopPrice) || !(amount > 0)) return { error: 'Enter an entry, a stop and a risk budget above zero.' }
  if (entryPrice === stopPrice) return { error: 'The stop has to differ from the entry.' }
  const pointValue = pointValueFor(symbol)
  const perUnit = Math.abs(entryPrice - stopPrice) * pointValue
  const money = mode === 'percent' ? (Number(balance) || 0) * (amount / 100) : amount
  const quantity = Math.floor(money / perUnit + 1e-9)
  return { quantity, risk: round(quantity * perUnit), budget: round(money), perUnit: round(perUnit, 4), pointValue, futures: isFuture(symbol), unit: isFuture(symbol) ? 'contracts' : 'shares', balance: mode === 'percent' ? balance : null }
}

/* ------------------------------------------------------------------ price bars */

/** One-minute sample bars around a trade that pass through every fill. */
export function barsFor(trade, fills) {
  const random = seeded(`${trade.id}-bars`)
  const normal = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, random()))) * Math.cos(2 * Math.PI * random())
  const ordered = [...fills].sort((a, b) => a.executed_at.localeCompare(b.executed_at))
  const startMin = minutesOf(clockOf(ordered[0].executed_at))
  const endMin = minutesOf(clockOf(ordered[ordered.length - 1].executed_at))
  const from = Math.max(9 * 60 + 30, startMin - 12)
  const to = Math.min(16 * 60, Math.max(endMin + 10, from + 24))
  const anchor = Number(ordered[0].price)
  const sigma = Math.max(0.01, anchor * 0.00055)
  const anchors = new Map()
  ordered.forEach((fill) => anchors.set(minutesOf(clockOf(fill.executed_at)), Number(fill.price)))
  const keys = [...anchors.keys()].sort((a, b) => a - b)
  // Bridge between fill prices, free walk outside them.
  const closes = []
  let price = anchor + normal() * sigma * 3
  for (let minute = from; minute <= to; minute += 1) {
    const next = keys.find((key) => key >= minute)
    if (minute < keys[0]) {
      const steps = keys[0] - minute
      price += ((anchor - price) / (steps + 1)) + normal() * sigma
    } else if (next != null) {
      const prev = [...keys].reverse().find((key) => key <= minute)
      const target = anchors.get(next)
      const steps = next - minute
      price = anchors.has(minute) ? anchors.get(minute) + normal() * sigma * 0.6 : price + ((target - price) / (steps + 1)) + normal() * sigma * 1.1
      if (prev != null && prev === minute) price = anchors.get(minute) + normal() * sigma * 0.5
    } else {
      price += normal() * sigma
    }
    closes.push(price)
  }
  let open = closes[0] - normal() * sigma
  return closes.map((close, index) => {
    const minute = from + index
    let high = Math.max(open, close) + Math.abs(normal()) * sigma * 0.8
    let low = Math.min(open, close) - Math.abs(normal()) * sigma * 0.8
    if (anchors.has(minute)) { high = Math.max(high, anchors.get(minute)); low = Math.min(low, anchors.get(minute)) }
    ordered.forEach((fill) => {
      if (minutesOf(clockOf(fill.executed_at)) === minute) { high = Math.max(high, Number(fill.price)); low = Math.min(low, Number(fill.price)) }
    })
    const bar = { key: isoAt(trade.date, clockFrom(minute)), minute, open: round(open), high: round(high), low: round(low), close: round(close) }
    open = close
    return bar
  })
}

/** Index of the last bar whose time is at or before the fill. */
export const barIndex = (bars, fill) => {
  const minute = minutesOf(clockOf(fill.executed_at))
  let found = 0
  bars.forEach((bar, index) => { if (bar.minute <= minute) found = index })
  return found
}

/* ------------------------------------------------------------------ trade store */

const persistLogged = () => writeJSON(KEYS.logged, tradeLog.filter((trade) => trade.logged))

export function addTrades(list) {
  list.forEach((trade) => tradeLog.push(trade))
  tradeLog.sort((a, b) => a.timestamp - b.timestamp)
  persistLogged()
}
export function removeTrades(ids) {
  const drop = new Set(ids)
  for (let index = tradeLog.length - 1; index >= 0; index -= 1) if (drop.has(tradeLog[index].id)) tradeLog.splice(index, 1)
  persistLogged()
}
export function replaceTrade(id, next) {
  const index = tradeLog.findIndex((trade) => trade.id === id)
  if (index >= 0) tradeLog[index] = next
  tradeLog.sort((a, b) => a.timestamp - b.timestamp)
  persistLogged()
}

/**
 * Groups fills flat-to-flat per symbol, currency and multiplier. Open positions and
 * fills that reverse through flat stay ungrouped (with their closing / opening split).
 */
export function groupFills(fills) {
  const byKey = new Map()
  fills.forEach((fill) => {
    const key = `${fill.symbol}|${fill.currency}|${fill.multiplier}`
    byKey.set(key, [...(byKey.get(key) || []), fill])
  })
  const groups = []; const ungrouped = []
  byKey.forEach((list) => {
    let position = 0; let current = []; let tainted = false
    list.sort((a, b) => a.executed_at.localeCompare(b.executed_at)).forEach((fill) => {
      const signed = (fill.side === 'buy' ? 1 : -1) * Number(fill.quantity)
      const next = round(position + signed, 8)
      if (position !== 0 && next !== 0 && Math.sign(next) !== Math.sign(position)) {
        ungrouped.push(...current.map((item) => ({ ...item })), { ...fill, reversing: { closing: Math.abs(position), opening: Math.abs(next) } })
        current = []; tainted = true; position = next
        return
      }
      position = next
      if (tainted) { ungrouped.push({ ...fill }); if (position === 0) tainted = false; return }
      current.push(fill)
      if (position === 0) { groups.push(current); current = [] }
    })
    ungrouped.push(...current.map((item) => ({ ...item })))
  })
  return { groups, ungrouped }
}

/** A journal trade built from one flat-to-flat group of fills. */
export function tradeFromFills(fills, meta = {}) {
  const ordered = [...fills].sort((a, b) => a.executed_at.localeCompare(b.executed_at))
  const multiplier = Number(ordered[0].multiplier) || 1
  const pnl = fifo(ordered, multiplier)
  const first = ordered[0]; const last = ordered[ordered.length - 1]
  const [date, clock] = [first.executed_at.slice(0, 10), clockOf(first.executed_at)]
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = clock.split(':').map(Number)
  return {
    id: meta.id ?? `${date}-x${uid('t').slice(2)}`, date, time: clock, closed: clockOf(last.executed_at), hour,
    timestamp: Date.UTC(year, month - 1, day, hour, minute),
    symbol: first.symbol, side: pnl.direction === 'long' ? 'Long' : 'Short',
    setup: meta.setup ?? 'Imported', code: meta.code ?? 'IMP', grade: meta.grade ?? 'B',
    qty: pnl.entryQty, entry: round(pnl.averageEntry, 4), exit: round(pnl.averageExit ?? pnl.averageEntry, 4),
    fees: round(pnl.fees), pnl: round(pnl.net), win: pnl.net > 0,
    multiplier, fills: ordered, account: meta.account ?? first.account_id ?? null, batch: meta.batch ?? null, logged: true, source: 'executions',
  }
}

/* ------------------------------------------------------------------ import batches */

export const loadBatches = () => readJSON(KEYS.batches, [])
export const saveBatches = (list) => writeJSON(KEYS.batches, list)
export const loadUngrouped = () => readJSON(KEYS.ungrouped, [])
export const saveUngrouped = (list) => writeJSON(KEYS.ungrouped, list)

/** Records fills as one undoable batch: flat-to-flat groups become trades, the rest wait ungrouped. */
export function recordBatch({ fileName, fills, counts, account = null, replaces = null, meta = {} }) {
  const batchId = uid('batch')
  const stamped = fills.map((fill) => ({ ...fill, id: fill.id ?? uid('fill'), batch: batchId, account_id: account }))
  const pool = [...loadUngrouped().filter((fill) => stamped.some((item) => item.symbol === fill.symbol)), ...stamped]
  const { groups, ungrouped } = groupFills(pool)
  const trades = groups.map((group, index) => tradeFromFills(group, { ...meta, account, batch: batchId, id: replaces && index === 0 ? replaces.id : undefined }))
  if (replaces) replaceTrade(replaces.id, { ...trades[0], setup: replaces.setup, code: replaces.code, grade: replaces.grade })
  addTrades(replaces ? trades.slice(1) : trades)
  const keep = loadUngrouped().filter((fill) => !pool.some((item) => item.id === fill.id))
  saveUngrouped([...keep, ...ungrouped])
  const batch = {
    id: batchId, revision: 1, file_name: fileName, created_at: new Date().toISOString(), status: 'committed',
    counts: { new: stamped.length, duplicate: counts?.duplicate ?? 0 }, trade_ids: trades.map((trade) => trade.id),
    fills: stamped, replaced: replaces ?? null,
  }
  saveBatches([batch, ...loadBatches()])
  notifyData()
  return batch
}

export function undoBatch(id) {
  const batches = loadBatches()
  const batch = batches.find((item) => item.id === id)
  if (!batch || batch.status !== 'committed') return null
  if (batch.replaced) {
    replaceTrade(batch.replaced.id, batch.replaced)
    removeTrades(batch.trade_ids.filter((tradeId) => tradeId !== batch.replaced.id))
  } else removeTrades(batch.trade_ids)
  saveUngrouped(loadUngrouped().filter((fill) => fill.batch !== id))
  const next = { ...batch, status: 'undone', revision: batch.revision + 1 }
  saveBatches(batches.map((item) => (item.id === id ? next : item)))
  notifyData()
  return next
}

/** Fingerprints of every fill already in the journal, for duplicate detection. */
export function knownFills() {
  const ids = new Set(); const shapes = new Set()
  loadBatches().filter((batch) => batch.status === 'committed').forEach((batch) => batch.fills.forEach((fill) => {
    if (fill.source_execution_id) ids.add(String(fill.source_execution_id))
    shapes.add(`${fill.executed_at}|${fill.symbol}|${fill.side}|${Number(fill.quantity)}|${Number(fill.price)}`)
  }))
  return { ids, shapes }
}

/* ------------------------------------------------------------------ flash
 * Saving data remounts the page (App re-keys <main> on `journal:data`), so a status
 * line meant for after the save rides through sessionStorage.
 */
export const setFlash = (key, value) => { try { sessionStorage.setItem(`flash:${key}`, JSON.stringify(value)) } catch { /* ignore */ } }
export const peekFlash = (key) => { try { return JSON.parse(sessionStorage.getItem(`flash:${key}`)) } catch { return null } }
export const clearFlash = (key) => { try { sessionStorage.removeItem(`flash:${key}`) } catch { /* ignore */ } }
