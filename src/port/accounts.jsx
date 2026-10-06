/**
 * Accounts: trading accounts with their prop-firm rules — drawdown, daily loss, profit
 * target and payout meters, suggested status and rule editing.
 * Seeded from `propAccounts`; edits persist in localStorage.
 */
import React, { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Landmark } from 'lucide-react'
import { FirmLogo, PageHead, MetricStrip, Card } from '../workspace'
import { Drawer, Sheet, Field } from '../dialogs'
import { money, toneOf } from '../viz'
import { tradeLog } from '../data'
import { STATUS_LABELS, accountForTrade, loadAccounts, saveAccounts, uid } from './trading-data'
import { Select } from '../select'
import './accounts.css'

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
const num = (value) => (value == null || value === '' ? null : Number(value))
const STATUS_CHIP = { active: 'Active', funded: 'Funded', blown: 'Blown', 'failed-eval': 'Failed eval' }
// a prop account that's still trading toward its target is in evaluation; "active" only means something for personal accounts
const statusLabel = (account) => (account.content.type === 'prop' && account.content.status === 'active' ? 'Evaluation' : STATUS_CHIP[account.content.status] ?? account.content.status)
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
function RulesPanel({ account, status, privacy, onMark, top = true }) {
  const fmt = (value) => money(value, { privacy, sign: false, decimals: 0 })
  const [marking, setMarking] = useState(false)
  return <div className="ac-rules" aria-label={`Rules for ${account.content.name}`}>
    {top && <div className="ac-rules-top">
      <span>Balance <b>{money(status.balance, { privacy, sign: false })}</b></span>
      <small>{plural(status.trades, 'trade')} · net <em className={`tone-${toneOf(status.net)}`}>{money(status.net, { privacy })}</em></small>
    </div>}
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
        <Select value={draft.drawdown_mode} onChange={(event) => set('drawdown_mode', event.target.value)}>
          <option value="trailing">Trailing (intraday)</option>
          <option value="end-of-day">Trailing (end of day)</option>
          <option value="static">Static</option>
        </Select>
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
        <Select value={draft.type} onChange={(event) => set('type', event.target.value)}>
          <option value="personal">Personal</option><option value="prop">Prop</option>
        </Select>
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

/** One account in the drawer: balance, every rule meter and the payout note, then edit and archive. */
function AccountDrawer({ account, status, index, total, privacy, onStep, onClose, onMark, onEdit, onArchive }) {
  const prop = account.content.type === 'prop'
  return <Drawer label={account.content.name} viewKey={account.id} width={440} onClose={onClose}>
    <div className="trade-panel dw-trade ac-dw">
      <div className="tp-head">
        <div>
          <div className="tp-title"><b>{account.content.name}</b></div>
          <small>{account.content.firm ?? 'Self-managed'} · started at {money(status.size, { privacy, sign: false, decimals: 0 })}</small>
        </div>
        <div className="tp-nav">
          <button type="button" aria-label="Previous account" disabled={index <= 0} onClick={() => onStep(-1)}><ChevronLeft size={15}/></button>
          <button type="button" aria-label="Next account" disabled={index >= total - 1} onClick={() => onStep(1)}><ChevronRight size={15}/></button>
        </div>
      </div>
      <div className="tp-result">
        <strong>{money(status.balance, { privacy, sign: false })}</strong>
        <span className={`ac-status s-${account.content.status}`}>{statusLabel(account)}</span>
      </div>
      <p className="ac-dw-sub"><b className={`tone-${toneOf(status.net)}`}>{money(status.net, { privacy })}</b> · {plural(status.trades, 'trade')}</p>
      {prop && <RulesPanel account={account} status={status} privacy={privacy} onMark={onMark} top={false}/>}
      <div className="dw-actions ac-dw-actions">
        <button type="button" className="ws-outline" onClick={onArchive}>Archive</button>
        {prop && <button type="button" className="start-day" onClick={onEdit}>Edit rules</button>}
      </div>
    </div>
  </Drawer>
}

// Designs by RNSENCE Studio
export function AccountsPage({ privacy, embedded = false }) {
  const [accounts, setAccounts] = useState(loadAccounts)
  const [sheet, setSheet] = useState(null)
  const [draft] = useState(EMPTY_ACCOUNT)
  const [showClosed, setShowClosed] = useState(false)
  const [openId, setOpenId] = useState(null)
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

  // a card is the account at a glance: logo, name, status, balance and result; limits and rules are in the drawer
  const renderCard = (account) => {
    const status = statuses[account.id]
    const open = () => setOpenId(account.id)
    // inside settings each account is one slim row: logo, name, tag, balance and result
    if (embedded) return <button key={account.id} type="button" className={`ac-row${isClosed(account) ? ' is-closed' : ''}`} aria-haspopup="dialog" onClick={open}>
      {account.content.firm ? <FirmLogo firm={account.content.firm}/> : <span className="acct-logo ac-row-self" aria-hidden="true">{account.content.name.slice(0, 1)}</span>}
      <span className="ac-row-id"><b>{account.content.name}</b><small>{account.content.firm ?? 'Self-managed'} · {plural(status.trades, 'trade')}</small></span>
      {account.content.type === 'prop' && <span className={`ac-status s-${account.content.status}`}>{statusLabel(account)}</span>}
      <span className="ac-row-fig"><b>{money(status.balance, { privacy, sign: false, decimals: 0 })}</b><em className={`tone-${toneOf(status.net)}`}>{money(status.net, { privacy, decimals: 0 })}</em></span>
    </button>
    return <article
      key={account.id} className={`home-card ac-card${isClosed(account) ? ' is-closed' : ''}`} role="button" tabIndex={0} aria-haspopup="dialog"
      onClick={open} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open() } }}
    >
      <header>
        {account.content.firm && <FirmLogo firm={account.content.firm}/>}
        <div className="ac-id">
          <h3>{account.content.name}</h3>
          <p>{account.content.firm ?? 'Self-managed'} · {plural(status.trades, 'trade')}</p>
        </div>
        {/* a personal account has no evaluation or payout stage, so it carries no tag */}
        {account.content.type === 'prop' && <span className={`ac-status s-${account.content.status}`}>{statusLabel(account)}</span>}
      </header>
      <div className="ac-figure">
        <strong>{money(status.balance, { privacy, sign: false, decimals: 0 })}</strong>
        <em className={`tone-${toneOf(status.net)}`}>{money(status.net, { privacy, decimals: 0 })}</em>
      </div>
    </article>
  }

  // embedded in Settings: the section heading stands in for the page title and the stats strip is left out
  return <div className={`page home ws-page ac-page${embedded ? ' is-embedded' : ''}`}>
    {embedded ? <div className="embed-actions"><button className="start-day" onClick={() => setSheet({ kind: 'add' })}>Add account</button></div> : <PageHead
      title="Accounts"
      meta={`${plural(live.filter((account) => !isClosed(account)).length, 'open account')} · ${live.filter((account) => !isClosed(account) && account.content.type === 'prop').length} prop`}
      actions={<button className="start-day" onClick={() => setSheet({ kind: 'add' })}>Add account</button>}
    />}

    {!embedded && <MetricStrip items={[
      { label: 'Accounts', value: String(live.length), sub: `${live.filter((account) => !isClosed(account)).length} open · ${live.filter(isClosed).length} closed` },
      { label: 'Starting capital', value: money(starting, { privacy, sign: false, decimals: 0 }), sub: 'All accounts' },
      { label: 'Trades', value: String(tradeLog.length), sub: 'Across all accounts' },
      { label: 'Net P&L', value: money(tradingPnl, { privacy, decimals: 0 }), tone: toneOf(tradingPnl), sub: 'All accounts' },
    ]}/>}

    {/* open accounts in two groups: prop firm accounts, then personal ones */}
    {[['prop', 'Prop firms'], ['personal', 'Personal']].map(([type, label]) => {
      const list = sorted.filter((account) => !isClosed(account) && (type === 'prop' ? account.content.type === 'prop' : account.content.type !== 'prop'))
      return list.length > 0 && <section key={type} className="ac-section" aria-label={label}>
        <h2 className="ac-section-label">{label}</h2>
        <div className="ac-grid">{list.map(renderCard)}</div>
      </section>
    })}
    {!live.length && <div className="ac-grid"><Card className="ac-empty"><Landmark size={18}/><p>Add a personal or prop account to start recording trades.</p></Card></div>}
    {sorted.some(isClosed) && <section className={`ac-closed${showClosed ? ' is-open' : ''}`}>
      <button type="button" className="ac-closed-head" aria-expanded={showClosed} onClick={() => setShowClosed(!showClosed)}>
        <span className="ac-closed-title">Closed out</span>
        <span className="ac-closed-meta">Blown or failed, kept for history</span>
      </button>
      {showClosed && <div className="ac-grid">{sorted.filter(isClosed).map(renderCard)}</div>}
    </section>}
    {archived.length > 0 && <button type="button" className="ws-more ac-restore" onClick={() => update(accounts.map((account) => ({ ...account, archived: false })))}>
      {plural(archived.length, 'archived account')} · Restore
    </button>}

    {(() => {
      // open accounts step among themselves; closed ones among the closed
      const opened = sorted.find((item) => item.id === openId)
      if (!opened) return null
      const group = sorted.filter((account) => isClosed(account) === isClosed(opened))
      const index = group.findIndex((account) => account.id === openId)
      if (index < 0) return null
      const account = group[index]
      return <AccountDrawer
        account={account} status={statuses[account.id]} index={index} total={group.length} privacy={privacy}
        onStep={(delta) => { const next = group[index + delta]; if (next) setOpenId(next.id) }}
        onClose={() => setOpenId(null)}
        onMark={(next) => patchContent(account.id, { ...account.content, status: next, status_date: today })}
        onEdit={() => { setOpenId(null); setSheet({ kind: 'rules', id: account.id }) }}
        onArchive={() => { setOpenId(null); update(accounts.map((item) => (item.id === account.id ? { ...item, archived: true } : item))) }}
      />
    })()}

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
