/**
 * Notebook store: journal entries (notes) with revisions, attachments and
 * annotations. Local-only stand-in for the monolith's journal API — every write
 * is an idempotent "command" keyed by a UUID, so a retried command that already
 * landed is simply confirmed again.
 */

const STORE_KEY = 'cc-notebook-v1'
const APPLIED_KEY = 'cc-notebook-applied-v1'
export const COMMAND_PREFIX = 'journal-command:'
export const NOTEBOOK_EVENT = 'notebook:data'

export const TITLE_MAX = 200
export const BODY_MAX = 64 * 1024
export const MAX_ATTACHMENT = 5 * 1024 * 1024
export const MAX_SHAPES = 100

export const TEMPLATES = [
  { name: 'Plan', body: 'Thesis:\n\nEntry criteria:\n\nPlanned risk (size, stop):\n\nExit plan:\n\nWhat would prove me wrong:\n' },
  { name: 'Session', body: 'Market context:\n\nWhat I did:\n\nDid I follow my plan?\n\nEmotions and focus:\n' },
  { name: 'Review', body: 'What happened:\n\nProcess (followed / broke rules):\n\nOutcome vs plan:\n\nLesson and next action:\n' },
]

export const parseList = (raw) => raw.split(',').map((item) => item.trim()).filter(Boolean)
export const parseSymbols = (raw) => [...new Set(parseList(raw).map((item) => item.toUpperCase()))]
export const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`)

/* ------------------------------------------------------------------ seed */

const at = (iso, time = '16:40') => new Date(`${iso}T${time}:00Z`).toISOString()

const SEED = [
  {
    id: 'n-0926', date: '2026-09-25', tags: ['review', 'nq', 'discipline'], symbols: ['NQ'], revisions: 2,
    title: 'Friday review: stopped after two red trades',
    body: `**What happened:** Two opening-drive shorts on NQ, both stopped for 1R each before 10:05.

**Process (followed / broke rules):**
- Followed the two-loss rule and closed the platform at 10:12.
- Size was right: 2 MNQ-equivalent risk.
- Broke nothing, but the second entry was a *chase* — price had already left VWAP by 18 pts.

**Outcome vs plan:** −2R, inside the daily loss limit with room to spare.

**Lesson and next action:** The opening drive needs a retest. No retest, no trade.`,
  },
  {
    id: 'n-0922', date: '2026-09-22', tags: ['thesis', 'nvda', 'earnings'], symbols: ['NVDA', 'SMH'], revisions: 1,
    title: 'NVDA into the October run-up',
    body: `Thesis: semis lead while the index grinds; NVDA holds the 116 shelf.

Entry criteria:
- Daily close above 118.40 with volume above the 20-day average
- SMH confirming (no divergence)

Planned risk (size, stop): 150 shares, stop 115.60 — about $420 at risk.

Exit plan: scale half at 124, trail the rest under the 10-day.

What would prove me wrong: a close back under 116 on rising volume.`,
    attachments: [{ name: 'nvda-daily-setup.png', seed: 22 }],
  },
  {
    id: 'n-0918', date: '2026-09-18', tags: ['session', 'spy', 'a-plus'], symbols: ['SPY', 'QQQ'], revisions: 3,
    title: 'Best session of the month — failed breakout short',
    body: `Market context: CPI day, gap up into prior week high, weak breadth (NYSE TICK never above +600).

What I did: waited for the failed break of 564.00, shorted the reclaim at 562.18, 300 shares, stop above the high.

Did I follow my plan? Yes — entry, size and stop were all written in the pre-market plan.

Emotions and focus: calm. Took the partial at 1R and let the rest run to VWAP.

> Result: +$1,034.74, every rule followed.`,
    attachments: [{ name: 'spy-failed-breakout.png', seed: 18 }, { name: 'cpi-notes.txt', text: 'CPI 0.2% m/m vs 0.3% est. Core 0.3% in line.\nYields −6bp on the print.\n' }],
  },
  {
    id: 'n-0912', date: '2026-09-12', tags: ['mistake', 'tsla', 'follow-up'], symbols: ['TSLA'], revisions: 1,
    title: 'Moved my stop on TSLA — again',
    body: `What happened: long the trend pullback at 251.20, stop 249.90. Price wicked to 250.10, I widened to 249.00 "to give it room".

Process: broke rule #3 (never move a stop further away).

Outcome vs plan: −$56 instead of −$52. Small money, big habit.

