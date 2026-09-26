import { SETUP_CODES, buildTradeLog } from './analytics'

/* ------------------------------------------------------------ local store
 * Trades, payouts and accounts the user adds are kept in localStorage and merged into
 * the sample book at load. Every write fires `journal:data` so open pages re-derive.
 */
const STORE_KEYS = { trades: 'cc-logged-trades', accounts: 'cc-prop-accounts', ledger: 'cc-prop-ledger' }
const readStore = (key) => { try { return JSON.parse(localStorage.getItem(key)) || [] } catch { return [] } }
const writeStore = (key, list) => { try { localStorage.setItem(key, JSON.stringify(list)) } catch { /* storage unavailable */ } }
const notifyData = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('journal:data')) }

export const trades = [
  { symbol: 'NVDA', setup: 'Opening drive', side: 'Long', date: 'Sep 18', time: '10:04', pnl: 486.2, grade: 'A' },
  { symbol: 'TSLA', setup: 'VWAP reclaim', side: 'Long', date: 'Sep 17', time: '14:21', pnl: -142.8, grade: 'C' },
  { symbol: 'AMD', setup: 'Trend pullback', side: 'Long', date: 'Sep 16', time: '09:47', pnl: 230.78, grade: 'A' },
  { symbol: 'AAPL', setup: 'Range break', side: 'Short', date: 'Sep 15', time: '11:32', pnl: 136.38, grade: 'B' },
  { symbol: 'SPY', setup: 'Failed breakout', side: 'Short', date: 'Sep 12', time: '15:23', pnl: 1034.74, grade: 'A+' },
  { symbol: 'META', setup: 'Gap continuation', side: 'Long', date: 'Sep 11', time: '09:54', pnl: -347.3, grade: 'D' },
]

export const sessionFills = [
  { symbol: 'AMD', setup: 'Trend pullback', side: 'Long', time: '09:47', closed: '10:21', qty: 150, entry: 158.21, exit: 159.76, fees: 2.25, pnl: 230.78, grade: 'A' },
  { symbol: 'META', setup: 'Gap continuation', side: 'Long', time: '09:54', closed: '10:06', qty: 45, entry: 512.40, exit: 504.73, fees: 2.25, pnl: -347.3, grade: 'D' },
  { symbol: 'NVDA', setup: 'Opening drive', side: 'Long', time: '10:14', closed: '10:32', qty: 120, entry: 118.42, exit: 119.61, fees: 2.25, pnl: 140.55, grade: 'B' },
  { symbol: 'QQQ', setup: 'VWAP reclaim', side: 'Short', time: '10:48', closed: '11:05', qty: 100, entry: 489.30, exit: 488.62, fees: 2.25, pnl: 65.75, grade: 'A' },
  { symbol: 'AAPL', setup: 'Range break', side: 'Short', time: '11:32', closed: '12:09', qty: 200, entry: 228.94, exit: 228.25, fees: 2.25, pnl: 136.38, grade: 'B' },
  { symbol: 'TSLA', setup: 'Trend pullback', side: 'Long', time: '13:41', closed: '13:58', qty: 40, entry: 251.20, exit: 249.85, fees: 2.25, pnl: -56.25, grade: 'C' },
  { symbol: 'MSFT', setup: 'Range break', side: 'Long', time: '14:22', closed: '14:49', qty: 50, entry: 431.10, exit: 433.02, fees: 2.25, pnl: 93.75, grade: 'B' },
  { symbol: 'AMD', setup: 'Failed breakout', side: 'Short', time: '14:55', closed: '15:08', qty: 100, entry: 161.40, exit: 161.92, fees: 2.25, pnl: -54.25, grade: 'C' },
  { symbol: 'SPY', setup: 'Failed breakout', side: 'Short', time: '15:23', closed: '15:51', qty: 300, entry: 562.18, exit: 558.72, fees: 2.25, pnl: 1034.74, grade: 'A+' },
]


