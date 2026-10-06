/**
 * Local stand-in for the assistant server: conversations, templates, usage and
 * a reply "model" that answers from the mock trade log. Destructive actions come
 * back pending and only run when the user confirms them.
 */
import { tradeLog, propAccounts, propTransactions } from '../data'
import { byHour, byWeekday, groupStats, streaks, summarize } from '../analytics'
import { money, percent, ratio } from '../viz'
import { applyCommand, loadEntries, uuid } from './notebook-data'

const STORE_KEY = 'cc-assistant-v1'
export const DAILY_TOKENS = 250_000

export const TEMPLATES = [
  { name: 'tilt-check', description: 'Check a day for tilt: losses in a row, trades after a big loss, overtrading', arguments: ['date'] },
  { name: 'weekly-recap', description: 'Recap the five sessions ending on a date', arguments: ['date'] },
  { name: 'setup-review', description: 'Review one setup: win rate, average and best hours', arguments: ['setup'] },
]

export const SUGGESTIONS = [
  { title: 'What was my biggest leak this month?', detail: 'Worst setup, hour and weekday' },
  { title: 'Which setup makes me the most money?', detail: 'Ranked by net P&L' },
  { title: 'How did I do this week?', detail: 'The last five sessions' },
  { title: 'Write today’s recap into my journal', detail: 'Creates a Notebook entry' },
  { title: 'When should I stop trading each day?', detail: 'P&L by hour of entry' },
  { title: 'Archive my oldest note', detail: 'Asks before it changes anything' },
]

export const toolLabel = (tool) => tool.replace(/^journal_/, '').replace(/_/g, ' ')

/* ------------------------------------------------------------------ store */

const today = () => new Date().toISOString().slice(0, 10)
const estimate = (text) => Math.max(1, Math.round(text.length / 4))

export function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY))
    if (stored?.conversations) {
      if (stored.usage?.day !== today()) stored.usage = { day: today(), requests: 0, input_tokens: 0, output_tokens: 0, daily_tokens: DAILY_TOKENS }
      return stored
    }
  } catch { /* storage unavailable */ }
  return seedState()
}

export function saveState(state) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)) } catch { /* storage unavailable */ }
}

function seedState() {
  const conversation = (title, prompt, reply, updated) => ({
    conversation_id: `c-${uuid().slice(0, 8)}`, title, updated_at: updated, pending: null,
    messages: [{ role: 'user', content: prompt }, ...reply.tools.map((tool) => ({ role: 'tool', tool })), { role: 'assistant', content: reply.text }],
  })
  const august = reply({ message: 'What was my biggest leak in August?' }, { month: '2026-08' })
  const tilt = reply({ template: { name: 'tilt-check', arguments: { date: '2026-09-12' } } })
  const setups = reply({ message: 'Which setup makes me the most money?' })
  const state = {
    conversations: [
      conversation('Which setup makes me the most money?', 'Which setup makes me the most money?', setups, '2026-09-24T21:12:00Z'),
      conversation('tilt-check 2026-09-12', '/tilt-check date=2026-09-12', tilt, '2026-09-13T15:02:00Z'),
      conversation('Biggest leak in August', 'What was my biggest leak in August?', august, '2026-09-01T18:40:00Z'),
    ],
    usage: { day: today(), requests: 3, input_tokens: 4_812, output_tokens: 2_236, daily_tokens: DAILY_TOKENS },
  }
  saveState(state)
  return state
}

export function recordUsage(state, input, output) {
  const usage = state.usage?.day === today() ? state.usage : { day: today(), requests: 0, input_tokens: 0, output_tokens: 0, daily_tokens: DAILY_TOKENS }
  // Every turn also sends the journal context and tool results.
  return { ...usage, requests: usage.requests + 1, input_tokens: usage.input_tokens + estimate(input) + 1_150, output_tokens: usage.output_tokens + estimate(output) }
}

/* ------------------------------------------------------------------ replies */

