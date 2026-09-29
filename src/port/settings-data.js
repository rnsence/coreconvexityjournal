/**
 * Journal settings, local edition: the monolith's `/settings` endpoint, alerts feed, label
 * index, exports and sample data, replaced by localStorage seeded from the mock book.
 */
import { propAccounts, tradeLog, profile } from '../data'
import { money } from '../viz'

export const SETTINGS_KEY = 'cc-journal-settings'
const ALERTS_KEY = 'cc-journal-alerts'
const LABELS_KEY = 'cc-journal-labels'
const SAMPLE_KEY = 'cc-journal-sample'
export const APPEARANCE_KEY = 'wealth.appearance'
export const APPEARANCE_EVENT = 'wealth-appearance-change'
const NAME_KEY = 'wx.profile.name.local'
const AVATAR_KEY = 'wx.profile.avatar.local'

const read = (key) => { try { return localStorage.getItem(key) } catch { return null } }
const write = (key, value) => {
  try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value) } catch { /* private mode: not kept */ }
}
const readJSON = (key, fallback) => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback } catch { return fallback } }
const writeJSON = (key, value) => write(key, JSON.stringify(value))

/* ------------------------------------------------------------------ constants (verbatim copy) */

export const METHODS = [
  { value: 'fifo', label: 'FIFO', detail: 'An exit closes the oldest open lot first. What most futures brokers report.' },
  { value: 'lifo', label: 'LIFO', detail: 'An exit closes the newest open lot first.' },
  { value: 'average', label: 'Average cost', detail: 'Open quantity is one lot at its weighted average price.' },
]
export const ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Singapore', 'Australia/Sydney', 'UTC']

export const GOAL_METRICS = [
  ['net_pnl', 'Net P&L at least'], ['win_rate', 'Win rate at least (0-1)'], ['profit_factor', 'Profit factor at least'],
  ['average_r', 'Average R at least'], ['max_drawdown', 'Max drawdown at most'], ['trades', 'Trades at most'], ['rule_breaks', 'Rule breaks at most'],
]
const CEILINGS = new Set(['max_drawdown', 'trades', 'rule_breaks'])

export const RULE_KINDS = [
  ['max_trades', 'Max trades a day', 'trades'], ['daily_loss', 'Stop after a daily loss of', 'amount'],
  ['loss_streak', 'Stop after losses in a row', 'losses'], ['max_size', 'Max position size', 'contracts or shares'], ['window', 'Only trade between', ''],
]
export const ASSET_CLASSES = [['', 'Any asset'], ['future', 'Futures'], ['option', 'Options'], ['stock', 'Stocks'], ['crypto', 'Crypto'], ['forex', 'Forex']]
export const FEE_KINDS = ['commission', 'exchange', 'regulatory', 'ecn', 'clearing', 'other']

export const browserZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York' } catch { return 'America/New_York' } }

/** The journal's accounts (open prop accounts), as the settings form lists them. */
export const journalAccounts = () => propAccounts.filter((account) => !account.closed)
  .map((account) => ({ account_id: account.id, name: `${account.firm} ${Math.round(account.size / 1000)}K` }))

export const DEFAULT_CONTENT = {
  matching_method: 'fifo', scratch_threshold: '0', default_risk_mode: null, default_risk: null, stats_basis: 'net',
  default_account_id: null, timezone: '', week_start: 'monday', accounts: {},
}

export const blankGoal = () => ({ name: '', metric: 'net_pnl', target: '', period: 'month', account_id: null, currency: 'USD' })
export const blankRule = () => ({ account_id: null, kind: 'max_trades', limit: '', start: '09:30', end: '11:30', timezone: browserZone() })
export const blankFee = () => ({ account_id: null, asset_class: 'future', symbol: '', kind: 'commission', per_unit: '' })
export const blankTemplate = () => ({ name: '', description: '', body: '' })

/* ------------------------------------------------------------------ settings "server" */

