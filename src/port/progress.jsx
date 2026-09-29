/**
 * Progress: the weekly review. A queue of ISO weeks with their review status, the
 * selected week's numbers and unreviewed records, open theses and follow-ups, past
 * reviews, and a review sheet that pins the revision of every note and trade it covers.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, ClipboardCheck, History } from 'lucide-react'
import { Card, CategoryColumns, MetricStrip, PageHead } from '../workspace'
import { TipRows, compactMoney, money, toneOf } from '../viz'
import { metricRows, pickRows } from './calendar-metrics'
import { RoutineCard } from './calendar-routine'
import { ProgressReviewSheet } from './progress-review'
import { reviewQueue, tradeLabel } from './progress-data'
import './progress.css'

const INTRO = 'Each ISO week runs Monday to Sunday (UTC). A review records which notes and trades you looked at, at the version you saw.'
const PENDING_CAP = 8
const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const shortDay = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const savedLabel = (stamp) => new Date(stamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export function weekStatus(week) {
  if (week.review_status === 'out_of_date') return { label: 'Review out of date', tone: 'destructive' }
  if (week.review_status === 'current') return { label: week.pending ? `Reviewed · ${week.pending} not covered` : 'Reviewed', tone: 'secondary' }
  if (!week.entries.length && !week.trades.length) return { label: 'Nothing recorded', tone: 'outline' }
  return { label: 'Not reviewed', tone: 'default' }
}
export const StatusBadge = ({ week }) => { const status = weekStatus(week); return <span className={`pg-badge ${status.tone}`}>{status.label}</span> }

export function stateLabel(review) {
  if (review.state === 'changed') return `Changed since review (reviewed revision ${review.pinned_revision})`
  if (review.state === 'unreviewed') return 'Unreviewed'
  return null
}

function describeStale(item, week, fmt) {
  const trade = week.trades.find((candidate) => candidate.trade.id === item.id)?.trade
  const entry = week.entries.find((candidate) => candidate.entry_id === item.id)
  const name = trade ? `Trade ${tradeLabel(trade, fmt)}` : entry ? `Note "${entry.title}"` : `${item.kind === 'trade' ? 'Trade' : 'Note'} ${item.id.slice(0, 8)}`
  if (item.reason === 'changed') return `${name} was edited after the review (reviewed revision ${item.pinned_revision}, now ${item.current_revision}).`
  if (item.reason === 'removed') return `${name} was archived after the review.`
  return `${name} was added to this week after the review.`
}

/** The week's breakdown row (Performance, dimension "week"). */
function Performance({ trades, privacy }) {
  if (!trades.length) return null
  const rows = pickRows(metricRows(trades, { privacy }), ['Net P&L', 'Trades', 'Win rate', 'Profit factor', 'Average R'])
  const [net, count, win, pf, avgR] = rows
  return <dl className="pg-perf">
    <div><dt>Net P&L</dt><dd className={`tone-${toneOf(net.raw)}`}>{net.value}</dd></div>
    <div><dt>Trades</dt><dd>{`${count.value} trade${count.value === '1' ? '' : 's'}`}</dd></div>
    <div><dt>Win</dt><dd>win {win.missing ? '—' : `${Math.round(parseFloat(win.value))}%`}</dd></div>
    <div><dt>PF</dt><dd>PF {pf.missing ? '—' : pf.value}</dd></div>
    <div><dt>Avg R</dt><dd>avg {avgR.missing ? '—' : `${Number(avgR.raw).toFixed(2)}R`}</dd></div>
  </dl>
}

