/**
 * Progress: the weekly review. One week in focus (its numbers, its days and what is still to review),
 * the run of recent weeks with their review state, and the routine.
 * Reviewing opens a sheet that pins the revision of every note and trade it covers.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { AlertTriangle, Check, FileText } from 'lucide-react'
import { MetricStrip, PageHead, Segmented } from '../workspace'
import { SymbolToken, money, toneOf } from '../viz'
import { metricRows, pickRows } from './calendar-metrics'
import { RoutineCard } from './calendar-routine'
import { useFloat } from './notebook-pickers'
import { ProgressReviewSheet } from './progress-review'
import { reviewQueue, tradeLabel } from './progress-data'
import './progress.css'

const LIST_CAP = 5
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const shortDay = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const range = (week) => `${shortDay(week.starts_on)} – ${shortDay(week.ends_on)}`
// "Sep 14 – 20"; both months only when the week crosses one
const shortRange = (week) => {
  const [a, b] = [shortDay(week.starts_on), shortDay(week.ends_on)]
  return a.split(' ')[0] === b.split(' ')[0] ? `${a} – ${b.split(' ')[1]}` : `${a} – ${b}`
}

/** One status per week, in plain words; colour is kept for P&L, so status reads by icon and text. */
export function weekStatus(week) {
  if (week.review_status === 'out_of_date') return { key: 'stale', label: 'Review out of date' }
  if (week.review_status === 'current') return { key: 'done', label: week.pending ? `Reviewed · ${week.pending} new` : 'Reviewed' }
  if (!week.entries.length && !week.trades.length) return { key: 'empty', label: 'No activity' }
  return { key: 'todo', label: 'Not reviewed' }
}
export const StatusBadge = ({ week }) => {
  const status = weekStatus(week)
  return <span className={`pg-status is-${status.key}`}>
    {status.key === 'done' ? <Check size={12} strokeWidth={2.6}/> : status.key === 'stale' ? <AlertTriangle size={12} strokeWidth={2.2}/> : <i/>}
    {status.label}
  </span>
}

function describeStale(item, week, fmt) {
  const trade = week.trades.find((candidate) => candidate.trade.id === item.id)?.trade
  const entry = week.entries.find((candidate) => candidate.entry_id === item.id)
  const name = trade ? tradeLabel(trade, fmt) : entry ? `"${entry.title}"` : `${item.kind === 'trade' ? 'A trade' : 'A note'}`
  if (item.reason === 'changed') return `${name} was edited after the review`
  if (item.reason === 'removed') return `${name} was archived after the review`
  return `${name} was added after the review`
}