Lesson and next action: hard stop in the order ticket, not a mental one. **Follow-up** on Friday: count how many times this happened in September.`,
  },
  {
    id: 'n-0905', date: '2026-09-05', tags: ['plan', 'es', 'thesis'], symbols: ['ES'], revisions: 1,
    title: 'September plan: fewer trades, cleaner process',
    body: `Goals for the month:
1. Max **4 trades a day**. The numbers say trades 5+ are net negative.
2. Only setups that meet every checklist rule after 11:00.
3. Journal every session before 16:30.

Risk: $500 daily loss limit on the 50K eval, $250 per trade.

Review cadence: weekly review every Friday, monthly on the 30th.`,
  },
  {
    id: 'n-0828', date: '2026-08-28', tags: ['review', 'prop', 'apex'], symbols: ['NQ', 'MNQ'], revisions: 2,
    title: 'Apex 50K passed — what worked',
    body: `Passed the evaluation in 9 trading days.

What worked:
- Trading only the first 90 minutes
- Half size until the buffer was above $1,000
- Skipping FOMC day entirely

What to keep for the funded account: the same 90-minute window and the \`half size under $1k buffer\` rule.`,
    attachments: [{ name: 'apex-eval-equity.png', seed: 28 }],
  },
  {
    id: 'n-0819', date: '2026-08-19', tags: ['research', 'vwap'], symbols: ['SPY', 'QQQ'], revisions: 1,
    title: 'Research: VWAP reclaim win rate by time of day',
    body: `Pulled 112 VWAP reclaim trades from the log.

- 09:30–10:30: 61% win rate, avg +$84
- 10:30–12:00: 48% win rate, avg +$12
- After 13:00: 39% win rate, avg −$31

Conclusion: the setup has an edge only in the morning. Afternoon reclaims are **noise**.`,
  },
  {
    id: 'n-0806', date: '2026-08-06', tags: ['mistake', 'tilt'], symbols: ['AMD', 'META'], revisions: 1,
    title: 'Revenge trading after the META loss',
    body: `Lost $347 on a META gap continuation that never continued. Then took three AMD scalps in 20 minutes with no plan.

Total damage: −$612 on the day, −$265 of it after the first loss.

Rule added: after any loss over $300, stand up and walk for 10 minutes before the next order.`,
  },
  {
    id: 'n-0722', date: '2026-07-22', tags: ['plan', 'earnings', 'follow-up'], symbols: ['MSFT', 'AAPL'], revisions: 1,
    title: 'Earnings week plan — MSFT and AAPL',
    body: `No positions held through the print. Trade the day-after only if:
- the gap holds the first 15-minute range
- volume is at least 2× average by 10:00

Size: half of normal until the first trade of the week is green.`,
    archived: true,
  },
  {
    id: 'n-0630', date: '2026-06-30', tags: ['review', 'monthly'], symbols: [], revisions: 2,
    title: 'June monthly review',
    body: `Net +$2,140 over 19 sessions, profit factor 1.42.

Best: opening drive (+$1,880). Worst: reversal fades (−$740).

Next month: drop reversal fades completely until the backtest says otherwise.`,
    archived: true,
  },
  {
    id: 'n-0614', date: '2026-06-14', tags: ['research', 'risk'], symbols: ['ES', 'NQ'], revisions: 1,
    title: 'Position sizing notes (ES vs NQ)',
    body: `NQ moves roughly 1.6× ES in points-per-dollar terms on normal days.

For the same $250 risk:
- ES: 1 contract, 5-point stop
- NQ: 5 MNQ, 25-point stop ($2 a point per contract)

Keep the dollar risk constant, not the contract count.`,
  },
]