function WeekCard({ week, privacy, onReview, openJournal }) {
  const fmt = (value) => money(value, { privacy })
  const pendingTrades = week.trades.filter((item) => item.review.state !== 'reviewed')
  const pendingEntries = week.entries.filter((item) => item.review.state !== 'reviewed')
  const [showAll, setShowAll] = useState(false)
  const total = pendingTrades.length + pendingEntries.length
  const tradeCap = showAll ? pendingTrades.length : Math.max(0, PENDING_CAP - Math.min(pendingEntries.length, 3))
  const entryCap = showAll ? pendingEntries.length : PENDING_CAP - Math.min(tradeCap, pendingTrades.length)
  return <Card className="pg-week" title={`Week ${week.week}`} aside={<StatusBadge week={week}/>}>
    <p className="pg-week-meta">{week.starts_on} to {week.ends_on} · {week.trades.length} trades · {week.entries.length} notes</p>
    <Performance trades={week.trades.map((item) => item.trade)} privacy={privacy}/>
    {week.review_status === 'out_of_date' && <ul role="alert" className="pg-stale">
      {week.stale_items.map((item) => <li key={item.kind + item.id}><AlertTriangle size={13}/><span>{describeStale(item, week, fmt)}</span></li>)}
    </ul>}
    {!week.entries.length && !week.trades.length && <p className="pg-muted">No trades or notes are dated in this week.</p>}
    {(pendingTrades.length > 0 || pendingEntries.length > 0) && <ul className="pg-pending" aria-label={`Unreviewed in ${week.week}`}>
      {pendingTrades.slice(0, tradeCap).map(({ trade, review }) => <li key={trade.id}>
        <button type="button" className="pg-item" onClick={() => openJournal?.(trade.date)}><span className="pg-kind trade">Trade</span>{tradeLabel(trade, fmt)}</button>
        <span className={`pg-state ${review.state}`}>{stateLabel(review)}</span>
      </li>)}
      {pendingEntries.slice(0, entryCap).map((entry) => <li key={entry.entry_id}>
        <span className="pg-item"><span className={`pg-kind ${entry.kind}`}>{entry.kind}</span>{entry.title}</span>
        <span className={`pg-state ${entry.review.state}`}>{stateLabel(entry.review)}</span>
      </li>)}
    </ul>}
    {total > PENDING_CAP && <button type="button" className="ws-more pg-more" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${total} unreviewed`}</button>}
    {week.trades.length + week.entries.length > 0 && !pendingTrades.length && !pendingEntries.length && <p className="pg-muted">Every note and trade in this week is covered by the review.</p>}
    <div className="pg-week-foot">
      <button type="button" className={week.review ? 'ws-outline pg-btn' : 'start-day pg-btn'} onClick={onReview}><ClipboardCheck size={14}/>{week.review ? 'Update review' : 'Write review'}</button>
      {week.review && <span className="pg-rev">Revision {week.review.revision} · saved {savedLabel(week.review.saved_at)}</span>}
    </div>
  </Card>
}

function DailyCard({ week, privacy }) {
  const days = WEEKDAY.map((label, index) => {
    const date = new Date(Date.parse(`${week.starts_on}T00:00:00Z`) + index * 86400000).toISOString().slice(0, 10)
    const list = week.trades.filter((item) => item.trade.date === date).map((item) => item.trade)
    return { label, date, value: list.reduce((total, trade) => total + trade.pnl, 0), trades: list.length, wins: list.filter((trade) => trade.pnl > 0).length }
  })
  return <Card className="pg-daily" title="Daily P&L" aside={<span className="pg-aside">{shortDay(week.starts_on)} – {shortDay(week.ends_on)}</span>}>
    {week.trades.length
      ? <CategoryColumns data={days} height={214} axisFormat={(value) => compactMoney(value, { privacy })} tip={(item) => <>
        <div className="tip-title">{item.label} · {shortDay(item.date)}</div>
        <TipRows rows={[{ label: 'Net P&L', value: money(item.value, { privacy }), tone: toneOf(item.value) }, { label: 'Trades', value: `${item.trades}` }, { label: 'Winners', value: `${item.wins}` }]}/>
      </>}/>
      : <div className="pg-empty-chart">No trades dated in this week.</div>}
  </Card>
}

function OpenItems({ queue }) {
  const lists = [{ title: 'Open theses', items: queue.open_theses }, { title: 'Follow-ups', items: queue.follow_ups }]
  return <section className="pg-open">
    {lists.map(({ title, items }) => <Card key={title} title={title} aside={<span className="pg-count">{items.length}</span>}>
      {items.length
        ? <ul className="pg-open-list">{items.map((entry) => <li key={entry.entry_id}>
          <span className="pg-item">{entry.title} <small>{shortDay(entry.date)}</small></span>
          <span className={`pg-state ${entry.review.state}`}>{stateLabel(entry.review) ?? `Reviewed in ${entry.review.week}`}</span>
        </li>)}</ul>
        : <p className="pg-muted">{title === 'Open theses' ? 'Tag a note "thesis" or start it from the Plan template.' : 'Tag a note "follow-up" to track it here.'}</p>}
    </Card>)}
    {queue.open_items_truncated && <p className="pg-muted pg-span">Showing the 50 newest open theses and follow-ups. Archive closed ones to see older items.</p>}
  </section>
}

function QueueTable({ weeks, selected, onSelect, privacy }) {
  return <Card className="pg-queue" title="Review queue" aside={<span className="pg-aside">Newest first · click a week to open it</span>}>
    <div className="pg-table-wrap"><table className="feed-table ws-table compact ledger pg-table">
      <thead><tr><th>Week</th><th>Dates</th><th className="num">Trades</th><th className="num">Notes</th><th className="num">Net P&L</th><th>Status</th></tr></thead>
      <tbody>{weeks.map((week) => {
        const net = week.trades.reduce((total, item) => total + item.trade.pnl, 0)
        return <tr key={week.week} className={week.week === selected ? 'is-selected' : undefined} onClick={() => onSelect(week.week)} aria-selected={week.week === selected}>
          <td><b>{week.week}</b></td>
          <td className="pg-dim">{shortDay(week.starts_on)} – {shortDay(week.ends_on)}</td>
          <td className="num">{week.trades.length}</td>
          <td className="num">{week.entries.length}</td>
          <td className={`num tone-${toneOf(net)}`}>{week.trades.length ? money(net, { privacy }) : '—'}</td>
          <td><StatusBadge week={week}/></td>
        </tr>
      })}</tbody>
    </table></div>
  </Card>
}

function PastReviews({ weeks, onOpen }) {
  const reviewed = weeks.filter((week) => week.review)
  const lesson = (notes) => {
    const match = notes.split('Lesson and next action:')[1]
    return (match ?? notes).trim().split('\n').find(Boolean) ?? '—'
  }
  return <Card className="pg-past" title="Past reviews" aside={<span className="pg-count">{reviewed.length}</span>}>
    {reviewed.length === 0
      ? <p className="pg-muted">No reviews yet. Write one from the week above; it pins the version of every note and trade you checked.</p>
      : <ul className="pg-past-list">{reviewed.map((week) => <li key={week.week}>
        <button type="button" onClick={() => onOpen(week.week)}>
          <span className="pg-past-week"><b>{week.week}</b><small>{shortDay(week.starts_on)} – {shortDay(week.ends_on)}</small></span>
          <span className="pg-past-lesson">{lesson(week.review.content.notes)}</span>
          <span className="pg-past-meta">
            <span>{week.review.content.trades.length} trades · {week.review.content.entries.length} notes</span>
            <span className="pg-rev-chip"><History size={12}/>rev {week.review.revision}</span>
            <StatusBadge week={week}/>
          </span>
        </button>
      </li>)}</ul>}
  </Card>
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
  const trades = week.trades.map((item) => item.trade)
  const rows = pickRows(metricRows(trades, { privacy }), ['Net P&L', 'Trades', 'Win rate', 'Profit factor', 'Average R', 'Winning days'])
  const editingWeek = queue.weeks.find((item) => item.week === editing)
  useEffect(() => { if (!saved) return undefined; const timer = setTimeout(() => setSaved(null), 3200); return () => clearTimeout(timer) }, [saved])

  const picker = <div className="pg-picker" aria-label="Week">
    <button type="button" className="acct-toggle" aria-label="Previous week" disabled={index >= queue.weeks.length - 1} onClick={() => setSelected(queue.weeks[index + 1].week)}><ChevronLeft size={14}/></button>
    <span className="pg-picker-label"><b>{week.week}</b><small>{shortDay(week.starts_on)} – {shortDay(week.ends_on)}</small></span>
    <button type="button" className="acct-toggle" aria-label="Next week" disabled={index <= 0} onClick={() => setSelected(queue.weeks[index - 1].week)}><ChevronRight size={14}/></button>
  </div>

  return <div className="page home ws-page progress-page">
    <PageHead
      title="Progress"
      meta={`Weekly review · ${reviewedCount} of ${queue.weeks.length} weeks reviewed · ${queue.open_theses.length} open theses`}
      actions={<>{picker}<button type="button" className={week.review ? 'ws-outline' : 'start-day'} onClick={() => setEditing(week.week)}><ClipboardCheck size={14}/>{week.review ? 'Update review' : 'Write review'}</button></>}
    />
    <p className="pg-intro">{INTRO}</p>
    {saved && <div className="pg-saved" role="status">Review {saved.week} saved as revision {saved.revision}.</div>}

    <MetricStrip items={rows.map((row) => ({
      label: row.label, value: row.value, sub: row.basis.replace(/^per (trade|trading day) · /, ''),
      tone: (row.label === 'Net P&L' || row.label === 'Average R') && row.raw != null ? toneOf(row.raw) : undefined,
    }))}/>

    <div className="pg-grid">
      <WeekCard week={week} privacy={privacy} onReview={() => setEditing(week.week)} openJournal={openJournal}/>
      <DailyCard week={week} privacy={privacy}/>
    </div>

    <RoutineCard month={week.ends_on.slice(0, 7)} privacy={privacy} version={version} onSaved={() => setVersion((value) => value + 1)}/>

    <QueueTable weeks={queue.weeks} selected={week.week} onSelect={setSelected} privacy={privacy}/>
    <OpenItems queue={queue}/>
    <PastReviews weeks={queue.weeks} onOpen={(value) => { setSelected(value); setEditing(value) }}/>

    {editingWeek && <ProgressReviewSheet
      key={editingWeek.week} week={editingWeek} queue={queue} privacy={privacy}
      onClose={() => setEditing(null)}
      onSaved={(review) => { setEditing(null); setVersion((value) => value + 1); setSaved({ week: editingWeek.week, revision: review.revision }) }}
    />}
  </div>
}
