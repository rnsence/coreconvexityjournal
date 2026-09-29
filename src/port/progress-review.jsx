/**
 * Review sheet: notes prefilled with the review prompts and the checked trades'
 * metrics (live until you type), the week metrics, and the notes and trades covered.
 */
import React, { useEffect, useId, useMemo, useState } from 'react'
import { AlertTriangle, History } from 'lucide-react'
import { Sheet } from '../dialogs'
import { money } from '../viz'
import { metricRows } from './calendar-metrics'
import { REVIEW_PROMPTS, saveReview, tradeLabel, tradeRevision } from './progress-data'
import './progress.css'

const savedLabel = (stamp) => new Date(stamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'

function metricsText(week, trades, rows, fmt) {
  const included = trades.slice(0, 20).map((trade) => tradeLabel(trade, fmt)).join('; ') + (trades.length > 20 ? `; and ${trades.length - 20} more` : '')
  const lines = rows.filter((row) => !row.missing).map((row) => `- ${row.label}: ${row.value} (${row.basis})`)
  return `Metrics for ${week.week} (${week.starts_on} to ${week.ends_on}) over ${trades.length} trades${trades.length ? `: ${included}` : ''}\n${lines.join('\n')}\n`
}

/** Everything a review may cover: the week's notes and trades plus open theses and follow-ups, once each. */
function coverable(week, queue) {
  const entries = new Map(week.entries.map((entry) => [entry.entry_id, entry]))
  for (const entry of [...queue.open_theses, ...queue.follow_ups]) if (!entries.has(entry.entry_id)) entries.set(entry.entry_id, entry)
  return { entries, trades: new Map(week.trades.map(({ trade }) => [trade.id, trade])) }
}

function Check({ id, checked, onToggle, label, revision, disabled }) {
  return <label className={`pg-check${checked ? ' on' : ''}`}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={() => onToggle(id)}/>
    <span className="pg-check-label">{label}</span>
    <span className="pg-check-rev">rev {revision}</span>
  </label>
}

function WeekMetrics({ trades, rows, measuring }) {
  return <section className="pg-metrics" aria-label="Week metrics">
    <header><h3>Week metrics</h3><p>Included records: the {trades.length} checked trades below. Same definitions as the Trades page.</p></header>
    {trades.length === 0 ? <p className="pg-metrics-state">No trades included; there is nothing to measure this week.</p>
      : measuring ? <p className="pg-metrics-state is-loading">Measuring the checked trades…</p>
      : <dl className="pg-metrics-grid">{rows.map((row) => <div key={row.label} className={row.missing ? 'is-missing' : undefined}>
        <dt>{row.label}</dt>
        <dd>{row.value}<small>{row.basis}{row.detail ? ` · ${row.detail}` : ''}</small></dd>
      </div>)}</dl>}
  </section>
}

// Designs by RNSENCE Studio
export function ProgressReviewSheet({ week, queue, privacy, onClose, onSaved }) {
  const formId = useId()
  const review = week.review
  const fmt = (value) => money(value, { privacy })
  const candidates = useMemo(() => coverable(week, queue), [week, queue])
  const [selected, setSelected] = useState(() => {
    const openPending = [...queue.open_theses, ...queue.follow_ups].filter((entry) => entry.review.state !== 'reviewed').map((entry) => entry.entry_id)
    const previouslyCovered = review ? [...review.content.entries, ...review.content.trades].map((item) => item.id) : []
    return new Set([...week.entries.map((entry) => entry.entry_id), ...week.trades.map(({ trade }) => trade.id), ...openPending, ...previouslyCovered])
  })
  const trades = [...candidates.trades.values()].filter((trade) => selected.has(trade.id))
  const tradeKey = trades.map((trade) => trade.id).sort().join(',')
  const rows = useMemo(() => metricRows(trades, { privacy }), [tradeKey, privacy])
  // Re-measuring after a toggle shows the brief "measuring" state the server read would.
  const [measuring, setMeasuring] = useState(false)
  useEffect(() => { setMeasuring(true); const timer = setTimeout(() => setMeasuring(false), 260); return () => clearTimeout(timer) }, [tradeKey])
  const [written, setNotes] = useState(() => review?.content.notes ?? null)
  const notes = written ?? `${REVIEW_PROMPTS}\n${measuring && trades.length ? '' : metricsText(week, trades, trades.length ? rows : [], fmt)}`
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const toggle = (id) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })

  const submit = async (event) => {
    event.preventDefault()
    setPending(true); setError(null)
    const content = {
      notes,
      entries: [...candidates.entries.values()].filter((entry) => selected.has(entry.entry_id)).map((entry) => ({ id: entry.entry_id, revision: entry.revision })),
      trades: trades.map((trade) => ({ id: trade.id, revision: tradeRevision(trade) })),
    }
    try {
      const next = await saveReview(week.week, { expected_revision: review?.revision ?? 0, content })
      onSaved(next)
    } catch (failure) {
      setError(failure.conflict ? 'This week\'s review or one of its notes or trades changed. The queue was reloaded; check the selection and save again.' : failure.message)
      setPending(false)
    }
  }

  const footer = <>
    <span className="pg-foot-note">{selected.size} records checked</span>
    <div className="dlg-actions">
      <button type="button" className="ws-outline" disabled={pending} onClick={onClose}>Cancel</button>
      <button type="submit" form={formId} className="start-day" disabled={pending}>{pending ? 'Saving…' : review ? 'Save review revision' : 'Mark week reviewed'}</button>
    </div>
  </>

  return <Sheet
    title={`Review ${week.week}`} width={680} className="pg-sheet" onClose={onClose} footer={footer}
    subtitle={`${week.starts_on} to ${week.ends_on}. Saving pins the current revision of every checked note and trade${review ? `; this becomes revision ${review.revision + 1} of the review` : ''}.`}
  >
    {week.review_status === 'out_of_date' && <div className="pg-alert" role="alert"><AlertTriangle size={14}/>Review out of date. Records changed after revision {review?.revision}; check them again before saving.</div>}
    {error && <div className="pg-alert" role="alert"><AlertTriangle size={14}/>{error}</div>}
    <form id={formId} className="pg-review-form" onSubmit={submit}>
      <label className="pg-notes">
        <span>Review notes {written === null && <em>Prefilled from the prompts and the checked trades until you type</em>}</span>
        <textarea aria-label="Review notes" rows={14} maxLength={64 * 1024} value={notes} disabled={pending} onChange={(event) => setNotes(event.target.value)}/>
      </label>
      <WeekMetrics trades={trades} rows={rows} measuring={measuring}/>
      <fieldset className="pg-fieldset" disabled={pending}>
        <legend>Covered trades</legend>
        {candidates.trades.size
          ? [...candidates.trades.values()].map((trade) => <Check key={trade.id} id={trade.id} checked={selected.has(trade.id)} onToggle={toggle} label={tradeLabel(trade, fmt)} revision={tradeRevision(trade)}/>)
          : <p className="pg-muted">No trades are dated in this week.</p>}
      </fieldset>
      <fieldset className="pg-fieldset" disabled={pending}>
        <legend>Covered notes, theses and follow-ups</legend>
        {candidates.entries.size
          ? [...candidates.entries.values()].map((entry) => <Check key={entry.entry_id} id={entry.entry_id} checked={selected.has(entry.entry_id)} onToggle={toggle} label={`${entry.title} (${entry.kind}, ${entry.date})`} revision={entry.revision}/>)
          : <p className="pg-muted">No notes to cover.</p>}
      </fieldset>
      {review && <section className="pg-history" aria-label="Revision history">
        <h3><History size={13}/>Revisions</h3>
        <ol>
          <li><b>Revision {review.revision}</b><span>{savedLabel(review.saved_at)} · current</span></li>
          {(review.history ?? []).map((item) => <li key={item.revision}>
            <b>Revision {item.revision}</b><span>{savedLabel(item.saved_at)}</span>
            <button type="button" className="pg-link" onClick={() => setNotes(item.notes)}>Use these notes</button>
          </li>)}
        </ol>
      </section>}
    </form>
  </Sheet>
}