/** Seeded chart images, drawn once on a canvas so thumbnails are real rasters. */
function drawChart(seed, width = 720, height = 440) {
  if (typeof document === 'undefined') return ''
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')
  let state = seed * 9301 + 49297
  const random = () => { state = (state * 9301 + 49297) % 233280; return state / 233280 }
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = '#eef0f3'; ctx.lineWidth = 1
  for (let y = 40; y < height; y += 60) { ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(width, y + .5); ctx.stroke() }
  for (let x = 60; x < width; x += 90) { ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, height); ctx.stroke() }
  const candles = 48
  const step = (width - 40) / candles
  let price = height * (0.45 + random() * 0.2)
  const closes = []
  for (let index = 0; index < candles; index += 1) {
    const drift = (seed % 2 ? -1 : 1) * 1.4 + (random() - 0.5) * 22
    const open = price
    const close = Math.max(40, Math.min(height - 40, price - drift))
    const high = Math.min(open, close) - random() * 14
    const low = Math.max(open, close) + random() * 14
    const x = 20 + index * step + step / 2
    const up = close < open
    ctx.strokeStyle = up ? '#12b76a' : '#f04438'; ctx.fillStyle = ctx.strokeStyle
    ctx.beginPath(); ctx.moveTo(x, high); ctx.lineTo(x, low); ctx.stroke()
    ctx.fillRect(x - step * 0.32, Math.min(open, close), step * 0.64, Math.max(2, Math.abs(close - open)))
    closes.push([x, close])
    price = close
  }
  ctx.strokeStyle = '#2f62dd'; ctx.lineWidth = 2; ctx.beginPath()
  let avg = closes[0][1]
  closes.forEach(([x, y], index) => { avg = avg * 0.85 + y * 0.15; if (index) ctx.lineTo(x, avg); else ctx.moveTo(x, avg) })
  ctx.stroke()
  ctx.fillStyle = '#98a2b3'; ctx.font = '600 13px Inter, system-ui, sans-serif'
  ctx.fillText('5m · VWAP', 16, 24)
  return canvas.toDataURL('image/png')
}

const dataUrlSize = (url) => Math.round((url.length - url.indexOf(',') - 1) * 0.75)

function seedEntries() {
  return SEED.map((seed, index) => {
    const created = at(seed.date, `${13 + (index % 4)}:${10 + index * 3}`)
    const content = { title: seed.title, body: seed.body, occurred_on: seed.date, tags: seed.tags, symbols: seed.symbols }
    const revisions = Array.from({ length: seed.revisions }, (_, revision) => ({
      revision: revision + 1,
      saved_at: new Date(Date.parse(created) + revision * 3600_000).toISOString(),
      content: revision + 1 === seed.revisions ? content : { ...content, body: content.body.split('\n').slice(0, -2).join('\n') },
    }))
    const attachments = (seed.attachments || []).map((file, fileIndex) => {
      if (file.text) {
        const src = `data:text/plain;charset=utf-8,${encodeURIComponent(file.text)}`
        return { attachment_id: `${seed.id}-a${fileIndex}`, name: file.name, type: 'text/plain', size_bytes: new TextEncoder().encode(file.text).length, src, annotation: null }
      }
      const src = drawChart(file.seed)
      return {
        attachment_id: `${seed.id}-a${fileIndex}`, name: file.name, type: 'image/png', size_bytes: src ? dataUrlSize(src) : 48_210, src,
        annotation: file.seed === 18 ? { revision: 1, shapes: [
          { kind: 'rect', x1: .55, y1: .18, x2: .72, y2: .42, colour: 'red' },
          { kind: 'arrow', x1: .38, y1: .12, x2: .54, y2: .24, colour: 'red' },
          { kind: 'text', x1: .22, y1: .1, x2: .22, y2: .1, colour: 'black', text: 'Failed break' },
        ] } : null,
      }
    })
    return {
      entry_id: seed.id,
      revision: seed.revisions + attachments.length,
      status: seed.archived ? 'archived' : 'active',
      created_at: created,
      updated_at: revisions.at(-1).saved_at,
      content,
      revisions,
      attachments,
    }
  })
}

/* ------------------------------------------------------------------ persistence */

let cache = null

export function loadEntries() {
  if (cache) return cache
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY))
    if (Array.isArray(stored)) { cache = stored; return cache }
  } catch { /* storage unavailable */ }
  cache = seedEntries()
  persist(cache)
  return cache
}

function persist(list) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list)) } catch {
    // Quota: keep attachment bytes in memory only, persist the rest.
    try { localStorage.setItem(STORE_KEY, JSON.stringify(list.map((entry) => ({ ...entry, attachments: entry.attachments.map((file) => (file.src?.length > 200_000 ? { ...file, src: '' } : file)) })))) } catch { /* storage unavailable */ }
  }
}

function commit(list) {
  cache = list
  persist(list)
  try { window.dispatchEvent(new CustomEvent(NOTEBOOK_EVENT)) } catch { /* no window */ }
}

/** Re-read after another tab wrote; returns true when the store changed. */
export function reloadFromStorage(event) {
  if (event && event.key !== STORE_KEY) return false
  cache = null
  loadEntries()
  return true
}

export function resetNotebook() {
  cache = seedEntries()
  commit(cache)
}

