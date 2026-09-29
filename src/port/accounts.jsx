/**
 * Accounts: trading accounts with their prop-firm rules — drawdown, daily loss, profit
 * target and payout meters, suggested status, rule editing, and a position sizer.
 * Seeded from `propAccounts`; edits persist in localStorage.
 */
import React, { useMemo, useState } from 'react'
import { Archive, Calculator, ChevronDown, Landmark, Plus } from 'lucide-react'
import { PageHead, MetricStrip, Card } from '../workspace'
import { Sheet, Field } from '../dialogs'
import { money, toneOf } from '../viz'
import { tradeLog } from '../data'
import { STATUS_LABELS, accountForTrade, loadAccounts, saveAccounts, sizePosition, uid } from './trading-data'
import './accounts.css'

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
const num = (value) => (value == null || value === '' ? null : Number(value))
const STATUS_CHIP = { active: 'Active', funded: 'Funded', blown: 'Blown', 'failed-eval': 'Failed eval' }
const isClosed = (account) => ['blown', 'failed-eval'].includes(account.content.status)
const latestDay = () => tradeLog.reduce((max, trade) => (trade.date > max ? trade.date : max), '')

/** Prop-rule status for one account as of `today`. */
export function ruleStatus(account, today) {
  const content = account.content
  const size = Number(content.size) || 0
  const trades = tradeLog.filter((trade) => accountForTrade(trade)?.id === account.id)
  const tradedNet = trades.reduce((total, trade) => total + trade.pnl, 0)
  const balance = account.seed?.balance ?? size + tradedNet
  const net = balance - size
  const out = { size, balance, net, trades: trades.length, breaches: [] }
  if (content.type !== 'prop') return out
  const buffer = num(content.buffer)
  if (buffer != null) {
    const peak = Math.max(account.seed?.peak ?? balance, balance, size)
    let floor = content.drawdown_mode === 'static' ? size - buffer : peak - buffer
    let locked = false
    if (content.drawdown_locks_at_start && content.drawdown_mode !== 'static' && floor >= size) { floor = size; locked = true }
    const remaining = balance - floor
    out.drawdown = { max: buffer, remaining, floor, locked, breached: remaining <= 0 }
    if (remaining <= 0) out.breaches.push('drawdown')
  }
  const limit = num(content.daily_limit)
  if (limit != null) {
    const dayNet = trades.filter((trade) => trade.date === today).reduce((total, trade) => total + trade.pnl, 0)
    const used = Math.max(0, -dayNet)
    out.daily = { limit, used, date: today, breached: used >= limit }
    if (used >= limit) out.breaches.push('daily')
  }
  const target = num(content.profit_target)
  if (target != null) out.target = { target, remaining: Math.max(0, target - net), reached: net >= target }
  const payoutBuffer = num(content.payout_buffer)
  if (payoutBuffer != null && !['blown', 'failed-eval'].includes(content.status)) {
    const threshold = size + payoutBuffer
    const split = num(content.split)
    out.payout = { threshold, eligible: balance >= threshold, remaining: Math.max(0, threshold - balance), estimate: balance > threshold && split != null ? (balance - threshold) * split : null }
  }
  const status = content.status
  if (out.drawdown?.breached && ['active', 'funded'].includes(status)) out.suggested = status === 'funded' ? 'blown' : 'failed-eval'
  else if (out.target?.reached && status === 'active') out.suggested = 'funded'
  return out
}

const share = (used, limit) => Math.max(0, Math.min(1, used / (limit || 1)))

function Meter({ label, detail, value, danger }) {
  return <div className="ac-meter">
    <div className="acct-meter-head"><span>{label}</span><b>{detail}</b></div>
    <div className="acct-bar" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={Number(value.toFixed(3))} aria-label={`${label} used`}>
      <i className={danger ? 'neg' : 'accent'} style={{ width: `${value * 100}%` }}/>
    </div>
  </div>
}

