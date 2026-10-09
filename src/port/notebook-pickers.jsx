/**
 * Search-bar pickers: a symbol input with top-3 suggestions, and a date field with the app's own calendar.
 * Both float in a portal and flip above the field when the viewport's bottom is too close.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarBlank, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { SymbolToken } from '../viz'
import { searchSymbols } from '../symbols'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const todayIso = () => { const t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()) }
const pretty = (value) => (value ? new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '')

/** Place a floating panel under an anchor, or above it if it would run off the bottom. */
export function useFloat(open, anchorRef, estimate, width, panelRef) {
  const [place, setPlace] = useState(null)
  useLayoutEffect(() => {
    if (!open) { setPlace(null); return undefined }
    const measure = () => {
      const r = anchorRef.current?.getBoundingClientRect()
      if (!r) return
      const height = panelRef?.current?.offsetHeight || estimate
      const gap = 6, edge = 8, below = window.innerHeight - r.bottom - gap - edge, above = r.top - gap - edge
      const up = below < height && above > below
      const room = up ? above : below
      const h = Math.min(height, room)
      const w = width ?? r.width
      const left = Math.max(edge, Math.min(r.left, window.innerWidth - w - edge))
      setPlace({ left, width: w, top: up ? r.top - gap - h : r.bottom + gap, up, maxHeight: room })
    }
    measure()
    window.addEventListener('resize', measure); window.addEventListener('scroll', measure, true)
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [open, estimate, width])
  // once the panel has rendered, re-place it with its real height
  useLayoutEffect(() => { if (open && place && panelRef?.current) window.dispatchEvent(new Event('resize')) }, [open, !!place])
  return place
}

/* ------------------------------------------------------------ symbol autocomplete */

export function SymbolInput({ value, onChange, placeholder = 'SPY' }) {
  const [focused, setFocused] = useState(false)
  const [cursor, setCursor] = useState(0)
  const boxRef = useRef(null)
  const options = useMemo(() => (value.trim() ? searchSymbols(value.trim(), 3).filter(([symbol]) => symbol !== value.trim().toUpperCase()) : []), [value])
  const open = focused && options.length > 0
  const place = useFloat(open, boxRef, options.length * 44 + 10, 280)
  useEffect(() => setCursor(0), [value])
  const pick = (symbol) => { onChange(symbol); setFocused(false) }
  const onKey = (event) => {
    if (!open) return
    if (event.key === 'ArrowDown') { event.preventDefault(); setCursor((i) => (i + 1) % options.length) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setCursor((i) => (i - 1 + options.length) % options.length) }
    if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); pick(options[cursor][0]) }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setFocused(false) }
  }
  const known = !!value.trim() && searchSymbols(value.trim(), 20).some(([symbol]) => symbol === value.trim().toUpperCase())
  return <span ref={boxRef} className="ws-search nb-input nb-symbol-input">
    {known && <SymbolToken symbol={value.trim().toUpperCase()}/>}
    <input
      aria-label="Symbol" placeholder={placeholder} maxLength={20} value={value} autoComplete="off"
      role="combobox" aria-expanded={open} aria-autocomplete="list" aria-controls={open ? 'nb-symbol-options' : undefined}
      onChange={(event) => onChange(event.target.value.toUpperCase())} onKeyDown={onKey}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    />
    {open && place && createPortal(<div id="nb-symbol-options" role="listbox" aria-label="Symbol suggestions"
      className={`nb-ed-suggest${place.up ? ' is-up' : ''}`} style={{ left: place.left, top: place.top, width: place.width, maxHeight: place.maxHeight }}>
      {options.map(([symbol, name, kind], index) => <button
        key={symbol} type="button" role="option" aria-selected={index === cursor} className={index === cursor ? 'on' : ''}
        onMouseEnter={() => setCursor(index)} onMouseDown={(event) => { event.preventDefault(); pick(symbol) }}
      >
        <SymbolToken symbol={symbol}/>
        <span className="nb-ed-suggest-copy"><b>{symbol}</b><small>{name}{kind ? ` · ${kind}` : ''}</small></span>
        {index === cursor && <kbd>↵</kbd>}
      </button>)}
    </div>, document.body)}
  </span>
}

/* ------------------------------------------------------------ date field */