/** GET /settings. Throws on a corrupt record so the page can show its load error. */
export function loadSettings() {
  const raw = read(SETTINGS_KEY)
  if (!raw) return { schema_version: 'journal-settings/v1', revision: 0, content: { ...DEFAULT_CONTENT }, rederived_trades: 0, saved_at: null }
  const parsed = JSON.parse(raw)
  if (!parsed || typeof parsed.revision !== 'number' || !parsed.content) throw new Error('bad settings record')
  return { ...parsed, content: { ...DEFAULT_CONTENT, ...parsed.content, accounts: { ...(parsed.content.accounts ?? {}) } } }
}

export class CommandError extends Error {
  constructor(message, status) { super(message); this.status = status }
}

/** How many trades a new matching method would re-derive (the ones that scaled in or out). */
function rederivedCount(before, after) {
  const scaled = tradeLog.filter((trade) => trade.qty >= 150).length
  const accounts = journalAccounts()
  let count = before.matching_method !== after.matching_method ? scaled : 0
  if (!count) {
    const changed = accounts.filter((a) => (before.accounts[a.account_id]?.matching_method || null) !== (after.accounts[a.account_id]?.matching_method || null)).length
    count = Math.round((scaled / Math.max(accounts.length, 1)) * changed)
  }
  return count
}

/** POST /settings with optimistic concurrency; a lost response when the browser is offline. */
export function postSettings({ expected_revision, content }) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { reject(new CommandError('unconfirmed', 0)); return }
      let current
      try { current = loadSettings() } catch { current = { revision: 0, content: DEFAULT_CONTENT } }
      if (current.revision !== expected_revision) { reject(new CommandError('revision conflict', 409)); return }
      const saved = {
        schema_version: 'journal-settings/v1', revision: current.revision + 1, content,
        rederived_trades: rederivedCount(current.content, content), saved_at: new Date().toISOString(),
      }
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved)) } catch { reject(new CommandError('Settings could not be stored in this browser.', 500)); return }
      resolve(saved)
    }, 650)
  })
}

/** The same clean-up the monolith applies before posting. */
export function normalise(draft) {
  const overrides = {}
  for (const [id, o] of Object.entries(draft.accounts ?? {})) {
    const cleaned = { matching_method: o.matching_method || null, scratch_threshold: o.scratch_threshold?.trim() || null }
    if (cleaned.matching_method || cleaned.scratch_threshold) overrides[id] = cleaned
  }
  return {
    ...draft, scratch_threshold: (draft.scratch_threshold ?? '').trim() || '0',
    default_risk: draft.default_risk_mode ? (draft.default_risk ?? '').trim() : null,
    default_account_id: draft.default_account_id || null, accounts: overrides,
  }
}

/* ------------------------------------------------------------------ validation */

const isNumber = (value) => value !== '' && value != null && Number.isFinite(Number(value))
const validZone = (zone) => { try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true } catch { return false } }

/** Field errors keyed by path ("scratch_threshold", "goals.0.target", …). */
export function validate(draft) {
  const errors = {}
  const scratch = (draft.scratch_threshold ?? '').trim()
  if (scratch && !(isNumber(scratch) && Number(scratch) >= 0)) errors.scratch_threshold = 'Enter an amount of 0 or more'
  for (const [id, o] of Object.entries(draft.accounts ?? {})) {
    const value = o.scratch_threshold?.trim()
    if (value && !(isNumber(value) && Number(value) >= 0)) errors[`accounts.${id}`] = 'Enter an amount of 0 or more'
  }
  if (draft.timezone && !validZone(draft.timezone)) errors.timezone = 'Not a timezone this browser knows'
  if (draft.default_risk_mode) {
    const risk = (draft.default_risk ?? '').trim()
    if (!(isNumber(risk) && Number(risk) > 0)) errors.default_risk = 'Enter a risk above 0'
    else if (draft.default_risk_mode === 'percent' && Number(risk) > 100) errors.default_risk = 'A share of the account is 100% at most'
  }
  ;(draft.goals ?? []).forEach((goal, index) => {
    if (!isNumber(goal.target)) errors[`goals.${index}.target`] = 'Enter a target'
    else if (goal.metric === 'win_rate' && (Number(goal.target) < 0 || Number(goal.target) > 1)) errors[`goals.${index}.target`] = 'A win rate is a fraction (0.55)'
  })
  ;(draft.trading_rules ?? []).forEach((rule, index) => {
    if (rule.kind === 'window') { if (!(rule.start < rule.end)) errors[`trading_rules.${index}.end`] = 'Until is before From' }
    else if (!(isNumber(rule.limit) && Number(rule.limit) > 0)) errors[`trading_rules.${index}.limit`] = 'Enter a limit'
  })
  ;(draft.fee_rules ?? []).forEach((rule, index) => {
    if (!(isNumber(rule.per_unit) && Number(rule.per_unit) >= 0)) errors[`fee_rules.${index}.per_unit`] = 'Enter a fee'
  })
  ;(draft.ai_templates ?? []).forEach((template, index) => {
    if (!template.name) errors[`ai_templates.${index}.name`] = 'Name the template'
    else if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(template.name)) errors[`ai_templates.${index}.name`] = 'lower-case letters, digits and dashes'
    if (!template.body.trim()) errors[`ai_templates.${index}.body`] = 'Write the prompt'
  })
  return errors
}