/** Mon–Fri net P&L as five small bars around a baseline; empty days are a short grey tick. */
function dayNets(week) {
  return WEEKDAY.map((label, index) => {
    const date = new Date(Date.parse(`${week.starts_on}T00:00:00Z`) + index * 86400000).toISOString().slice(0, 10)
    const list = week.trades.filter((item) => item.trade.date === date).map((item) => item.trade)
    return { label, date, net: list.reduce((sum, trade) => sum + trade.pnl, 0), trades: list.length }
  })
}
/** Mon–Fri as five squircle tiles, tinted by how large each day's result was; the hover tip gives the figure. */
function DayTiles({ week, privacy }) {
  const days = dayNets(week)
  const peak = Math.max(1, ...days.map((day) => Math.abs(day.net)))
  const line = (day) => `${day.label} ${day.trades ? money(day.net, { privacy, decimals: 0 }) : 'no trades'}`
  return <span className="pg-tiles" role="img" aria-label={days.map(line).join(', ')}>
    {days.map((day) => <span key={day.label} className={`pg-tile${day.trades ? ` is-${day.net >= 0 ? 'pos' : 'neg'}` : ''}`} style={{ '--k': day.trades ? 0.18 + 0.62 * (Math.abs(day.net) / peak) : 0 }}>
      <span aria-hidden="true">{day.label[0]}</span>
      <span className="pg-day-tip" aria-hidden="true"><b className={day.trades ? `tone-${toneOf(day.net)}` : undefined}>{day.trades ? money(day.net, { privacy, decimals: 0 }) : 'No trades'}</b><em>{day.label}{day.trades > 0 && ` · ${day.trades} trade${day.trades === 1 ? '' : 's'}`}</em></span>
    </span>)}
  </span>
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const addDays = (value, days) => new Date(Date.parse(`${value}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)

/** A calendar button: the month opens as Monday-first week rows, and a row with a review week picks it. */
function WeekPicker({ weeks, value, onChange }) {
  const [open, setOpen] = useState(false)
  const current = weeks.find((week) => week.week === value) ?? weeks[0]
  const [view, setView] = useState(() => current.starts_on.slice(0, 7))
  const [focus, setFocus] = useState(current.starts_on)
  const boxRef = useRef(null), panelRef = useRef(null)
  const place = useFloat(open, boxRef, 300, 272, panelRef)
  const byStart = useMemo(() => new Map(weeks.map((week) => [week.starts_on, week])), [weeks])
  const starts = useMemo(() => [...byStart.keys()].sort(), [byStart])
  useEffect(() => {
    if (!open) return undefined
    setView(current.starts_on.slice(0, 7)); setFocus(current.starts_on)
    const away = (event) => { if (!boxRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  useEffect(() => { if (open) panelRef.current?.querySelector(`[data-week="${focus}"]`)?.focus({ preventScroll: true }) }, [focus, open, place])
  const rows = useMemo(() => {
    const first = `${view}-01`, lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7
    return Array.from({ length: 6 }, (_, row) => addDays(first, row * 7 - lead)).filter((monday, row) => row < 4 || monday.slice(0, 7) <= view)
  }, [view])
  const shift = (n) => setView((ym) => { const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)); return d.toISOString().slice(0, 7) })
  const choose = (monday) => { const week = byStart.get(monday); if (!week) return; onChange(week.week); setOpen(false); boxRef.current?.querySelector('button')?.focus() }
  const step = (dir) => {
    const next = starts[starts.indexOf(focus) + dir]
    if (!next) return
    setFocus(next)
    if (next.slice(0, 7) !== view && addDays(next, 6).slice(0, 7) !== view) setView(next.slice(0, 7))
  }
  const onKey = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { event.preventDefault(); step(1) }
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { event.preventDefault(); step(-1) }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); boxRef.current?.querySelector('button')?.focus() }
  }
  const today = new Date().toISOString().slice(0, 10)
  return <span ref={boxRef} className={`pg-weekpick${open ? ' is-open' : ''}`}>
    <button type="button" className="ws-outline" aria-haspopup="dialog" aria-expanded={open} aria-label={`Week: ${range(current)}`} onClick={() => setOpen((v) => !v)}>
      Calendar
    </button>
    {open && place && createPortal(<div ref={panelRef} role="dialog" aria-label="Pick a week"
      className={`nb-cal pg-wcal${place.up ? ' is-up' : ''}`} style={{ left: Math.max(8, place.left + (boxRef.current?.offsetWidth ?? 0) - place.width), top: place.top, width: place.width, maxHeight: place.maxHeight }} onKeyDown={onKey}>
      <div className="nb-cal-head">
        <b>{MONTH_NAMES[Number(view.slice(5, 7)) - 1]} <span>{view.slice(0, 4)}</span></b>
        <div className="nb-cal-nav">
          <button type="button" aria-label="Previous month" onClick={() => shift(-1)}><CaretLeft size={14} weight="bold"/></button>
          <button type="button" aria-label="Next month" onClick={() => shift(1)}><CaretRight size={14} weight="bold"/></button>
        </div>
      </div>
      <div className="nb-cal-week">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="pg-wcal-rows">{rows.map((monday) => {
        const week = byStart.get(monday)
        return <button key={monday} type="button" data-week={monday} tabIndex={monday === focus ? 0 : -1} disabled={!week}
          className={`pg-wcal-row${week?.week === current.week ? ' is-picked' : ''}`} aria-pressed={week?.week === current.week}
          aria-label={week ? range(week) : undefined} onClick={() => choose(monday)}>
          {Array.from({ length: 7 }, (_, i) => { const day = addDays(monday, i); return <span key={day} className={`${day.slice(0, 7) !== view ? 'out ' : ''}${day === today ? 'today' : ''}`}>{Number(day.slice(8))}</span> })}
        </button>
      })}</div>
      <div className="nb-cal-foot">
        <span/>
        <button type="button" onClick={() => choose(starts[starts.length - 1])} disabled={current.starts_on === starts[starts.length - 1]}>Latest week</button>
      </div>
    </div>, document.body)}
  </span>
}

/** The selected week: its figures, its days, and what still needs a look. */
function WeekPanel({ week, privacy, openJournal, bar, children }) {
  const fmt = (value) => money(value, { privacy })
  const trades = week.trades.map((item) => item.trade)
  const rows = pickRows(metricRows(trades, { privacy }), ['Net P&L', 'Trades', 'Win rate', 'Profit factor'])
  const pending = [
    ...week.trades.filter((item) => item.review.state !== 'reviewed').map(({ trade, review }) => ({ id: trade.id, kind: 'Trade', symbol: trade.symbol, title: trade.symbol ?? 'Trade', side: trade.side, setup: trade.setup, meta: shortDay(trade.date), value: trade.pnl, state: review.state, open: () => openJournal?.(trade.date) })),
    ...week.entries.filter((item) => item.review.state !== 'reviewed').map((entry) => ({ id: entry.entry_id, kind: entry.kind === 'follow-up' ? 'Follow-up' : entry.kind === 'thesis' ? 'Thesis' : 'Note', title: entry.title, meta: shortDay(entry.date), state: entry.review.state, open: () => openJournal?.(entry.date) })),
  ]
  const empty = !week.trades.length && !week.entries.length
  const days = dayNets(week).filter((day) => day.trades)
  const best = days.reduce((top, day) => (!top || day.net > top.net ? day : top), null)
  const wins = trades.filter((trade) => trade.pnl > 0).length, losses = trades.filter((trade) => trade.pnl < 0).length
  const shown = (row) => (row.missing ? '—' : row.value)
  const strip = [
    { label: 'Net P&L', value: shown(rows[0]), sub: best ? `Best day ${best.label} ${money(best.net, { privacy, decimals: 0 })}` : 'No trades' },
    { label: 'Trades', value: shown(rows[1]), sub: `${days.length} trading ${days.length === 1 ? 'day' : 'days'}` },
    { label: 'Win rate', value: rows[2].missing ? '—' : `${Math.round(parseFloat(rows[2].value))}%`, sub: `${wins} wins · ${losses} losses` },
    { label: 'Profit factor', value: shown(rows[3]), sub: trades.length ? `${money(trades.reduce((t, x) => t + x.pnl, 0) / trades.length, { privacy, decimals: 0 })} a trade` : '—' },
    { label: 'Green days', value: `${days.filter((day) => day.net > 0).length} of ${days.length}`, sub: <DayTiles week={week} privacy={privacy}/> },
  ]

  const review = <div className="pg-review-duo">
        <div className="pg-sub">
          <h3>Review</h3>
        </div>
        <div className="pg-review-body">
        {/* five rows show; the rest scroll inside the list */}
        {pending.length > 0 && <div className="pg-row pg-row-head" aria-hidden="true"><span>Trade</span><span>Side</span><span>Setup</span><span>Date</span><span>P&L</span></div>}
        {pending.length > 0 && <ul className={`pg-list${pending.length > LIST_CAP ? ' is-scroll' : ''}`} style={{ '--cap': LIST_CAP }}>
          {pending.map((item) => <li key={item.id}>
            <button type="button" className="pg-row" onClick={(event) => { if (event.detail) event.currentTarget.blur(); item.open() }}>
              <span className="pg-row-title">{item.symbol ? <SymbolToken symbol={item.symbol}/> : <span className="pg-row-icon" aria-hidden="true"><FileText size={13} strokeWidth={1.9}/></span>}<span>{item.title}</span></span>
              <span className="pg-row-side">{item.side ? <i className={`is-${item.side.toLowerCase()}`}>{item.side}</i> : null}</span>
              <span className="pg-row-setup">{item.setup ?? item.kind}</span>
              <span className={`pg-row-meta${item.state === 'changed' ? ' is-edited' : ''}`} title={item.state === 'changed' ? 'Edited since review' : undefined}>{item.meta}</span>
              <span className={`pg-row-value${item.value != null ? ` tone-${toneOf(item.value)}` : ''}`}>{item.value != null ? fmt(item.value) : ''}</span>
            </button>
          </li>)}
        </ul>}
        {!pending.length && <p className="pg-empty">Every trade and note this week is covered.</p>}
        </div>
        </div>
  // the week's strip sits straight under the page header, like Prop firms; its picker lives in the header too
  return <>
    {empty
      ? <section className="pg-card pg-week" aria-label={`Week of ${range(week)}`}><p className="pg-empty">Nothing was traded or written this week.</p></section>
      : <MetricStrip items={strip}/>}
    {week.review_status === 'out_of_date' && <ul className="pg-stale" role="alert">
      {week.stale_items.slice(0, 3).map((item) => <li key={item.kind + item.id}><AlertTriangle size={13}/>{describeStale(item, week, fmt)}</li>)}
      {week.stale_items.length > 3 && <li className="pg-stale-more">and {week.stale_items.length - 3} more</li>}
    </ul>}
    {/* the Weeks / Months switch sits under the strip, above the pair it drives */}
    {bar}
    {/* To review and the weeks list share one row */}
    <div className={`pg-pair${empty ? ' is-single' : ''}`}>
      {!empty && review}
      {children}
    </div>
  </>
}

/** Recent weeks, newest first: one row each, the lesson under reviewed ones. */
/** Recent weeks, newest first, or the same weeks rolled up by month; a month row opens its latest week. */
function WeekList({ weeks, selected, onSelect, privacy, by = 'Weeks' }) {
  const lesson = (week) => {
    if (!week.review) return null
    const notes = week.review.content.notes
    const match = notes.split('Lesson and next action:')[1]
    return (match ?? notes).trim().split('\n').find(Boolean) ?? null
  }
  const shown = weeks.filter((week) => week.trades.length || week.entries.length || week.review || week.week === selected)
  const months = useMemo(() => {
    const map = new Map()
    shown.forEach((week) => {
      const key = week.starts_on.slice(0, 7)
      const row = map.get(key) ?? { key, weeks: [], net: 0, trades: 0, reviewed: 0 }
      row.weeks.push(week); row.trades += week.trades.length
      row.net += week.trades.reduce((sum, item) => sum + item.trade.pnl, 0)
      if (week.review) row.reviewed += 1
      map.set(key, row)
    })
    return [...map.values()]
  }, [shown])
  const monthName = (key) => new Date(`${key}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return <section className="pg-card pg-weeks is-duo" aria-label="Recent weeks">
    <header className="pg-head"><h2>{by}</h2></header>
    <div className="pg-weeks-body">
    <div className="pg-week-row pg-wk-head" aria-hidden="true"><span>{by === 'Months' ? 'Month' : 'Week'}</span><span>Status</span><span>{by === 'Months' ? 'Weeks' : 'Lesson'}</span><span>Trades</span><span>Net</span></div>
    {by === 'Months'
      ? <ul className="pg-week-list">{months.map((month) => {
        const current = month.weeks.some((week) => week.week === selected)
        return <li key={month.key}>
          <button type="button" className={`pg-week-row is-month${current ? ' is-current' : ''}`} aria-current={current ? 'true' : undefined}
            onClick={(event) => { if (event.detail) event.currentTarget.blur(); onSelect(month.weeks[0].week) }}>
            <b className="pg-wk-name">{monthName(month.key)}</b>
            <span className="pg-wk-status"><span className="pg-status">{month.reviewed} of {month.weeks.length} reviewed</span></span>
            <span className="pg-wk-note">{plural(month.weeks.length, 'week')}</span>
            <span className="pg-week-count">{month.trades || '—'}</span>
            <span className={`pg-week-net${month.trades ? ` tone-${toneOf(month.net)}` : ''}`}>{month.trades ? money(month.net, { privacy, decimals: 0 }) : '—'}</span>
          </button>
        </li>
      })}</ul>
      : <ul className="pg-week-list">{shown.map((week) => {
      const net = week.trades.reduce((sum, item) => sum + item.trade.pnl, 0)
      const note = lesson(week)
      return <li key={week.week}>
        <button type="button" className={`pg-week-row${week.week === selected ? ' is-current' : ''}`} aria-current={week.week === selected ? 'true' : undefined}
          onClick={(event) => { if (event.detail) event.currentTarget.blur(); onSelect(week.week) }}>
          <b className="pg-wk-name">{shortRange(week)}</b>
          <span className="pg-wk-status"><StatusBadge week={week}/></span>
          <span className="pg-wk-note" title={note ?? undefined}>{note ?? ''}</span>
          <span className="pg-week-count">{week.trades.length || '—'}</span>
          <span className={`pg-week-net${week.trades.length ? ` tone-${toneOf(net)}` : ''}`}>{week.trades.length ? money(net, { privacy, decimals: 0 }) : '—'}</span>
        </button>
      </li>
    })}</ul>}
    </div>
  </section>
}

// Designs by RNSENCE Studio
export function ProgressPage({ privacy, openJournal }) {
  const [version, setVersion] = useState(0)
  const queue = useMemo(() => reviewQueue(8), [version])
  const [selected, setSelected] = useState(() => (queue.weeks.find((week) => !week.review && week.trades.length) ?? queue.weeks[0]).week)
  const [editing, setEditing] = useState(null)
  const [routineOn, setRoutineOn] = useState(false)
  const [by, setBy] = useState('Weeks')
  const [saved, setSaved] = useState(null)
  const index = queue.weeks.findIndex((week) => week.week === selected)
  const week = queue.weeks[index] ?? queue.weeks[0]
  const reviewedCount = queue.weeks.filter((item) => item.review).length
  const editingWeek = queue.weeks.find((item) => item.week === editing)
  useEffect(() => { if (!saved) return undefined; const timer = setTimeout(() => setSaved(null), 3200); return () => clearTimeout(timer) }, [saved])

  const picker = <WeekPicker weeks={queue.weeks} value={week.week} onChange={setSelected}/>

  const panel = <WeekPanel week={week} privacy={privacy} openJournal={openJournal}
    bar={<div className="pg-bar"><Segmented options={['Weeks', 'Months']} value={by} onChange={setBy} label="Group by" className="compact rail-switch report-switch"/></div>}>
    <WeekList weeks={queue.weeks} selected={week.week} onSelect={setSelected} privacy={privacy} by={by}/>
  </WeekPanel>
  const routine = <RoutineCard month={week.ends_on.slice(0, 7)} privacy={privacy} version={version} onSaved={() => setVersion((value) => value + 1)}/>

  return <div className="page home ws-page progress-page">
    <PageHead
      title="Progress"
      meta={`${range(week)} · ${reviewedCount} of ${queue.weeks.length} weeks reviewed`}
      actions={<>{picker}<button type="button" className="start-day" onClick={() => setEditing(week.week)}>{week.review ? 'Update review' : 'New review'}</button></>}
    />
    {saved && <div className="pg-saved" role="status">Review saved.</div>}

    <div className="pg-stack">
      {panel}
      {/* folded to its title like Statistics on Compare: a click anywhere opens it, its head folds it again */}
      <div className={`pg-fold${routineOn ? ' is-on' : ''}`} role="button" tabIndex={0} aria-expanded={routineOn} aria-label={`${routineOn ? 'Hide' : 'Show'} routine`}
        onClick={(event) => { if (event.target.closest('button, input, form, .cal-routine-edit')) return; if (!routineOn || event.target.closest('.ws-card-head')) setRoutineOn((value) => !value) }}
        onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setRoutineOn((value) => !value) } }}>
        {routine}
      </div>
    </div>

    {editingWeek && <ProgressReviewSheet
      key={editingWeek.week} week={editingWeek} queue={queue} privacy={privacy}
      onClose={() => setEditing(null)}
      onSaved={(review) => { setEditing(null); setVersion((value) => value + 1); setSaved({ week: editingWeek.week, revision: review.revision }) }}
    />}
  </div>
}