export const equityCurve = [12, 10, 15, 8, -4, -18, -24, -21, -15, -11, -14, -9, -12, 4, 28, 31, 43, 52, 63, 57, 73, 68, 91, 96, 101, 103, 99, 104, 102, 108, 105, 113, 111, 109, 116, 112, 128, 109, 115, 121, 118]
export const trendLine = [28, 35, 42, 40, 49, 55, 62, 68, 77, 72, 81, 73, 79, 71, 76, 69, 66, 72, 61, 58, 63, 57, 64, 55, 62, 54, 61, 50, 54, 46, 49, 43, 50, 55, 45, 51, 40]
export const avgLine = [-42, -15, -20, -12, -18, 8, 22, 84, 102, 97, 118, 147, 135, 176, 151, 188, 162, 221, 207, 174, 171, 119, 108, 145, 128, 113, 124, 98, 87, 61, 76, 45, 62, 38, 42, 19, 10, 36, 21, 13, 28, 16, 27, 15, 38, 52, 41, 19, 26]

export const activity = [
  ['NVDA', 'Today, 10:04', 486.2], ['TSLA', 'Yesterday, 14:21', -142.8], ['AMD', 'Sep 16, 09:47', 230.78],
  ['AAPL', 'Sep 15, 11:32', 136.38], ['SPY', 'Sep 12, 15:23', 1034.74], ['META', 'Sep 11, 09:54', -347.3],
]

export const accounts = [
  { name: 'Apex 50K', pct: 74, color: '#4da3ff' },
  { name: 'Apex 100K', pct: 41, color: '#8b7bf0' },
  { name: 'TopStep 150K', pct: 88, color: '#3dba39' },
  { name: 'Tradeify 50K', pct: 33, color: '#e8a33d' },
  { name: 'Personal cash', pct: 58, color: '#ef5b52' },
]

export const profile = {
  name: 'RNSENCE',
  caption: 'View account',
  discordId: '1221491991007989834',
  discordAvatar: '84a110c4c389947c81d65c878c148c9c',
}

/**
 * Canonical sample book every page reads from. The reviewed session on Sep 18 is the
 * hand-journaled day (sessionFills), so the dashboard, calendar and journal all agree.
 */
const REVIEWED_DAY = '2026-09-18'
const reviewedTrades = sessionFills.map((fill, index) => {
  const [hour, minute] = fill.time.split(':').map(Number)
  return {
    ...fill,
    id: `${REVIEWED_DAY}-r${index}`,
    date: REVIEWED_DAY,
    timestamp: Date.UTC(2026, 8, 18, hour, minute),
    hour,
    code: SETUP_CODES[fill.setup] ?? fill.setup.slice(0, 4).toUpperCase(),
    win: fill.pnl > 0,
  }
})
export const tradeLog = [...buildTradeLog().filter((trade) => trade.date !== REVIEWED_DAY), ...reviewedTrades, ...readStore(STORE_KEYS.trades)]
  .sort((a, b) => a.timestamp - b.timestamp)

/** Adds a hand-logged trade to the book; returns the stored trade. */
export function logTrade({ date, time, closed, symbol, side, setup, grade, qty, entry, exit, fees = 0 }) {
  const [hour, minute] = time.split(':').map(Number)
  const [year, month, day] = date.split('-').map(Number)
  const direction = side === 'Short' ? -1 : 1
  const pnl = Math.round(((exit - entry) * qty * direction - fees) * 100) / 100
  const trade = {
    id: `${date}-u${Date.now().toString(36)}`, date, time, closed: closed || time, hour,
    timestamp: Date.UTC(year, month - 1, day, hour, minute),
    symbol: symbol.toUpperCase(), side, setup, code: SETUP_CODES[setup] ?? setup.slice(0, 4).toUpperCase(), grade,
    qty, entry, exit, fees, pnl, win: pnl > 0, logged: true,
  }
  tradeLog.push(trade)
  tradeLog.sort((a, b) => a.timestamp - b.timestamp)
  writeStore(STORE_KEYS.trades, [...readStore(STORE_KEYS.trades), trade])
  notifyData()
  return trade
}

/** Every trading day in the book, oldest first. */
export const tradingDays = () => [...new Set(tradeLog.map((trade) => trade.date))].sort()