export function DateField({ value, onChange, min, max, label, placeholder = 'Any date' }) {
  const [open, setOpen] = useState(false)
  const start = value || todayIso()
  const [view, setView] = useState({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 })
  const [focusDay, setFocusDay] = useState(start)
  const boxRef = useRef(null), panelRef = useRef(null)
  const place = useFloat(open, boxRef, 318, 272, panelRef)
  useEffect(() => {
    if (!open) return undefined
    const s = value || todayIso()
    setView({ y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)) - 1 }); setFocusDay(s)
    const away = (event) => { if (!boxRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay()
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(Date.UTC(view.y, view.m, 1 - first + i)); return { iso: d.toISOString().slice(0, 10), day: d.getUTCDate(), out: d.getUTCMonth() !== view.m } })
  }, [view])
  const shift = (n) => setView(({ y, m }) => { const d = new Date(Date.UTC(y, m + n, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() } })
  const blocked = (d) => (min && d < min) || (max && d > max)
  const choose = (d) => { if (blocked(d)) return; onChange(d); setOpen(false); boxRef.current?.querySelector('button')?.focus() }
  const moveFocus = (days) => {
    const d = new Date(`${focusDay}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days)
    const next = d.toISOString().slice(0, 10); setFocusDay(next)
    if (next.slice(0, 7) !== iso(view.y, view.m, 1).slice(0, 7)) setView({ y: Number(next.slice(0, 4)), m: Number(next.slice(5, 7)) - 1 })
  }
  const onKey = (event) => {
    const map = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (map[event.key]) { event.preventDefault(); moveFocus(map[event.key]) }
    if (event.key === 'Enter') { event.preventDefault(); choose(focusDay) }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); boxRef.current?.querySelector('button')?.focus() }
  }
  useEffect(() => { if (open) panelRef.current?.querySelector(`[data-day="${focusDay}"]`)?.focus({ preventScroll: true }) }, [focusDay, open, place])
  const today = todayIso()
  return <span ref={boxRef} className={`ws-search nb-input nb-datefield${open ? ' is-open' : ''}`}>
    <button type="button" className={value ? '' : 'is-empty'} aria-label={`${label}: ${value ? pretty(value) : 'not set'}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
      <span>{value ? pretty(value) : placeholder}</span>
      <CalendarBlank size={14} weight="duotone"/>
    </button>
    {open && place && createPortal(<div ref={panelRef} role="dialog" aria-label={`Pick ${label.toLowerCase()}`}
      className={`nb-cal${place.up ? ' is-up' : ''}`} style={{ left: place.left, top: place.top, width: place.width, maxHeight: place.maxHeight }} onKeyDown={onKey}>
      <div className="nb-cal-head">
        <b>{MONTHS[view.m]} <span>{view.y}</span></b>
        <div className="nb-cal-nav">
          <button type="button" aria-label="Previous month" onClick={() => shift(-1)}><CaretLeft size={14} weight="bold"/></button>
          <button type="button" aria-label="Next month" onClick={() => shift(1)}><CaretRight size={14} weight="bold"/></button>
        </div>
      </div>
      <div className="nb-cal-week">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="nb-cal-grid" role="grid">
        {cells.map((cell) => <button
          key={cell.iso} type="button" data-day={cell.iso} tabIndex={cell.iso === focusDay ? 0 : -1}
          className={`${cell.out ? 'out ' : ''}${cell.iso === value ? 'picked ' : ''}${cell.iso === today ? 'today ' : ''}${(min && cell.iso === min) || (max && cell.iso === max) ? 'edge ' : ''}`}
          disabled={blocked(cell.iso)} aria-pressed={cell.iso === value} aria-label={pretty(cell.iso)} onClick={() => choose(cell.iso)}
        >{cell.day}</button>)}
      </div>
      <div className="nb-cal-foot">
        <button type="button" onClick={() => { onChange(''); setOpen(false) }} disabled={!value}>Clear</button>
        <button type="button" onClick={() => choose(today)} disabled={blocked(today)}>Today</button>
      </div>
    </div>, document.body)}
  </span>
}

/* ------------------------------------------------------------ date range */

const shiftIso = (value, days) => { const d = new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
const short = (value) => new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
export const PRESETS = [
  ['Today', () => { const t = todayIso(); return [t, t] }],
  ['Last 7 days', () => { const t = todayIso(); return [shiftIso(t, -6), t] }],
  ['Last 30 days', () => { const t = todayIso(); return [shiftIso(t, -29), t] }],
  ['This month', () => { const t = todayIso(); return [`${t.slice(0, 7)}-01`, t] }],
  ['This year', () => { const t = todayIso(); return [`${t.slice(0, 4)}-01-01`, t] }],
]

/* ------------------------------------------------------------ one Filters menu */

/** Symbol, dates and tag in one dropdown. Everything applies as you pick; the trigger counts what is on. */
export function FilterMenu({ filters, tags, onChange }) {
  const [open, setOpen] = useState(false)
  const [symbol, setSymbol] = useState(filters.symbol)
  const [tagQuery, setTagQuery] = useState('')
  const [chosen, setChosen] = useState(null)
  const boxRef = useRef(null), panelRef = useRef(null)
  const place = useFloat(open, boxRef, 420, Math.min(340, window.innerWidth - 16), panelRef)
  useEffect(() => setSymbol(filters.symbol), [filters.symbol])
  // symbol applies a moment after typing stops, so half-typed tickers don't flash empty results
  useEffect(() => { if (symbol === filters.symbol) return undefined; const t = window.setTimeout(() => onChange({ symbol: symbol.trim() }), 350); return () => window.clearTimeout(t) }, [symbol])
  useEffect(() => {
    if (!open) return undefined
    const away = (event) => {
      if (boxRef.current?.contains(event.target) || panelRef.current?.contains(event.target) || event.target.closest?.('.nb-cal, .nb-ed-suggest')) return
      setOpen(false)
    }
    const esc = (event) => { if (event.key === 'Escape' && !document.querySelector('.nb-cal:not(.nb-filter-panel), .nb-ed-suggest')) { setOpen(false); boxRef.current?.querySelector('button')?.focus() } }
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])
  const count = [filters.symbol, filters.from || filters.to, filters.tag].filter(Boolean).length
  const matches = (name) => { const [a, b] = PRESETS.find(([n]) => n === name)[1](); return a === filters.from && b === filters.to }
  const active = chosen && matches(chosen) ? chosen : PRESETS.find(([name]) => matches(name))?.[0]
  const shownTags = tags.filter((item) => !tagQuery.trim() || item.tag.toLowerCase().includes(tagQuery.trim().replace(/^#/, '').toLowerCase()))
  const summary = [filters.symbol, filters.tag && `#${filters.tag}`, (filters.from || filters.to) && (active ?? 'Dates')].filter(Boolean)
  return <span ref={boxRef} className="nb-filtermenu">
    <button type="button" className={`nb-btn nb-filterbtn${count ? ' is-set' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
      Filters
      {count > 0 && <em>{count}</em>}
    </button>
    {summary.length > 0 && <span className="nb-filter-summary">{summary.join(' · ')}</span>}
    {open && place && createPortal(<div ref={panelRef} role="dialog" aria-label="Filters"
      className={`nb-cal nb-filter-panel${place.up ? ' is-up' : ''}`} style={{ left: place.left, top: place.top, width: place.width, maxHeight: place.maxHeight }}>
      <section className="nb-fp-sec">
        <header><span>Symbol</span>{filters.symbol && <button type="button" onClick={() => { setSymbol(''); onChange({ symbol: '' }) }}>Clear</button>}</header>
        <SymbolInput value={symbol} onChange={setSymbol} placeholder="Any symbol"/>
      </section>
      <section className="nb-fp-sec">
        <header><span>Dates</span>{(filters.from || filters.to) && <button type="button" onClick={() => onChange({ from: '', to: '' })}>Clear</button>}</header>
        <div className="nb-range-presets">
          {PRESETS.map(([name, make]) => <button key={name} type="button" className={active === name ? 'on' : ''} aria-pressed={active === name}
            onClick={() => { if (active === name) { onChange({ from: '', to: '' }); return } setChosen(name); const [from, to] = make(); onChange({ from, to }) }}>{name}</button>)}
        </div>
        <div className="nb-range-fields">
          <label><span>From</span><DateField label="From date" value={filters.from} max={filters.to || undefined} onChange={(from) => onChange({ from })}/></label>
          <label><span>To</span><DateField label="To date" value={filters.to} min={filters.from || undefined} onChange={(to) => onChange({ to })}/></label>
        </div>
      </section>
      <section className="nb-fp-sec">
        <header><span>Tag</span>{filters.tag && <button type="button" onClick={() => onChange({ tag: '' })}>Clear</button>}</header>
        {tags.length > 8 && <input className="nb-tagsearch" placeholder="Find a tag" aria-label="Find a tag" value={tagQuery} onChange={(event) => setTagQuery(event.target.value)}/>}
        <div className="nb-fp-tags" role="listbox" aria-label="Tags">
          {shownTags.map((item) => <button key={item.tag} type="button" role="option" aria-selected={filters.tag === item.tag}
            className={filters.tag === item.tag ? 'on' : ''} onClick={() => onChange({ tag: filters.tag === item.tag ? '' : item.tag })}>
            #{item.tag}<em>{item.count}</em>
          </button>)}
          {!shownTags.length && <span className="nb-tagnone">No tag matches.</span>}
        </div>
      </section>
      <div className="nb-cal-foot">
        <button type="button" disabled={!count} onClick={() => { setSymbol(''); onChange({ symbol: '', from: '', to: '', tag: '' }) }}>Clear all</button>
        <button type="button" onClick={() => setOpen(false)}>Done</button>
      </div>
    </div>, document.body)}
  </span>
}
