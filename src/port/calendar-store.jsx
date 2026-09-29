/**
 * Local stand-in for the day journal and routine commands. Day records and the routine
 * are revisioned like the monolith's (`expected_revision` must match or the save is a
 * conflict), kept in localStorage and seeded so the calendar has history to show.
 */
import { tradeLog } from '../data'

const DAY_KEY = (date) => `cc-day-${date}`
const ROUTINE_KEY = 'cc-routine'
const read = (key) => { try { return JSON.parse(localStorage.getItem(key)) } catch { return null } }
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ } }
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export class ConflictError extends Error {
  constructor(message = 'Conflict') { super(message); this.conflict = true }
}

/* ------------------------------------------------------------------ routine */

/** The first five match the Daily journal's execution checklist, in its order. */
const JOURNAL_HABITS = ['h-plan', 'h-stops', 'h-size', 'h-fomo', 'h-time']
const SEED_ROUTINE = {
  revision: 3,
  habits: [
    { habit_id: 'h-plan', text: 'Followed the written plan', archived: false },
    { habit_id: 'h-stops', text: 'Respected every stop', archived: false },
    { habit_id: 'h-size', text: 'Sized within risk limits', archived: false },
    { habit_id: 'h-fomo', text: 'No revenge or FOMO trades', archived: false },
    { habit_id: 'h-time', text: 'Stopped at the planned time', archived: false },
    { habit_id: 'h-first5', text: 'No trades in the first 5 minutes', archived: true },
  ],
}
export const readRoutine = () => read(ROUTINE_KEY) || SEED_ROUTINE

export async function saveRoutine({ expected_revision, content }) {
  await wait(420)
  const current = readRoutine()
  if (current.revision !== expected_revision) throw new ConflictError()
  const next = { revision: current.revision + 1, habits: content.habits }
  write(ROUTINE_KEY, next)
  return next
}

/* ------------------------------------------------------------------ days */

export const EMPTY_DAY = { plan: '', recap: '', mood: null, discipline: null, checks: [], missed: [] }

/** The Daily journal's hand-seeded checklist days (same values it shows). */
const SAMPLE_CHECKS = {
  '2026-09-14': [true, true, true, true, true], '2026-09-15': [true, true, false, true, true],
  '2026-09-16': [true, false, true, false, true], '2026-09-17': [true, true, true, true, true],
  '2026-09-18': [true, true, true, false, true],
}

const SEED_DAYS = {
  '2026-09-18': { revision: 2, content: {
    plan: 'SPY 560 is the line. Short failed pushes into 562–563 with VWAP overhead; no longs under VWAP. Max 3 losses, flat by 15:55.',
    recap: 'Opening was choppy — the META gap trade was a C setup I took anyway. Best trade of the week on the late SPY failed breakout; waited for the retest instead of chasing.',
    mood: 4, discipline: 4, checks: [],
    missed: [{ symbol: 'NVDA', direction: 'long', playbook_id: 'Opening drive', entry: '118.10', stop: '117.60', target: '119.60', reason: 'Was still managing META; did not want two positions open.', potential_r: '3.00' }],
  } },
  '2026-09-17': { revision: 1, content: {
    plan: 'Trend day candidate after CPI. Buy pullbacks to the 9 EMA in NVDA/AAPL only.',
    recap: 'Stuck to the two names. Clean day, sized down after the first win like planned.',
    mood: 5, discipline: 5, checks: [], missed: [],
  } },
  '2026-09-16': { revision: 1, content: {
    plan: 'Range day expected ahead of FOMC. Fade the extremes, half size.',
    recap: 'Moved my AMD stop once — exactly what the plan said not to do. Took a revenge QQQ short after.',
    mood: 2, discipline: 2, checks: [],
    missed: [{ symbol: 'AAPL', direction: 'short', playbook_id: 'Range break', entry: '229.40', stop: '229.90', target: '228.10', reason: 'Hesitated after the AMD loss.', potential_r: '2.60' }],
  } },
  '2026-09-15': { revision: 1, content: { plan: 'Gap-and-go watch list: META, AAPL. Nothing before 9:35.', recap: '', mood: 3, discipline: 4, checks: [], missed: [] } },
  '2026-09-14': { revision: 1, content: { plan: '', recap: 'Quiet Monday, two AAPL scalps and a small META loss. Good patience.', mood: 4, discipline: 4, checks: [], missed: [] } },
  '2026-09-10': { revision: 1, content: { plan: 'Only NVDA today — one A setup or nothing.', recap: 'One trade, as planned.', mood: 4, discipline: 5, checks: [], missed: [] } },
  '2026-09-04': { revision: 1, content: { plan: 'Jobs report. Wait 15 minutes.', recap: 'Did not wait. Three QQQ losses in the first hour.', mood: 2, discipline: 1, checks: [],
    missed: [{ symbol: 'ES', direction: 'long', playbook_id: 'Trend pullback', entry: '5641.25', stop: '5636.00', target: '5657.00', reason: 'Already at my loss limit.', potential_r: '3.00' },
      { symbol: 'NVDA', direction: 'long', playbook_id: null, entry: '', stop: '', target: '', reason: 'Saw it too late.', potential_r: null }] } },
}