/* ------------------------------------------------------------------ goal progress (GET /goals) */

const DAY = 86400000
const isoOf = (time) => new Date(time).toISOString().slice(0, 10)
const shortOf = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
export const todayIn = (zone) => {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: zone || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }
  catch { return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }
}

function periodOf(period, today, weekStart) {
  const now = Date.parse(`${today}T12:00:00Z`)
  if (period === 'week') {
    const weekday = new Date(now).getUTCDay()
    const back = weekStart === 'sunday' ? weekday : (weekday + 6) % 7
    const from = now - back * DAY
    return [isoOf(from), isoOf(from + 6 * DAY)]
  }
  const date = new Date(now)
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
  return [`${today.slice(0, 7)}-01`, isoOf(last)]
}

/** Trades that broke one of the rules (the same test the statistics use for "rule broken"). */
export function ruleBreaks(trades, rules = []) {
  const broken = new Set()
  const byDay = new Map()
  trades.forEach((trade) => byDay.set(trade.date, [...(byDay.get(trade.date) ?? []), trade]))
  for (const rule of rules) {
    const limit = Number(rule.limit)
    for (const list of byDay.values()) {
      const day = [...list].sort((a, b) => a.time.localeCompare(b.time))
      let running = 0; let streak = 0
      day.forEach((trade, index) => {
        if (rule.kind === 'max_trades' && limit > 0 && index >= limit) broken.add(trade.id)
        if (rule.kind === 'daily_loss' && limit > 0 && running <= -limit) broken.add(trade.id)
        if (rule.kind === 'loss_streak' && limit > 0 && streak >= limit) broken.add(trade.id)
        if (rule.kind === 'max_size' && limit > 0 && trade.qty > limit) broken.add(trade.id)
        if (rule.kind === 'window' && (trade.time < rule.start || trade.time > rule.end)) broken.add(trade.id)
        running += trade.pnl
        streak = trade.pnl < 0 ? streak + 1 : 0
      })
    }
  }
  return broken.size
}