const appliedKeys = () => { try { return JSON.parse(localStorage.getItem(APPLIED_KEY)) || {} } catch { return {} } }
const markApplied = (key, result) => {
  try {
    const keys = appliedKeys()
    keys[key] = result
    const trimmed = Object.fromEntries(Object.entries(keys).slice(-200))
    localStorage.setItem(APPLIED_KEY, JSON.stringify(trimmed))
  } catch { /* storage unavailable */ }
}

export class CommandError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
export const isConflict = (error) => error?.status === 409
export const isRefusal = (error) => error?.status >= 400 && error?.status < 500

/* ------------------------------------------------------------------ commands */

const now = () => new Date().toISOString()
const find = (list, id) => {
  const entry = list.find((item) => item.entry_id === id)
  if (!entry) throw new CommandError(404, 'This note no longer exists.')
  return entry
}
const expect = (entry, expected) => {
  if (expected != null && entry.revision !== expected) {
    throw new CommandError(409, `This note is at revision ${entry.revision}, not ${expected}. Reopen it to see the latest.`)
  }
}
const bump = (entry, patch) => ({ ...entry, ...patch, revision: entry.revision + 1, updated_at: now() })

/** Runs one command intent `{ key, kind, ... }` against the store. Idempotent by key. */
export function applyCommand(intent) {
  const done = appliedKeys()[intent.key]
  if (done) return done
  const list = loadEntries().slice()
  let result = { ok: true }
  const replace = (next) => { list[list.findIndex((item) => item.entry_id === next.entry_id)] = next; return next }

  if (intent.kind === 'create') {
    const content = intent.content
    const entry = {
      entry_id: `n-${uuid().slice(0, 8)}`, revision: 1, status: 'active', created_at: now(), updated_at: now(),
      content, revisions: [{ revision: 1, saved_at: now(), content }], attachments: [], author: intent.author,
    }
    list.unshift(entry)
    result = { ok: true, entry_id: entry.entry_id }
  } else {
    const entry = find(list, intent.entry_id)
    expect(entry, intent.expected_revision)
    if (intent.kind === 'revise') {
      const next = bump(entry, { content: intent.content })
      next.revisions = [...entry.revisions, { revision: next.revision, saved_at: next.updated_at, content: intent.content }]
      replace(next)
    } else if (intent.kind === 'archive' || intent.kind === 'restore') {
      replace(bump(entry, { status: intent.kind === 'archive' ? 'archived' : 'active' }))
    } else if (intent.kind === 'attach') {
      replace(bump(entry, { attachments: [...entry.attachments, { ...intent.attachment, annotation: null }] }))
    } else if (intent.kind === 'remove-attachment') {
      replace(bump(entry, { attachments: entry.attachments.filter((file) => file.attachment_id !== intent.attachment_id) }))
    } else if (intent.kind === 'rewrite-attachment') {
      if (!entry.attachments.some((item) => item.attachment_id === intent.attachment_id)) throw new CommandError(404, 'This attachment was removed.')
      replace(bump(entry, { attachments: entry.attachments.map((item) => (item.attachment_id === intent.attachment_id ? { ...item, src: intent.src, size_bytes: intent.size_bytes } : item)) }))
    } else if (intent.kind === 'annotate') {
      const file = entry.attachments.find((item) => item.attachment_id === intent.attachment_id)
      if (!file) throw new CommandError(404, 'This attachment was removed.')
      const current = file.annotation?.revision ?? 0
      if (current !== intent.annotation_revision) throw new CommandError(409, 'annotation changed')
      replace({
        ...entry, updated_at: now(),
        attachments: entry.attachments.map((item) => (item.attachment_id === intent.attachment_id ? { ...item, annotation: { revision: current + 1, shapes: intent.shapes } } : item)),
      })
    } else {
      throw new CommandError(400, `Unknown command ${intent.kind}.`)
    }
  }
  commit(list)
  markApplied(intent.key, result)
  return result
}

/* ------------------------------------------------------------------ queries */

export const NO_FILTERS = { status: 'active', tag: '', q: '', symbol: '', from: '', to: '' }

export const entryDate = (entry) => entry.content.occurred_on ?? entry.created_at.slice(0, 10)

/** Mirrors the server's validation: refusals are 4xx, so the page says which filter is wrong. */
export function validateFilters(filters) {
  if (filters.from && filters.to && filters.from > filters.to) throw new CommandError(422, 'from must be on or before to')
  if (filters.symbol.trim() && !/^[A-Za-z0-9.\-/!^=]{1,20}$/.test(filters.symbol.trim())) throw new CommandError(422, 'symbol is not valid')
}

