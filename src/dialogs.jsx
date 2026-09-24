import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, CalendarDays, Clock3, CornerDownLeft, FileText, Landmark, LayoutDashboard, ListFilter, NotebookPen, Plus, Search, X, ChartNoAxesCombined } from 'lucide-react'
import { SETUP_CODES } from './analytics'
import { addCustomSymbol, allSymbols, searchSymbols } from './symbols'
import { addPropAccount, logTrade, propAccounts, recordPropTransaction, tradeLog, tradingDays } from './data'
import { money, toneOf } from './viz'

const easternIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const dayLabel = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

/** Centered dialog with a dimmed backdrop; Escape or a backdrop click closes it. */
function Dialog({ title, subtitle, onClose, children, footer, width = 520, className = '' }) {
  const panelRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') closeRef.current() }
    const previous = document.activeElement
    document.addEventListener('keydown', onKey)
    document.body.classList.add('dlg-open')
    panelRef.current?.querySelector('input, select, textarea, button:not(.dlg-close)')?.focus()
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('dlg-open'); previous?.focus?.() }
  }, [])
  return createPortal(<div className="dlg-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className={`dlg ${className}`} role="dialog" aria-modal="true" aria-label={title} style={{ '--dlg-width': `${width}px` }} ref={panelRef}>
      {title && <header className="dlg-head">
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <button type="button" className="dlg-close" aria-label="Close" onClick={onClose}><X size={16}/></button>
      </header>}
      {children}
      {footer && <footer className="dlg-foot">{footer}</footer>}
    </div>
  </div>, document.body)
}

function Field({ label, children, hint, error, wide = false }) {
  return <label className={`dlg-field${wide ? ' wide' : ''}`}>
    <span>{label}</span>
    {children}
    {error ? <small className="is-error">{error}</small> : hint && <small>{hint}</small>}
  </label>
}

function Choice({ options, value, onChange, label, format = (option) => option, tones = {} }) {
  return <div className="dlg-choice" role="radiogroup" aria-label={label}>
    {options.map((option) => <button key={option} type="button" role="radio" aria-checked={value === option} className={`${value === option ? 'on' : ''} ${tones[option] ?? ''}`} onClick={() => onChange(option)}>{format(option)}</button>)}
  </div>
}

const pad2 = (value) => String(value).padStart(2, '0')

/** Time field with a themed hour / minute / AM–PM popover; value is 24h "HH:MM". */
function TimePicker({ value, onChange, label, invalid = false }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const [hours, minutes] = value.split(':').map(Number)
  const hour12 = hours % 12 || 12
  const period = hours >= 12 ? 'PM' : 'AM'
  const commit = (nextHour12, nextMinute, nextPeriod) => {
    const base = nextHour12 % 12
    onChange(`${pad2(nextPeriod === 'PM' ? base + 12 : base)}:${pad2(nextMinute)}`)
  }
  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('mousedown', onPointer)
    rootRef.current?.querySelectorAll('.tp-col .on').forEach((node) => node.scrollIntoView({ block: 'center' }))
    return () => document.removeEventListener('mousedown', onPointer)
  }, [open])
  const column = (items, current, pick, format = (item) => item) => <div className={`tp-col${items.length < 4 ? ' short' : ''}`} role="listbox">
    {items.map((item) => <button key={item} type="button" role="option" aria-selected={item === current} className={item === current ? 'on' : ''} onClick={() => pick(item)}>{format(item)}</button>)}
  </div>
  return <div
    className={`time-pick${open ? ' is-open' : ''}`} ref={rootRef}
    onKeyDown={(event) => { if (event.key === 'Escape' && open) { event.stopPropagation(); event.nativeEvent.stopImmediatePropagation(); setOpen(false) } }}
  >
    <button type="button" className="time-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-invalid={invalid} onClick={() => setOpen(!open)}>
      <span>{pad2(hour12)}:{pad2(minutes)} <em>{period}</em></span>
      <Clock3 size={14}/>
    </button>
    {open && <div className="time-pop">
      {column(Array.from({ length: 12 }, (_, index) => index + 1), hour12, (item) => commit(item, minutes, period), pad2)}
      {column(Array.from({ length: 60 }, (_, index) => index), minutes, (item) => commit(hour12, item, period), pad2)}
      {column(['AM', 'PM'], period, (item) => commit(hour12, minutes, item))}
    </div>}
  </div>
}