const latestDate = () => tradeLog.reduce((max, trade) => (trade.date > max ? trade.date : max), tradeLog[0]?.date ?? today())
const monthName = (month) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayName = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
const sessions = () => [...new Set(tradeLog.map((trade) => trade.date))].sort()

function leak(options) {
  const month = options.month ?? latestDate().slice(0, 7)
  const trades = tradeLog.filter((trade) => trade.date.startsWith(month))
  const m = (value) => money(value, { privacy: options.privacy, decimals: 0 })
  if (!trades.length) return { tools: ['journal_get_metrics'], text: `There are no trades dated in ${monthName(month)}, so there is nothing to measure yet.` }
  const stats = summarize(trades)
  const setups = groupStats(trades, (trade) => trade.setup).sort((a, b) => a.pnl - b.pnl)
  const hours = byHour(trades).filter((bucket) => bucket.trades).sort((a, b) => a.pnl - b.pnl)
  const days = byWeekday(trades).filter((bucket) => bucket.trades).sort((a, b) => a.pnl - b.pnl)
  const worst = setups[0]
  return {
    tools: ['journal_get_metrics', 'journal_list_trades'],
    text: `In **${monthName(month)}** you took ${stats.trades} trades for ${m(stats.netPnl)} net (win rate ${percent(stats.winRate)}, profit factor ${ratio(stats.profitFactor)}).

Your biggest leak is **${worst.key}**: ${worst.trades} trades, ${m(worst.pnl)} net, ${percent(worst.winRate)} win rate.

Other drags:
- Worst hour: **${hours[0].label}** at ${m(hours[0].pnl)} over ${hours[0].trades} trades
- Worst weekday: **${days[0].label}** at ${m(days[0].pnl)}

Without ${worst.key} the month would have been ${m(stats.netPnl - worst.pnl)}. A simple next step: only take it when every checklist rule is met, or pause it for two weeks and compare.`,
  }
}

function bestSetups(options) {
  const m = (value) => money(value, { privacy: options.privacy, decimals: 0 })
  const rows = groupStats(tradeLog, (trade) => trade.setup).sort((a, b) => b.pnl - a.pnl)
  const top = rows.slice(0, 3)
  const bottom = rows.at(-1)
  return {
    tools: ['journal_get_metrics'],
    text: `Across all ${tradeLog.length} trades, your top setups by net P&L are:

${top.map((row, index) => `${index + 1}. **${row.key}**: ${m(row.pnl)} over ${row.trades} trades (win ${percent(row.winRate)}, PF ${ratio(row.profitFactor)})`).join('\n')}

At the other end, **${bottom.key}** is ${m(bottom.pnl)} over ${bottom.trades} trades. ${top[0].key} earns ${m(top[0].avg)} a trade on average, so it deserves your full size.`,
  }
}

function week(options, endDate) {
  const m = (value) => money(value, { privacy: options.privacy, decimals: 0 })
  const days = sessions().filter((day) => !endDate || day <= endDate).slice(-5)
  if (!days.length) return { tools: ['journal_list_trades'], text: `There are no sessions on or before ${endDate}.` }
  const trades = tradeLog.filter((trade) => days.includes(trade.date))
  const stats = summarize(trades)
  const rows = days.map((day) => {
    const list = trades.filter((trade) => trade.date === day)
    const net = list.reduce((total, trade) => total + trade.pnl, 0)
    return `- ${dayName(day)}: ${m(net)} · ${list.length} trade${list.length === 1 ? '' : 's'}`
  })
  const run = streaks(trades)
  return {
    tools: ['journal_list_trades', 'journal_get_metrics'],
    text: `Your last five sessions (${days[0]} to ${days.at(-1)}) came to **${m(stats.netPnl)}** on ${stats.trades} trades, win rate ${percent(stats.winRate)}, profit factor ${ratio(stats.profitFactor)}.

${rows.join('\n')}

Longest runs: ${run.win} wins and ${run.loss} losses in a row. ${stats.greenSessions >= 3 ? 'Most days were green, so the process is holding.' : 'More red days than green: worth a weekly review before Monday.'}`,
  }
}

