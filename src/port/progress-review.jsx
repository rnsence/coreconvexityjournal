/**
 * Review drawer: four short prompts, the week's headline figures, and the notes and trades the review covers.
 * Saving pins the version of every covered record, so later edits show the review as out of date.
 */
import React, { useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronRight, History } from 'lucide-react'
import { Drawer, useDrawer } from '../dialogs'
import { SymbolToken, money, toneOf } from '../viz'
import { metricRows, pickRows } from './calendar-metrics'
import { saveReview, tradeRevision } from './progress-data'
import './progress.css'

const PROMPTS = [
  { key: 'happened', label: 'What happened', heading: 'What happened:', hint: 'The week in a sentence or two' },
  { key: 'process', label: 'Process', heading: 'Process (followed / broke rules):', hint: 'Rules you kept, rules you broke' },
  { key: 'outcome', label: 'Outcome vs plan', heading: 'Outcome vs plan:', hint: 'Where the result and the plan parted' },
  { key: 'lesson', label: 'Lesson and next action', heading: 'Lesson and next action:', hint: 'One thing to do differently next week' },
]
const shortDay = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const savedLabel = (stamp) => new Date(stamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

/** Split saved notes back into the four prompts; anything before the first heading stays with "What happened". */
function parseNotes(notes = '') {
  const out = Object.fromEntries(PROMPTS.map((prompt) => [prompt.key, '']))
  const marks = PROMPTS.map((prompt) => ({ prompt, at: notes.indexOf(prompt.heading) })).filter((mark) => mark.at >= 0).sort((a, b) => a.at - b.at)
  if (!marks.length) { out.happened = notes.trim(); return out }
  marks.forEach((mark, index) => {
    const end = marks[index + 1]?.at ?? notes.length
    // drop the auto-filled metrics block older reviews appended under the last prompt
    out[mark.prompt.key] = notes.slice(mark.at + mark.prompt.heading.length, end).split(/\n\s*Metrics for /)[0].trim()
  })
  return out
}
const joinNotes = (fields) => PROMPTS.map((prompt) => `${prompt.heading}\n${(fields[prompt.key] ?? '').trim()}\n`).join('\n')

/** Everything a review may cover: the week's notes and trades plus open theses and follow-ups, once each. */
function coverable(week, queue) {
  const entries = new Map(week.entries.map((entry) => [entry.entry_id, entry]))
  for (const entry of [...queue.open_theses, ...queue.follow_ups]) if (!entries.has(entry.entry_id)) entries.set(entry.entry_id, entry)
  return { entries, trades: new Map(week.trades.map(({ trade }) => [trade.id, trade])) }
}

function CheckRow({ checked, onToggle, children, aside }) {
  return <button type="button" role="checkbox" aria-checked={checked} className={`pgr-check${checked ? ' is-on' : ''}`} onClick={onToggle}>
    <span className="pgr-box" aria-hidden="true">{checked && <Check size={11} strokeWidth={3}/>}</span>
    <span className="pgr-check-label">{children}</span>
    {aside && <span className="pgr-check-aside">{aside}</span>}
  </button>
}

function WriteView({ week, review, fields, setField, figures, coverLine, pending, error, onSubmit, setView }) {
  const { close } = useDrawer()
  return <form className="pgr" onSubmit={onSubmit}>
    <header className="pgr-head">
      <h2>Review {shortDay(week.starts_on)} – {shortDay(week.ends_on)}</h2>
      <p>{week.trades.length} trades · {week.entries.length} notes{review ? ` · revision ${review.revision}` : ''}</p>
    </header>
    <dl className="pgr-figs">{figures.map((row) => <div key={row.label}>
      <dt>{row.label}</dt>
      <dd className={row.tone ? `tone-${row.tone}` : undefined}>{row.value}</dd>
    </div>)}</dl>
    {week.review_status === 'out_of_date' && <p className="pgr-alert" role="alert"><AlertTriangle size={14}/>Some notes or trades changed since the last review. Check them before saving.</p>}
    {error && <p className="pgr-alert" role="alert"><AlertTriangle size={14}/>{error}</p>}
    <div className="pgr-fields">{PROMPTS.map((prompt) => <label key={prompt.key} className="pgr-field">
      <span>{prompt.label}</span>
      <textarea rows={2} value={fields[prompt.key]} placeholder={prompt.hint} disabled={pending} maxLength={16000}
        onChange={(event) => setField(prompt.key, event.target.value)}
        onInput={(event) => { const el = event.currentTarget; el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }}/>
    </label>)}</div>
    <div className="pgr-links">
      <button type="button" className="pgr-link" onClick={() => setView('covered')}><span>Covers</span><b>{coverLine}</b></button>
      {review && <button type="button" className="pgr-link" onClick={() => setView('history')}><span><History size={13}/>History</span><b>{(review.history?.length ?? 0) + 1} revisions</b></button>}
    </div>
    <div className="pgr-actions">
      <button type="button" className="pgr-btn" disabled={pending} onClick={close}>Cancel</button>
      <button type="submit" className="pgr-btn is-primary" disabled={pending}>{pending ? 'Saving…' : review ? 'Save review' : 'Mark week reviewed'}</button>
    </div>
  </form>
}

function CoveredView({ candidates, selected, toggle, setAll, fmt, setView }) {
  const trades = [...candidates.trades.values()]
  const entries = [...candidates.entries.values()]
  const group = (title, items, idOf, render) => {
    const on = items.filter((item) => selected.has(idOf(item))).length
    return <section className="pgr-group">
      <div className="pgr-group-head"><h3>{title}<span>{on} of {items.length}</span></h3>
        {items.length > 0 && <button type="button" className="pgr-mini" onClick={() => setAll(items.map(idOf), on < items.length)}>{on < items.length ? 'Select all' : 'Clear'}</button>}
      </div>
      {items.length ? items.map(render) : <p className="pgr-muted">None this week.</p>}
    </section>
  }
  return <div className="pgr">
    <header className="pgr-head has-back">
      <button type="button" className="pgr-back" aria-label="Back" onClick={() => setView('write')}><ChevronRight size={16} style={{ transform: 'rotate(180deg)' }}/></button>
      <div><h2>Covered by this review</h2><p>Uncheck anything you didn't look at.</p></div>
    </header>
    {group('Trades', trades, (trade) => trade.id, (trade) => <CheckRow key={trade.id} checked={selected.has(trade.id)} onToggle={() => toggle(trade.id)}
      aside={<span className={`tone-${toneOf(trade.pnl)}`}>{fmt(trade.pnl)}</span>}>
      <SymbolToken symbol={trade.symbol}/><b>{trade.symbol ?? 'Trade'}</b><small>{shortDay(trade.date)}</small>
    </CheckRow>)}
    {group('Notes', entries, (entry) => entry.entry_id, (entry) => <CheckRow key={entry.entry_id} checked={selected.has(entry.entry_id)} onToggle={() => toggle(entry.entry_id)}
      aside={entry.kind === 'note' ? null : entry.kind === 'thesis' ? 'Thesis' : 'Follow-up'}>
      <b>{entry.title}</b><small>{shortDay(entry.date)}</small>
    </CheckRow>)}
    <div className="pgr-actions"><button type="button" className="pgr-btn is-primary" onClick={() => setView('write')}>Done</button></div>
  </div>
}

function HistoryView({ review, onUse, setView }) {
  const items = [{ revision: review.revision, saved_at: review.saved_at, current: true }, ...(review.history ?? [])]
  return <div className="pgr">
    <header className="pgr-head has-back">
      <button type="button" className="pgr-back" aria-label="Back" onClick={() => setView('write')}><ChevronRight size={16} style={{ transform: 'rotate(180deg)' }}/></button>
      <div><h2>History</h2><p>Each save keeps the previous notes.</p></div>
    </header>
    <ol className="pgr-history">{items.map((item) => <li key={item.revision}>
      <b>Revision {item.revision}</b><span>{savedLabel(item.saved_at)}</span>
      {item.current ? <em>Current</em> : <button type="button" className="pgr-mini" onClick={() => { onUse(item.notes); setView('write') }}>Use these notes</button>}
    </li>)}</ol>
  </div>
}

// Designs by RNSENCE Studio
export function ProgressReviewSheet({ week, queue, privacy, onClose, onSaved }) {
  const review = week.review
  const fmt = (value) => money(value, { privacy })
  const candidates = useMemo(() => coverable(week, queue), [week, queue])
  const [selected, setSelected] = useState(() => {
    const openPending = [...queue.open_theses, ...queue.follow_ups].filter((entry) => entry.review.state !== 'reviewed').map((entry) => entry.entry_id)
    const previouslyCovered = review ? [...review.content.entries, ...review.content.trades].map((item) => item.id) : []
    return new Set([...week.entries.map((entry) => entry.entry_id), ...week.trades.map(({ trade }) => trade.id), ...openPending, ...previouslyCovered])
  })
  const [fields, setFields] = useState(() => parseNotes(review?.content.notes))
  const [view, setView] = useState('write')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const trades = [...candidates.trades.values()].filter((trade) => selected.has(trade.id))
  const tradeKey = trades.map((trade) => trade.id).sort().join(',')
  const figures = useMemo(() => {
    const [net, win, pf] = pickRows(metricRows(trades, { privacy }), ['Net P&L', 'Win rate', 'Profit factor'])
    return [
      { label: 'Net P&L', value: trades.length ? net.value : '—', tone: trades.length && net.raw != null ? toneOf(net.raw) : null },
      { label: 'Win rate', value: win.missing || !trades.length ? '—' : `${Math.round(parseFloat(win.value))}%` },
      { label: 'Profit factor', value: pf.missing || !trades.length ? '—' : pf.value },
    ]
  }, [tradeKey, privacy])
  const noteCount = [...candidates.entries.keys()].filter((id) => selected.has(id)).length
  const coverLine = `${trades.length} trade${trades.length === 1 ? '' : 's'} · ${noteCount} note${noteCount === 1 ? '' : 's'}`
  const toggle = (id) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const setAll = (ids, on) => setSelected((current) => { const next = new Set(current); ids.forEach((id) => (on ? next.add(id) : next.delete(id))); return next })

  const submit = async (event) => {
    event.preventDefault()
    if (pending) return
    setPending(true); setError(null)
    const content = {
      notes: joinNotes(fields),
      entries: [...candidates.entries.values()].filter((entry) => selected.has(entry.entry_id)).map((entry) => ({ id: entry.entry_id, revision: entry.revision })),
      trades: trades.map((trade) => ({ id: trade.id, revision: tradeRevision(trade) })),
    }
    try {
      onSaved(await saveReview(week.week, { expected_revision: review?.revision ?? 0, content }))
    } catch (failure) {
      setError(failure.conflict ? 'This review changed somewhere else. Reload the page and save again.' : failure.message)
      setPending(false)
    }
  }

  return <Drawer label={`Review ${week.week}`} width={480} viewKey={view} onClose={onClose}>
    {view === 'covered'
      ? <CoveredView candidates={candidates} selected={selected} toggle={toggle} setAll={setAll} fmt={fmt} setView={setView}/>
      : view === 'history' && review
        ? <HistoryView review={review} onUse={(notes) => setFields(parseNotes(notes))} setView={setView}/>
        : <WriteView week={week} review={review} fields={fields} setField={(key, value) => setFields((current) => ({ ...current, [key]: value }))}
          figures={figures} coverLine={coverLine} pending={pending} error={error} onSubmit={submit} setView={setView}/>}
  </Drawer>
}