/** Searchable instrument field: directory matches, recent symbols, or create a custom one. */
function SymbolPicker({ value, onChange, invalid = false }) {
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const rootRef = useRef(null)
  const lookup = (symbol) => allSymbols().find(([item]) => item === symbol.toUpperCase())
  const selected = value ? lookup(value) : null
  const recent = useMemo(() => {
    const counts = new Map()
    tradeLog.forEach((trade) => counts.set(trade.symbol, (counts.get(trade.symbol) ?? 0) + 1))
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([symbol]) => lookup(symbol) ?? [symbol, 'Traded before', 'Custom'])
  }, [])
  const text = value.trim().toUpperCase()
  const matches = text ? searchSymbols(text, 8) : recent
  const canCreate = text && /^[A-Z0-9.\-/!]{1,12}$/.test(text) && !matches.some(([symbol]) => symbol === text)
  const options = [...matches.map((entry) => ({ kind: 'pick', entry })), ...(canCreate ? [{ kind: 'create', entry: [text, 'Custom symbol', 'Custom'] }] : [])]
  useEffect(() => { setCursor(0) }, [value])
  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [open])
  const choose = (option) => {
    if (!option) return
    if (option.kind === 'create') addCustomSymbol(option.entry[0])
    onChange(option.entry[0])
    setOpen(false)
  }
  const onKey = (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setCursor((index) => Math.min(options.length - 1, index + 1)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setCursor((index) => Math.max(0, index - 1)) }
    if (event.key === 'Enter' && open && options.length) { event.preventDefault(); choose(options[cursor]) }
    if (event.key === 'Escape' && open) { event.stopPropagation(); event.nativeEvent.stopImmediatePropagation(); setOpen(false) }
  }
  return <div className={`sym-pick${open ? ' is-open' : ''}`} ref={rootRef}>
    <div className="sym-input">
      <Search size={14}/>
      <input
        value={value} placeholder="Search symbol, e.g. QQQ or NQ" autoComplete="off" spellCheck={false}
        aria-label="Symbol" aria-invalid={invalid} aria-expanded={open} role="combobox"
        onFocus={() => setOpen(true)} onKeyDown={onKey}
        onChange={(event) => { onChange(event.target.value.toUpperCase()); setOpen(true) }}
      />
      {selected && <em className={`sym-class c-${selected[2].split(' ')[0].toLowerCase()}`}>{selected[2]}</em>}
    </div>
    {open && options.length > 0 && <ul className="sym-list" role="listbox">
      {!text && <li className="sym-group" aria-hidden="true">Your most traded</li>}
      {options.map((option, index) => <li
        key={`${option.kind}-${option.entry[0]}-${option.entry[2]}`} role="option" aria-selected={index === cursor}
        className={`${index === cursor ? 'on' : ''}${option.kind === 'create' ? ' create' : ''}`}
        onMouseEnter={() => setCursor(index)} onMouseDown={(event) => { event.preventDefault(); choose(option) }}
      >
        {option.kind === 'create'
          ? <><Plus size={14}/><span>Create custom symbol <b>{option.entry[0]}</b></span></>
          : <><b>{option.entry[0]}</b><span>{option.entry[1]}</span><em className={`sym-class c-${option.entry[2].split(' ')[0].toLowerCase()}`}>{option.entry[2]}</em></>}
      </li>)}
    </ul>}
  </div>
}

/* ------------------------------------------------------------------ log a trade */

