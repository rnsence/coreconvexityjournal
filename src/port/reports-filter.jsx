/**
 * One Filters menu for every trade set on Reports: the trigger, then the active filters as small removable
 * chips. The panel offers what the trades actually hold (with counts) instead of free-text boxes.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from '@phosphor-icons/react'
import { SymbolToken } from '../viz'
import { DateField, PRESETS, SymbolInput, useFloat } from './notebook-pickers'
import { Select } from '../select'
import { ACCOUNTS, applyFilter, cleanFilter, filterCount } from './reports-data'

const DIRECTIONS = [['', 'Both'], ['long', 'Long'], ['short', 'Short']]
const short = (value) => new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const tally = (list, pick) => {
  const counts = new Map()
  list.forEach((trade) => pick(trade).forEach((key) => counts.set(key, (counts.get(key) ?? 0) + 1)))
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

/** One filter as a row: its name on the left, one compact control on the right. */
function Row({ label, set, onClear, children }) {
  return <div className="rf-row">
    <span className="rf-row-label">{label}</span>
    <div className="rf-row-control">{children}</div>
    <button type="button" className="rf-row-clear" aria-label={`Clear ${label.toLowerCase()}`} onClick={onClear} disabled={!set} tabIndex={set ? 0 : -1}><X size={11} weight="bold"/></button>
  </div>
}

/** A custom dropdown of values with their trade counts; the empty option means "any". */
function Pick({ label, value, options, onPick, any = 'Any' }) {
  return <Select className="rf-field" aria-label={label} value={value ?? ''} onChange={(event) => onPick(event.target.value || undefined)}>
    <option value="">{any}</option>
    {options.map(([key, count, name]) => <option key={key} value={key}>{`${name ?? key}${count != null ? ` · ${count}` : ''}`}</option>)}
  </Select>
}

/** Active filters as removable chips; the symbol chip carries its logo. */
function Summary({ value, onChange }) {
  const f = cleanFilter(value)
  const chips = []
  if (f.direction) chips.push(['direction', f.direction === 'long' ? 'Long' : 'Short'])
  if (f.symbol) chips.push(['symbol', f.symbol, <SymbolToken key="t" symbol={f.symbol}/>])
  if (f.setup) chips.push(['setup', f.setup])
  if (f.account) chips.push(['account', f.account])
  if (f.tag) chips.push(['tag', `#${f.tag}`])
  if (f.mistake) chips.push(['mistake', f.mistake])
  if (f.from || f.to) chips.push(['dates', f.from && f.to ? `${short(f.from)} – ${short(f.to)}` : f.from ? `From ${short(f.from)}` : `Until ${short(f.to)}`])
  return chips.map(([key, text, icon]) => <span key={key} className={`rf-chip${icon ? ' has-icon' : ''}`}>
    {icon}{text}
    <button type="button" aria-label={`Remove ${text}`} onClick={() => onChange(key === 'dates' ? { ...value, from: undefined, to: undefined } : { ...value, [key]: undefined })}><X size={10} weight="bold"/></button>
  </span>)
}