function hours(options) {
  const m = (value) => money(value, { privacy: options.privacy, decimals: 0 })
  const rows = byHour(tradeLog).filter((bucket) => bucket.trades)
  const best = [...rows].sort((a, b) => b.pnl - a.pnl)[0]
  const firstBad = rows.find((bucket) => bucket.hour >= 11 && bucket.avgPnl < 0)
  return {
    tools: ['journal_get_metrics'],
    text: `P&L by hour of entry:

${rows.map((bucket) => `- ${bucket.label}: ${m(bucket.pnl)} · ${bucket.trades} trades · win ${percent(bucket.winRate)}`).join('\n')}

Your best hour is **${best.label}**. ${firstBad ? `From **${firstBad.label}** the average trade turns negative, so a hard stop at ${firstBad.label} is the rule the numbers support.` : 'No hour is negative on average, so the data does not argue for a cut-off yet.'}`,
  }
}

function overview(options) {
  const m = (value) => money(value, { privacy: options.privacy })
  const stats = summarize(tradeLog)
  return {
    tools: ['journal_get_metrics'],
    text: `All-time: **${stats.trades} trades**, ${m(stats.netPnl)} net over ${stats.sessions} sessions.

- Win rate ${percent(stats.winRate)} (${stats.wins} W · ${stats.losses} L)
- Profit factor ${ratio(stats.profitFactor)}, expectancy ${m(stats.expectancy)} a trade
- Average win ${m(stats.avgWin)}, average loss ${m(-stats.avgLoss)}
- Max drawdown ${m(stats.maxDrawdown)}; ${percent(stats.dayWinRate)} of sessions were green`,
  }
}

function symbolStats(symbol, options) {
  const m = (value) => money(value, { privacy: options.privacy, decimals: 0 })
  const trades = tradeLog.filter((trade) => trade.symbol === symbol)
  if (!trades.length) return { tools: ['journal_list_trades'], text: `You have no trades in **${symbol}** in the journal.` }
  const stats = summarize(trades)
  const setups = groupStats(trades, (trade) => trade.setup).sort((a, b) => b.pnl - a.pnl)
  return {
    tools: ['journal_list_trades', 'journal_get_metrics'],
    text: `**${symbol}**: ${stats.trades} trades, ${m(stats.netPnl)} net, win rate ${percent(stats.winRate)}, profit factor ${ratio(stats.profitFactor)}.

Best setup on it: ${setups[0].key} (${m(setups[0].pnl)}). Weakest: ${setups.at(-1).key} (${m(setups.at(-1).pnl)}).`,
  }
}

function prop(options) {
  const m = (value) => money(value, { privacy: options.privacy, decimals: 0 })
  const spent = propTransactions.filter((item) => item.amount < 0).reduce((total, item) => total - item.amount, 0)
  const paid = propTransactions.filter((item) => item.type === 'Payout' && item.status === 'Paid').reduce((total, item) => total + item.amount, 0)
  const live = propAccounts.filter((account) => account.status === 'Active')
  return {
    tools: ['journal_list_accounts'],
    text: `Prop firms: ${m(paid)} paid out against ${m(spent)} spent, a net of **${m(paid - spent)}**.

Live accounts:
${live.map((account) => `- ${account.firm} ${account.size / 1000}K (${account.phase}): ${m(account.balance - account.floor)} above the drawdown floor`).join('\n')}`,
  }
}