// Designs by RNSENCE Studio
export function LogTradeDialog({ defaultDate, onClose, onSaved }) {
  const [form, setForm] = useState({
    date: defaultDate || easternIso(), symbol: '', side: 'Long', setup: Object.keys(SETUP_CODES)[0],
    time: '09:45', closed: '10:05', qty: '', entry: '', exit: '', fees: '2.25', withFees: false, grade: 'B',
  })
  const [touched, setTouched] = useState(false)
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event?.target ? event.target.value : event }))
  const numbers = { qty: Number(form.qty), entry: Number(form.entry), exit: Number(form.exit), fees: form.withFees ? Number(form.fees) || 0 : 0 }
  const errors = {
    symbol: !form.symbol.trim() && 'Add a symbol',
    qty: !(numbers.qty > 0) && 'Quantity must be above 0',
    entry: !(numbers.entry > 0) && 'Entry price required',
    exit: !(numbers.exit > 0) && 'Exit price required',
    closed: form.closed < form.time && 'Exit is before entry',
  }
  const valid = !Object.values(errors).some(Boolean)
  const preview = valid ? ((numbers.exit - numbers.entry) * numbers.qty * (form.side === 'Short' ? -1 : 1)) - numbers.fees : null
  const save = (event) => {
    event.preventDefault()
    setTouched(true)
    if (!valid) return
    onSaved(logTrade({ ...form, symbol: form.symbol.trim(), ...numbers }))
  }
  const show = (key) => touched && errors[key]

  return <Dialog title="Log a trade" subtitle="Saved to your journal and every report" onClose={onClose} width={560}>
    <form className="dlg-body" onSubmit={save} noValidate>
      <div className="dlg-grid">
        <div className="dlg-field">
          <span>Symbol</span>
          <SymbolPicker value={form.symbol} onChange={set('symbol')} invalid={!!show('symbol')}/>
          {show('symbol') && <small className="is-error">{show('symbol')}</small>}
        </div>
        <Field label="Date"><input type="date" value={form.date} onChange={set('date')}/></Field>
        <Field label="Side"><Choice label="Side" options={['Long', 'Short']} value={form.side} onChange={set('side')} tones={{ Long: 'long', Short: 'short' }}/></Field>
        <Field label="Setup">
          <select value={form.setup} onChange={set('setup')}>{Object.keys(SETUP_CODES).map((setup) => <option key={setup}>{setup}</option>)}</select>
        </Field>
        <div className="dlg-field"><span>Entry time</span><TimePicker label="Entry time" value={form.time} onChange={set('time')}/></div>
        <div className="dlg-field">
          <span>Exit time</span>
          <TimePicker label="Exit time" value={form.closed} onChange={set('closed')} invalid={!!show('closed')}/>
          {show('closed') && <small className="is-error">{show('closed')}</small>}
        </div>
        <Field label="Quantity" error={show('qty')}><input inputMode="decimal" value={form.qty} onChange={set('qty')} placeholder="100" aria-invalid={!!show('qty')}/></Field>
        <div className="dlg-field">
          <span className="dlg-toggle-label">
            Fees
            <button type="button" role="switch" aria-checked={form.withFees} aria-label="Include fees" className={`dlg-switch${form.withFees ? ' on' : ''}`} onClick={() => setForm((current) => ({ ...current, withFees: !current.withFees }))}><i/></button>
          </span>
          <input inputMode="decimal" value={form.withFees ? form.fees : ''} placeholder="Not included" disabled={!form.withFees} onChange={set('fees')} aria-label="Fees"/>
        </div>
        <Field label="Entry price" error={show('entry')}><input inputMode="decimal" value={form.entry} onChange={set('entry')} placeholder="0.00" aria-invalid={!!show('entry')}/></Field>
        <Field label="Exit price" error={show('exit')}><input inputMode="decimal" value={form.exit} onChange={set('exit')} placeholder="0.00" aria-invalid={!!show('exit')}/></Field>
        <Field label="Grade" wide><Choice label="Grade" options={['A+', 'A', 'B', 'C', 'D']} value={form.grade} onChange={set('grade')} tones={{ 'A+': 'g-ap', A: 'g-a', B: 'g-b', C: 'g-c', D: 'g-d' }}/></Field>
      </div>
      <div className="dlg-foot">
        <span className="dlg-preview">Net P&L <b className={preview == null ? '' : `tone-${toneOf(preview)}`}>{preview == null ? '—' : money(preview)}</b></span>
        <div className="dlg-actions">
          <button type="button" className="ws-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="start-day"><Plus size={15} strokeWidth={2.2}/> Save trade</button>
        </div>
      </div>
    </form>
  </Dialog>
}

/* ------------------------------------------------------------ prop firm entries */

const FIRMS = ['Apex', 'Topstep', 'MyFundedFutures', 'Tradeify', 'Lucid', 'Take Profit Trader']
const DRAWDOWN_BY_SIZE = { 25000: 1500, 50000: 2500, 100000: 3000, 150000: 4500 }