export function goalProgress(goal, content, { privacy = false } = {}) {
  const [from, to] = periodOf(goal.period, todayIn(content.timezone || 'America/New_York'), content.week_start)
  const trades = tradeLog.filter((trade) => trade.date >= from && trade.date <= to)
  const net = (trade) => (content.stats_basis === 'gross' ? trade.pnl + (trade.fees ?? 0) : trade.pnl)
  const n = trades.length
  let value = null
  if (n) {
    const wins = trades.filter((t) => net(t) > 0)
    const losses = trades.filter((t) => net(t) < 0)
    const won = wins.reduce((s, t) => s + net(t), 0)
    const lost = Math.abs(losses.reduce((s, t) => s + net(t), 0))
    const total = trades.reduce((s, t) => s + net(t), 0)
    if (goal.metric === 'net_pnl') value = total
    if (goal.metric === 'win_rate') value = wins.length / n
    if (goal.metric === 'profit_factor') value = lost ? won / lost : won
    if (goal.metric === 'average_r') value = losses.length ? (total / n) / (lost / losses.length) : null
    if (goal.metric === 'trades') value = n
    if (goal.metric === 'rule_breaks') value = ruleBreaks(trades, content.trading_rules)
    if (goal.metric === 'max_drawdown') {
      let peak = 0; let run = 0; let drawdown = 0
      ;[...trades].sort((a, b) => a.timestamp - b.timestamp).forEach((t) => { run += net(t); peak = Math.max(peak, run); drawdown = Math.max(drawdown, peak - run) })
      value = drawdown
    }
  }
  const target = Number(goal.target)
  const status = value == null ? 'no trades' : (CEILINGS.has(goal.metric) ? value <= target : value >= target) ? 'met' : 'not met'
  const fmt = (v) => goal.metric === 'net_pnl' ? money(v, { privacy }) : goal.metric === 'max_drawdown' ? money(v, { privacy, sign: false })
    : goal.metric === 'win_rate' ? v.toFixed(2) : Number.isInteger(v) ? String(v) : v.toFixed(2)
  return { from: shortOf(from), to: shortOf(to), value: value == null ? null : fmt(value), target: goal.target, trades: n, status }
}

/* ------------------------------------------------------------------ alerts */

const SEED_ALERTS = [
  { key: 'a3', kind: 'rule_break', title: 'Max trades a day', body: '9 trades on Sep 18 against a limit of 8 on every account.', created_at: '2026-09-18T20:05:00Z', read_at: null },
  { key: 'a2', kind: 'goal_met', title: 'Monthly target', body: 'September net P&L reached its target of $2,000.', created_at: '2026-09-17T21:10:00Z', read_at: null },
  { key: 'a1', kind: 'goal_missed', title: 'Weekly win rate', body: 'Win rate finished the week at 0.44 against 0.55.', created_at: '2026-09-13T22:00:00Z', read_at: '2026-09-14T13:02:00Z' },
]
export const loadAlerts = () => { const alerts = readJSON(ALERTS_KEY, SEED_ALERTS); return { alerts, unread: alerts.filter((a) => !a.read_at).length, push: true } }
export const markAlertsRead = () => {
  const now = new Date().toISOString()
  const alerts = loadAlerts().alerts.map((a) => (a.read_at ? a : { ...a, read_at: now }))
  writeJSON(ALERTS_KEY, alerts)
  return { alerts, unread: 0, push: true }
}

/* ------------------------------------------------------------------ labels */

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
function seedLabels() {
  const tags = new Map()
  tradeLog.forEach((trade) => tags.set(slug(trade.setup), (tags.get(slug(trade.setup)) ?? 0) + 1))
  return {
    mistakes: [['Chased entry', 14], ['Moved stop', 9], ['Oversized', 6], ['Early exit', 11], ['No plan', 3]].map(([label, trades]) => ({ label, trades })),
    tags: [...tags.entries()].sort((a, b) => b[1] - a[1]).map(([label, trades]) => ({ label, trades })),
    emotions: [['Calm', 41], ['FOMO', 12], ['Hesitant', 8], ['Revenge', 4]].map(([label, trades]) => ({ label, trades })),
  }
}
export const loadLabels = () => readJSON(LABELS_KEY, null) ?? seedLabels()

/** POST /trade-labels/rename — `to: ''` deletes; renaming onto an existing label merges. */
export function renameLabel(kind, from, to) {
  return new Promise((resolve) => setTimeout(() => {
    const group = { tag: 'tags', mistake: 'mistakes', emotion: 'emotions' }[kind]
    const labels = loadLabels()
    const list = labels[group]
    const source = list.find((item) => item.label === from)
    let next = list.filter((item) => item.label !== from)
    if (to && source) {
      const target = next.find((item) => item.label.toLowerCase() === to.toLowerCase())
      next = target ? next.map((item) => (item === target ? { ...item, trades: item.trades + source.trades } : item)) : [...next, { label: to, trades: source.trades }]
    }
    const updated = { ...labels, [group]: next.sort((a, b) => b.trades - a.trades) }
    writeJSON(LABELS_KEY, updated)
    resolve({ labels: updated, revised: source?.trades ?? 0 })
  }, 420))
}