function tiltCheck(date, options) {
  const m = (value) => money(value, { privacy: options.privacy, decimals: 0 })
  const trades = tradeLog.filter((trade) => trade.date === date).sort((a, b) => a.timestamp - b.timestamp)
  if (!trades.length) return { tools: ['journal_list_trades'], text: `No trades are dated ${date}, so there is nothing to check. Rest days count too.` }
  let run = 0; let worstRun = 0; let afterBig = 0; let bigSeen = false
  trades.forEach((trade) => {
    if (bigSeen) afterBig += 1
    if (trade.pnl < -300) bigSeen = true
    run = trade.pnl < 0 ? run + 1 : 0
    worstRun = Math.max(worstRun, run)
  })
  const net = trades.reduce((total, trade) => total + trade.pnl, 0)
  const flags = [
    trades.length > 4 && `${trades.length} trades, over your 4-trade limit`,
    worstRun >= 2 && `${worstRun} losses in a row`,
    afterBig > 0 && `${afterBig} trade${afterBig === 1 ? '' : 's'} after a loss over $300`,
  ].filter(Boolean)
  return {
    tools: ['journal_list_trades', 'journal_get_day'],
    text: `**${dayName(date)}**: ${trades.length} trades, ${m(net)} net.

${flags.length ? `Tilt signs:\n${flags.map((flag) => `- ${flag}`).join('\n')}\n\nSuggestion: add a note to that day and set a stop-after-two-losses rule.` : 'No tilt signs: trade count, loss runs and post-loss behaviour are all inside your rules.'}`,
  }
}

function setupReview(setup, options) {
  const m = (value) => money(value, { privacy: options.privacy, decimals: 0 })
  const match = groupStats(tradeLog, (trade) => trade.setup).find((row) => row.key.toLowerCase() === setup.trim().toLowerCase())
  if (!match) return { tools: ['journal_get_metrics'], text: `I couldn't find a setup called “${setup}”. Your setups are: ${[...new Set(tradeLog.map((trade) => trade.setup))].join(', ')}.` }
  const trades = tradeLog.filter((trade) => trade.setup === match.key)
  const hourRows = byHour(trades).filter((bucket) => bucket.trades).sort((a, b) => b.pnl - a.pnl)
  return {
    tools: ['journal_get_metrics', 'journal_list_trades'],
    text: `**${match.key}**: ${match.trades} trades, ${m(match.pnl)} net, win ${percent(match.winRate)}, PF ${ratio(match.profitFactor)}, ${m(match.avg)} a trade.

Best hour: ${hourRows[0].label} (${m(hourRows[0].pnl)}). Worst hour: ${hourRows.at(-1).label} (${m(hourRows.at(-1).pnl)}).`,
  }
}

function writeRecap(options) {
  const day = latestDate()
  const trades = tradeLog.filter((trade) => trade.date === day)
  const net = trades.reduce((total, trade) => total + trade.pnl, 0)
  const title = `Recap: ${dayName(day)}`
  const body = `What happened: ${trades.length} trades, ${money(net, { decimals: 0 })} net.

Process (followed / broke rules):
${trades.map((trade) => `- ${trade.time} ${trade.symbol} ${trade.side.toLowerCase()} · ${trade.setup} · grade ${trade.grade} · ${money(trade.pnl, { decimals: 0 })}`).join('\n')}

Outcome vs plan:

Lesson and next action:
`
  return {
    tools: ['journal_list_trades', 'journal_create_entry'],
    text: `I wrote a recap for **${dayName(day)}** into your Notebook as “${title}”, with each trade listed and the Review prompts left for you to fill in. It is tagged #assistant so you can find it.`,
    effect: () => applyCommand({ key: uuid(), kind: 'create', author: 'assistant', content: { title, body, occurred_on: day, tags: ['review', 'assistant'], symbols: [...new Set(trades.map((trade) => trade.symbol))] } }),
  }
}

