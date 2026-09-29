/**
 * Local stand-in for the weekly review queue. Weeks are ISO weeks (Monday–Sunday, UTC)
 * derived from the trade log; notes, theses and follow-ups plus a few past reviews are
 * seeded so every queue state (reviewed, not covered, out of date, empty) can be seen.
 */
import { tradeLog } from '../data'

const STORE = 'cc-weekly-reviews'
const read = () => { try { return JSON.parse(localStorage.getItem(STORE)) } catch { return null } }
const write = (value) => { try { localStorage.setItem(STORE, JSON.stringify(value)) } catch { /* storage unavailable */ } }
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const DAY = 86400000

export class ConflictError extends Error {
  constructor(message = 'Conflict') { super(message); this.conflict = true }
}

/* ------------------------------------------------------------------ ISO weeks */

export function isoWeek(iso) {
  const date = new Date(`${iso}T00:00:00Z`)
  const weekday = (date.getUTCDay() + 6) % 7
  const thursday = new Date(date.getTime() + (3 - weekday) * DAY)
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((thursday.getTime() - yearStart) / DAY + 1) / 7)
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
const mondayOf = (iso) => {
  const date = new Date(`${iso}T00:00:00Z`)
  return new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10)
}
const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10)
export const todayIso = () => new Date().toISOString().slice(0, 10)

/* ------------------------------------------------------------------ records */

/** Trades carry a revision; a couple were edited after they were reviewed. */
const firstTradeOn = (date) => tradeLog.find((trade) => trade.date === date)?.id
const EDITED = { [firstTradeOn('2026-09-08')]: 2 }
export const tradeRevision = (trade) => EDITED[trade.id] ?? 1
export const tradeLabel = (trade, money) => `${trade.symbol ?? 'No symbol'} ${money(trade.pnl)} · ${trade.date}`

/** Journal notes: plain notes, theses and follow-ups, each revisioned. */
export const ENTRIES = [
  { entry_id: 'n-7a1c3e90', title: 'Tariff headlines — size down into CPI', kind: 'thesis', date: '2026-08-05', revision: 2, created: '2026-08-05T13:00:00Z' },
  { entry_id: 'n-2b8d4f11', title: 'Why I keep fading strength before 10:00', kind: 'note', date: '2026-08-06', revision: 1, created: '2026-08-06T21:10:00Z' },
  { entry_id: 'n-94c02a7e', title: 'Semis leadership rotation', kind: 'thesis', date: '2026-08-12', revision: 3, created: '2026-08-12T12:40:00Z' },
  { entry_id: 'n-c51e8b02', title: 'Re-test the VWAP reclaim rules on 5-minute bars', kind: 'follow-up', date: '2026-08-14', revision: 1, created: '2026-08-14T20:30:00Z' },
  { entry_id: 'n-0f3a6d45', title: 'Week of the Jackson Hole chop', kind: 'note', date: '2026-08-21', revision: 1, created: '2026-08-21T20:05:00Z' },
  { entry_id: 'n-e7b9c318', title: 'Stop trading the first 5 minutes?', kind: 'follow-up', date: '2026-08-26', revision: 2, created: '2026-08-26T19:15:00Z' },
  { entry_id: 'n-58d1e6a0', title: 'Jobs-day plan and what actually happened', kind: 'note', date: '2026-09-04', revision: 1, created: '2026-09-04T21:00:00Z' },
  { entry_id: 'n-a3f47c29', title: 'Mega-cap tech into the Fed', kind: 'thesis', date: '2026-09-09', revision: 2, created: '2026-09-09T12:20:00Z' },
  { entry_id: 'n-6c20b9d4', title: 'Check fill quality on AAPL limit exits', kind: 'follow-up', date: '2026-09-11', revision: 1, created: '2026-09-13T15:00:00Z' },
  { entry_id: 'n-d8e15a73', title: 'FOMC week: range until proven otherwise', kind: 'thesis', date: '2026-09-15', revision: 1, created: '2026-09-15T12:00:00Z' },
  { entry_id: 'n-1b6f9e22', title: 'Moved a stop on AMD — write the rule down', kind: 'follow-up', date: '2026-09-16', revision: 1, created: '2026-09-16T20:45:00Z' },
  { entry_id: 'n-4e7a0c58', title: 'Friday session review', kind: 'note', date: '2026-09-18', revision: 2, created: '2026-09-18T21:30:00Z' },
]
/** Theses and follow-ups that were closed; they drop off the open lists. */
const CLOSED = new Set(['n-7a1c3e90'])