export function PropEntryDialog({ onClose }) {
  const accounts = propAccounts.filter((account) => account.status !== 'Breached')
  const [form, setForm] = useState({ kind: 'Payout', account: accounts[0]?.id ?? '', category: 'Evaluation', amount: '', date: easternIso(), status: 'Paid' })
  const [touched, setTouched] = useState(false)
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event?.target ? event.target.value : event }))
  const amount = Number(form.amount)
  const valid = amount > 0 && form.account
  const save = (event) => {
    event.preventDefault()
    setTouched(true)
    if (!valid) return
    const account = propAccounts.find((item) => item.id === form.account)
    recordPropTransaction(form.kind === 'Payout'
      ? { date: form.date, firm: account.firm, account: account.id, type: 'Payout', amount, status: form.status }
      : { date: form.date, firm: account.firm, account: account.id, type: form.category, amount: -amount })
    onClose()
  }
  return <Dialog title="Record a transaction" subtitle="Payouts in, fees out — the ledger and charts update instantly" onClose={onClose} width={480}>
    <form className="dlg-body" onSubmit={save} noValidate>
      <div className="dlg-grid">
        <Field label="Type" wide><Choice label="Type" options={['Payout', 'Expense']} value={form.kind} onChange={set('kind')}/></Field>
        <Field label="Account" wide>
          <select value={form.account} onChange={set('account')}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.firm} {account.size / 1000}K · {account.id}</option>)}</select>
        </Field>
        {form.kind === 'Expense' && <Field label="Category" wide><Choice label="Category" options={['Evaluation', 'Reset', 'Subscription', 'Activation']} value={form.category} onChange={set('category')}/></Field>}
        <Field label="Amount" error={touched && !(amount > 0) && 'Enter an amount'}><input inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder="0.00" aria-invalid={touched && !(amount > 0)}/></Field>
        <Field label="Date"><input type="date" value={form.date} onChange={set('date')}/></Field>
        {form.kind === 'Payout' && <Field label="Status" wide><Choice label="Status" options={['Paid', 'Pending']} value={form.status} onChange={set('status')}/></Field>}
      </div>
      <div className="dlg-foot">
        <span className="dlg-preview">{form.kind === 'Payout' ? 'Payout' : 'Expense'} <b className={amount > 0 ? (form.kind === 'Payout' ? 'tone-pos' : 'tone-neg') : ''}>{amount > 0 ? money(form.kind === 'Payout' ? amount : -amount) : '—'}</b></span>
        <div className="dlg-actions">
          <button type="button" className="ws-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="start-day">Save</button>
        </div>
      </div>
    </form>
  </Dialog>
}

export function AddAccountDialog({ onClose }) {
  const [form, setForm] = useState({ firm: 'Apex', id: '', size: '50000', phase: 'Evaluation', fee: '' })
  const [touched, setTouched] = useState(false)
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event?.target ? event.target.value : event }))
  const duplicate = propAccounts.some((account) => account.id === form.id.trim())
  const idError = !form.id.trim() ? 'Add the account number from your firm dashboard' : duplicate ? 'That account is already tracked' : null
  const save = (event) => {
    event.preventDefault()
    setTouched(true)
    if (idError) return
    const size = Number(form.size)
    addPropAccount({ firm: form.firm, id: form.id.trim(), size, phase: form.phase, maxDrawdown: DRAWDOWN_BY_SIZE[size], fee: Number(form.fee) || 0 })
    onClose()
  }
  return <Dialog title="Add an account" subtitle="Track balance, drawdown room and payouts" onClose={onClose} width={480}>
    <form className="dlg-body" onSubmit={save} noValidate>
      <div className="dlg-grid">
        <Field label="Firm" wide><select value={form.firm} onChange={set('firm')}>{FIRMS.map((firm) => <option key={firm}>{firm}</option>)}</select></Field>
        <Field label="Account number" wide error={touched && idError}><input value={form.id} onChange={set('id')} placeholder="e.g. APEX-248193-18" aria-invalid={!!(touched && idError)}/></Field>
        <Field label="Size" wide><Choice label="Size" options={['25000', '50000', '100000', '150000']} value={form.size} onChange={set('size')} format={(option) => `${Number(option) / 1000}K`}/></Field>
        <Field label="Stage"><Choice label="Stage" options={['Evaluation', 'Funded']} value={form.phase} onChange={set('phase')}/></Field>
        <Field label="Fee paid" hint="Adds an expense to the ledger"><input inputMode="decimal" value={form.fee} onChange={set('fee')} placeholder="0.00"/></Field>
      </div>
      <div className="dlg-foot">
        <span className="dlg-preview">Max drawdown <b>{money(DRAWDOWN_BY_SIZE[Number(form.size)], { sign: false, decimals: 0 })}</b></span>
        <div className="dlg-actions">
          <button type="button" className="ws-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="start-day"><Plus size={15} strokeWidth={2.2}/> Add account</button>
        </div>
      </div>
    </form>
  </Dialog>
}