/** §9 AccountRulesPanel. */
function RulesPanel({ account, status, privacy, onMark }) {
  const fmt = (value) => money(value, { privacy, sign: false, decimals: 0 })
  const [marking, setMarking] = useState(false)
  return <div className="ac-rules" aria-label={`Rules for ${account.content.name}`}>
    <div className="ac-rules-top">
      <span>Balance <b>{money(status.balance, { privacy, sign: false })}</b></span>
      <small>{plural(status.trades, 'trade')} · net <em className={`tone-${toneOf(status.net)}`}>{money(status.net, { privacy })}</em></small>
    </div>
    {(status.breaches.length > 0 || status.target?.reached) && <div className="ac-badges">
      {status.breaches.map((kind) => <span key={kind} className="ac-badge neg">{kind === 'drawdown' ? 'Drawdown breached' : 'Daily loss limit hit'}</span>)}
      {status.target?.reached && <span className="ac-badge pos">Profit target reached</span>}
    </div>}
    {status.suggested && <div className="ac-suggest" aria-label="Suggested status">
      <span>The rules say this account is now {STATUS_LABELS[status.suggested]}.</span>
      <button type="button" className="ac-btn" disabled={marking} onClick={() => { setMarking(true); window.setTimeout(() => onMark(status.suggested), 240) }}>{marking ? 'Saving…' : `Mark as ${STATUS_LABELS[status.suggested]}`}</button>
    </div>}
    {status.drawdown && <Meter
      label="Max drawdown" danger={status.drawdown.breached}
      value={share(status.drawdown.max - status.drawdown.remaining, status.drawdown.max)}
      detail={`${fmt(Math.max(0, status.drawdown.remaining))} left · floor ${fmt(status.drawdown.floor)}${status.drawdown.locked ? ' (locked)' : ''}`}
    />}
    {status.daily && <Meter
      label={`Daily loss (${status.daily.date})`} danger={status.daily.breached}
      value={share(status.daily.used, status.daily.limit)} detail={`${fmt(status.daily.used)} of ${fmt(status.daily.limit)}`}
    />}
    {status.target && <Meter
      label="Profit target" value={share(status.target.target - status.target.remaining, status.target.target)}
      detail={status.target.reached ? 'reached' : `${fmt(status.target.remaining)} to go`}
    />}
    {status.payout && <p className="ac-payout">{status.payout.eligible
      ? <>Above the payout threshold {fmt(status.payout.threshold)}{status.payout.estimate != null ? `; estimated payout ${fmt(status.payout.estimate)} before firm caps and fees` : ''}</>
      : <>{fmt(status.payout.remaining)} until the payout threshold {fmt(status.payout.threshold)}</>}</p>}
  </div>
}

/** PropRuleFields: limits typed from the firm's terms. */
function PropRuleFields({ draft, set }) {
  const text = (key) => ({ value: draft[key] ?? '', onChange: (event) => set(key, event.target.value.trim() || null) })
  return <fieldset className="ac-fieldset">
    <legend>Firm rules (from your firm's terms)</legend>
    <div className="dlg-grid">
      <Field label="Max drawdown"><input inputMode="decimal" placeholder="2000" {...text('buffer')}/></Field>
      <Field label="Drawdown type">
        <select value={draft.drawdown_mode} onChange={(event) => set('drawdown_mode', event.target.value)}>
          <option value="trailing">Trailing (intraday)</option>
          <option value="end-of-day">Trailing (end of day)</option>
          <option value="static">Static</option>
        </select>
      </Field>
      <label className="ac-check wide">
        <input type="checkbox" checked={!!draft.drawdown_locks_at_start} onChange={(event) => set('drawdown_locks_at_start', event.target.checked)}/>
        Trailing stops once the floor reaches the starting balance
      </label>
      <Field label="Daily loss limit"><input inputMode="decimal" {...text('daily_limit')}/></Field>
      <Field label="Profit target"><input inputMode="decimal" {...text('profit_target')}/></Field>
      <Field label="Payout buffer"><input inputMode="decimal" placeholder="above starting size" {...text('payout_buffer')}/></Field>
      <Field label="Profit split"><input inputMode="decimal" placeholder="0.9" {...text('split')}/></Field>
    </div>
  </fieldset>
}

const EMPTY_ACCOUNT = {
  name: '', size: '', type: 'personal', firm: null, buffer: null, daily_limit: null, split: null, payout_buffer: null,
  status_date: null, status_notes: null, profit_target: null, hwm_pnl: '0', status: 'active', drawdown_mode: 'trailing', drawdown_locks_at_start: false,
}

function AccountForm({ initial, onSubmit, onCancel }) {
  const [draft, setDraft] = useState(initial)
  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }))
  return <form className="ac-form" onSubmit={(event) => { event.preventDefault(); onSubmit(draft) }}>
    <div className="dlg-grid">
      <Field label="Name"><input required maxLength={255} value={draft.name} onChange={(event) => set('name', event.target.value)}/></Field>
      <Field label="Starting size"><input required inputMode="decimal" placeholder="50000" value={draft.size} onChange={(event) => set('size', event.target.value)}/></Field>
      <Field label="Type">
        <select value={draft.type} onChange={(event) => set('type', event.target.value)}>
          <option value="personal">Personal</option><option value="prop">Prop</option>
        </select>
      </Field>
      <Field label="Firm (optional)"><input maxLength={255} value={draft.firm ?? ''} onChange={(event) => set('firm', event.target.value || null)}/></Field>
    </div>
    {draft.type === 'prop' && <PropRuleFields draft={draft} set={set}/>}
    <div className="dlg-foot ac-foot">
      <span/>
      <div className="dlg-actions">
        <button type="button" className="ws-outline" onClick={onCancel}>Cancel</button>
        <button type="submit" className="start-day">Save account</button>
      </div>
    </div>
  </form>
}