function archiveOldest() {
  const oldest = loadEntries().filter((entry) => entry.status === 'active').sort((a, b) => (a.content.occurred_on ?? '').localeCompare(b.content.occurred_on ?? ''))[0]
  if (!oldest) return { tools: ['journal_search_entries'], text: 'You have no active notes to archive.' }
  return {
    tools: ['journal_search_entries'],
    text: `Your oldest active note is “${oldest.content.title}” (${oldest.content.occurred_on}). Archiving hides it from the Notebook until you restore it.`,
    pending: { tool: 'journal_archive_entry', arguments: { entry_id: oldest.entry_id, title: oldest.content.title, expected_revision: oldest.revision } },
  }
}

function rules() {
  return {
    tools: ['journal_get_settings'],
    text: 'Here is the rule set I would save, based on your last month of trades. It changes your settings, so I need your go-ahead.',
    pending: { tool: 'journal_update_trading_rules', arguments: { max_trades_per_day: 4, daily_loss_limit: 500, stop_after_consecutive_losses: 2, no_entries_after: '11:30' } },
  }
}

/** Runs a confirmed or declined pending action. */
export function confirm(pending, allow, options) {
  if (!allow) return { tools: [], text: `Okay, I didn't run ${toolLabel(pending.tool)}. Nothing changed.` }
  if (pending.tool === 'journal_archive_entry') {
    return {
      tools: [pending.tool],
      text: `Archived “${pending.arguments.title}”. You can bring it back from Notebook → Archived with **Restore**.`,
      effect: () => applyCommand({ key: uuid(), kind: 'archive', entry_id: pending.arguments.entry_id, expected_revision: pending.arguments.expected_revision }),
    }
  }
  const a = pending.arguments
  return {
    tools: [pending.tool],
    text: `Saved your trading rules: at most **${a.max_trades_per_day} trades** a day, stop at ${money(-a.daily_loss_limit, { privacy: options.privacy, decimals: 0 })}, stop after ${a.stop_after_consecutive_losses} losses in a row, and no new entries after ${a.no_entries_after}.`,
  }
}

const SYMBOL_LIST = () => [...new Set(tradeLog.map((trade) => trade.symbol))]

/** The reply to one turn: `{ tools, text, pending?, effect? }`. */
export function reply(turn, options = {}) {
  if (turn.template) {
    const { name, arguments: args } = turn.template
    if (name === 'tilt-check') return tiltCheck(args.date, options)
    if (name === 'weekly-recap') return week(options, args.date)
    if (name === 'setup-review') return setupReview(args.setup ?? '', options)
  }
  const text = (turn.message ?? '').toLowerCase()
  const month = text.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/)
  const monthIndex = month ? ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(month[1]) : -1
  const monthKey = monthIndex >= 0 ? `2026-${String(monthIndex + 1).padStart(2, '0')}` : options.month
  const symbol = SYMBOL_LIST().find((item) => new RegExp(`\\b${item.toLowerCase()}\\b`).test(text))
  if (/archive|delete .*note|remove .*note/.test(text)) return archiveOldest()
  if (/\b(write|draft|create)\b.*\b(recap|journal|note|day)\b|recap .*journal/.test(text)) return writeRecap(options)
  if (/\brules?\b|\blimit\b|\bgoal/.test(text)) return rules()
  if (/leak|losing|worst|mistake|bleed|hurt/.test(text)) return leak({ ...options, month: monthKey })
  if (/prop|payout|apex|topstep|funded|firm/.test(text)) return prop(options)
  if (symbol) return symbolStats(symbol, options)
  if (/\bsetups?\b|best|edge|most money|makes? me/.test(text)) return bestSetups(options)
  if (/stop trading|hour|time of day|when should/.test(text)) return hours(options)
  if (/week|today|yesterday|how did i do|recap|summar/.test(text)) return week(options)
  if (/win rate|profit factor|expectancy|stats|overall|all.time|performance/.test(text)) return overview(options)
  return {
    tools: [],
    text: `I can answer from your journal and make changes to it. Try asking:

- “What was my biggest leak this month?”
- “How did I do on NVDA?”
- “Write today’s recap into my journal”
- “Set my trading rules”

Or use a template below the message box for a guided check.`,
  }
}