const PROMPTS = 'What happened:\n\nProcess (followed / broke rules):\n\nOutcome vs plan:\n\nLesson and next action:\n'
export const REVIEW_PROMPTS = PROMPTS

const tradesIn = (start, end) => tradeLog.filter((trade) => trade.date >= start && trade.date <= end)
const pin = (list) => list.map((item) => ({ id: item.id ?? item.entry_id, revision: item.revision ?? 1 }))

/** Past reviews, as the server would hold them: the latest revision plus its history. */
function seedReviews() {
  const at = (week) => { const start = mondayOf(week); return { start, end: addDays(start, 6) } }
  const weekEntries = (start, end) => ENTRIES.filter((entry) => entry.date >= start && entry.date <= end)
  const make = (anchor, savedAt, notes, { dropTrades = 0, extraEntries = [], history = [], revision = 1 } = {}) => {
    const { start, end } = at(anchor)
    const trades = tradesIn(start, end).slice(0, Math.max(0, tradesIn(start, end).length - dropTrades))
    return {
      revision, saved_at: savedAt,
      content: { notes, trades: trades.map((trade) => ({ id: trade.id, revision: 1 })), entries: [...pin(weekEntries(start, end)), ...extraEntries] },
      history,
    }
  }
  return {
    [isoWeek('2026-08-10')]: make('2026-08-10', '2026-08-16T18:20:00Z',
      'What happened:\nSemis carried the week; I was early on two fades.\n\nProcess (followed / broke rules):\nKept size inside limits every day. Broke the 10:00 rule twice.\n\nOutcome vs plan:\nGreen week, but the plan said fewer trades.\n\nLesson and next action:\nNo fades before 10:00 — write it into the checklist.\n'),
    [isoWeek('2026-08-17')]: make('2026-08-17', '2026-08-23T17:05:00Z',
      'What happened:\nJackson Hole chop. Two red days in a row.\n\nProcess (followed / broke rules):\nStopped at the loss limit both days.\n\nOutcome vs plan:\nSmall red week, inside the drawdown budget.\n\nLesson and next action:\nHalf size on event weeks.\n',
      { revision: 2, history: [{ revision: 1, saved_at: '2026-08-22T20:40:00Z', notes: 'What happened:\nChop.\n\nLesson and next action:\nHalf size on event weeks.\n' }] }),
    [isoWeek('2026-08-31')]: make('2026-08-31', '2026-09-06T16:45:00Z',
      'What happened:\nJobs day went badly — traded the first 15 minutes.\n\nProcess (followed / broke rules):\nBroke the wait rule; respected stops.\n\nOutcome vs plan:\nRed week driven by one day.\n\nLesson and next action:\nNo trades before 9:45 on data days.\n',
      { dropTrades: 1 }),
    [isoWeek('2026-09-07')]: make('2026-09-07', '2026-09-12T19:30:00Z',
      'What happened:\nMega-cap tech ran into the Fed; SPY short was the week.\n\nProcess (followed / broke rules):\nClean — every stop honoured.\n\nOutcome vs plan:\nAhead of plan.\n\nLesson and next action:\nKeep the Friday review short.\n',
      { extraEntries: [{ id: 'n-f09b1d67', revision: 1 }] }),
  }
}

export const readReviews = () => read() || seedReviews()

/* ------------------------------------------------------------------ queue */

function itemState(id, revision, coverage) {
  const pinned = coverage.get(id)
  if (!pinned) return { state: 'unreviewed' }
  if (pinned.revision !== revision) return { state: 'changed', pinned_revision: pinned.revision, week: pinned.week }
  return { state: 'reviewed', week: pinned.week }
}