function EditRulesForm({ account, onSubmit, onCancel }) {
  const [draft, setDraft] = useState(account.content)
  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }))
  return <form className="ac-form" onSubmit={(event) => { event.preventDefault(); onSubmit(draft) }}>
    <PropRuleFields draft={draft} set={set}/>
    <div className="dlg-foot ac-foot">
      <span/>
      <div className="dlg-actions">
        <button type="button" className="ws-outline" onClick={onCancel}>Cancel</button>
        <button type="submit" className="start-day">Save rules</button>
      </div>
    </div>
  </form>
}

function PositionSizer({ accounts, statuses, privacy }) {
  const [form, setForm] = useState({ account: accounts.find((account) => account.content.type === 'prop')?.id ?? accounts[0]?.id ?? '', symbol: 'MNQ', entry: '21450.25', stop: '21430', mode: 'money', budget: '500' })
  const [result, setResult] = useState(null)
  const [pending, setPending] = useState(false)
  const set = (key) => (event) => { setForm((current) => ({ ...current, [key]: event.target.value })); setResult(null) }
  const balance = statuses[form.account]?.balance ?? null
  const ready = form.entry && form.stop && form.budget && form.symbol && (form.mode === 'money' || form.account)
  return <Card title="Position sizer" className="ac-sizer" aside={<span className="ws-hint">Risk per unit = |entry − stop| × point value</span>}>
    <div className="ac-sizer-grid" role="group" aria-label="Position sizer">
      <Field label="Account">
        <select value={form.account} onChange={set('account')}>
          <option value="">No account</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.content.name}</option>)}
        </select>
      </Field>
      <Field label="Symbol"><input value={form.symbol} onChange={set('symbol')} placeholder="MNQ"/></Field>
      <Field label="Entry"><input inputMode="decimal" value={form.entry} onChange={set('entry')} placeholder="21450.25"/></Field>
      <Field label="Stop"><input inputMode="decimal" value={form.stop} onChange={set('stop')} placeholder="21430"/></Field>
      <Field label="Risk as">
        <select aria-label="Risk as" value={form.mode} onChange={set('mode')}>
          <option value="money">Money</option>
          <option value="percent" disabled={!form.account}>% of account</option>
        </select>
      </Field>
      <Field label="Risk budget"><input aria-label="Risk budget" inputMode="decimal" value={form.budget} onChange={set('budget')} placeholder={form.mode === 'money' ? '500' : '1'}/></Field>
      <button
        type="button" className="start-day ac-size-btn" disabled={!ready || pending}
        onClick={() => { setPending(true); window.setTimeout(() => { setResult(sizePosition({ ...form, balance })); setPending(false) }, 260) }}
      ><Calculator size={15}/> {pending ? 'Sizing…' : 'Size'}</button>
    </div>
    {result?.error && <p className="ac-error" role="alert">{result.error}</p>}
    {result && !result.error && <div className="ac-sized" aria-live="polite">
      <strong>{result.quantity}</strong>
      <span>{result.unit} risk <b>{money(result.risk, { privacy, sign: false })}</b> of {money(result.budget, { privacy, sign: false })}{result.balance != null ? ` (balance ${money(result.balance, { privacy, sign: false, decimals: 0 })} USD)` : ''} · {result.perUnit} a unit at the stop, point value {result.pointValue}{result.futures ? ' from the futures table' : ''}. Rounded down.</span>
    </div>}
  </Card>
}