export function queryEntries(filters, list = loadEntries()) {
  validateFilters(filters)
  const q = filters.q.trim().toLowerCase()
  const tag = filters.tag.trim().toLowerCase()
  const symbol = filters.symbol.trim().toLowerCase()
  const wordMatch = symbol ? new RegExp(`(^|[^a-z0-9])${symbol.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}([^a-z0-9]|$)`, 'i') : null
  return list
    .filter((entry) => filters.status === 'all' || entry.status === filters.status)
    .filter((entry) => !tag || entry.content.tags.some((item) => item.toLowerCase() === tag))
    .filter((entry) => !q || entry.content.title.toLowerCase().includes(q) || entry.content.body.toLowerCase().includes(q))
    .filter((entry) => !symbol
      || (entry.content.symbols || []).some((item) => item.toLowerCase() === symbol)
      || entry.content.tags.some((item) => item.toLowerCase() === symbol)
      || wordMatch.test(entry.content.title) || wordMatch.test(entry.content.body))
    .filter((entry) => !filters.from || entryDate(entry) >= filters.from)
    .filter((entry) => !filters.to || entryDate(entry) <= filters.to)
    .sort((a, b) => entryDate(b).localeCompare(entryDate(a)) || b.created_at.localeCompare(a.created_at))
}

/** Tag counts over active notes, most used first. */
export function tagCounts(list = loadEntries()) {
  const counts = new Map()
  list.filter((entry) => entry.status === 'active').forEach((entry) => entry.content.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)))
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

/* ------------------------------------------------------------------ export */

export function exportEntries(format, filters) {
  const list = queryEntries(filters)
  if (list.length > 500) throw new CommandError(422, 'journal export exceeds 500 entries; narrow it with a date range or filter')
  const stamp = new Date().toISOString().slice(0, 10)
  if (format === 'json') {
    const payload = {
      exported_at: now(),
      filters,
      entries: list.map(({ entry_id, revision, status, created_at, updated_at, content, revisions, attachments }) => ({
        entry_id, revision, status, created_at, updated_at, content, revisions,
        attachments: attachments.map(({ attachment_id, name, type, size_bytes, annotation }) => ({ attachment_id, name, type, size_bytes, annotation })),
      })),
    }
    return { name: `journal-${stamp}.json`, type: 'application/json', text: JSON.stringify(payload, null, 2) }
  }
  const blocks = list.map((entry) => {
    const meta = [entryDate(entry), `revision ${entry.revision}`, entry.status === 'archived' ? 'archived' : null].filter(Boolean).join(' · ')
    const tags = entry.content.tags.length ? `\n${entry.content.tags.map((tag) => `#${tag}`).join(' ')}` : ''
    const symbols = entry.content.symbols?.length ? `\nSymbols: ${entry.content.symbols.join(', ')}` : ''
    const files = entry.attachments.length ? `\n\nAttachments: ${entry.attachments.map((file) => file.name).join(', ')}` : ''
    return `## ${entry.content.title}\n\n_${meta}_${tags}${symbols}\n\n${entry.content.body.trim()}${files}`
  })
  return { name: `journal-${stamp}.md`, type: 'text/markdown', text: `# Journal export\n\nExported ${stamp} · ${list.length} ${list.length === 1 ? 'entry' : 'entries'}\n\n${blocks.join('\n\n---\n\n')}\n` }
}

export function download({ name, type, text, url }) {
  const href = url ?? URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = href
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  if (!url) setTimeout(() => URL.revokeObjectURL(href), 0)
}

/* ------------------------------------------------------------------ attachments */

const EXTENSIONS = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv' }
export const ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.csv'
export const declaredType = (name) => EXTENSIONS[name.split('.').pop()?.toLowerCase() ?? ''] ?? null
export const isRaster = (file) => ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KiB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

export function precheck(file) {
  if (!declaredType(file.name)) return `${file.name}: attach PNG, JPEG, WebP, GIF, PDF, TXT or CSV files.`
  if (file.size === 0) return `${file.name} is empty.`
  if (file.size > MAX_ATTACHMENT) return `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MiB; attachments may be at most 5 MiB.`
  return null
}

export const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result)
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(file)
})

/** Pending command intents (lost responses) waiting to be retried. */
export function waitingCommands() {
  try {
    let count = 0
    for (let index = 0; index < localStorage.length; index += 1) if (localStorage.key(index)?.startsWith(COMMAND_PREFIX)) count += 1
    return count
  } catch { return 0 }
}
