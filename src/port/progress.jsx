/**
 * Progress: the weekly review. One week in focus (its numbers, its days and what is still to review),
 * the run of recent weeks with their review state, the routine, and the open theses and follow-ups.
 * Reviewing opens a sheet that pins the revision of every note and trade it covers.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import { PageHead, Segmented } from '../workspace'
import { SymbolToken, money, toneOf } from '../viz'
import { metricRows, pickRows } from './calendar-metrics'
import { RoutineCard } from './calendar-routine'
import { ProgressReviewSheet } from './progress-review'
import { reviewQueue, tradeLabel } from './progress-data'
import './progress.css'

const LIST_CAP = 5
const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const shortDay = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const range = (week) => `${shortDay(week.starts_on)} – ${shortDay(week.ends_on)}`

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
function DayBars({ week, large = false, privacy }) {
  const days = dayNets(week)
  const peak = Math.max(1, ...days.map((day) => Math.abs(day.net)))
  return <span className={`pg-days${large ? ' is-large' : ''}`} role="img" aria-label={days.map((day) => `${day.label} ${day.trades ? money(day.net, { privacy, decimals: 0 }) : 'no trades'}`).join(', ')}>
    {days.map((day) => <span key={day.label} className="pg-day" title={large ? undefined : `${day.label} · ${day.trades ? money(day.net, { privacy, decimals: 0 }) : 'no trades'}`}>
      <span className="pg-day-plot">
        <i className={day.trades ? `is-${day.net >= 0 ? 'pos' : 'neg'}` : 'is-none'} style={{ '--h': day.trades ? Math.max(0.08, Math.abs(day.net) / peak) : 0 }}/>
      </span>
      {large && <small>{day.label}</small>}
      {large && <span className="pg-day-tip" aria-hidden="true"><b className={day.trades ? `tone-${toneOf(day.net)}` : undefined}>{day.trades ? money(day.net, { privacy, decimals: 0 }) : 'No trades'}</b>{day.trades > 0 && <em>{day.trades} trade{day.trades === 1 ? '' : 's'}</em>}</span>}
    </span>)}
  </span>
}

/** The selected week: its figures, its days, and what still needs a look. */
function WeekPanel({ week, privacy, openJournal }) {
  const fmt = (value) => money(value, { privacy })
  const trades = week.trades.map((item) => item.trade)
  const rows = pickRows(metricRows(trades, { privacy }), ['Net P&L', 'Trades', 'Win rate', 'Profit factor'])
  const pending = [
    ...week.trades.filter((item) => item.review.state !== 'reviewed').map(({ trade, review }) => ({ id: trade.id, kind: 'Trade', symbol: trade.symbol, title: trade.symbol ?? 'Trade', meta: shortDay(trade.date), value: trade.pnl, state: review.state, open: () => openJournal?.(trade.date) })),
    ...week.entries.filter((item) => item.review.state !== 'reviewed').map((entry) => ({ id: entry.entry_id, kind: entry.kind === 'follow-up' ? 'Follow-up' : entry.kind === 'thesis' ? 'Thesis' : 'Note', title: entry.title, meta: shortDay(entry.date), state: entry.review.state, open: () => openJournal?.(entry.date) })),
  ]
  const [all, setAll] = useState(false)
  useEffect(() => setAll(false), [week.week])
  const shown = all ? pending : pending.slice(0, LIST_CAP)
  const empty = !week.trades.length && !week.entries.length

  return <section className="pg-card pg-week" aria-label={`Week of ${range(week)}`}>
    <header className="pg-head">
      <h2>{range(week)}</h2>
      <StatusBadge week={week}/>
    </header>
    {empty
      ? <p className="pg-empty">Nothing was traded or written this week.</p>
      : <>
        <div className="pg-overview">
          <dl className="pg-figs">{rows.map((row) => <div key={row.label}>
            <dt>{row.label}</dt>
            <dd className={row.label === 'Net P&L' && row.raw != null ? `tone-${toneOf(row.raw)}` : undefined}>{row.missing ? '—' : row.label === 'Win rate' ? `${Math.round(parseFloat(row.value))}%` : row.value}</dd>
          </div>)}</dl>
          <DayBars week={week} large privacy={privacy}/>
        </div>
        {week.review_status === 'out_of_date' && <ul className="pg-stale" role="alert">
          {week.stale_items.slice(0, 3).map((item) => <li key={item.kind + item.id}><AlertTriangle size={13}/>{describeStale(item, week, fmt)}</li>)}
          {week.stale_items.length > 3 && <li className="pg-stale-more">and {week.stale_items.length - 3} more</li>}
        </ul>}
        <div className="pg-sub">
          <h3>To review</h3>
          <span>{pending.length || 'All covered'}</span>
        </div>
        {pending.length > 0 && <ul className="pg-list">
          {shown.map((item) => <li key={item.id}>
            <button type="button" className="pg-row" onClick={(event) => { if (event.detail) event.currentTarget.blur(); item.open() }}>
              <span className="pg-row-title">{item.symbol ? <SymbolToken symbol={item.symbol}/> : <span className="pg-row-icon" aria-hidden="true"><FileText size={13} strokeWidth={1.9}/></span>}<span>{item.title}</span>{!item.symbol && <small>{item.kind}</small>}</span>
              <span className="pg-row-meta">{item.state === 'changed' ? 'Edited since review' : item.meta}</span>
              {item.value != null && <span className={`pg-row-value tone-${toneOf(item.value)}`}>{fmt(item.value)}</span>}
            </button>
          </li>)}
        </ul>}
        {pending.length > LIST_CAP && <button type="button" className="pg-more" onClick={() => setAll(!all)}>{all ? 'Show less' : `Show all ${pending.length}`}</button>}
      </>}
  </section>
}