export function TradeFilter({ trades, value, onChange, setups, label = 'Filters', compact = false }) {
  const [open, setOpen] = useState(false)
  const [symbol, setSymbol] = useState(value.symbol ?? '')
  const [custom, setCustom] = useState(false)
  const boxRef = useRef(null), panelRef = useRef(null)
  const place = useFloat(open, boxRef, 360, Math.min(340, window.innerWidth - 16), panelRef)
  const set = (patch) => onChange(cleanFilter({ ...value, ...patch }))
  const pool = useMemo(() => applyFilter(trades, {}), [trades])
  const tags = useMemo(() => tally(pool, (trade) => trade.tags), [pool])
  const mistakes = useMemo(() => tally(pool, (trade) => trade.mistakes), [pool])
  const setupCounts = useMemo(() => { const counts = new Map(tally(pool, (trade) => [trade.setup])); return setups.map((setup) => [setup, counts.get(setup) ?? 0]) }, [pool, setups])
  const accounts = useMemo(() => { const counts = new Map(tally(pool, (trade) => [trade.account])); return ACCOUNTS.map((account) => [account, counts.get(account) ?? 0]) }, [pool])
  useEffect(() => setSymbol(value.symbol ?? ''), [value.symbol])
  // the symbol applies a moment after typing stops, so half-typed tickers don't flash empty results
  useEffect(() => { if (symbol === (value.symbol ?? '')) return undefined; const t = window.setTimeout(() => set({ symbol: symbol.trim() || undefined }), 350); return () => window.clearTimeout(t) }, [symbol])
  useEffect(() => {
    if (!open) return undefined
    const away = (event) => {
      if (boxRef.current?.contains(event.target) || panelRef.current?.contains(event.target) || event.target.closest?.('.nb-cal, .nb-ed-suggest, .cs-menu')) return
      setOpen(false)
    }
    const esc = (event) => { if (event.key === 'Escape' && !document.querySelector('.nb-cal:not(.nb-filter-panel), .nb-ed-suggest, .cs-menu')) { setOpen(false); boxRef.current?.querySelector('button')?.focus() } }
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])
  const count = filterCount(value) - (value.from && value.to ? 1 : 0)
  const matches = (name) => { const [a, b] = PRESETS.find(([n]) => n === name)[1](); return a === value.from && b === value.to }
  const preset = PRESETS.find(([name]) => matches(name))?.[0]
  const dateChoice = custom || ((value.from || value.to) && !preset) ? 'custom' : preset ?? ''

  return <div ref={boxRef} className={`rf-bar${compact ? ' is-compact' : ''}`}>
    <button type="button" className={`rf-btn${count ? ' is-set' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
      {label}
      {count > 0 && <em>{count}</em>}
    </button>
    <Summary value={value} onChange={onChange}/>
    {open && place && createPortal(<div ref={panelRef} role="dialog" aria-label={label}
      className={`nb-cal nb-filter-panel rf-panel${place.up ? ' is-up' : ''}`} style={{ left: place.left, top: place.top, width: place.width, maxHeight: place.maxHeight }}>
      <Row label="Direction" set={!!value.direction} onClear={() => set({ direction: undefined })}>
        <div className="rf-seg" role="radiogroup" aria-label="Direction">
          {DIRECTIONS.map(([key, name]) => <button key={name} type="button" role="radio" aria-checked={(value.direction ?? '') === key}
            className={`${key ? `is-${key}` : ''}${(value.direction ?? '') === key ? ' on' : ''}`} onClick={() => set({ direction: key || undefined })}>{name}</button>)}
        </div>
      </Row>
      <Row label="Symbol" set={!!value.symbol} onClear={() => { setSymbol(''); set({ symbol: undefined }) }}>
        <SymbolInput value={symbol} onChange={setSymbol} placeholder="Any symbol"/>
      </Row>
      <Row label="Setup" set={!!value.setup} onClear={() => set({ setup: undefined })}>
        <Pick label="Setup" value={value.setup} options={setupCounts} onPick={(setup) => set({ setup })} any="Any setup"/>
      </Row>
      <Row label="Dates" set={!!(value.from || value.to)} onClear={() => { setCustom(false); set({ from: undefined, to: undefined }) }}>
        <Select className="rf-field" aria-label="Dates" value={dateChoice} onChange={(event) => {
          const choice = event.target.value
          if (choice === 'custom') { setCustom(true); return }
          setCustom(false)
          if (!choice) { set({ from: undefined, to: undefined }); return }
          const [from, to] = PRESETS.find(([name]) => name === choice)[1](); set({ from, to })
        }}>
          <option value="">Any time</option>
          {PRESETS.map(([name]) => <option key={name} value={name}>{name}</option>)}
          <option value="custom">Custom range…</option>
        </Select>
      </Row>
      {dateChoice === 'custom' && <div className="rf-range">
        <DateField label="From date" value={value.from ?? ''} max={value.to || undefined} onChange={(from) => set({ from: from || undefined })} placeholder="From"/>
        <span aria-hidden="true">–</span>
        <DateField label="To date" value={value.to ?? ''} min={value.from || undefined} onChange={(to) => set({ to: to || undefined })} placeholder="To"/>
      </div>}
      <Row label="Account" set={!!value.account} onClear={() => set({ account: undefined })}>
        <Pick label="Account" value={value.account} options={accounts} onPick={(account) => set({ account })} any="Any account"/>
      </Row>
      <Row label="Tag" set={!!value.tag} onClear={() => set({ tag: undefined })}>
        <Pick label="Tag" value={value.tag} options={tags.map(([key, n]) => [key, n, `#${key}`])} onPick={(tag) => set({ tag })} any="Any tag"/>
      </Row>
      <Row label="Mistake" set={!!value.mistake} onClear={() => set({ mistake: undefined })}>
        <Pick label="Mistake" value={value.mistake} options={mistakes} onPick={(mistake) => set({ mistake })} any="Any mistake"/>
      </Row>
      <div className="nb-cal-foot">
        <button type="button" disabled={!filterCount(value)} onClick={() => { setSymbol(''); setCustom(false); onChange({}) }}>Clear all</button>
        <button type="button" onClick={() => setOpen(false)}>Done</button>
      </div>
    </div>, document.body)}
  </div>
}