/** The queue: the last `count` ISO weeks up to today's, newest first, plus open theses and follow-ups. */
export function reviewQueue(count = 8) {
  const reviews = readReviews()
  const currentMonday = mondayOf(todayIso())
  const allCoverage = new Map()
  Object.entries(reviews).sort(([a], [b]) => a.localeCompare(b)).forEach(([week, review]) => {
    review.content.entries.forEach((item) => allCoverage.set(item.id, { ...item, week }))
  })
  const weeks = Array.from({ length: count }, (_, index) => {
    const starts_on = addDays(currentMonday, -7 * index)
    const ends_on = addDays(starts_on, 6)
    const week = isoWeek(starts_on)
    const review = reviews[week] ? { ...reviews[week], week } : null
    const coverage = new Map()
    review?.content.trades.forEach((item) => coverage.set(item.id, { ...item, week }))
    review?.content.entries.forEach((item) => coverage.set(item.id, { ...item, week }))
    const trades = tradesIn(starts_on, ends_on).map((trade) => ({ trade, review: itemState(trade.id, tradeRevision(trade), coverage) }))
    const entries = ENTRIES.filter((entry) => entry.date >= starts_on && entry.date <= ends_on).map((entry) => ({ ...entry, review: itemState(entry.entry_id, entry.revision, coverage) }))
    const stale_items = []
    if (review) {
      trades.filter((item) => item.review.state === 'changed').forEach((item) => stale_items.push({ kind: 'trade', id: item.trade.id, reason: 'changed', pinned_revision: item.review.pinned_revision, current_revision: tradeRevision(item.trade) }))
      entries.filter((item) => item.review.state === 'changed').forEach((item) => stale_items.push({ kind: 'entry', id: item.entry_id, reason: 'changed', pinned_revision: item.review.pinned_revision, current_revision: item.revision }))
      const known = new Set([...trades.map((item) => item.trade.id), ...ENTRIES.map((entry) => entry.entry_id)])
      ;[...review.content.trades.map((item) => ['trade', item]), ...review.content.entries.map((item) => ['entry', item])]
        .filter(([, item]) => !known.has(item.id)).forEach(([kind, item]) => stale_items.push({ kind, id: item.id, reason: 'removed' }))
      entries.filter((item) => item.review.state === 'unreviewed' && item.created > review.saved_at).forEach((item) => stale_items.push({ kind: 'entry', id: item.entry_id, reason: 'added' }))
      trades.filter((item) => item.review.state === 'unreviewed' && item.trade.logged).forEach((item) => stale_items.push({ kind: 'trade', id: item.trade.id, reason: 'added' }))
    }
    const pending = [...trades, ...entries].filter((item) => item.review.state === 'unreviewed').length
    return {
      week, starts_on, ends_on, trades, entries, review, stale_items, pending,
      review_status: !review ? null : stale_items.length ? 'out_of_date' : 'current',
    }
  })
  const open = (kind) => ENTRIES.filter((entry) => entry.kind === kind && !CLOSED.has(entry.entry_id))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((entry) => ({ ...entry, review: itemState(entry.entry_id, entry.revision, allCoverage) }))
  return { weeks, open_theses: open('thesis'), follow_ups: open('follow-up'), open_items_truncated: false }
}

/* ------------------------------------------------------------------ commands */

/** POST /reviews (first review) or /reviews/{week}/revisions (with expected_revision). */
export async function saveReview(week, { expected_revision = 0, content }) {
  await wait(650)
  const reviews = readReviews()
  const current = reviews[week]
  if ((current?.revision ?? 0) !== expected_revision) throw new ConflictError()
  const history = current ? [{ revision: current.revision, saved_at: current.saved_at, notes: current.content.notes }, ...(current.history ?? [])] : []
  const next = { revision: expected_revision + 1, saved_at: new Date().toISOString(), content, history }
  write({ ...reviews, [week]: next })
  return next
}