/* ------------------------------------------------------------------ quick jump */

const PAGES = [
  ['Dashboard', LayoutDashboard], ['Calendar', CalendarDays], ['Daily journal', NotebookPen],
  ['Trades', ListFilter], ['Reports', ChartNoAxesCombined], ['Prop firms', Landmark],
]

/** ⌘K palette: jump to a page, a trading day's journal, or a symbol's trades. */
// Designs by RNSENCE Studio
export function QuickJump({ onClose, setPage, openJournal, openTrades, openLog }) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const items = useMemo(() => {
    const text = query.trim().toLowerCase()
    const pages = PAGES.filter(([label]) => !text || label.toLowerCase().includes(text))
      .map(([label, Icon]) => ({ key: `page-${label}`, group: 'Pages', label, Icon, run: () => setPage(label) }))
    const actions = (!text || 'log a trade'.includes(text) || 'new trade'.includes(text))
      ? [{ key: 'log', group: 'Actions', label: 'Log a trade', Icon: Plus, run: openLog }] : []
    const days = tradingDays().slice().reverse()
      .filter((iso) => !text || dayLabel(iso).toLowerCase().includes(text) || iso.includes(text))
      .slice(0, text ? 6 : 4)
      .map((iso) => {
        const pnl = tradeLog.filter((trade) => trade.date === iso).reduce((sum, trade) => sum + trade.pnl, 0)
        return { key: `day-${iso}`, group: 'Journal', label: dayLabel(iso), meta: money(pnl, { decimals: 0 }), tone: toneOf(pnl), Icon: FileText, run: () => openJournal(iso) }
      })
    const symbols = text ? [...new Set(tradeLog.map((trade) => trade.symbol))]
      .filter((symbol) => symbol.toLowerCase().startsWith(text))
      .map((symbol) => ({ key: `sym-${symbol}`, group: 'Symbols', label: symbol, meta: `${tradeLog.filter((trade) => trade.symbol === symbol).length} trades`, Icon: Search, run: () => openTrades(symbol) })) : []
    return [...actions, ...symbols, ...days, ...pages]
  }, [query])
  useEffect(() => { setCursor(0) }, [query])
  const run = (item) => { if (!item) return; onClose(); item.run() }
  const onKey = (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setCursor((value) => Math.min(items.length - 1, value + 1)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setCursor((value) => Math.max(0, value - 1)) }
    if (event.key === 'Enter') { event.preventDefault(); run(items[cursor]) }
  }
  let lastGroup = null
  return <Dialog onClose={onClose} width={520} className="jump">
    <div className="jump-input">
      <Search size={16}/>
      <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onKey} placeholder="Jump to a page, day or symbol…" aria-label="Quick jump"/>
      <kbd>esc</kbd>
    </div>
    <ul className="jump-list" role="listbox">
      {items.length === 0 && <li className="jump-empty">No matches for “{query}”</li>}
      {items.map((item, index) => {
        const heading = item.group !== lastGroup ? item.group : null
        lastGroup = item.group
        return <React.Fragment key={item.key}>
          {heading && <li className="jump-group" aria-hidden="true">{heading}</li>}
          <li role="option" aria-selected={index === cursor} className={index === cursor ? 'on' : ''} onMouseEnter={() => setCursor(index)} onClick={() => run(item)}>
            <item.Icon size={15}/>
            <span>{item.label}</span>
            {item.meta && <em className={item.tone ? `tone-${item.tone}` : undefined}>{item.meta}</em>}
            {index === cursor ? <CornerDownLeft size={13} className="jump-enter"/> : <ArrowRight size={13} className="jump-enter idle"/>}
          </li>
        </React.Fragment>
      })}
    </ul>
  </Dialog>
}