/** September 2026 as calendar cells, summed from the trade log. */
export const calendarDays = Array.from({ length: 30 }, (_, index) => {
  const date = `2026-09-${String(index + 1).padStart(2, '0')}`
  const list = tradeLog.filter((trade) => trade.date === date)
  if (!list.length) return { day: index + 1 }
  return { day: index + 1, date, trades: list.length, pnl: Math.round(list.reduce((total, trade) => total + trade.pnl, 0) * 100) / 100 }
})

/** The individual trades behind one calendar cell. */
export function dayEntries(day) {
  if (!day?.date) return []
  return tradeLog
    .filter((trade) => trade.date === day.date)
    .map((trade) => ({ id: trade.id, symbol: trade.symbol, time: trade.time, pnl: trade.pnl }))
}

/* ------------------------------------------------------------------ prop firms */

/** Funded and evaluation accounts. `floor` is the current liquidation level. */
export const propAccounts = [
  { id: 'PA-APEX-248193-03', firm: 'Apex', size: 50000, phase: 'Funded', status: 'Active', balance: 53184.2, start: 50000, floor: 52184.2, maxDrawdown: 2500, dailyLossLimit: 1000, target: null, fee: 35, payoutEligible: true },
  { id: 'EXPRESS-V2-248193-73015942', firm: 'Topstep', size: 150000, phase: 'Funded', status: 'Active', balance: 154612.5, start: 150000, floor: 152700.0, maxDrawdown: 4500, dailyLossLimit: 1800, target: null, fee: 199, payoutEligible: true },
  { id: 'APEX-248193-17', firm: 'Apex', size: 100000, phase: 'Evaluation', status: 'Active', balance: 101700.0, start: 100000, floor: 100700.0, maxDrawdown: 3000, dailyLossLimit: 1200, target: 106000, fee: 60, payoutEligible: false },
  { id: 'MFFUSFBLDR654871012', firm: 'MyFundedFutures', size: 100000, phase: 'Evaluation', status: 'Passed', balance: 106322.4, start: 100000, floor: 104822.4, maxDrawdown: 3000, dailyLossLimit: 1200, target: 106000, fee: 209, payoutEligible: false },
  { id: 'TDFYSEL50K00318462', firm: 'Tradeify', size: 50000, phase: 'Evaluation', status: 'Breached', balance: 47910.0, start: 50000, floor: 48000.0, maxDrawdown: 2000, dailyLossLimit: 800, target: 53000, fee: 139, payoutEligible: false },
  { id: 'PA-APEX-231877-01', firm: 'Apex', size: 50000, phase: 'Evaluation', status: 'Breached', balance: 47955.0, start: 50000, floor: 48000.0, maxDrawdown: 2000, dailyLossLimit: 800, target: 53000, fee: 35, payoutEligible: false, closed: '2026-05-14' },
  { id: 'EXPRESS-V2-231877-64029118', firm: 'Topstep', size: 50000, phase: 'Funded', status: 'Breached', balance: 47938.0, start: 50000, floor: 48000.0, maxDrawdown: 2000, dailyLossLimit: 800, target: null, fee: 49, payoutEligible: false, closed: '2026-06-02' },
  { id: 'MFFUSFSTR118420937', firm: 'MyFundedFutures', size: 100000, phase: 'Evaluation', status: 'Breached', balance: 96952.0, start: 100000, floor: 97000.0, maxDrawdown: 3000, dailyLossLimit: 1200, target: 106000, fee: 209, payoutEligible: false, closed: '2026-06-28' },
  { id: 'LCDSTR100K0084213', firm: 'Lucid', size: 100000, phase: 'Evaluation', status: 'Breached', balance: 97468.0, start: 100000, floor: 97500.0, maxDrawdown: 2500, dailyLossLimit: 1000, target: 106000, fee: 215, payoutEligible: false, closed: '2026-07-21' },
  ...readStore(STORE_KEYS.accounts),
]

/** Adds a prop account; evaluations get a 6% target and funded accounts start payout-ineligible. */
export function addPropAccount({ firm, id, size, phase, maxDrawdown, fee }) {
  const account = {
    id, firm, size, phase, status: 'Active', balance: size, start: size, floor: size - maxDrawdown, maxDrawdown,
    dailyLossLimit: Math.round((maxDrawdown * 0.4) / 50) * 50,
    target: phase === 'Evaluation' ? Math.round(size * 1.06) : null, payoutEligible: false,
  }
  propAccounts.push(account)
  writeStore(STORE_KEYS.accounts, [...readStore(STORE_KEYS.accounts), account])
  if (fee > 0) recordPropTransaction({ date: new Date().toISOString().slice(0, 10), firm, account: id, type: phase === 'Evaluation' ? 'Evaluation' : 'Activation', amount: -fee }, false)
  notifyData()
  return account
}