const tradeDays = new Set(tradeLog.map((trade) => trade.date))
const hash = (text) => { let value = 2166136261; for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619); return (value >>> 0) / 4294967295 }

/** Seeded habit checks for older trading days, so adherence has three months of history. */
function seededChecks(date) {
  if (!tradeDays.has(date) || date < '2026-06-15' || hash(`journal:${date}`) < 0.18) return []
  const dayPnl = tradeLog.filter((trade) => trade.date === date).reduce((total, trade) => total + trade.pnl, 0)
  const keepRate = dayPnl >= 0 ? 0.88 : 0.62
  const checks = JOURNAL_HABITS.map((habit_id) => ({ habit_id, done: hash(`${habit_id}:${date}`) < keepRate }))
  if (date < '2026-08-01' && hash(`first5:${date}`) < 0.7) checks.push({ habit_id: 'h-first5', done: hash(`f5:${date}`) < 0.6 })
  return checks
}

/** Checks the Daily journal holds for this date (its checklist is the first five habits). */
function journalChecks(date) {
  let list = null
  try { list = JSON.parse(localStorage.getItem(`journal-checklist-${date}`)) } catch { list = null }
  list = list || SAMPLE_CHECKS[date]
  return list ? JOURNAL_HABITS.map((habit_id, index) => ({ habit_id, done: !!list[index] })) : null
}

/** The stored day record ({revision, content}) or null. Checks fall back to the Daily journal's. */
export function readDay(date) {
  const stored = read(DAY_KEY(date)) || SEED_DAYS[date] || null
  const fromJournal = journalChecks(date)
  if (stored) {
    const checks = stored.content.checks?.length ? stored.content.checks : fromJournal || seededChecks(date)
    return { ...stored, content: { ...EMPTY_DAY, ...stored.content, checks } }
  }
  const checks = fromJournal || seededChecks(date)
  return checks.length ? { revision: 1, content: { ...EMPTY_DAY, checks }, derived: true } : null
}

const num = (value) => (value == null || value === '' ? null : Number(value))
const potentialR = (item) => {
  const [entry, stop, target] = [num(item.entry), num(item.stop), num(item.target)]
  if ([entry, stop, target].some((value) => value == null || !Number.isFinite(value)) || entry === stop) return null
  return (Math.abs(target - entry) / Math.abs(entry - stop)).toFixed(2)
}

/** Saves a day; mirrors the first five habit checks into the Daily journal's checklist. */
export async function saveDay(date, { expected_revision, content }) {
  await wait(480)
  const current = read(DAY_KEY(date)) || SEED_DAYS[date] || null
  if ((current?.revision ?? 0) !== expected_revision) throw new ConflictError()
  const next = { revision: expected_revision + 1, content: { ...content, missed: content.missed.map((item) => ({ ...item, potential_r: potentialR(item) })) } }
  write(DAY_KEY(date), next)
  if (content.checks.some((check) => JOURNAL_HABITS.includes(check.habit_id))) {
    write(`journal-checklist-${date}`, JOURNAL_HABITS.map((id) => content.checks.find((check) => check.habit_id === id)?.done === true))
  }
  return next
}

/** Calendar-cell markers for one date. */
export function dayMarkers(date) {
  const day = readDay(date)
  if (!day || day.derived) return { has_plan: false, has_recap: false, missed: 0 }
  return { has_plan: !!day.content.plan.trim(), has_recap: !!day.content.recap.trim(), missed: day.content.missed.length }
}

/* ------------------------------------------------------------------ adherence */

const isoDays = (from, to) => {
  const out = []
  for (let time = Date.parse(`${from}T00:00:00Z`); time <= Date.parse(`${to}T00:00:00Z`); time += 86400000) out.push(new Date(time).toISOString().slice(0, 10))
  return out
}

/** Per habit: days kept / checked, the current kept streak, and net P&L on kept vs broken days. */
export function adherence(routine, from, to) {
  const dayPnl = new Map()
  tradeLog.forEach((trade) => { if (trade.date >= from && trade.date <= to) dayPnl.set(trade.date, (dayPnl.get(trade.date) ?? 0) + trade.pnl) })
  const records = isoDays(from, to).map((date) => [date, readDay(date)]).filter(([, day]) => day)
  return routine.habits.map((habit) => {
    const checks = records.map(([date, day]) => [date, day.content.checks.find((check) => check.habit_id === habit.habit_id)]).filter(([, check]) => check)
    let streak = 0
    for (let index = checks.length - 1; index >= 0 && checks[index][1].done; index -= 1) streak += 1
    const net = (done) => {
      const list = checks.filter(([date, check]) => check.done === done && dayPnl.has(date))
      return list.length ? [{ currency: 'USD', net_pnl: list.reduce((total, [date]) => total + dayPnl.get(date), 0) }] : []
    }
    return {
      habit_id: habit.habit_id, text: habit.text, archived: habit.archived,
      days_checked: checks.length, days_kept: checks.filter(([, check]) => check.done).length,
      current_streak: streak, net_when_kept: net(true), net_when_broken: net(false),
    }
  })
}

export const shiftMonth = (month, delta) => {
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + delta, 1))
  return date.toISOString().slice(0, 7)
}