// Designs by RNSENCE Studio
export function AccountsPage({ privacy }) {
  const [accounts, setAccounts] = useState(loadAccounts)
  const [sheet, setSheet] = useState(null)
  const [draft] = useState(EMPTY_ACCOUNT)
  const [showClosed, setShowClosed] = useState(false)
  const today = useMemo(latestDay, [])
  const update = (next) => { setAccounts(next); saveAccounts(next) }
  const live = accounts.filter((account) => !account.archived)
  const archived = accounts.filter((account) => account.archived)
  const statuses = useMemo(() => Object.fromEntries(live.map((account) => [account.id, ruleStatus(account, today)])), [accounts, today])
  const starting = live.reduce((total, account) => total + (Number(account.content.size) || 0), 0)
  const tradingPnl = tradeLog.reduce((total, trade) => total + trade.pnl, 0)
  const patchContent = (id, content) => update(accounts.map((account) => (account.id === id ? { ...account, content, revision: account.revision + 1 } : account)))
  const order = { funded: 0, active: 1, blown: 2, 'failed-eval': 3 }
  const sorted = [...live].sort((a, b) => (a.content.type === b.content.type ? 0 : a.content.type === 'prop' ? -1 : 1) || order[a.content.status] - order[b.content.status])
  const editing = accounts.find((account) => account.id === sheet?.id)
  const fmt0 = (value) => money(value, { privacy, sign: false, decimals: 0 })

  const renderCard = (account) => {
        const status = statuses[account.id]
        return <article key={account.id} className={`home-card ac-card${['blown', 'failed-eval'].includes(account.content.status) ? ' is-closed' : ''}`}>
          <header>
            <div>
              <h3>{account.content.name}</h3>
              <p>{account.content.firm ?? 'Self-managed'} · {account.content.type}</p>
            </div>
            <span className={`ac-status s-${account.content.status}`}>{STATUS_CHIP[account.content.status] ?? account.content.status}</span>
          </header>
          <p className="ac-size">{money(Number(account.content.size), { privacy, sign: false })}</p>
          {account.content.type === 'prop'
            ? <RulesPanel
                account={account} status={status} privacy={privacy}
                onMark={(next) => patchContent(account.id, { ...account.content, status: next, status_date: today })}
              />
            : <div className="ac-rules"><div className="ac-rules-top"><span>Balance <b>{money(status.balance, { privacy, sign: false })}</b></span><small>{plural(status.trades, 'trade')} · net <em className={`tone-${toneOf(status.net)}`}>{money(status.net, { privacy })}</em></small></div></div>}
          <div className="ac-actions">
            {account.content.type === 'prop' && <button type="button" className="ac-btn" onClick={() => setSheet({ kind: 'rules', id: account.id })}>Edit rules</button>}
            <button type="button" className="ac-btn" onClick={() => update(accounts.map((item) => (item.id === account.id ? { ...item, archived: true } : item)))}><Archive size={13}/> Archive</button>
          </div>
        </article>
      }

  return <div className="page home ws-page ac-page">
    <PageHead
      title="Accounts"
      meta={`${plural(live.length, 'account')} · ${live.filter((account) => account.content.type === 'prop').length} prop · rules checked for ${today}`}
      actions={<button className="start-day" onClick={() => setSheet({ kind: 'add' })}><Plus size={16} strokeWidth={2.2}/> Add account</button>}
    />

    <MetricStrip items={[
      { label: 'Trading accounts', value: String(live.length), sub: `${live.filter((account) => ['active', 'funded'].includes(account.content.status)).length} open · ${live.filter((account) => ['blown', 'failed-eval'].includes(account.content.status)).length} closed out` },
      { label: 'Starting capital', value: money(starting, { privacy, sign: false }), sub: 'Sum of starting sizes, USD' },
      { label: 'Recorded trades', value: String(tradeLog.length), sub: 'All trades in the journal' },
      { label: 'Trading P&L', value: money(tradingPnl, { privacy }), tone: toneOf(tradingPnl), sub: 'Net, USD' },
    ]}/>

    <Card title="Rule status" className="ac-status-card" aside={<span className="ws-hint">Measured against the limits you entered</span>}>
      <div className="ws-table-wrap">
        <table className="feed-table ws-table compact ledger ac-table">
          <thead><tr><th>Account</th><th>Status</th><th>Balance</th><th>Drawdown left</th><th>Daily loss</th><th>Profit target</th><th>Payout</th></tr></thead>
          <tbody>{sorted.map((account) => {
            const status = statuses[account.id]
            return <tr key={account.id} className={isClosed(account) ? 'ac-row-closed' : ''}>
              <td><b>{account.content.name}</b><small>{account.content.firm ?? 'Self-managed'} · {account.content.type}</small></td>
              <td><span className={`ac-status s-${account.content.status}`}>{STATUS_CHIP[account.content.status] ?? account.content.status}</span></td>
              <td>{money(status.balance, { privacy, sign: false })}</td>
              <td className={status.drawdown?.breached ? 'tone-neg' : ''}>{status.drawdown ? fmt0(Math.max(0, status.drawdown.remaining)) : '—'}</td>
              <td>{status.daily ? <>{fmt0(status.daily.used)} <em className="ac-of">/ {fmt0(status.daily.limit)}</em></> : '—'}</td>
              <td>{status.target ? (status.target.reached ? <span className="ac-badge pos">Reached</span> : `${fmt0(status.target.remaining)} to go`) : '—'}</td>
              <td>{status.payout ? (status.payout.eligible ? <span className="ac-badge pos">Eligible</span> : `${fmt0(status.payout.remaining)} to go`) : '—'}</td>
            </tr>
          })}</tbody>
        </table>
      </div>
    </Card>

    <div className="ac-grid">
      {sorted.filter((account) => !isClosed(account)).map(renderCard)}
      {!live.length && <Card className="ac-empty"><Landmark size={18}/><p>Add a personal or prop account to start recording trades.</p></Card>}
    </div>
    {sorted.some(isClosed) && <section className={`ac-closed${showClosed ? ' is-open' : ''}`}>
      <button type="button" className="ac-closed-head" aria-expanded={showClosed} onClick={() => setShowClosed(!showClosed)}>
        <span className="ac-closed-title">Closed out <em>{sorted.filter(isClosed).length}</em></span>
        <span className="ac-closed-meta">Blown or failed evaluations keep their rules and history</span>
        <span className="cc-caret-box"><ChevronDown size={14} strokeWidth={2.2}/></span>
      </button>
      {showClosed && <div className="ac-grid">{sorted.filter(isClosed).map(renderCard)}</div>}
    </section>}
    {archived.length > 0 && <button type="button" className="ws-more ac-restore" onClick={() => update(accounts.map((account) => ({ ...account, archived: false })))}>
      {plural(archived.length, 'archived account')} · Restore
    </button>}

    <PositionSizer accounts={live} statuses={statuses} privacy={privacy}/>

    {sheet?.kind === 'add' && <Sheet title="Add trading account" subtitle="Set up a personal or prop trading account." onClose={() => setSheet(null)} width={560} className="ac-sheet">
      <AccountForm initial={draft} onCancel={() => setSheet(null)} onSubmit={(content) => {
        update([...accounts, { id: uid('acct'), revision: 1, archived: false, content: { ...content, name: content.name.trim(), size: content.size.trim(), firm: content.firm?.trim() || null }, seed: { balance: null, peak: null } }])
        setSheet(null)
      }}/>
    </Sheet>}
    {sheet?.kind === 'rules' && editing && <Sheet title={`${editing.content.name} rules`} subtitle="Enter the limits from your firm's terms; the journal measures against exactly these." onClose={() => setSheet(null)} width={560} className="ac-sheet">
      <EditRulesForm account={editing} onCancel={() => setSheet(null)} onSubmit={(content) => { patchContent(editing.id, content); setSheet(null) }}/>
    </Sheet>}
  </div>
}