/** Records a payout (positive) or an expense (negative) against a prop account. */
export function recordPropTransaction(entry, notify = true) {
  propTransactions.push(entry)
  writeStore(STORE_KEYS.ledger, [...readStore(STORE_KEYS.ledger), entry])
  if (notify) notifyData()
  return entry
}

/** Cash in and out of the prop firms. Negative = money spent. */
export const propTransactions = [
  { date: '2026-04-02', firm: 'Apex', account: 'PA-APEX-248193-03', type: 'Evaluation', amount: -167 },
  { date: '2026-04-19', firm: 'Tradeify', account: 'TDFYSEL50K00318462', type: 'Evaluation', amount: -145 },
  { date: '2026-04-28', firm: 'Apex', account: 'PA-APEX-248193-03', type: 'Activation', amount: -85 },
  { date: '2026-05-03', firm: 'Topstep', account: 'EXPRESS-V2-248193-73015942', type: 'Subscription', amount: -149 },
  { date: '2026-05-21', firm: 'Tradeify', account: 'TDFYSEL50K00318462', type: 'Reset', amount: -99 },
  { date: '2026-05-30', firm: 'Apex', account: 'PA-APEX-248193-03', type: 'Payout', amount: 1200, status: 'Paid' },
  { date: '2026-06-03', firm: 'Topstep', account: 'EXPRESS-V2-248193-73015942', type: 'Subscription', amount: -149 },
  { date: '2026-06-12', firm: 'Topstep', account: 'EXPRESS-V2-248193-73015942', type: 'Activation', amount: -149 },
  { date: '2026-06-26', firm: 'Apex', account: 'PA-APEX-248193-03', type: 'Payout', amount: 1650, status: 'Paid' },
  { date: '2026-07-02', firm: 'Apex', account: 'APEX-248193-17', type: 'Evaluation', amount: -207 },
  { date: '2026-07-09', firm: 'MyFundedFutures', account: 'MFFUSFBLDR654871012', type: 'Evaluation', amount: -165 },
  { date: '2026-07-18', firm: 'Topstep', account: 'EXPRESS-V2-248193-73015942', type: 'Payout', amount: 2400, status: 'Paid' },
  { date: '2026-07-29', firm: 'Tradeify', account: 'TDFYSEL50K00318462', type: 'Reset', amount: -99 },
  { date: '2026-08-04', firm: 'Apex', account: 'APEX-248193-17', type: 'Subscription', amount: -207 },
  { date: '2026-08-14', firm: 'Apex', account: 'PA-APEX-248193-03', type: 'Payout', amount: 1980, status: 'Paid' },
  { date: '2026-08-22', firm: 'MyFundedFutures', account: 'MFFUSFBLDR654871012', type: 'Subscription', amount: -165 },
  { date: '2026-08-28', firm: 'Topstep', account: 'EXPRESS-V2-248193-73015942', type: 'Payout', amount: 3100, status: 'Paid' },
  { date: '2026-09-02', firm: 'Apex', account: 'APEX-248193-17', type: 'Subscription', amount: -207 },
  { date: '2026-09-08', firm: 'Tradeify', account: 'TDFYSEL50K00318462', type: 'Evaluation', amount: -145 },
  { date: '2026-09-11', firm: 'Apex', account: 'PA-APEX-248193-03', type: 'Payout', amount: 2150, status: 'Paid' },
  { date: '2026-09-16', firm: 'Topstep', account: 'EXPRESS-V2-248193-73015942', type: 'Payout', amount: 1850, status: 'Pending' },
  { date: '2026-09-17', firm: 'MyFundedFutures', account: 'MFFUSFBLDR654871012', type: 'Activation', amount: -130 },
  ...readStore(STORE_KEYS.ledger),
]