/* ------------------------------------------------------------------ exports */

const csvCell = (value) => { const text = String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text }
const csv = (rows) => rows.map((row) => row.map(csvCell).join(',')).join('\n')

export function exportCSV(kind) {
  return new Promise((resolve, reject) => setTimeout(() => {
    try {
      const sorted = [...tradeLog].sort((a, b) => a.timestamp - b.timestamp)
      const rows = kind === 'trades'
        ? [['date', 'opened', 'closed', 'symbol', 'side', 'setup', 'grade', 'quantity', 'entry', 'exit', 'fees', 'net_pnl'],
          ...sorted.map((t) => [t.date, t.time, t.closed, t.symbol, t.side, t.setup, t.grade, t.qty, t.entry, t.exit, t.fees ?? 0, t.pnl])]
        : [['date', 'time', 'symbol', 'action', 'quantity', 'price', 'fee', 'file', 'row'],
          ...sorted.flatMap((t, index) => [
            [t.date, t.time, t.symbol, t.side === 'Long' ? 'Buy' : 'Sell', t.qty, t.entry, ((t.fees ?? 0) / 2).toFixed(2), 'journal-fills.csv', index * 2 + 2],
            [t.date, t.closed, t.symbol, t.side === 'Long' ? 'Sell' : 'Buy', t.qty, t.exit, ((t.fees ?? 0) / 2).toFixed(2), 'journal-fills.csv', index * 2 + 3],
          ])]
      const url = URL.createObjectURL(new Blob([csv(rows)], { type: 'text/csv' }))
      const link = document.createElement('a')
      link.href = url; link.download = `journal-${kind}.csv`
      document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      resolve()
    } catch { reject(new Error('The download could not be prepared.')) }
  }, 380))
}

/* ------------------------------------------------------------------ sample data */

export const loadSample = () => readJSON(SAMPLE_KEY, { active: false, trades: 0 })
export const setSample = (active) => new Promise((resolve) => setTimeout(() => {
  const next = active ? { active: true, trades: 214 } : { active: false, trades: 0 }
  writeJSON(SAMPLE_KEY, next)
  resolve(next)
}, active ? 1400 : 900))

/* ------------------------------------------------------------------ appearance (shared/preferences/appearance.ts) */

let memoryAppearance = null
export function readAppearance() {
  const stored = read(APPEARANCE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return memoryAppearance ?? 'light'
}
export const systemDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
export function setAppearance(value) {
  memoryAppearance = value
  write(APPEARANCE_KEY, value)
  const dark = value === 'dark' || (value === 'system' && systemDark())
  // The journal is drawn in light only; the resolved theme is exposed for when a dark theme ships.
  document.documentElement.dataset.appearance = dark ? 'dark' : 'light'
  window.dispatchEvent(new Event(APPEARANCE_EVENT))
}

/* ------------------------------------------------------------------ profile (wealth/ui/useProfile.ts) */

export function resolveProfile() {
  const localName = read(NAME_KEY)
  const localAvatar = read(AVATAR_KEY)
  return { name: localName || profile.name || 'Your name', avatar: localAvatar, source: localName || localAvatar ? 'local' : 'account' }
}
export const setProfileName = (name) => write(NAME_KEY, name.trim() ? name.trim() : null)
export const setProfileAvatar = (dataUrl) => write(AVATAR_KEY, dataUrl)

/** "Dung Cao" → "DC", "ddc" → "DD", "" → "?". */
export function initialsOf(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Square-crop and downscale a picked image to 256px JPEG so the stored data URL stays small. */
export async function fileToAvatar(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('unreadable image'))
      image.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = 256; canvas.height = 256
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no canvas')
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256)
    return canvas.toDataURL('image/jpeg', 0.86)
  } finally { URL.revokeObjectURL(url) }
}