/** Recent weeks, newest first: one row each, the lesson under reviewed ones. */
function WeekList({ weeks, selected, onSelect, privacy }) {
  const lesson = (week) => {
    if (!week.review) return null
    const notes = week.review.content.notes
    const match = notes.split('Lesson and next action:')[1]
    return (match ?? notes).trim().split('\n').find(Boolean) ?? null
  }
  return <section className="pg-card pg-weeks" aria-label="Recent weeks">
    <header className="pg-head"><h2>Weeks</h2></header>
    <ul className="pg-week-list">{weeks.filter((week) => week.trades.length || week.entries.length || week.review || week.week === selected).map((week) => {
      const net = week.trades.reduce((sum, item) => sum + item.trade.pnl, 0)
      const note = lesson(week)
      return <li key={week.week}>
        <button type="button" className={`pg-week-row${week.week === selected ? ' is-current' : ''}`} aria-current={week.week === selected ? 'true' : undefined}
          onClick={(event) => { if (event.detail) event.currentTarget.blur(); onSelect(week.week) }}>
          <span className="pg-week-main">
            <b>{range(week)}</b>
            <span className="pg-week-line"><StatusBadge week={week}/>{note && <em>{note}</em>}</span>
          </span>
          <span className="pg-week-count">{week.trades.length ? `${week.trades.length} trades` : ''}</span>
          <span className={`pg-week-net${week.trades.length ? ` tone-${toneOf(net)}` : ''}`}>{week.trades.length ? money(net, { privacy, decimals: 0 }) : '—'}</span>
          <DayBars week={week} privacy={privacy}/>
        </button>
      </li>
    })}</ul>
  </section>
}

/** Open theses and follow-ups, one list behind a switch. */
function OpenNotes({ queue }) {
  const [tab, setTab] = useState('Theses')
  const items = tab === 'Theses' ? queue.open_theses : queue.follow_ups
  return <section className="pg-card pg-open" aria-label="Open theses and follow-ups">
    <header className="pg-head">
      <h2>Open notes</h2>
      <Segmented options={['Theses', 'Follow-ups']} value={tab} onChange={setTab} label="Open notes" className="compact"/>
    </header>
    {items.length
      ? <ul className="pg-list">{items.map((entry) => <li key={entry.entry_id}><span className="pg-row is-static">
        <span className="pg-row-title">{entry.title}</span>
        <span className="pg-row-meta">{entry.review.state === 'reviewed' ? `Reviewed ${shortDay(entry.date)}` : entry.review.state === 'changed' ? 'Edited since review' : 'Not reviewed'}</span>
      </span></li>)}</ul>
      : <p className="pg-empty">{tab === 'Theses' ? 'Tag a note "thesis" to track it here.' : 'Tag a note "follow-up" to track it here.'}</p>}
  </section>
}

// Designs by RNSENCE Studio
export function ProgressPage({ privacy, openJournal }) {
  const [version, setVersion] = useState(0)
  const queue = useMemo(() => reviewQueue(8), [version])
  const [selected, setSelected] = useState(() => (queue.weeks.find((week) => !week.review && week.trades.length) ?? queue.weeks[0]).week)
  const [editing, setEditing] = useState(null)
  const [saved, setSaved] = useState(null)
  const index = queue.weeks.findIndex((week) => week.week === selected)
  const week = queue.weeks[index] ?? queue.weeks[0]
  const reviewedCount = queue.weeks.filter((item) => item.review).length
  const editingWeek = queue.weeks.find((item) => item.week === editing)
  useEffect(() => { if (!saved) return undefined; const timer = setTimeout(() => setSaved(null), 3200); return () => clearTimeout(timer) }, [saved])

  const picker = <div className="pg-picker" aria-label="Week">
    <button type="button" aria-label="Previous week" disabled={index >= queue.weeks.length - 1} onClick={() => setSelected(queue.weeks[index + 1].week)}><ChevronLeft size={15}/></button>
    <span>{range(week)}</span>
    <button type="button" aria-label="Next week" disabled={index <= 0} onClick={() => setSelected(queue.weeks[index - 1].week)}><ChevronRight size={15}/></button>
  </div>

  const panel = <WeekPanel week={week} privacy={privacy} openJournal={openJournal}/>
  const routine = <RoutineCard month={week.ends_on.slice(0, 7)} privacy={privacy} version={version} onSaved={() => setVersion((value) => value + 1)}/>

  return <div className="page home ws-page progress-page">
    <PageHead
      title="Progress"
      meta={`${reviewedCount} of ${queue.weeks.length} weeks reviewed`}
      actions={<>{picker}<button type="button" className="start-day" onClick={() => setEditing(week.week)}>{week.review ? 'Update review' : 'Review week'}</button></>}
    />
    {saved && <div className="pg-saved" role="status">Review saved.</div>}

    <div className="pg-stack">
      {panel}
      <WeekList weeks={queue.weeks} selected={week.week} onSelect={setSelected} privacy={privacy}/>
      {routine}
      <OpenNotes queue={queue}/>
    </div>

    {editingWeek && <ProgressReviewSheet
      key={editingWeek.week} week={editingWeek} queue={queue} privacy={privacy}
      onClose={() => setEditing(null)}
      onSaved={(review) => { setEditing(null); setVersion((value) => value + 1); setSaved({ week: editingWeek.week, revision: review.revision }) }}
    />}
  </div>
}
